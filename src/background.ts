import { SpaceMessageAction, Space } from './utils/spaceMessages';
import { FOLLOW_ACTIVE_TAB_KEY, parseFollowActiveTabMode } from './utils/followActiveTab';
import { isPinnedManagedTab, getTabAssociations, saveTabAssociationBackup, removeTabAssociationBackup, updateTabAssociationBackupIndices, removeWindowAssociationBackup, restoreTabAssociationBackup } from './utils/tabAssociations';
import { toChromeColor } from './utils/groupColors';
import { fetchFaviconAsBase64, getFaviconUrl } from './utils/favicon';
import { parseManagerActionId, RoutedManager } from './managers/proxies/messageRouting';
import { SpaceWindowStateManager } from './managers/impl/spaceWindowStateManager';
import { TabSpaceRegistry } from './managers/impl/tabSpaceRegistry';
import { SpaceManager } from './managers/impl/spaceManager';
import { TabHistoryManager } from './managers/impl/tabHistoryManager';
import { LastAudibleTracker } from './managers/impl/lastAudibleTracker';
import { PinnedSitesManager } from './managers/impl/pinnedSitesManager';

// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Feature flags
const ENABLE_AUTO_GROUP_NEW_TABS = false;

// Workaround: chrome.tabGroups.update() sets title/color internally but
// chrome.tabGroups.query() returns stale data until manual collapse/expand.
// See https://github.com/brave/brave-browser/issues/52949
const ISSUE_52949_WORKAROUND = true;

// =============================================================================
// TabGroupTracker - Manages active tab group (for auto-grouping feature)
// =============================================================================

class TabGroupTracker
{
  static STORAGE_KEY = 'bg_windowActiveGroups';

  #activeGroups = new Map<number, number>();  // windowId -> groupId

  getActiveGroup(windowId: number): number | undefined
  {
    return this.#activeGroups.get(windowId);
  }

  setActiveGroup(windowId: number, groupId: number): void
  {
    this.#activeGroups.set(windowId, groupId);
    chrome.storage.session.set({
      [TabGroupTracker.STORAGE_KEY]: Array.from(this.#activeGroups.entries())
    });
  }

  removeWindow(windowId: number): void
  {
    this.#activeGroups.delete(windowId);
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([TabGroupTracker.STORAGE_KEY]);
    if (result[TabGroupTracker.STORAGE_KEY])
    {
      for (const [key, value] of result[TabGroupTracker.STORAGE_KEY])
      {
        this.#activeGroups.set(key, value);
      }
    }
  }
}

// NewsVersionChecker - Fetches latest news version from GitHub (at most once/week)
// =============================================================================

class NewsVersionChecker
{
  static LATEST_VERSION_URL =
    'https://monemone-org.github.io/ChromeSideBar/public/latest.version';
  static STORAGE_KEY_VERSION = 'sidebar-news-latest-version';
  static STORAGE_KEY_CHECK_TIME = 'sidebar-last-news-check-time';
  static CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

  #cachedVersion = 0;

  getCachedVersion(): number
  {
    return this.#cachedVersion;
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.local.get([NewsVersionChecker.STORAGE_KEY_VERSION]);
    const stored = parseInt(String(result[NewsVersionChecker.STORAGE_KEY_VERSION] ?? 0), 10);
    this.#cachedVersion = isNaN(stored) ? 0 : stored;
    await this.checkIfDue();
  }

  // Fetch from GitHub if enough time has passed since last check
  async checkIfDue(): Promise<void>
  {
    const result = await chrome.storage.local.get([NewsVersionChecker.STORAGE_KEY_CHECK_TIME]);
    const lastCheckTime = parseInt(String(result[NewsVersionChecker.STORAGE_KEY_CHECK_TIME] ?? 0), 10) || 0;
    if (Date.now() - lastCheckTime >= NewsVersionChecker.CHECK_INTERVAL_MS)
    {
      this.fetchLatestVersion();
    }
  }

