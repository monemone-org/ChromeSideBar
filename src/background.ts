import { SpaceMessageAction, Space } from './utils/spaceMessages';
import { FOLLOW_ACTIVE_TAB_KEY, parseFollowActiveTabMode } from './utils/followActiveTab';
import { fetchFaviconAsBase64, getFaviconUrl } from './utils/favicon';
import { parseManagerActionId, RoutedManager } from './managers/proxies/messageRouting';
import { SpaceWindowStateManager } from './managers/impl/spaceWindowStateManager';
import { TabSpaceRegistry } from './managers/impl/tabSpaceRegistry';
import { SpaceManager } from './managers/impl/spaceManager';
import { TabHistoryManager } from './managers/impl/tabHistoryManager';
import { LastAudibleTracker } from './managers/impl/lastAudibleTracker';
import { PinnedSitesManager } from './managers/impl/pinnedSitesManager';
import { TabAssociationManager } from './managers/impl/tabAssociationManager';
import { SpaceTabManager } from './managers/impl/spaceTabManager';
import { backgroundTestHooks } from './managers/impl/backgroundTestHooks';
import {
  BACKGROUND_TEST_HOOK_ACTION,
  BackgroundTestHookRequest,
  BackgroundTestHookResponse,
} from './managers/shared/backgroundTestHooksApi';
import { DEV_TEST_RUN_COMMAND_ACTION, DevTestRunCommandReply } from './utils/devTestCommand';

// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Feature flags
const ENABLE_AUTO_GROUP_NEW_TABS = false;

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
  // A plain in-memory lookup on TabAssociationManager's map - no yield point
  // on a path every tab activation walks.
  if (tabAssociationManager.isPinnedManagedTab(windowId, tabId)) return undefined;

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
const tabAssociationManager = new TabAssociationManager();
// Reads the history manager's activation order, so it has to come after it.
const lastAudibleTracker = new LastAudibleTracker(historyManager);
tabSpaceRegistry = new TabSpaceRegistry();
// Owns the grouping queue. Reads the active space, the space list and the
// pinned check through callbacks rather than holding the managers themselves.
const spaceTabManager = new SpaceTabManager({
  getActiveSpace: (windowId) => spaceStateManager.getActiveSpace(windowId),
  getSpace: (spaceId) => spaceManager.getSpaces().find(s => s.id === spaceId),
  isPinnedManagedTab: (windowId, tabId) => tabAssociationManager.isPinnedManagedTab(windowId, tabId),
});
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
  tabAssociationManager.load(),
  tabSpaceRegistry.load(),
  newsVersionChecker.load()
]).then(() =>
{
  stateReadyResolve();
  tabAssociationManager.restoreFromBackup();
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

// Clean up history, last audible tracker, tab registry, and the tab's
// association when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) =>
{
  await stateReady;
  historyManager.remove(removeInfo.windowId, tabId);
  lastAudibleTracker.clearIfMatches(tabId);
  tabSpaceRegistry.unregister(removeInfo.windowId, tabId);
  spaceTabManager.forgetTab(tabId);

  if (!removeInfo.isWindowClosing)
  {
    // Drops the session entry and its backup entry together. The sidebar used
    // to do the session half from its own onRemoved listener, which only ran
    // while it was open - background owns both halves now.
    tabAssociationManager.deassociate(removeInfo.windowId, tabId);

    // Any tab removal shifts indices of tabs after it
    await tabAssociationManager.refreshBackupIndices(removeInfo.windowId);
  }
});

// A tracked tab dragged into a different window is no longer this window's
// tab, so its association here goes. Background has the correct oldWindowId
// on the event; before this, the only onDetached listener lived in the sidebar
// and so did nothing while it was closed - see G2/A.6 in
// docs/test/issues/G2-association-survives-sidebar-closed.md.
chrome.tabs.onDetached.addListener(async (tabId, detachInfo) =>
{
  await stateReady;
  tabAssociationManager.deassociate(detachInfo.oldWindowId, tabId);

  // Removing a tab from the window shifts the indices of the tabs after it
  await tabAssociationManager.refreshBackupIndices(detachInfo.oldWindowId);
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
  await tabAssociationManager.removeWindow(windowId);
});

// Update tab indices in local backup when any tab is moved.
// A single move shifts all tabs between fromIndex and toIndex, so we refresh
// all managed tabs in the window.
chrome.tabs.onMoved.addListener(async (_tabId, moveInfo) =>
{
  await stateReady;
  await tabAssociationManager.refreshBackupIndices(moveInfo.windowId);
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
      await tabAssociationManager.noteTabNavigated(tab.windowId, tabId, changeInfo.url, tab.index);
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

          // Straight to the owner rather than a fire-and-forget message to a
          // sidebar that may not be open. The manager's own broadcast tells
          // whichever sidebars are around - see G2/A.3.
          tabAssociationManager.deassociate(tab.windowId, tabId);
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
  // (SpaceTabManager checks whether it's a managed tab and ungroups it if needed)
  // Mone: we need to change tab's active space group in background.ts and not in Tablist,
  //       useTab or BookmarkTabContext because we need this to work even when the SideBar
  //       is hidden.
  //       e.g. user is in Space A. user hide side bar. user use Cmd+T to create new tab.
  //            new tab should be also under Space A.
  spaceTabManager.queueNewTab(tab);
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
registerManager(tabAssociationManager);
registerManager(spaceTabManager);

// Answers one DEV-only test hook message from the in-panel test runner - see
// managers/shared/backgroundTestHooksApi.ts.
async function handleBackgroundTestHook(request: BackgroundTestHookRequest): Promise<BackgroundTestHookResponse>
{
  try
  {
    switch (request.op)
    {
      case 'armGate':
        backgroundTestHooks.armGate(request.gate);
        return { ok: true };

      case 'waitForGate':
        return { ok: true, value: await backgroundTestHooks.waitForGate(request.gate, request.timeoutMs) };

      case 'releaseGate':
        backgroundTestHooks.releaseGate(request.gate);
        return { ok: true };

      case 'failNextCall':
        backgroundTestHooks.failNextCall(request.managerId, request.method);
        return { ok: true };

      case 'broadcast':
        // No listener is not an error here, same as every other broadcast
        await chrome.runtime.sendMessage(request.message).catch(() => {});
        return { ok: true };

      case 'forgetTabAssociationSession':
        tabAssociationManager.forgetSessionForTest(request.windowId);
        return { ok: true };

      case 'runTabAssociationRestore':
        await tabAssociationManager.restoreFromBackup();
        return { ok: true };

      case 'readTabAssociationBackup':
        return { ok: true, value: await tabAssociationManager.readBackupForTest(request.windowId) };

      case 'hasShortcutListener':
        return { ok: true, value: chrome.commands.onCommand.hasListeners() };

      case 'reset':
        backgroundTestHooks.reset();
        return { ok: true };
    }
  }
  catch (error)
  {
    return { ok: false, error: String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
  // Test hooks only exist in a debug build, so a release build ignores them
  // like any other unknown message
  if (import.meta.env.DEV && message?.action === BACKGROUND_TEST_HOOK_ACTION)
  {
    (async () =>
    {
      await stateReady;
      sendResponse(await handleBackgroundTestHook(message.request as BackgroundTestHookRequest));
    })();
    return true;  // async response
  }

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
        if (import.meta.env.DEV)
        {
          backgroundTestHooks.throwIfFailureArmed(routed.managerId, routed.method);
        }

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

// The commands in public/manifest.json's "commands" block that handleCommand
// acts on (_execute_side_panel is handled by Chrome itself)
const SHORTCUT_COMMANDS = ['prev-used-tab', 'next-used-tab', 'open-space-navigator'] as const;
type ShortcutCommand = typeof SHORTCUT_COMMANDS[number];

function isShortcutCommand(command: unknown): command is ShortcutCommand
{
  return SHORTCUT_COMMANDS.includes(command as ShortcutCommand);
}

/**
 * What a keyboard shortcut does. Resolves once the command has finished,
 * including the history navigation, so a caller that awaits it can check the
 * result straight away.
 *
 * `windowId` is left out for a real key press, which acts on the active tab
 * of the current window exactly as before. The DEV-only test trigger below
 * passes the side panel's own window, because the panel under test is not
 * necessarily in the window Chrome considers current.
 *
 * Returns whether it acted: false for an unknown command, or when there is no
 * active tab to act from (no such window, or a window without tabs). A key
 * press ignores that, as it always has; the test trigger reports it.
 */
async function handleCommand(command: string, windowId?: number): Promise<boolean>
{
  await stateReady;

  const activeTabQuery: chrome.tabs.QueryInfo = windowId === undefined
    ? { active: true, currentWindow: true }
    : { active: true, windowId };

  // History Back/Forward: step the active tab's window through its tab history
  if (command === "prev-used-tab" || command === "next-used-tab")
  {
    const tabs = await chrome.tabs.query(activeTabQuery);
    if (tabs.length === 0) return false;
    const direction = command === "prev-used-tab" ? -1 : 1;
    await historyManager.navigate(tabs[0].windowId, direction);
    return true;
  }

  // Open Space Navigator as a focused popup window so it reliably receives keyboard input
  if (command === "open-space-navigator")
  {
    const tabs = await chrome.tabs.query(activeTabQuery);
    if (tabs.length === 0) return false;
    const targetWindowId = tabs[0].windowId;
    const win = await chrome.windows.get(targetWindowId);

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

    await chrome.windows.create({
      url: chrome.runtime.getURL(`navigator.html?windowId=${targetWindowId}`),
      type: 'popup',
      focused: true,
      width: popupWidth,
      height: popupHeight,
      left,
      top,
    });
    return true;
  }

  return false;
}

chrome.commands.onCommand.addListener((command) =>
{
  handleCommand(command).catch((error) =>
  {
    if (import.meta.env.DEV)
    {
      console.log(`[commands] "${command}" failed:`, error);
    }
  });
});

// DEV-only stand-in for pressing a shortcut, for the in-panel test runner
// (C.2c): an extension cannot press its own keys, so the runner sends this
// message and background runs the same handleCommand a key press reaches.
// That covers everything after Chrome dispatches the command. The key binding
// and the onCommand registration have their own checks in C.2c
// (assertCommandShortcutBound, assertShortcutListenerRegistered). Compiled out
// of release builds.
if (import.meta.env.DEV)
{
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
  {
    if (message?.action !== DEV_TEST_RUN_COMMAND_ACTION) return;
    const reply = (r: DevTestRunCommandReply) => sendResponse(r);

    // Only the commands the manifest defines, acting on the window the test names
    if (!isShortcutCommand(message.command) || typeof message.windowId !== 'number')
    {
      reply({ error: `${DEV_TEST_RUN_COMMAND_ACTION}: expected one of [${SHORTCUT_COMMANDS.join(', ')}] and a numeric windowId, got command "${message.command}", windowId ${message.windowId}` });
      return;
    }

    // Reply only after the command has finished, so the test's next
    // assertion does not race the navigation
    handleCommand(message.command, message.windowId)
      .then((acted) => reply(acted
        ? { ok: true }
        : { error: `"${message.command}" did nothing: window ${message.windowId} has no active tab (or no longer exists)` }))
      .catch((error) => reply({ error: String(error) }));
    return true;  // async response
  });
}
