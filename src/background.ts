// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Feature flags
const ENABLE_AUTO_GROUP_NEW_TABS = false;

// =============================================================================
// SpaceTabTracker - Manages active space and last-active-tab per space
// =============================================================================

interface ActivateResult
{
  success: boolean;
  action: 'activated-last' | 'activated-first' | 'already-active' | 'none';
  tabId?: number;
}

class SpaceTabTracker
{
  static KEYS = {
    ACTIVE_SPACES: 'bg_windowActiveSpaces',
    LAST_ACTIVE_TABS: 'bg_spaceLastActiveTabs'
  };

  #activeSpaces = new Map<number, string>();  // windowId -> spaceId
  #lastActiveTabs = new Map<number, Record<string, number>>();  // windowId -> {spaceId -> tabId}

  // --- Active Space ---

  getActiveSpace(windowId: number): string | undefined
  {
    return this.#activeSpaces.get(windowId);
  }

  setActiveSpace(windowId: number, spaceId: string): void
  {
    this.#activeSpaces.set(windowId, spaceId);
    chrome.storage.session.set({
      [SpaceTabTracker.KEYS.ACTIVE_SPACES]: Array.from(this.#activeSpaces.entries())
    });
  }

  // --- Last Active Tab per Space ---

  getLastActiveTab(windowId: number, spaceId: string): number | undefined
  {
    return this.#lastActiveTabs.get(windowId)?.[spaceId];
  }

  private setLastActiveTab(windowId: number, spaceId: string, tabId: number): void
  {
    let windowMap = this.#lastActiveTabs.get(windowId);
    if (!windowMap)
    {
      windowMap = {};
      this.#lastActiveTabs.set(windowId, windowMap);
    }
    windowMap[spaceId] = tabId;
    chrome.storage.session.set({
      [SpaceTabTracker.KEYS.LAST_ACTIVE_TABS]: Array.from(this.#lastActiveTabs.entries())
    });
  }

  // Update last active tab (checks if tab belongs to space first)
  async updateLastActiveTab(windowId: number, spaceId: string, tabId: number): Promise<void>
  {
    if (!spaceId) return;

    // Check if tab belongs to this space (read spaceTabs from sidebar's storage)
    // Skip check for "all" space since all tabs belong to it
    if (spaceId !== 'all')
    {
      const windowStateKey = `spaceWindowState_${windowId}`;
      const result = await chrome.storage.session.get([windowStateKey]);
      const windowState = result[windowStateKey];
      const spaceTabs = windowState?.spaceTabs?.[spaceId] || [];
      if (!spaceTabs.includes(tabId))
      {
        return;  // Tab doesn't belong to this space
      }
    }

    this.setLastActiveTab(windowId, spaceId, tabId);
  }

  // Remove tab from all spaces' last-active mappings (when tab is closed)
  removeTab(windowId: number, tabId: number): void
  {
    const windowMap = this.#lastActiveTabs.get(windowId);
    if (!windowMap) return;

    let changed = false;
    for (const spaceId of Object.keys(windowMap))
    {
      if (windowMap[spaceId] === tabId)
      {
        delete windowMap[spaceId];
        changed = true;
      }
    }

    if (changed)
    {
      chrome.storage.session.set({
        [SpaceTabTracker.KEYS.LAST_ACTIVE_TABS]: Array.from(this.#lastActiveTabs.entries())
      });
    }
  }

  // Activate last tab when switching to a space
  async activateLastTab(windowId: number, spaceId: string): Promise<ActivateResult>
  {
    const lastActiveTabId = this.getLastActiveTab(windowId, spaceId);

    if (import.meta.env.DEV)
    {
      console.log(`[SpaceTabTracker] activateLastTab: spaceId="${spaceId}", lastActiveTabId=${lastActiveTabId}`);
    }

    // Try stored last active tab
    if (lastActiveTabId)
    {
      try
      {
        const tab = await chrome.tabs.get(lastActiveTabId);
        if (tab && !tab.active)
        {
          if (import.meta.env.DEV) console.log(`[SpaceTabTracker] activateLastTab: result=activated-last, tabId=${lastActiveTabId}`);
          await chrome.tabs.update(lastActiveTabId, { active: true });
          return { success: true, action: 'activated-last', tabId: lastActiveTabId };
        }
        if (tab && tab.active)
        {
          if (import.meta.env.DEV) console.log(`[SpaceTabTracker] activateLastTab: result=already-active, tabId=${lastActiveTabId}`);
          return { success: true, action: 'already-active', tabId: lastActiveTabId };
        }
      }
      catch { /* tab doesn't exist */ }
    }

    // Fallback: first tab in space (from spaceTabs)
    const storageKey = `spaceWindowState_${windowId}`;
    const result = await chrome.storage.session.get([storageKey]);
    const windowState = result[storageKey];
    const spaceTabs = windowState?.spaceTabs?.[spaceId] || [];

    for (const tabId of spaceTabs)
    {
      try
      {
        const tab = await chrome.tabs.get(tabId);
        if (tab && !tab.active)
        {
          if (import.meta.env.DEV) console.log(`[SpaceTabTracker] activateLastTab: result=activated-first, tabId=${tabId}`);
          await chrome.tabs.update(tabId, { active: true });
          return { success: true, action: 'activated-first', tabId };
        }
        if (tab && tab.active)
        {
          if (import.meta.env.DEV) console.log(`[SpaceTabTracker] activateLastTab: result=already-active, tabId=${tabId}`);
          return { success: true, action: 'already-active', tabId };
        }
      }
      catch { /* tab doesn't exist, try next */ }
    }

    if (import.meta.env.DEV) console.log(`[SpaceTabTracker] activateLastTab: result=none (no tabs)`);
    return { success: true, action: 'none' };
  }

  // --- Persistence ---

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([
      SpaceTabTracker.KEYS.ACTIVE_SPACES,
      SpaceTabTracker.KEYS.LAST_ACTIVE_TABS
    ]);

    if (result[SpaceTabTracker.KEYS.ACTIVE_SPACES])
    {
      for (const [key, value] of result[SpaceTabTracker.KEYS.ACTIVE_SPACES])
      {
        this.#activeSpaces.set(key, value);
      }
    }

    if (result[SpaceTabTracker.KEYS.LAST_ACTIVE_TABS])
    {
      for (const [key, value] of result[SpaceTabTracker.KEYS.LAST_ACTIVE_TABS])
      {
        this.#lastActiveTabs.set(key, value);
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
  #spaceTracker: SpaceTabTracker;

  constructor(spaceTracker: SpaceTabTracker)
  {
    this.#spaceTracker = spaceTracker;
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
    const spaceId = this.#spaceTracker.getActiveSpace(windowId) || 'all';

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

      if (entry.spaceId)
      {
        this.#spaceTracker.updateLastActiveTab(windowId, entry.spaceId, entry.tabId);
        chrome.runtime.sendMessage({
          action: 'history-tab-activated',
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

      if (entry.spaceId)
      {
        this.#spaceTracker.updateLastActiveTab(windowId, entry.spaceId, entry.tabId);
        chrome.runtime.sendMessage({
          action: 'history-tab-activated',
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
  private async dump(windowId: number, action: string): Promise<void>
  {
    const history = this.#history.get(windowId);
    if (!history)
    {
      console.log(`[TabHistory] ${action} - windowId=${windowId}: NO HISTORY`);
      return;
    }

    const uniqueSpaceIds = [...new Set(history.stack.map(e => e.spaceId))];
    const spaceNameMap: Record<string, string> = { all: 'All' };
    const result = await chrome.storage.local.get(['spaces']);
    const spaces = result.spaces || [];
    for (const spaceId of uniqueSpaceIds)
    {
      if (spaceId !== 'all')
      {
        const space = spaces.find((s: { id: string; name: string }) => s.id === spaceId);
        spaceNameMap[spaceId] = space ? space.name : spaceId;
      }
    }

    console.log(`\n[TabHistory] --- begin ---`);
    console.log(`[TabHistory] ${action} - windowId=${windowId}, index=${history.index}, size=${history.stack.length}`);
    console.log(`[TabHistory] spaces: ${uniqueSpaceIds.map(id => `${spaceNameMap[id]}`).join(', ')}`);

    for (let i = 0; i < history.stack.length; i++)
    {
      const entry = history.stack[i];
      const marker = i === history.index ? ">>>" : "   ";
      const spaceName = spaceNameMap[entry.spaceId] || "(not found)";
      try
      {
        const tab = await chrome.tabs.get(entry.tabId);
        const title = tab.title || "(no title)";
        const url = tab.url || tab.pendingUrl || "(no url)";
        console.log(`${marker} [${i}] space="${spaceName}", spaceId="${entry.spaceId}", title="${title}", url="${url}"`);
      }
      catch
      {
        console.log(`${marker} [${i}] space="${spaceName}", spaceId="${entry.spaceId}", (tab not found - closed?)`);
      }
    }
    console.log(`[TabHistory] --- end ---`);
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
// Initialize trackers
// =============================================================================

const spaceTracker = new SpaceTabTracker();
const historyManager = new TabHistoryManager(spaceTracker);
const groupTracker = new TabGroupTracker();

// Load persisted state
Promise.all([
  spaceTracker.load(),
  historyManager.load(),
  groupTracker.load()
]);

// =============================================================================
// Event Listeners
// =============================================================================

// Update tracked group when active tab changes + track history
chrome.tabs.onActivated.addListener((activeInfo) =>
{
  if (import.meta.env.DEV) console.log(`[TabHistory] onActivated: tabId=${activeInfo.tabId}, isNavigating=${historyManager.isNavigating}`);

  // Track tab history (skip if this activation was triggered by navigation)
  if (!historyManager.isNavigating)
  {
    historyManager.push(activeInfo.windowId, activeInfo.tabId);
  }

  chrome.tabs.get(activeInfo.tabId, (tab) =>
  {
    if (tab)
    {
      if (ENABLE_AUTO_GROUP_NEW_TABS && tab.groupId !== undefined)
      {
        groupTracker.setActiveGroup(activeInfo.windowId, tab.groupId);
      }

      // Track last active tab for current space
      const spaceId = spaceTracker.getActiveSpace(activeInfo.windowId);
      if (spaceId)
      {
        spaceTracker.updateLastActiveTab(activeInfo.windowId, spaceId, activeInfo.tabId);
      }
    }
  });
});

// Clean up history when tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) =>
{
  historyManager.remove(removeInfo.windowId, tabId);
  spaceTracker.removeTab(removeInfo.windowId, tabId);
});

// Auto-group all new tabs when active tab is in a group
chrome.tabs.onCreated.addListener((tab) =>
{
  if (ENABLE_AUTO_GROUP_NEW_TABS)
  {
    const groupId = groupTracker.getActiveGroup(tab.windowId);
    if (groupId && groupId !== -1 && tab.id)
    {
      chrome.tabs.group({ tabIds: [tab.id], groupId });
    }
  }
});

// =============================================================================
// Message Handlers
// =============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
  // Track active space (no tab activation) - used by history navigation, etc.
  if (message.action === 'set-active-space')
  {
    if (message.windowId && message.spaceId)
    {
      spaceTracker.setActiveSpace(message.windowId, message.spaceId);
      if (import.meta.env.DEV)
      {
        console.log(`[SpaceTabTracker] set-active-space: spaceId="${message.spaceId}" (tracking only)`);
      }
    }
    return;
  }

  // Switch to space AND activate last tab - used by user clicks, swipes
  if (message.action === 'switch-to-space')
  {
    if (message.windowId && message.spaceId)
    {
      spaceTracker.setActiveSpace(message.windowId, message.spaceId);
      if (import.meta.env.DEV)
      {
        console.log(`[SpaceTabTracker] switch-to-space: spaceId="${message.spaceId}"`);
      }

      spaceTracker.activateLastTab(message.windowId, message.spaceId).then(sendResponse);
      return true;  // async response
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