  private async fetchLatestVersion(): Promise<void>
  {
    try
    {
      const res = await fetch(NewsVersionChecker.LATEST_VERSION_URL);
      if (!res.ok) return;

      const text = await res.text();
      const fetched = parseInt(text.trim(), 10);
      if (isNaN(fetched)) return;

      this.#cachedVersion = fetched;

      if (import.meta.env.DEV)
      {
        console.log(`[NewsVersionChecker] Fetched news version: ${fetched}`);
      }

      await chrome.storage.local.set({
        [NewsVersionChecker.STORAGE_KEY_VERSION]: fetched,
        [NewsVersionChecker.STORAGE_KEY_CHECK_TIME]: Date.now()
      });
    }
    catch
    {
      // Silently skip — try again next week
    }
  }
}

// =============================================================================
// Space-Group Helper Functions
// =============================================================================

// Find Chrome group by name in a window
async function findGroupByName(windowId: number, name: string): Promise<number | undefined>
{
  const groups = await chrome.tabGroups.query({ windowId, title: name });
  return groups[0]?.id;
}

// Get a space by ID from the in-memory SpaceManager cache
async function getSpaceById(spaceId: string): Promise<Space | undefined>
{
  return spaceManager.getSpaces().find(s => s.id === spaceId);
}

// Find a space by name from the in-memory SpaceManager cache
async function findSpaceByName(name: string | undefined): Promise<Space | undefined>
{
  if (!name) return undefined;
  return spaceManager.getSpaces().find(s => s.name === name);
}

// Forward declaration - will be initialized below
let tabSpaceRegistry: TabSpaceRegistry;

// Get space ID for a tab at navigation time
// Priority: pinned check > live Chrome group > tab registry > 'all' for ungrouped
// Returns undefined for pinned tabs (don't switch space)
//
// Pinned-site tabs are checked first and unconditionally excluded: pins live in
// the global pinned bar, not any one space's bookmark folder, and are meant to
// stay reachable without a space switch even if the underlying tab gets dragged
// into a space's Chrome group.
//
// The Chrome group is checked next because it's the tab's current ground
// truth. The registry is a cache written once when an Arc-style bookmark tab
// is created (see TabSpaceRegistry.register, reached via the proxy) and nothing updates
// it if the tab is later moved to a different group - so it can only be
// trusted as a fallback for tabs with no live group (the brief window right
// after a bookmark tab is created before auto-grouping completes).
async function getSpaceForTab(windowId: number, tabId: number): Promise<string | undefined>
{
  if (await isPinnedManagedTab(windowId, tabId)) return undefined;

  try
  {
    const tab = await chrome.tabs.get(tabId);

    // 1. Check live Chrome group
    if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
    {
      const group = await chrome.tabGroups.get(tab.groupId);
      const space = await findSpaceByName(group.title);
      if (space) return space.id;
    }
  }
  catch { /* Tab may not exist */ }

  // 2. Fall back to tab registry (no live group to consult)
  const registeredSpace = tabSpaceRegistry.getSpace(windowId, tabId);
  if (registeredSpace) return registeredSpace;

  // 3. Ungrouped normal tab → 'all'
  return undefined;
}

/**
 * Activates a tab and switches the sidebar to its space.
 *
 * Used by explicit user actions (audio quick-jump, audio tabs list, the
 * "show active tab" toolbar button), so it always switches space regardless of
 * the "Follow active tab" setting - that setting only governs passive following
 * in the onActivated listener.
 *
 * The space switch is performed here rather than left to onActivated: when the
 * requested tab is already the active one, Chrome fires no onActivated event, so
 * relying on that side effect would silently do nothing. When the tab really
 * does change, onActivated still fires but finds the space already correct.
 *
 * @param tabId - The tab to activate
 * @returns Object with success status and optional error
 */
async function setActiveTabAndSpace(
  tabId: number
): Promise<{ success: boolean; error?: string }>
{
  try
  {
    // Activate the tab. Our chrome.tabs.onActivated listener adds it to history.
    const tab = await chrome.tabs.update(tabId, { active: true });

    if (!tab.windowId)
    {
      return { success: false, error: 'Tab has no window' };
    }

    // Switch the sidebar to the tab's space (unless in "All" space, where every
    // tab is already visible)
    const destinationSpaceId = await getSpaceForTab(tab.windowId, tabId);
    const currentSpaceId = spaceStateManager.getActiveSpace(tab.windowId);
    let spaceSwitched = false;
    if (destinationSpaceId && currentSpaceId !== 'all' && currentSpaceId !== destinationSpaceId)
    {
      spaceStateManager.setActiveSpace(tab.windowId, destinationSpaceId);
      spaceSwitched = true;
    }

    // Tell the sidebar to scroll the tab into view. Flagged explicit so it
    // scrolls regardless of the "Follow active tab" setting - callers here are
    // deliberate user actions. This is the only scroll signal for keyboard
    // shortcuts, which never reach the sidebar, and for the "show active tab"
    // button, whose target is already active so onActivated never fires.
    chrome.runtime.sendMessage({
      action: SpaceMessageAction.TAB_ACTIVATED,
      windowId: tab.windowId,
      tabId,
      spaceSwitched,
      explicit: true
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });

    return { success: true };
  }
  catch (error)
  {
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// Initialize trackers
// =============================================================================

const spaceStateManager = new SpaceWindowStateManager();
const spaceManager = new SpaceManager();
// setActiveTabAndSpace and getSpaceForTab are orchestration living here, so
// the manager takes them rather than importing them back out of this file -
// see TabHistoryDeps in managers/impl/tabHistoryManager.ts.
const historyManager = new TabHistoryManager({
  setActiveTabAndSpace,
  getSpaceForTab,
});
const groupTracker = new TabGroupTracker();
const pinnedSitesManager = new PinnedSitesManager();
// Reads the history manager's activation order, so it has to come after it.
const lastAudibleTracker = new LastAudibleTracker(historyManager);
tabSpaceRegistry = new TabSpaceRegistry();
const newsVersionChecker = new NewsVersionChecker();

// Promise that resolves when all state managers have loaded.
// Event handlers must await this before accessing state to prevent race conditions
// when the service worker restarts after being idle.
let stateReadyResolve: () => void;
const stateReady = new Promise<void>((resolve) =>
{
  stateReadyResolve = resolve;
  // Safety timeout - don't block forever if load fails
  setTimeout(resolve, 1000);
});

// Load persisted state
Promise.all([
  spaceStateManager.load(),
  spaceManager.load(),
  historyManager.load(),
  groupTracker.load(),
  lastAudibleTracker.load(),
  pinnedSitesManager.load(),
  tabSpaceRegistry.load(),
  newsVersionChecker.load()
]).then(() =>
{
  stateReadyResolve();
  restoreTabAssociationBackup();
});

// =============================================================================
// Event Listeners
// =============================================================================

// Update tracked group when active tab changes + track history + switch to tab's Space
chrome.tabs.onActivated.addListener(async (activeInfo) =>
{
  // Wait for state to load (handles service worker restart)
  await stateReady;

  // Check for news updates (throttled to once per week)
  await newsVersionChecker.checkIfDue();

  const isNavigating = historyManager.isNavigating(activeInfo.windowId);

  // if (import.meta.env.DEV)
  // {
  //   console.log(`[onActivated] START tabId=${activeInfo.tabId}, isNavigating=${isNavigating}`);
  // }

  // Track tab history (skip if this activation was triggered by navigation)
  if (!isNavigating)
  {
    historyManager.push(activeInfo.windowId, activeInfo.tabId);
  }

  // Lookup destination space for sidebar switch
  const destinationSpaceId = await getSpaceForTab(activeInfo.windowId, activeInfo.tabId);

  // if (import.meta.env.DEV)
  // {
  //   console.log(`[onActivated] destinationSpaceId=${destinationSpaceId}`);
  // }

  // Read the "Follow active tab" mode - 'off' disables space switching (and the
  // sidebar skips scrolling)
  const followResult = await chrome.storage.local.get([FOLLOW_ACTIVE_TAB_KEY]);
  const followMode = parseFollowActiveTabMode(followResult[FOLLOW_ACTIVE_TAB_KEY]);

  // Switch sidebar to tab's Space (unless in "All" space, or following is off)
  let spaceSwitched = false;
  const currentSpaceId = spaceStateManager.getActiveSpace(activeInfo.windowId);
  if (followMode !== 'off' && destinationSpaceId && currentSpaceId !== 'all')
  {
    if (currentSpaceId !== destinationSpaceId)
    {
      spaceStateManager.setActiveSpace(activeInfo.windowId, destinationSpaceId);
      spaceSwitched = true;
    }
  }

  // Announce the activation so the sidebar can scroll the tab into view.
  // The sidebar decides whether to scroll based on the follow mode and spaceSwitched.
  chrome.runtime.sendMessage({
    action: SpaceMessageAction.TAB_ACTIVATED,
    windowId: activeInfo.windowId,
    tabId: activeInfo.tabId,
    spaceSwitched
  }).catch(() =>
  {
    // Sidepanel may not be open - ignore error
  });

  // Track tab group (for auto-grouping feature)
  if (ENABLE_AUTO_GROUP_NEW_TABS)
  {
    chrome.tabs.get(activeInfo.tabId, (tab) =>
    {
      if (tab && tab.groupId !== undefined)
      {
        groupTracker.setActiveGroup(activeInfo.windowId, tab.groupId);
      }
    });
  }
});

// Refresh tab indices in local backup for all managed tabs in a window.
// Called after any tab move or removal that may shift indices.
async function refreshBackupIndices(windowId: number): Promise<void>
{
  const associations = await getTabAssociations(windowId);
  if (Object.keys(associations).length === 0) return;

  const allTabs = await chrome.tabs.query({ windowId });
  const tabIndexMap = new Map(allTabs.map(t => [t.id!, t.index]));

  const updates: Record<string, number> = {};
  for (const [id, itemKey] of Object.entries(associations))
  {
    const newIndex = tabIndexMap.get(Number(id));
    if (newIndex !== undefined)
    {
      updates[itemKey] = newIndex;
    }
  }

  if (Object.keys(updates).length > 0)
  {
    await updateTabAssociationBackupIndices(windowId, updates);
  }
}

// Clean up history, last audible tracker, tab registry, and local backup when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) =>
{
  await stateReady;
  historyManager.remove(removeInfo.windowId, tabId);
  lastAudibleTracker.clearIfMatches(tabId);
  tabSpaceRegistry.unregister(removeInfo.windowId, tabId);

  if (!removeInfo.isWindowClosing)
  {
    const associations = await getTabAssociations(removeInfo.windowId);
    const itemKey = associations[tabId];
    if (itemKey)
    {
      await removeTabAssociationBackup(removeInfo.windowId, itemKey);
    }

    // Any tab removal shifts indices of tabs after it
    await refreshBackupIndices(removeInfo.windowId);
  }
});

// Clean up in-memory maps and local backup when a window is closed
chrome.windows.onRemoved.addListener(async (windowId) =>
{
  await stateReady;

  // TODO: remove after testing
  if (import.meta.env.DEV)
  {
    console.log(`[onRemoved] cleaning up in-memory state for window=${windowId}`);
  }

  spaceStateManager.removeWindow(windowId);
  historyManager.removeWindow(windowId);
  groupTracker.removeWindow(windowId);
  tabSpaceRegistry.removeWindow(windowId);
  await removeWindowAssociationBackup(windowId);
});

// Update tab indices in local backup when any tab is moved.
// A single move shifts all tabs between fromIndex and toIndex, so we refresh
// all managed tabs in the window.
chrome.tabs.onMoved.addListener(async (_tabId, moveInfo) =>
{
  await stateReady;
  await refreshBackupIndices(moveInfo.windowId);
});

// Favicon loading Scenario 5 — see docs/favicon-loading-strategy.md
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) =>
{
  await stateReady;
  if (changeInfo.audible === false)
  {
    lastAudibleTracker.setLastAudibleTabId(tabId);
  }

  // The url/groupId/favIconUrl handlers below all need the tab - fetch it once
  // and share it, instead of each handler independently re-fetching
  let tab: chrome.tabs.Tab | undefined;
  if (changeInfo.url !== undefined || changeInfo.groupId !== undefined || changeInfo.favIconUrl !== undefined)
  {
    try { tab = await chrome.tabs.get(tabId); }
    catch { /* tab may have been closed */ }
  }

  // Update URL in local backup when a managed tab navigates
  if (changeInfo.url && tab?.windowId)
  {
    try
    {
      const associations = await getTabAssociations(tab.windowId);
      const itemKey = associations[tabId];
      if (itemKey)
      {
        saveTabAssociationBackup(tab.windowId, itemKey, { tabId, url: changeInfo.url, tabIndex: tab.index });
      }
    }
    catch { /* tab may have been closed */ }
  }

  // If a tracked Arc-style bookmark/pinned tab is dragged into a Chrome group
  // for a different space than the one it's associated with, break the
  // association - equivalent to the user choosing "Move to Tabs" and then
  // moving a regular tab to that space, since the tab no longer lives in its
  // bookmark's space. Once deassociated it's a regular tab, which gets its
  // space from its live Chrome group directly (see getSpaceForTab), so there
  // is nothing left in tabSpaceRegistry to keep in sync - just remove it.
  if (changeInfo.groupId !== undefined && changeInfo.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && tab?.windowId)
  {
    try
    {
      const registeredSpaceId = tabSpaceRegistry.getSpace(tab.windowId, tabId);
      if (registeredSpaceId)
      {
        const group = await chrome.tabGroups.get(changeInfo.groupId);
        const space = await findSpaceByName(group.title);

        if (space?.id !== registeredSpaceId)
        {
          tabSpaceRegistry.unregister(tab.windowId, tabId);
          chrome.runtime.sendMessage({
            action: SpaceMessageAction.DEASSOCIATE_TAB,
            windowId: tab.windowId,
            tabId
          }).catch(() =>
          {
            // Sidepanel may not be open - ignore error
          });
        }
      }
    }
    catch { /* tab may have been closed */ }
  }

  // Scenario 5: update pinned site favicon when Chrome reports a new favIconUrl
  if (changeInfo.favIconUrl && tab?.url)
  {
    try
    {
      let tabHostname: string;
      try { tabHostname = new URL(tab.url).hostname; }
      catch { return; }

      // Match by hostname, only sites without favicon and no custom icon/emoji.
      // PinnedSitesManager owns this list now, so this reads its in-memory copy
      // instead of storage, and hands back a patch instead of a whole rewritten
      // array - see Case 2 in the shared-storage decision doc.
      const matchingSites = pinnedSitesManager.getPinnedSites().filter(site =>
      {
        if (site.favicon || site.customIconName || site.emoji) return false;
        try { return new URL(site.url).hostname === tabHostname; }
        catch { return false; }
      });

      if (matchingSites.length > 0)
      {
        // Use Chrome's internal _favicon API instead of fetching favIconUrl directly.
        // This avoids CORS errors on private/local servers (e.g. homeassistant, proxmox).
        // Chrome has just cached the favicon (it just fired favIconUrl), so this will work.
        const favicon = await fetchFaviconAsBase64(getFaviconUrl(tab.url));
        if (favicon)
        {
          // No originId: this change started here, so every sidebar needs to
          // hear about it. The manager re-checks each pin's eligibility, since
          // the fetch above gave the user time to set an icon by hand.
          pinnedSitesManager.setFavicons(
            matchingSites.map(site => ({ id: site.id, favicon }))
          );

          if (import.meta.env.DEV)
          {
            console.log('[Background] updated favicon for pinned sites:',
              matchingSites.map(s => s.url));
          }
        }
      }
    }
    catch { /* tab may have been closed */ }
  }
});

