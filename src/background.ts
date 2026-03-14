import { SpaceMessageAction, SpaceWindowState, DEFAULT_WINDOW_STATE } from './utils/spaceMessages';
import { isPinnedManagedTab, getTabAssociations, saveTabAssociationBackup, removeTabAssociationBackup, updateTabAssociationBackupIndices, removeWindowAssociationBackup, restoreTabAssociationBackup } from './utils/tabAssociations';
import { toChromeColor } from './utils/groupColors';
import { fetchFaviconAsBase64, getFaviconUrl } from './utils/favicon';

// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Feature flags
const ENABLE_AUTO_GROUP_NEW_TABS = false;

// Workaround: chrome.tabGroups.update() sets title/color internally but
// chrome.tabGroups.query() returns stale data until manual collapse/expand.
// See https://github.com/brave/brave-browser/issues/52949
const ISSUE_52949_WORKAROUND = true;

// =============================================================================
// SpaceWindowStateManager - Manages SpaceWindowState per window
// =============================================================================

class SpaceWindowStateManager
{
  static STORAGE_KEY_PREFIX = 'spaceWindowState_';

  #states = new Map<number, SpaceWindowState>();  // windowId -> state

  private getStorageKey(windowId: number): string
  {
    return `${SpaceWindowStateManager.STORAGE_KEY_PREFIX}${windowId}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Access
  // ─────────────────────────────────────────────────────────────────────────

  getState(windowId: number): SpaceWindowState
  {
    return this.#states.get(windowId) || { ...DEFAULT_WINDOW_STATE };
  }

  getActiveSpace(windowId: number): string
  {
    return this.getState(windowId).activeSpaceId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Mutations
  // ─────────────────────────────────────────────────────────────────────────

  setActiveSpace(windowId: number, spaceId: string): void
  {
    const state = this.getState(windowId);
    const newState = { ...state, activeSpaceId: spaceId };
    this.saveState(windowId, newState);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persistence & Notification
  // ─────────────────────────────────────────────────────────────────────────

  private saveState(windowId: number, state: SpaceWindowState): void
  {
    this.#states.set(windowId, state);
    chrome.storage.session.set({ [this.getStorageKey(windowId)]: state });

    // Notify sidebar of state change
    chrome.runtime.sendMessage({
      action: SpaceMessageAction.STATE_CHANGED,
      windowId,
      state
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });
  }

  removeWindow(windowId: number): void
  {
    this.#states.delete(windowId);
  }

  async load(): Promise<void>
  {
    // Load all window states from session storage
    const result = await chrome.storage.session.get(null);

    for (const [key, value] of Object.entries(result))
    {
      if (key.startsWith(SpaceWindowStateManager.STORAGE_KEY_PREFIX))
      {
        const windowId = parseInt(key.replace(SpaceWindowStateManager.STORAGE_KEY_PREFIX, ''), 10);
        if (!isNaN(windowId))
        {
          this.#states.set(windowId, value as SpaceWindowState);
        }
      }
    }
  }
}

// =============================================================================
// TabHistoryManager - Manages tab navigation history
// =============================================================================

interface HistoryEntry
{
  tabId: number;
}

interface TabHistory
{
  stack: HistoryEntry[];
  index: number;
}

class TabHistoryManager
{
  static STORAGE_KEY = 'bg_windowTabHistory';
  static MAX_SIZE = 25;

  #history = new Map<number, TabHistory>();  // windowId -> history

  // Navigation state tracking (per-window)
  // - Prevents history tracking when we programmatically activate a tab via navigate()
  // - Uses incrementing IDs to handle rapid navigation: if user triggers nav A then B quickly,
  //   only B's callback executes (A's callback sees stale navId and returns early)
  // - Per-window so navigation in window A doesn't affect history tracking in window B
  #navigatingWindows = new Map<number, number>();  // windowId -> navId

  isNavigating(windowId: number): boolean
  {
    return this.#navigatingWindows.has(windowId);
  }

  // Mark window as navigating. Returns navId to pass to unsetNavigating().
  setNavigating(windowId: number): number
  {
    const navId = (this.#navigatingWindows.get(windowId) ?? 0) + 1;
    this.#navigatingWindows.set(windowId, navId);
    // if (import.meta.env.DEV)
    // {
    //   console.log(`[TabHistory] setNavigating: windowId=${windowId}, navId=${navId}`);
    // }
    return navId;
  }

  // Clear navigation state if navId still matches. Returns false if a newer navigation superseded this one.
  unsetNavigating(windowId: number, navId: number): boolean
  {
    const currentNavId = this.#navigatingWindows.get(windowId);
    const matches = currentNavId === navId;
    // if (import.meta.env.DEV)
    // {
    //   console.log(`[TabHistory] unsetNavigating: windowId=${windowId}, navId=${navId}, currentNavId=${currentNavId}, cleared=${matches}`);
    // }
    if (!matches) return false;
    this.#navigatingWindows.delete(windowId);
    return true;
  }

  getHistory(windowId: number): TabHistory | undefined
  {
    return this.#history.get(windowId);
  }

  private getOrCreateHistory(windowId: number): TabHistory
  {
    if (!this.#history.has(windowId))
    {
      this.#history.set(windowId, { stack: [], index: -1 });
    }
    return this.#history.get(windowId)!;
  }

  private save(): void
  {
    chrome.storage.session.set({
      [TabHistoryManager.STORAGE_KEY]: Array.from(this.#history.entries())
    });
  }

  push(windowId: number, tabId: number): void
  {
    const history = this.getOrCreateHistory(windowId);

    // skip if same as current entry (same tab)
    if (history.index >= 0)
    {
      const current = history.stack[history.index];
      if (current.tabId === tabId)
      {
        return;
      }
    }

    // remove any existing occurrence of this tabId to prevent duplicates
    const existingIdx = history.stack.findIndex(e => e.tabId === tabId);
    if (existingIdx !== -1)
    {
      history.stack.splice(existingIdx, 1);
      if (existingIdx <= history.index)
      {
        history.index--;
      }
    }

    // insert new entry after current position
    history.stack.splice(history.index + 1, 0, { tabId });
    history.index++;

    // trim to keep ±MAX_SIZE around current index
    const beforeCount = history.index;
    if (beforeCount > TabHistoryManager.MAX_SIZE)
    {
      const trimCount = beforeCount - TabHistoryManager.MAX_SIZE;
      history.stack.splice(0, trimCount);
      history.index -= trimCount;
    }

    const afterCount = history.stack.length - history.index - 1;
    if (afterCount > TabHistoryManager.MAX_SIZE)
    {
      const trimCount = afterCount - TabHistoryManager.MAX_SIZE;
      history.stack.splice(history.stack.length - trimCount, trimCount);
    }

    this.save();
    // if (import.meta.env.DEV) this.dump(windowId, `PUSH tabId=${tabId}`);
  }

  remove(windowId: number, tabId: number): void
  {
    const history = this.#history.get(windowId);
    if (!history) return;

    const idx = history.stack.findIndex(e => e.tabId === tabId);
    if (idx === -1) return;

    history.stack.splice(idx, 1);

    if (history.index >= idx)
    {
      history.index = Math.max(0, history.index - 1);
    }

    if (history.stack.length === 0)
    {
      history.index = -1;
    }

    this.save();
    // if (import.meta.env.DEV) this.dump(windowId, `REMOVE tabId=${tabId}`);
  }

  async navigate(windowId: number, direction: number): Promise<void>
  {
    const history = this.#history.get(windowId);
    if (!history || history.stack.length === 0) return;

    const newIndex = history.index + direction;
    if (newIndex < 0 || newIndex >= history.stack.length) return;

    history.index = newIndex;
    const entry = history.stack[newIndex];
    this.save();

    if (import.meta.env.DEV)
    {
      const dirLabel = direction === -1 ? "BACK" : "FORWARD";
      this.dump(windowId, `NAVIGATE ${dirLabel} to tabId=${entry.tabId}`);
    }

    const navId = this.setNavigating(windowId);

    // Use unified function to activate tab and switch space
    // Skip history since we're navigating within existing history
    const result = await setActiveTabAndSpace(entry.tabId);

    if (!this.unsetNavigating(windowId, navId)) return;

    if (import.meta.env.DEV && result.success)
    {
      console.log(`[TabHistory] Navigate completed: result=${result}`);
    }
  }

  async navigateToIndex(windowId: number, index: number): Promise<void>
  {
    const history = this.#history.get(windowId);
    if (!history || index < 0 || index >= history.stack.length) return;

    history.index = index;
    const entry = history.stack[index];
    this.save();

    if (import.meta.env.DEV)
    {
      this.dump(windowId, `NAVIGATE to index=${index}, tabId=${entry.tabId}`);
    }

    const navId = this.setNavigating(windowId);

    // Use unified function to activate tab and switch space
    // Skip history since we're navigating within existing history
    const result = await setActiveTabAndSpace(entry.tabId);

    if (!this.unsetNavigating(windowId, navId)) return;

    if (import.meta.env.DEV && result.success)
    {
      console.log(`[TabHistory] NavigateToIndex completed: result=${result}`);
    }
  }

  getActivationOrder(windowId: number): number[]
  {
    const history = this.#history.get(windowId);
    if (!history || history.stack.length === 0) return [];

    // Return tab IDs from current index backwards (most recent first)
    const result: number[] = [];
    for (let i = history.index; i >= 0; i--)
    {
      result.push(history.stack[i].tabId);
    }
    return result;
  }

  async getHistoryDetails(windowId: number): Promise<{
    before: Array<{ tabId: number; spaceId: string; index: number; title: string; url: string; favIconUrl: string }>;
    after: Array<{ tabId: number; spaceId: string; index: number; title: string; url: string; favIconUrl: string }>;
    currentIndex: number;
  }>
  {
    const history = this.#history.get(windowId);
    if (!history || history.stack.length === 0)
    {
      return { before: [], after: [], currentIndex: -1 };
    }

    const before: Array<{ tabId: number; spaceId: string; index: number; title: string; url: string; favIconUrl: string }> = [];
    const after: typeof before = [];

    for (let i = 0; i < history.stack.length; i++)
    {
      const entry = history.stack[i];
      try
      {
        const tab = await chrome.tabs.get(entry.tabId);
        // Lookup space dynamically at query time (fallback to 'all' for pinned tabs)
        const spaceId = await getSpaceForTab(windowId, entry.tabId) ?? 'all';
        const item = {
          tabId: entry.tabId,
          spaceId,
          index: i,
          title: tab.title || '(no title)',
          url: tab.url || tab.pendingUrl || '',
          favIconUrl: tab.favIconUrl || ''
        };

        if (i < history.index)
        {
          before.push(item);
        }
        else if (i > history.index)
        {
          after.push(item);
        }
      }
      catch { /* Tab no longer exists */ }
    }

    before.reverse();
    return { before, after, currentIndex: history.index };
  }

  removeWindow(windowId: number): void
  {
    this.#history.delete(windowId);
    this.#navigatingWindows.delete(windowId);
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([TabHistoryManager.STORAGE_KEY]);
    if (result[TabHistoryManager.STORAGE_KEY])
    {
      for (const [key, value] of result[TabHistoryManager.STORAGE_KEY])
      {
        this.#history.set(key, value);
      }
    }
  }

  // Debug: dump complete history with tab details
  private async dump(_windowId: number, _action: string): Promise<void>
  {
    return;
  //   const history = this.#history.get(windowId);
  //   if (!history)
  //   {
  //     console.log(`[TabHistory] ${action} - windowId=${windowId}: NO HISTORY`);
  //     return;
  //   }

  //   const uniqueSpaceIds = [...new Set(history.stack.map(e => e.spaceId))];
  //   const spaceNameMap: Record<string, string> = { all: 'All' };
  //   const result = await chrome.storage.local.get(['spaces']);
  //   const spaces = result.spaces || [];
  //   for (const spaceId of uniqueSpaceIds)
  //   {
  //     if (spaceId !== 'all')
  //     {
  //       const space = spaces.find((s: { id: string; name: string }) => s.id === spaceId);
  //       spaceNameMap[spaceId] = space ? space.name : spaceId;
  //     }
  //   }

  //   console.log(`\n[TabHistory] --- begin ---`);
  //   console.log(`[TabHistory] ${action} - windowId=${windowId}, index=${history.index}, size=${history.stack.length}`);
  //   console.log(`[TabHistory] spaces: ${uniqueSpaceIds.map(id => `${spaceNameMap[id]}`).join(', ')}`);

  //   for (let i = 0; i < history.stack.length; i++)
  //   {
  //     const entry = history.stack[i];
  //     const marker = i === history.index ? ">>>" : "   ";
  //     const spaceName = spaceNameMap[entry.spaceId] || "(not found)";
  //     try
  //     {
  //       const tab = await chrome.tabs.get(entry.tabId);
  //       const title = tab.title || "(no title)";
  //       const url = tab.url || tab.pendingUrl || "(no url)";
  //       console.log(`${marker} [${i}] space="${spaceName}", spaceId="${entry.spaceId}", title="${title}", url="${url}"`);
  //     }
  //     catch
  //     {
  //       console.log(`${marker} [${i}] space="${spaceName}", spaceId="${entry.spaceId}", (tab not found - closed?)`);
  //     }
  //   }
  //   console.log(`[TabHistory] --- end ---`);
  }
}

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

// =============================================================================
// LastAudibleTracker - Tracks the most recently audible tabs (in memory)
// =============================================================================

class LastAudibleTracker
{
  static STORAGE_KEY = 'bg_lastAudibleTabIds';
  static MAX_HISTORY_SIZE = 5;

  #lastAudibleTabIds: number[] = [];

  getLastAudibleTabIds(): number[]
  {
    return [...this.#lastAudibleTabIds];
  }

  setLastAudibleTabId(tabId: number): void
  {
    // Remove if already exists (move-to-front deduplication)
    const existingIndex = this.#lastAudibleTabIds.indexOf(tabId);
    if (existingIndex !== -1)
    {
      this.#lastAudibleTabIds.splice(existingIndex, 1);
    }

    // Add to front
    this.#lastAudibleTabIds.unshift(tabId);

    // Trim to max size
    if (this.#lastAudibleTabIds.length > LastAudibleTracker.MAX_HISTORY_SIZE)
    {
      this.#lastAudibleTabIds.length = LastAudibleTracker.MAX_HISTORY_SIZE;
    }

    this.#save();
  }

  clearIfMatches(tabId: number): void
  {
    const index = this.#lastAudibleTabIds.indexOf(tabId);
    if (index !== -1)
    {
      this.#lastAudibleTabIds.splice(index, 1);
      this.#save();
    }
  }

  #save(): void
  {
    chrome.storage.session.set({ [LastAudibleTracker.STORAGE_KEY]: this.#lastAudibleTabIds });
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([LastAudibleTracker.STORAGE_KEY]);
    this.#lastAudibleTabIds = result[LastAudibleTracker.STORAGE_KEY] ?? [];
  }
}

// =============================================================================
// TabSpaceRegistry - Tracks home space for tabs opened from bookmarks
// =============================================================================

class TabSpaceRegistry
{
  static STORAGE_KEY = 'bg_tabSpaces';

  // Map<windowId, Map<tabId, spaceId>>
  #registry: Map<number, Map<number, string>> = new Map();

  register(windowId: number, tabId: number, spaceId: string): void
  {
    if (!this.#registry.has(windowId))
    {
      this.#registry.set(windowId, new Map());
    }
    this.#registry.get(windowId)!.set(tabId, spaceId);
    this.save();
  }

  getSpace(windowId: number, tabId: number): string | undefined
  {
    return this.#registry.get(windowId)?.get(tabId);
  }

  unregister(windowId: number, tabId: number): void
  {
    this.#registry.get(windowId)?.delete(tabId);
    this.save();
  }

  private save(): void
  {
    const data: Array<[number, Array<[number, string]>]> = [];
    for (const [windowId, tabMap] of this.#registry)
    {
      data.push([windowId, Array.from(tabMap.entries())]);
    }
    chrome.storage.session.set({ [TabSpaceRegistry.STORAGE_KEY]: data });
  }

  removeWindow(windowId: number): void
  {
    this.#registry.delete(windowId);
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([TabSpaceRegistry.STORAGE_KEY]);
    const data = result[TabSpaceRegistry.STORAGE_KEY];
    if (data)
    {
      for (const [windowId, entries] of data)
      {
        this.#registry.set(windowId, new Map(entries));
      }
    }
  }
}

// =============================================================================
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

interface Space
{
  id: string;
  name: string;
  color: string;
}

// Find Chrome group by name in a window
async function findGroupByName(windowId: number, name: string): Promise<number | undefined>
{
  const groups = await chrome.tabGroups.query({ windowId, title: name });
  return groups[0]?.id;
}

// Get a space by ID from storage
async function getSpaceById(spaceId: string): Promise<Space | undefined>
{
  const result = await chrome.storage.local.get(['spaces']);
  const spaces: Space[] = result.spaces || [];
  return spaces.find(s => s.id === spaceId);
}

// Find a space by name from storage
async function findSpaceByName(name: string | undefined): Promise<Space | undefined>
{
  if (!name) return undefined;
  const result = await chrome.storage.local.get(['spaces']);
  const spaces: Space[] = result.spaces || [];
  return spaces.find(s => s.name === name);
}

// Forward declaration - will be initialized below
let tabSpaceRegistry: TabSpaceRegistry;

// Get space ID for a tab at navigation time
// Priority: Tab registry > pending > Chrome group > 'all' for ungrouped
// Returns undefined for pinned tabs (don't switch space)
async function getSpaceForTab(windowId: number, tabId: number): Promise<string | undefined>
{
  // 1. Check tab registry
  const registeredSpace = tabSpaceRegistry.getSpace(windowId, tabId);
  if (registeredSpace) return registeredSpace;

  try
  {
    const tab = await chrome.tabs.get(tabId);

    // 4. Check Chrome group
    if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
    {
      const group = await chrome.tabGroups.get(tab.groupId);
      const space = await findSpaceByName(group.title);
      if (space) return space.id;
    }
  }
  catch { /* Tab may not exist */ }

  // 5. Ungrouped normal tab → 'all'
  return undefined;
}

/**
 * Activates a tab and switches to its space.
 *
 * @param tabId - The tab to activate
 * @param skipHistory - If true, don't add to tab history
 * @returns Object with success status, spaceId, and optional error
 */
async function setActiveTabAndSpace(
  tabId: number
): Promise<{ success: boolean; error?: string }>
{
  try
  {
    // Activate the tab
    // Our chrome.tabs.onActivatelistener will bring up its active space
    // and add to history.
    const tab = await chrome.tabs.update(tabId, { active: true });

    if (!tab.windowId)
    {
      return { success: false, error: 'Tab has no window' };
    }

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
const historyManager = new TabHistoryManager();
const groupTracker = new TabGroupTracker();
const lastAudibleTracker = new LastAudibleTracker();
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
  historyManager.load(),
  groupTracker.load(),
  lastAudibleTracker.load(),
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

  // Switch sidebar to tab's Space (unless in "All" space or pinned tab)
  if (destinationSpaceId && spaceStateManager.getActiveSpace(activeInfo.windowId) !== 'all')
  {
    const currentSpaceId = spaceStateManager.getActiveSpace(activeInfo.windowId);
    if (currentSpaceId !== destinationSpaceId)
    {
      spaceStateManager.setActiveSpace(activeInfo.windowId, destinationSpaceId);
    }
  }

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

  // Update URL in local backup when a managed tab navigates
  if (changeInfo.url)
  {
    try
    {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.windowId) return;

      const associations = await getTabAssociations(tab.windowId);
      const itemKey = associations[tabId];
      if (itemKey)
      {
        saveTabAssociationBackup(tab.windowId, itemKey, { tabId, url: changeInfo.url, tabIndex: tab.index });
      }
    }
    catch { /* tab may have been closed */ }
  }

  // Scenario 5: update pinned site favicon when Chrome reports a new favIconUrl
  if (changeInfo.favIconUrl)
  {
    try
    {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url) return;

      let tabHostname: string;
      try { tabHostname = new URL(tab.url).hostname; }
      catch { return; }

      const PINNED_KEY = 'pinnedSites';
      const result = await chrome.storage.local.get([PINNED_KEY]);
      const sites = (result[PINNED_KEY] || []) as Array<{
        id: string; url: string; favicon?: string;
        customIconName?: string; emoji?: string;
      }>;

      // Match by hostname, only sites without favicon and no custom icon/emoji
      const matchingSites = sites.filter(site =>
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
          const updatedSites = sites.map(site =>
            matchingSites.some(m => m.id === site.id)
              ? { ...site, favicon }
              : site
          );

          await chrome.storage.local.set({ [PINNED_KEY]: updatedSites });

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
  activeSpaceId: string;  // Captured at queue time
}
const groupingQueue: TabGroupingRequest[] = [];
let isProcessingGroupingQueue = false;

// Queue a tab for grouping - prevents race condition when multiple tabs created rapidly
function queueTabForGrouping(tab: chrome.tabs.Tab): void
{
  if (!tab.id || !tab.windowId) return;

  // Capture active space at queue time (not processing time)
  const activeSpaceId = spaceStateManager.getActiveSpace(tab.windowId);
  if (!activeSpaceId || activeSpaceId === 'all') return;

  groupingQueue.push({ tabId: tab.id, windowId: tab.windowId, activeSpaceId });
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
  const { tabId, windowId, activeSpaceId } = request;

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
    // Verify tab still exists and is ungrouped
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;

    const space = await getSpaceById(activeSpaceId);
    if (!space) return;

    // Find existing Chrome group with Space's name
    const existingGroupId = await findGroupByName(windowId, space.name);

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
// Audio Tab Helper
// =============================================================================

/**
 * Returns lists of playing and recently-played audio tabs.
 * - playingTabIds: currently audible tabs (ordered by play-start time)
 * - historyTabIds: recently stopped audio tabs (ordered by activation recency)
 */
function getAudioTabLists(allTabs: chrome.tabs.Tab[]): { playingTabIds: number[]; historyTabIds: number[] }
{
  const audibleTabIds = new Set(
    allTabs.filter(t => t.audible && t.id !== undefined).map(t => t.id!)
  );
  const lastAudibleIds = lastAudibleTracker.getLastAudibleTabIds();

  // Playing tabs: from lastAudibleIds, filtered to currently audible (keeps play-start order)
  const playingTabIds = lastAudibleIds.filter(id => audibleTabIds.has(id));

  // Include any audible tabs not yet in history (just started playing)
  for (const tab of allTabs)
  {
    if (tab.audible && tab.id !== undefined && !playingTabIds.includes(tab.id))
    {
      playingTabIds.push(tab.id);
    }
  }

  // Non-playing tabs from history
  const historyTabIds = lastAudibleIds.filter(id => !audibleTabIds.has(id));

  // Sort historyTabIds by activation order
  const windowId = allTabs[0]?.windowId;
  if (windowId !== undefined)
  {
    const activationOrder = historyManager.getActivationOrder(windowId);
    historyTabIds.sort((a, b) =>
    {
      const aIndex = activationOrder.indexOf(a);
      const bIndex = activationOrder.indexOf(b);
      // Not in history = put at end
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      // Lower index = more recently activated
      return aIndex - bIndex;
    });
  }

  return { playingTabIds, historyTabIds };
}

// =============================================================================
// Message Handlers
// =============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
  // Get current SpaceWindowState for a window
  if (message.action === SpaceMessageAction.GET_WINDOW_STATE)
  {
    (async () =>
    {
      await stateReady;
      if (message.windowId)
      {
        const state = spaceStateManager.getState(message.windowId);
        sendResponse(state);
      }
    })();
    return true;
  }

  // Set active space
  if (message.action === SpaceMessageAction.SET_ACTIVE_SPACE)
  {
    (async () =>
    {
      await stateReady;
      if (message.windowId && message.spaceId)
      {
        spaceStateManager.setActiveSpace(message.windowId, message.spaceId);
      }
    })();
    return;
  }

  // Re-queue a tab for grouping check (used by sidebar after storing association)
  if (message.action === 'queue-tab-for-grouping')
  {
    (async () =>
    {
      await stateReady;
      if (message.tabId && message.windowId)
      {
        queueTabForGrouping({ id: message.tabId, windowId: message.windowId } as chrome.tabs.Tab);
      }
    })();
    return;
  }

  if (message.action === 'prev-used-tab' || message.action === 'next-used-tab')
  {
    (async () =>
    {
      await stateReady;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
      {
        if (tabs.length === 0) return;
        const direction = message.action === 'prev-used-tab' ? -1 : 1;
        historyManager.navigate(tabs[0].windowId, direction);
      });
    })();
  }
  else if (message.action === 'get-tab-history')
  {
    (async () =>
    {
      await stateReady;
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) =>
      {
        if (tabs.length === 0)
        {
          sendResponse({ before: [], after: [], currentIndex: -1 });
          return;
        }

        const result = await historyManager.getHistoryDetails(tabs[0].windowId);
        sendResponse(result);
      });
    })();
    return true;  // async response
  }
  else if (message.action === 'navigate-to-history-index')
  {
    (async () =>
    {
      await stateReady;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
      {
        if (tabs.length === 0) return;
        historyManager.navigateToIndex(tabs[0].windowId, message.index);
      });
    })();
  }
  else if (message.action === 'register-tab-space')
  {
    (async () =>
    {
      await stateReady;
      tabSpaceRegistry.register(message.windowId, message.tabId, message.spaceId);
    })();
    return;
  }
  else if (message.action === 'set-active-tab-and-space')
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
  else if (message.action === 'get-last-audible-tab')
  {
    (async () =>
    {
      await stateReady;
      chrome.tabs.query({ currentWindow: true }, (allTabs) =>
      {
        sendResponse(getAudioTabLists(allTabs));
      });
    })();
    return true;
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
    else if (command === "jump-to-audio-tab")
    {
      chrome.tabs.query({ currentWindow: true }, (allTabs) =>
      {
        const { playingTabIds, historyTabIds } = getAudioTabLists(allTabs);

        // Try first playing tab, then fall back to first history tab
        const targetTabId = playingTabIds[0] ?? historyTabIds[0];

        if (targetTabId !== undefined)
        {
          chrome.tabs.update(targetTabId, { active: true });
        }
      });
    }
    // Note: focus-filter-input is handled directly in the side panel
  })();
});
