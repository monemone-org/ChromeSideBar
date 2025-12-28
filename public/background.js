// Set side panel to open when clicking the extension toolbar button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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