// Queue for batching tab grouping to prevent race conditions
interface TabGroupingRequest
{
  tabId: number;
  windowId: number;
  spaceId: string;  // Target space, captured at queue time
  force: boolean;  // Move even if already in a different group (see queueTabForGrouping)
}
const groupingQueue: TabGroupingRequest[] = [];
let isProcessingGroupingQueue = false;

// Queue a tab for grouping - prevents race condition when multiple tabs created rapidly
// spaceId is the target space to group into. If omitted (e.g. Cmd+T new tabs), falls
// back to whichever space is currently active in this window, captured at queue time
// (not processing time).
//
// An explicit spaceId means the caller has a definite target (e.g. moving a
// bookmark's tab to match its new Space) - the request is "forced": the tab moves
// even if it's already in a different group. Without one, only tabs still
// ungrouped by processing time are claimed, so a queued new-tab request can't
// race ahead of - and clobber - a group assigned in the meantime.
function queueTabForGrouping(tab: chrome.tabs.Tab, spaceId?: string): void
{
  if (!tab.id || !tab.windowId) return;

  const targetSpaceId = spaceId ?? spaceStateManager.getActiveSpace(tab.windowId);
  if (!targetSpaceId || targetSpaceId === 'all') return;

  groupingQueue.push({ tabId: tab.id, windowId: tab.windowId, spaceId: targetSpaceId, force: spaceId !== undefined });
  processGroupingQueue();
}

