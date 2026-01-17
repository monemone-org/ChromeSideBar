// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Feature flags
const ENABLE_AUTO_GROUP_NEW_TABS = false;

// Centralized state management with granular persistence
class BackgroundState
{
  // Storage keys for session persistence
  static KEYS = {
    ACTIVE_GROUPS: 'bg_windowActiveGroups',
    ACTIVE_SPACES: 'bg_windowActiveSpaces',
    TAB_HISTORY: 'bg_windowTabHistory',
    SPACE_LAST_ACTIVE_TABS: 'bg_spaceLastActiveTabs'
  };

  #activeGroups = new Map<number, number>();  // windowId -> groupId
  #activeSpaces = new Map<number, string>();  // windowId -> spaceId
  #tabHistory = new Map<number, { stack: { tabId: number; spaceId: string }[]; index: number }>();
  #spaceLastActiveTabs = new Map<number, Record<string, number>>();  // windowId -> {spaceId -> tabId}

  // --- Active Groups ---
  getActiveGroup(windowId: number): number | undefined
  {
    return this.#activeGroups.get(windowId);
  }

  setActiveGroup(windowId: number, groupId: number): void
  {
    this.#activeGroups.set(windowId, groupId);
    chrome.storage.session.set({
      [BackgroundState.KEYS.ACTIVE_GROUPS]: Array.from(this.#activeGroups.entries())
    });
  }

  // --- Active Spaces ---
  getActiveSpace(windowId: number): string | undefined
  {
    return this.#activeSpaces.get(windowId);
  }

  setActiveSpace(windowId: number, spaceId: string): void
  {
    this.#activeSpaces.set(windowId, spaceId);
    chrome.storage.session.set({
      [BackgroundState.KEYS.ACTIVE_SPACES]: Array.from(this.#activeSpaces.entries())
    });
  }

  // --- Tab History ---
  getHistory(windowId: number)
  {
    return this.#tabHistory.get(windowId);
  }

  hasHistory(windowId: number): boolean
  {
    return this.#tabHistory.has(windowId);
  }

  getOrCreateHistory(windowId: number)
  {
    if (!this.#tabHistory.has(windowId))
    {
      this.#tabHistory.set(windowId, { stack: [], index: -1 });
    }
    return this.#tabHistory.get(windowId)!;
  }

  saveHistory(): void
  {
    chrome.storage.session.set({
      [BackgroundState.KEYS.TAB_HISTORY]: Array.from(this.#tabHistory.entries())
    });
  }

  // --- Space Last Active Tabs ---
  getLastActiveTab(windowId: number, spaceId: string): number | undefined
  {
    return this.#spaceLastActiveTabs.get(windowId)?.[spaceId];
  }

  setLastActiveTab(windowId: number, spaceId: string, tabId: number): void
  {
    let windowMap = this.#spaceLastActiveTabs.get(windowId);
    if (!windowMap)
    {
      windowMap = {};
      this.#spaceLastActiveTabs.set(windowId, windowMap);
    }
    windowMap[spaceId] = tabId;
    chrome.storage.session.set({
      [BackgroundState.KEYS.SPACE_LAST_ACTIVE_TABS]: Array.from(this.#spaceLastActiveTabs.entries())
    });
  }

  removeTabFromLastActive(windowId: number, tabId: number): void
  {
    const windowMap = this.#spaceLastActiveTabs.get(windowId);
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
        [BackgroundState.KEYS.SPACE_LAST_ACTIVE_TABS]: Array.from(this.#spaceLastActiveTabs.entries())
      });
    }
  }

  // --- Load all state on startup ---
  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([
      BackgroundState.KEYS.ACTIVE_GROUPS,
      BackgroundState.KEYS.ACTIVE_SPACES,
      BackgroundState.KEYS.TAB_HISTORY,
      BackgroundState.KEYS.SPACE_LAST_ACTIVE_TABS
    ]);

    if (result[BackgroundState.KEYS.ACTIVE_GROUPS])
    {
      for (const [key, value] of result[BackgroundState.KEYS.ACTIVE_GROUPS])
      {
        this.#activeGroups.set(key, value);
      }
    }

    if (result[BackgroundState.KEYS.ACTIVE_SPACES])
    {
      for (const [key, value] of result[BackgroundState.KEYS.ACTIVE_SPACES])
      {
        this.#activeSpaces.set(key, value);
      }
    }

    if (result[BackgroundState.KEYS.TAB_HISTORY])
    {
      for (const [key, value] of result[BackgroundState.KEYS.TAB_HISTORY])
      {
        this.#tabHistory.set(key, value);
      }
    }

    if (result[BackgroundState.KEYS.SPACE_LAST_ACTIVE_TABS])
    {
      for (const [key, value] of result[BackgroundState.KEYS.SPACE_LAST_ACTIVE_TABS])
      {
        this.#spaceLastActiveTabs.set(key, value);
      }
    }
  }
}

// Global state instance
const state = new BackgroundState();
state.load();

// Tab history config
const MAX_HISTORY_SIZE = 25;
let isNavigating = false;  // flag to skip history tracking during navigation


// Debug: dump complete history with tab details
async function dumpHistory(windowId: number, action: string): Promise<void>
{
  const history = state.getHistory(windowId);
  if (!history)
  {
    console.log(`[TabHistory] ${action} - windowId=${windowId}: NO HISTORY`);
    return;
  }

  // Build space name map upfront
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

function pushToHistory(windowId: number, tabId: number): void
{
  const history = state.getOrCreateHistory(windowId);
  const spaceId = state.getActiveSpace(windowId) || 'all';

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
    // adjust index if the removed entry was before or at current position
    if (existingIdx <= history.index)
    {
      history.index--;
    }
  }

  // insert new entry after current position (preserve forward history)
  history.stack.splice(history.index + 1, 0, { tabId, spaceId });
  history.index++;

  // trim to keep ±MAX_HISTORY_SIZE around current index
  // trim oldest (before current) if too many
  const beforeCount = history.index;
  if (beforeCount > MAX_HISTORY_SIZE)
  {
    const trimCount = beforeCount - MAX_HISTORY_SIZE;
    history.stack.splice(0, trimCount);
    history.index -= trimCount;
  }

  // trim newest (after current) if too many
  const afterCount = history.stack.length - history.index - 1;
  if (afterCount > MAX_HISTORY_SIZE)
  {
    const trimCount = afterCount - MAX_HISTORY_SIZE;
    history.stack.splice(history.stack.length - trimCount, trimCount);
  }

  state.saveHistory();
  if (import.meta.env.DEV) dumpHistory(windowId, `PUSH tabId=${tabId}, spaceId=${spaceId}`);
}

function removeFromHistory(windowId: number, tabId: number): void
{
  const history = state.getHistory(windowId);
  if (!history) return;

  const idx = history.stack.findIndex(e => e.tabId === tabId);
  if (idx === -1) return;

  history.stack.splice(idx, 1);

  // adjust index if needed
  if (history.index >= idx)
  {
    history.index = Math.max(0, history.index - 1);
  }

  // handle empty stack
  if (history.stack.length === 0)
  {
    history.index = -1;
  }

  state.saveHistory();
  if (import.meta.env.DEV) dumpHistory(windowId, `REMOVE tabId=${tabId}`);
}

// Update last active tab for a space (checks if tab belongs to space first)
async function updateSpaceLastActiveTab(windowId: number, spaceId: string, tabId: number): Promise<void>
{
  if (!spaceId) return;

  // Check if tab belongs to this space (read spaceTabs from sidebar's storage)
  // Skip check for "all" space since all tabs belong to it
  if (spaceId !== 'all')
  {
    const windowStateKey = `spaceWindowState_${windowId}`;
    const windowStateResult = await chrome.storage.session.get([windowStateKey]);
    const windowState = windowStateResult[windowStateKey];
    const spaceTabs = windowState?.spaceTabs?.[spaceId] || [];
    if (!spaceTabs.includes(tabId))
    {
      return;  // Tab doesn't belong to this space, skip
    }
  }

  state.setLastActiveTab(windowId, spaceId, tabId);
}

// Remove tab from all space last-active mappings when closed
function removeTabFromSpaceLastActive(windowId: number, tabId: number): void
{
  state.removeTabFromLastActive(windowId, tabId);
}

// Activate last tab for a space when switching spaces
async function activateLastTabForSpace(
  windowId: number,
  spaceId: string
): Promise<{ success: boolean; action: string; tabId?: number }>
{

  // Look up last active tab from BackgroundState
  const lastActiveTabId = state.getLastActiveTab(windowId, spaceId);

  if (import.meta.env.DEV)
  {
    console.log(`[TabHistory] activateLastTabForSpace: spaceId="${spaceId}", lastActiveTabId=${lastActiveTabId}`);
  }

  // Try stored last active tab
  if (lastActiveTabId)
  {
    try
    {
      const tab = await chrome.tabs.get(lastActiveTabId);
      // Tab exists and is not already active - activate it
      if (tab && !tab.active)
      {
        if (import.meta.env.DEV) console.log(`[TabHistory] activateLastTabForSpace: result=activated-last, tabId=${lastActiveTabId}`);
        await chrome.tabs.update(lastActiveTabId, { active: true });
        return { success: true, action: 'activated-last', tabId: lastActiveTabId };
      }
      // Tab already active - nothing to do
      if (tab && tab.active)
      {
        if (import.meta.env.DEV) console.log(`[TabHistory] activateLastTabForSpace: result=already-active, tabId=${lastActiveTabId}`);
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

  if (spaceTabs.length > 0)
  {
    // Try to activate the first valid tab in the space
    for (const tabId of spaceTabs)
    {
      try
      {
        const tab = await chrome.tabs.get(tabId);
        if (tab && !tab.active)
        {
          if (import.meta.env.DEV) console.log(`[TabHistory] activateLastTabForSpace: result=activated-first, tabId=${tabId}`);
          await chrome.tabs.update(tabId, { active: true });
          return { success: true, action: 'activated-first', tabId };
        }
        if (tab && tab.active)
        {
          if (import.meta.env.DEV) console.log(`[TabHistory] activateLastTabForSpace: result=already-active, tabId=${tabId}`);
          return { success: true, action: 'already-active', tabId };
        }
      }
      catch { /* tab doesn't exist, try next */ }
    }
  }

  // No tabs in space - do nothing (don't create blank page)
  if (import.meta.env.DEV) console.log(`[TabHistory] activateLastTabForSpace: result=none (no tabs)`);
  return { success: true, action: 'none' };
}

function navigateHistory(windowId: number, direction: number): void
{
  const history = state.getHistory(windowId);
  if (!history || history.stack.length === 0) return;

  const newIndex = history.index + direction;

  // check boundaries
  if (newIndex < 0 || newIndex >= history.stack.length) return;

  history.index = newIndex;
  const entry = history.stack[newIndex];
  state.saveHistory();

  if (import.meta.env.DEV)
  {
    const dirLabel = direction === -1 ? "BACK" : "FORWARD";
    dumpHistory(windowId, `NAVIGATE ${dirLabel} to tabId=${entry.tabId}, spaceId=${entry.spaceId}`);
  }

  if (import.meta.env.DEV) console.log(`[TabHistory] navigateHistory: setting isNavigating=true`);
  isNavigating = true;
  chrome.tabs.update(entry.tabId, { active: true }, () =>
  {
    if (import.meta.env.DEV) console.log(`[TabHistory] navigateHistory callback: setting isNavigating=false`);
    isNavigating = false;

    // Notify sidebar of the stored spaceId for space switching
    // Skip if spaceId is empty (pinned sites)
    if (entry.spaceId)
    {
      // Update the target space's last active tab BEFORE notifying sidebar
      // This ensures activateLastTabForSpace() won't switch to a different tab
      updateSpaceLastActiveTab(windowId, entry.spaceId, entry.tabId);

      chrome.runtime.sendMessage({
        action: 'history-tab-activated',
        tabId: entry.tabId,
        spaceId: entry.spaceId
      });
    }
  });
}

// Update tracked group when active tab changes + track history
chrome.tabs.onActivated.addListener((activeInfo) =>
{
  if (import.meta.env.DEV) console.log(`[TabHistory] onActivated: tabId=${activeInfo.tabId}, isNavigating=${isNavigating}`);
  // track tab history (skip if this activation was triggered by navigation)
  if (!isNavigating)
  {
    pushToHistory(activeInfo.windowId, activeInfo.tabId);
  }

  chrome.tabs.get(activeInfo.tabId, (tab) =>
  {
    if (tab)
    {
      if (ENABLE_AUTO_GROUP_NEW_TABS && tab.groupId !== undefined)
      {
        state.setActiveGroup(activeInfo.windowId, tab.groupId);
      }

      // Track last active tab for current space
      const spaceId = state.getActiveSpace(activeInfo.windowId);
      if (spaceId)
      {
        updateSpaceLastActiveTab(activeInfo.windowId, spaceId, activeInfo.tabId);
      }
    }
  });
});

// Clean up history when tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) =>
{
  removeFromHistory(removeInfo.windowId, tabId);
  removeTabFromSpaceLastActive(removeInfo.windowId, tabId);
});

// Auto-group all new tabs when active tab is in a group
chrome.tabs.onCreated.addListener((tab) =>
{
  if (ENABLE_AUTO_GROUP_NEW_TABS)
  {
    const groupId = state.getActiveGroup(tab.windowId);
    if (groupId && groupId !== -1 && tab.id)
    {
      chrome.tabs.group({ tabIds: [tab.id], groupId });
    }
  }
});

// Handle messages from side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
  // Track active space (no tab activation) - used by history navigation, etc.
  if (message.action === 'set-active-space')
  {
    if (message.windowId && message.spaceId)
    {
      state.setActiveSpace(message.windowId, message.spaceId);
      if (import.meta.env.DEV)
      {
        console.log(`[TabHistory] set-active-space: spaceId="${message.spaceId}" (tracking only)`);
      }
    }
    return;
  }

  // Switch to space AND activate last tab - used by user clicks, swipes
  if (message.action === 'switch-to-space')
  {
    if (message.windowId && message.spaceId)
    {
      state.setActiveSpace(message.windowId, message.spaceId);
      if (import.meta.env.DEV)
      {
        console.log(`[TabHistory] switch-to-space: spaceId="${message.spaceId}"`);
      }

      // Activate last tab for the new space (background looks it up itself)
      activateLastTabForSpace(
        message.windowId,
        message.spaceId
      ).then(sendResponse);

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
      navigateHistory(tabs[0].windowId, direction);
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

      const windowId = tabs[0].windowId;
      const history = state.getHistory(windowId);

      if (!history || history.stack.length === 0)
      {
        sendResponse({ before: [], after: [], currentIndex: -1 });
        return;
      }

      // Build before and after lists with tab details
      const before: Array<{
        tabId: number;
        spaceId: string;
        index: number;
        title: string;
        url: string;
        favIconUrl: string;
      }> = [];
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
        catch
        {
          // Tab no longer exists, skip it
        }
      }

      // Reverse before list so most recent is first
      before.reverse();

      sendResponse({ before, after, currentIndex: history.index });
    });

    // Return true to indicate async response
    return true;
  }
  else if (message.action === 'navigate-to-history-index')
  {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length === 0) return;

      const windowId = tabs[0].windowId;
      const history = state.getHistory(windowId);

      if (!history || message.index < 0 || message.index >= history.stack.length) return;

      history.index = message.index;
      const entry = history.stack[message.index];
      state.saveHistory();

      if (import.meta.env.DEV) dumpHistory(windowId, `NAVIGATE to index=${message.index}, tabId=${entry.tabId}, spaceId=${entry.spaceId}`);

      isNavigating = true;
      chrome.tabs.update(entry.tabId, { active: true }, () =>
      {
        isNavigating = false;

        // Notify sidebar of the stored spaceId for space switching
        // Skip if spaceId is empty (pinned sites)
        if (entry.spaceId)
        {
          // Update the target space's last active tab BEFORE notifying sidebar
          // This ensures activateLastTabForSpace() won't switch to a different tab
          updateSpaceLastActiveTab(windowId, entry.spaceId, entry.tabId);

          chrome.runtime.sendMessage({
            action: 'history-tab-activated',
            tabId: entry.tabId,
            spaceId: entry.spaceId
          });
        }
      });
    });
  }
});

// Handle keyboard shortcuts
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
        // If active tab was in a group, add new tab to that group
        if (groupId && groupId !== -1 && newTab.id)
        {
          chrome.tabs.group({ tabIds: [newTab.id], groupId });
        }
      });
    });
  }
  // Tab history navigation
  else if (command === "prev-used-tab" || command === "next-used-tab")
  {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length === 0) return;
      const direction = command === "prev-used-tab" ? -1 : 1;
      navigateHistory(tabs[0].windowId, direction);
    });
  }
  // Note: focus-filter-input and navigate-spaces are handled directly in the side panel
});
