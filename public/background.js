// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Track last active tab's groupId per window
const windowActiveGroups = new Map();

// Update tracked group when active tab changes
chrome.tabs.onActivated.addListener((activeInfo) =>
{
  chrome.tabs.get(activeInfo.tabId, (tab) =>
  {
    if (tab && tab.groupId !== undefined)
    {
      windowActiveGroups.set(activeInfo.windowId, tab.groupId);
    }
  });
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
});