// Process queued tabs sequentially - prevents race condition
async function processGroupingQueue(): Promise<void>
{
  if (isProcessingGroupingQueue) return;  // Already processing, items will be picked up
  isProcessingGroupingQueue = true;

  try
  {
    while (groupingQueue.length > 0)
    {
      const request = groupingQueue.shift()!;
      await processGroupingRequest(request);
    }
  }
  finally
  {
    isProcessingGroupingQueue = false;
  }
}

// Process a single grouping request
async function processGroupingRequest(request: TabGroupingRequest): Promise<void>
{
  const { tabId, windowId, spaceId, force } = request;

  // Check if this is a pinned-site managed tab (keep ungrouped)
  if (await isPinnedManagedTab(windowId, tabId))
  {
    // Ungroup if currently in a group
    try
    {
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
      {
        await chrome.tabs.ungroup(tabId);
      }
    }
    catch { /* Tab may be closed */ }
    return;
  }

  try
  {
    // Verify tab still exists. Skip only if already grouped and this isn't a
    // forced move (see queueTabForGrouping) - avoids clobbering a group assigned
    // to a newly-created tab in the gap between queueing and processing.
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && !force) return;

    const space = await getSpaceById(spaceId);
    if (!space) return;

    // Find existing Chrome group with Space's name
    const existingGroupId = await findGroupByName(windowId, space.name);

    // Already in the right group - nothing to do
    if (existingGroupId && tab.groupId === existingGroupId) return;

    if (existingGroupId)
    {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existingGroupId });
    }
    else
    {
      const newGroupId = await chrome.tabs.group({
        tabIds: [tabId],
        createProperties: { windowId }
      });
      await chrome.tabGroups.update(newGroupId, {
        title: space.name,
        color: toChromeColor(space.color),
      });

      if (ISSUE_52949_WORKAROUND)
      {
        // Send correct group details directly — query() returns stale data for new groups
        chrome.runtime.sendMessage({
          type: 'TAB_GROUP_TITLE_SET',
          groupId: newGroupId,
          title: space.name,
          color: toChromeColor(space.color),
          windowId
        }).catch(() => {});
      }
    }
  }
  catch (error)
  {
    if (import.meta.env.DEV) console.error('[processGroupingRequest] Failed:', error);
  }
}

