// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Track last active tab's groupId per window
const windowActiveGroups = new Map();

// Track active space per window (sent from sidebar)
const windowActiveSpaces = new Map(); // Map<windowId, spaceId>

// Tab history navigation (undo/redo style)
// Each entry is { tabId, spaceId } to restore both tab and space
const MAX_HISTORY_SIZE = 25;
const windowTabHistory = new Map(); // Map<windowId, { stack: {tabId, spaceId}[], index: number }>
let isNavigating = false; // flag to skip history tracking during navigation
let debugTabHistory = false; // enable via 'set-debug-tab-history' message from sidebar

function getOrCreateHistory(windowId)
{
  if (!windowTabHistory.has(windowId))
  {
    windowTabHistory.set(windowId, { stack: [], index: -1 });
  }
  return windowTabHistory.get(windowId);
}

// Debug: dump complete history with tab details
async function dumpHistory(windowId, action)
{
  const history = windowTabHistory.get(windowId);
  if (!history)
  {
    console.log(`[TabHistory] ${action} - windowId=${windowId}: NO HISTORY`);
    return;
  }

  console.log(`\n[TabHistory] --- begin ---`);
  console.log(`[TabHistory] ${action} - windowId=${windowId}, index=${history.index}, size=${history.stack.length}`);

  for (let i = 0; i < history.stack.length; i++)
  {
    const entry = history.stack[i];
    const marker = i === history.index ? ">>>" : "   ";
    try
    {
      const tab = await chrome.tabs.get(entry.tabId);
      const title = tab.title || "(no title)";
      const url = tab.url || tab.pendingUrl || "(no url)";
      console.log(`${marker} [${i}] tabId=${entry.tabId}, spaceId="${entry.spaceId}", title="${title}", url="${url}"`);
    }
    catch (e)
    {
      console.log(`${marker} [${i}] tabId=${entry.tabId}, spaceId="${entry.spaceId}", (tab not found - closed?)`);
    }
  }
  console.log(`[TabHistory] --- end ---`);
}

function pushToHistory(windowId, tabId)
{
  const history = getOrCreateHistory(windowId);
  const spaceId = windowActiveSpaces.get(windowId) || 'all';

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

  if (debugTabHistory) dumpHistory(windowId, `PUSH tabId=${tabId}, spaceId=${spaceId}`);
}

function removeFromHistory(windowId, tabId)
{
  const history = windowTabHistory.get(windowId);
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

  if (debugTabHistory) dumpHistory(windowId, `REMOVE tabId=${tabId}`);
}

function navigateHistory(windowId, direction)
{
  const history = windowTabHistory.get(windowId);
  if (!history || history.stack.length === 0) return;

  const newIndex = history.index + direction;

  // check boundaries
  if (newIndex < 0 || newIndex >= history.stack.length) return;

  history.index = newIndex;
  const entry = history.stack[newIndex];

  if (debugTabHistory)
  {
    const dirLabel = direction === -1 ? "BACK" : "FORWARD";
    dumpHistory(windowId, `NAVIGATE ${dirLabel} to tabId=${entry.tabId}, spaceId=${entry.spaceId}`);
  }

  isNavigating = true;
  chrome.tabs.update(entry.tabId, { active: true }, () =>
  {
    isNavigating = false;

    // Notify sidebar of the stored spaceId for space switching
    // Skip if spaceId is empty (pinned sites)
    if (entry.spaceId)
    {
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
  // track tab history (skip if this activation was triggered by navigation)
  if (!isNavigating)
  {
    pushToHistory(activeInfo.windowId, activeInfo.tabId);
  }

  chrome.tabs.get(activeInfo.tabId, (tab) =>
  {
    if (tab && tab.groupId !== undefined)
    {
      windowActiveGroups.set(activeInfo.windowId, tab.groupId);
    }
  });
});

// Clean up history when tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) =>
{
  removeFromHistory(removeInfo.windowId, tabId);
});

// Auto-group all new tabs when active tab is in a group
chrome.tabs.onCreated.addListener((tab) =>
{
  const groupId = windowActiveGroups.get(tab.windowId);

  if (groupId && groupId !== -1)
  {
    chrome.tabs.group({ tabIds: [tab.id], groupId });
  }
});

// Handle messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
  if (message.action === 'set-debug-tab-history')
  {
    debugTabHistory = message.enabled;
    console.log(`[TabHistory] Debug mode ${debugTabHistory ? 'ENABLED' : 'DISABLED'}`);
    return;
  }

  // Track active space from sidebar
  if (message.action === 'set-active-space')
  {
    if (message.windowId && message.spaceId)
    {
      windowActiveSpaces.set(message.windowId, message.spaceId);
      if (debugTabHistory)
      {
        console.log(`[TabHistory] Active space set: windowId=${message.windowId}, spaceId=${message.spaceId}`);
      }
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
      const history = windowTabHistory.get(windowId);

      if (!history || history.stack.length === 0)
      {
        sendResponse({ before: [], after: [], currentIndex: -1 });
        return;
      }

      // Build before and after lists with tab details
      const before = [];
      const after = [];

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
        catch (e)
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
      const history = windowTabHistory.get(windowId);

      if (!history || message.index < 0 || message.index >= history.stack.length) return;

      history.index = message.index;
      const entry = history.stack[message.index];

      if (debugTabHistory) dumpHistory(windowId, `NAVIGATE to index=${message.index}, tabId=${entry.tabId}, spaceId=${entry.spaceId}`);

      isNavigating = true;
      chrome.tabs.update(entry.tabId, { active: true }, () =>
      {
        isNavigating = false;

        // Notify sidebar of the stored spaceId for space switching
        // Skip if spaceId is empty (pinned sites)
        if (entry.spaceId)
        {
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
        if (groupId && groupId !== -1)
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
  // Note: focus-filter-input and open-saved-filters are handled directly in the side panel
});
