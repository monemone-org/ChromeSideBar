import { SpaceMessageAction, SpaceWindowState, DEFAULT_WINDOW_STATE } from './utils/spaceMessages';
import { LIVEBOOKMARKS_GROUP_NAME } from './constants';

// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Feature flags
const ENABLE_AUTO_GROUP_NEW_TABS = false;

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
  spaceId: string;
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
  #isNavigating = false;  // flag to skip history tracking during navigation
  #spaceStateManager: SpaceWindowStateManager;

  constructor(spaceStateManager: SpaceWindowStateManager)
  {
    this.#spaceStateManager = spaceStateManager;
  }

  get isNavigating(): boolean
  {
    return this.#isNavigating;
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
    const spaceId = this.#spaceStateManager.getActiveSpace(windowId);

    // skip if same as current entry (same tab AND same space)
    if (history.index >= 0)
    {
      const current = history.stack[history.index];
      if (current.tabId === tabId && current.spaceId === spaceId)
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
    history.stack.splice(history.index + 1, 0, { tabId, spaceId });
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
    if (import.meta.env.DEV) this.dump(windowId, `PUSH tabId=${tabId}, spaceId=${spaceId}`);
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
    if (import.meta.env.DEV) this.dump(windowId, `REMOVE tabId=${tabId}`);
  }

  navigate(windowId: number, direction: number): void
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
      this.dump(windowId, `NAVIGATE ${dirLabel} to tabId=${entry.tabId}, spaceId=${entry.spaceId}`);
    }

    if (import.meta.env.DEV) console.log(`[TabHistory] navigate: setting isNavigating=true`);
    this.#isNavigating = true;

    chrome.tabs.update(entry.tabId, { active: true }, () =>
    {
      if (import.meta.env.DEV) console.log(`[TabHistory] navigate callback: setting isNavigating=false`);
      this.#isNavigating = false;

      // Notify sidepanel to switch to the space
      if (entry.spaceId)
      {
        chrome.runtime.sendMessage({
          action: SpaceMessageAction.HISTORY_TAB_ACTIVATED,
          tabId: entry.tabId,
          spaceId: entry.spaceId
        });
      }
    });
  }

  navigateToIndex(windowId: number, index: number): void
  {
    const history = this.#history.get(windowId);
    if (!history || index < 0 || index >= history.stack.length) return;

    history.index = index;
    const entry = history.stack[index];
    this.save();

    if (import.meta.env.DEV) this.dump(windowId, `NAVIGATE to index=${index}, tabId=${entry.tabId}, spaceId=${entry.spaceId}`);

    this.#isNavigating = true;
    chrome.tabs.update(entry.tabId, { active: true }, () =>
    {
      this.#isNavigating = false;

      // Notify sidepanel to switch to the space
      if (entry.spaceId)
      {
        chrome.runtime.sendMessage({
          action: SpaceMessageAction.HISTORY_TAB_ACTIVATED,
          tabId: entry.tabId,
          spaceId: entry.spaceId
        });
      }
    });
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
        const item = {
          tabId: entry.tabId,
          spaceId: entry.spaceId,
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
// Space-Group Helper Functions
// =============================================================================

interface Space
{
  id: string;
  name: string;
  color: chrome.tabGroups.ColorEnum;
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

// =============================================================================
// Initialize trackers
// =============================================================================

const spaceStateManager = new SpaceWindowStateManager();
const historyManager = new TabHistoryManager(spaceStateManager);
const groupTracker = new TabGroupTracker();

// Load persisted state
Promise.all([
  spaceStateManager.load(),
  historyManager.load(),
  groupTracker.load()
]);

// =============================================================================
// Event Listeners
// =============================================================================

// Update tracked group when active tab changes + track history + switch to tab's Space
chrome.tabs.onActivated.addListener(async (activeInfo) =>
{
  //if (import.meta.env.DEV) console.log(`[TabHistory] onActivated: tabId=${activeInfo.tabId}, isNavigating=${historyManager.isNavigating}`);

  // Track tab history (skip if this activation was triggered by navigation)
  if (!historyManager.isNavigating)
  {
    historyManager.push(activeInfo.windowId, activeInfo.tabId);
  }

  // Switch sidebar to tab's Space based on its Chrome group
  // Skip if currently in "All" space (user wants to stay in overview mode)
  if (spaceStateManager.getActiveSpace(activeInfo.windowId) !== 'all')
  {
    try
    {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
      {
        const group = await chrome.tabGroups.get(tab.groupId);
        const space = await findSpaceByName(group.title);
        if (space)
        {
          const currentSpaceId = spaceStateManager.getActiveSpace(activeInfo.windowId);
          if (currentSpaceId !== space.id)
          {
            spaceStateManager.setActiveSpace(activeInfo.windowId, space.id);
          }
        }
      }
    }
    catch
    {
      // Tab or group may have been closed
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

// Clean up history when tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) =>
{
  historyManager.remove(removeInfo.windowId, tabId);
});

// Helper to add a tab to the active space's Chrome group
async function addTabToActiveSpaceGroup(tab: chrome.tabs.Tab): Promise<boolean>
{
  if (!tab.id || !tab.windowId) return false;

  const activeSpaceId = spaceStateManager.getActiveSpace(tab.windowId);
  if (!activeSpaceId || activeSpaceId === 'all') return false;

  try
  {
    const space = await getSpaceById(activeSpaceId);
    if (!space) return false;

    // Find existing Chrome group with Space's name
    const existingGroupId = await findGroupByName(tab.windowId, space.name);

    if (existingGroupId)
    {
      // Add to existing group
      await chrome.tabs.group({ tabIds: [tab.id], groupId: existingGroupId });
    }
    else
    {
      // Create new group with this tab
      const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
      await chrome.tabGroups.update(newGroupId, {
        title: space.name,
        color: space.color,
      });
    }
    return true;
  }
  catch (error)
  {
    if (import.meta.env.DEV) console.error('[addTabToActiveSpaceGroup] Failed:', error);
    return false;
  }
}

// Add new tabs to active Space's Chrome group
// Special handling: tabs opened from LiveBookmarks inherit that group, so move them
chrome.tabs.onCreated.addListener(async (tab) =>
{
  if (!tab.id || !tab.windowId) return;

  // Check if tab is in LiveBookmarks group - needs special handling
  if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
  {
    try
    {
      const group = await chrome.tabGroups.get(tab.groupId);
      if (group.title === LIVEBOOKMARKS_GROUP_NAME)
      {
        // Only move if opened from a tab that's also in LiveBookmarks group
        if (!tab.openerTabId) return;

        const openerTab = await chrome.tabs.get(tab.openerTabId);
        if (openerTab.groupId !== tab.groupId) return;

        const activeSpaceId = spaceStateManager.getActiveSpace(tab.windowId);
        if (!activeSpaceId || activeSpaceId === 'all')
        {
          // Ungroup the tab (make it orphaned)
          await chrome.tabs.ungroup(tab.id);
          return;
        }

        addTabToActiveSpaceGroup(tab)
        return;
      }
    }
    catch
    {
      // Group or opener tab might not exist, continue
    }

    // Tab is in a non-LiveBookmarks group - leave it alone
    return;
  }

  // Ungrouped tab - add to active space's group
  await addTabToActiveSpaceGroup(tab);
});

// =============================================================================
// Message Handlers
// =============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
  // Get current SpaceWindowState for a window
  if (message.action === SpaceMessageAction.GET_WINDOW_STATE)
  {
    if (message.windowId)
    {
      const state = spaceStateManager.getState(message.windowId);
      sendResponse(state);
    }
    return true;  // async response
  }

  // Set active space
  if (message.action === SpaceMessageAction.SET_ACTIVE_SPACE)
  {
    if (message.windowId && message.spaceId)
    {
      spaceStateManager.setActiveSpace(message.windowId, message.spaceId);
    }
    return;
  }

  if (message.action === 'prev-used-tab' || message.action === 'next-used-tab')
  {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length === 0) return;
      const direction = message.action === 'prev-used-tab' ? -1 : 1;
      historyManager.navigate(tabs[0].windowId, direction);
    });
  }
  else if (message.action === 'get-tab-history')
  {
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

    return true;  // async response
  }
  else if (message.action === 'navigate-to-history-index')
  {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length === 0) return;
      historyManager.navigateToIndex(tabs[0].windowId, message.index);
    });
  }
});

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

chrome.commands.onCommand.addListener((command) =>
{
  if (command === "new-tab-in-group")
  {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length === 0) return;

      const activeTab = tabs[0];
      const groupId = activeTab.groupId;

      chrome.tabs.create({ active: true }, (newTab) =>
      {
        if (groupId && groupId !== -1 && newTab.id)
        {
          chrome.tabs.group({ tabIds: [newTab.id], groupId });
        }
      });
    });
  }
  else if (command === "prev-used-tab" || command === "next-used-tab")
  {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length === 0) return;
      const direction = command === "prev-used-tab" ? -1 : 1;
      historyManager.navigate(tabs[0].windowId, direction);
    });
  }
  // Note: focus-filter-input and navigate-spaces are handled directly in the side panel
});