// Add new tabs to active Space's Chrome group
chrome.tabs.onCreated.addListener(async (tab) =>
{
  if (!tab.id || !tab.windowId) return;

  // Tab is already in a group - leave it alone
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
  {
    return;
  }

  // Wait for state to load (handles service worker restart)
  await stateReady;

  // Ungrouped tab - queue for grouping
  // (processGroupingRequest will check if it's a managed tab and ungroup if needed)
  // Mone: we need to change tab's active space group in background.ts and not in Tablist,
  //       useTab or BookmarkTabContext because we need this to work even when the SideBar
  //       is hidden.
  //       e.g. user is in Space A. user hide side bar. user use Cmd+T to create new tab.
  //            new tab should be also under Space A.
  queueTabForGrouping(tab);
});

// =============================================================================
// Message Handlers
// =============================================================================

// Every manager that owns messages, keyed by the managerId half of its action
// strings. Built once here so routing is an exact-match lookup rather than a
// prefix scan - "Space" would otherwise also match "SpaceWindowState".
const routedManagers = new Map<string, RoutedManager>();

// Registering the same managerId twice would silently give one manager's
// messages to the other, so fail at load instead of at runtime.
function registerManager(manager: RoutedManager): void
{
  if (routedManagers.has(manager.managerId))
  {
    throw new Error(`duplicate managerId "${manager.managerId}" - message routing would be ambiguous`);
  }
  routedManagers.set(manager.managerId, manager);
}

