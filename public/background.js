// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Track last active tab's groupId per window
const windowActiveGroups = new Map();

// Tab history navigation (undo/redo style)
const MAX_HISTORY_SIZE = 25;
const windowTabHistory = new Map(); // Map<windowId, { stack: tabId[], index: number }>
let isNavigating = false; // flag to skip history tracking during navigation

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
    const tabId = history.stack[i];
    const marker = i === history.index ? ">>>" : "   ";
    try
    {
      const tab = await chrome.tabs.get(tabId);
      const title = tab.title || "(no title)";
      const url = tab.url || tab.pendingUrl || "(no url)";
      console.log(`${marker} [${i}] tabId=${tabId}, title="${title}", url="${url}"`);
    }
    catch (e)
    {
      console.log(`${marker} [${i}] tabId=${tabId}, (tab not found - closed?)`);
    }
  }
  console.log(`[TabHistory] --- end ---`);
}

function pushToHistory(windowId, tabId)
{
  const history = getOrCreateHistory(windowId);

  // skip if same as current entry
  if (history.index >= 0 && history.stack[history.index] === tabId)
  {
    return;
  }

  // insert new entry after current position (preserve forward history)
  history.stack.splice(history.index + 1, 0, tabId);
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

  dumpHistory(windowId, `PUSH tabId=${tabId}`);
}

function removeFromHistory(windowId, tabId)
{
  const history = windowTabHistory.get(windowId);
  if (!history) return;

  const idx = history.stack.indexOf(tabId);
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

  dumpHistory(windowId, `REMOVE tabId=${tabId}`);
}

function navigateHistory(windowId, direction)
{
  const history = windowTabHistory.get(windowId);
  if (!history || history.stack.length === 0) return;

  const newIndex = history.index + direction;

  // check boundaries
  if (newIndex < 0 || newIndex >= history.stack.length) return;

  history.index = newIndex;
  const tabId = history.stack[newIndex];

  const dirLabel = direction === -1 ? "BACK" : "FORWARD";
  dumpHistory(windowId, `NAVIGATE ${dirLabel} to tabId=${tabId}`);

  isNavigating = true;
  chrome.tabs.update(tabId, { active: true }, () =>
  {
    isNavigating = false;
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