registerManager(tabSpaceRegistry);
registerManager(spaceStateManager);
registerManager(spaceManager);
registerManager(historyManager);
registerManager(lastAudibleTracker);
registerManager(pinnedSitesManager);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
  // Manager-routed messages come first: anything shaped "<Manager>_msg_<method>"
  // belongs to exactly one manager and never falls through to the flat
  // orchestration handlers below.
  const routed = parseManagerActionId(message?.action);
  if (routed)
  {
    const manager = routedManagers.get(routed.managerId);
    if (!manager)
    {
      console.error(`[messageRouting] no manager registered for "${routed.managerId}"`);
      return;
    }

    // stateReady is awaited here, once, rather than in every manager method -
    // the service worker can be woken by any of these messages.
    (async () =>
    {
      await stateReady;
      try
      {
        sendResponse(await manager.dispatch(routed.method, message));
      }
      catch (error)
      {
        console.error(`[messageRouting] ${routed.managerId}.${routed.method} failed:`, error);
        sendResponse({ error: String(error) });
      }
    })();
    return true;  // async response
  }

  // Re-queue a tab for grouping check (used by sidebar after storing association).
  // spaceId is optional - when given (e.g. associating an existing tab with a
  // bookmark in a specific Space's folder), it overrides the active-space fallback.
  if (message.action === 'queue-tab-for-grouping')
  {
    (async () =>
    {
      await stateReady;
      if (message.tabId && message.windowId)
      {
        queueTabForGrouping({ id: message.tabId, windowId: message.windowId } as chrome.tabs.Tab, message.spaceId);
      }
    })();
    return;
  }

  if (message.action === 'set-active-tab-and-space')
  {
    if (message.tabId !== undefined)
    {
      (async () =>
      {
        await stateReady;
        const result = await setActiveTabAndSpace(message.tabId);
        sendResponse(result);
      })();
      return true;  // async response
    }
  }
});

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

chrome.commands.onCommand.addListener((command) =>
{
  (async () =>
  {
    await stateReady;

    if (command === "prev-used-tab" || command === "next-used-tab")
    {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
      {
        if (tabs.length === 0) return;
        const direction = command === "prev-used-tab" ? -1 : 1;
        historyManager.navigate(tabs[0].windowId, direction);
      });
    }

    // Open Space Navigator as a focused popup window so it reliably receives keyboard input
    if (command === "open-space-navigator")
    {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) =>
      {
        if (tabs.length === 0) return;
        const windowId = tabs[0].windowId;
        const win = await chrome.windows.get(windowId);

        // Size the popup to fit all spaces without scrolling (capped at 480px content height).
        // Measured from SpaceNavigatorApp.tsx / SpaceList.tsx rendering (Tailwind defaults, 1rem = 16px):
        //   headerHeight = 37   ("Navigate to Space" row: py-2 padding 16 + text-sm line-height 20 + border-b 1)
        //   searchBoxHeight = 39 (search row: py-1.5 padding 12 + input py-1 padding 8
        //                         + input text-xs line-height 16 + input border 2 + border-b 1)
        //   listPadding = 8    (SpaceList's rows container: py-1 padding, top + bottom)
        //   rowHeight = 28     (each space row: h-7)
        const spaces = spaceManager.getSpaces();
        const itemCount = spaces.length + 1; // +1 for the "All" space
        const popupWidth = 300;
        const headerHeight = 37;
        const searchBoxHeight = 39;
        const listPadding = 8;
        const rowHeight = 28;
        const bottomPadding = 10;
        const contentHeight = headerHeight + searchBoxHeight + listPadding + itemCount * rowHeight + bottomPadding;
        const popupHeight = Math.min(contentHeight, 480) + 30; // +30 for OS title bar

        // Center the popup within the browser window
        const left = Math.round((win.left ?? 0) + ((win.width ?? 1200) - popupWidth) / 2);
        const top = Math.round((win.top ?? 0) + ((win.height ?? 800) - popupHeight) / 2);

        chrome.windows.create({
          url: chrome.runtime.getURL(`navigator.html?windowId=${windowId}`),
          type: 'popup',
          focused: true,
          width: popupWidth,
          height: popupHeight,
          left,
          top,
        });
      });
    }
  })();
});
