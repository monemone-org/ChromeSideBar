import { useCallback } from 'react';
import { Globe, Volume2 } from 'lucide-react';
import { QuickDismissDialog } from './QuickDismissDialog';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useTabGroups } from '../hooks/useTabGroups';

export interface AudioTabsDialogProps
{
  isOpen: boolean;
  tabs: chrome.tabs.Tab[];
  lastAudibleTab?: chrome.tabs.Tab;
  onTabSelect: (tabId: number) => void;
  onClose: () => void;
}

export const AudioTabsDialog = ({
  isOpen,
  tabs,
  lastAudibleTab,
  onTabSelect,
  onClose
}: AudioTabsDialogProps) =>
{
  const { spaces, setActiveSpaceId, activeSpaceId } = useSpacesContext();
  const { getItemKeyForTab } = useBookmarkTabsContext();
  const { tabGroups } = useTabGroups();

  // Find space ID for a tab based on its Chrome group title
  const getSpaceForTab = useCallback((tab: chrome.tabs.Tab): string | null =>
  {
    if (!tab.groupId || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;

    const group = tabGroups.find(g => g.id === tab.groupId);
    if (!group || !group.title) return null;

    const space = spaces.find(s => s.name === group.title);
    return space?.id ?? null;
  }, [tabGroups, spaces]);

  const handleSelectTab = (tab: chrome.tabs.Tab) =>
  {
    if (tab.id === undefined) return;

    // Find which space the tab belongs to (via Chrome group title)
    const spaceId = getSpaceForTab(tab);

    // Activate the tab
    onTabSelect(tab.id);
    onClose();

    // Switch to the space if needed
    // If tab not in any space (e.g., live bookmark tab), fall back to "All" space
    const targetSpaceId = spaceId || 'all';
    if (targetSpaceId !== activeSpaceId)
    {
      setActiveSpaceId(targetSpaceId);
    }

    // Scroll to the tab/bookmark after space switch renders
    setTimeout(() =>
    {
      // Check if this tab is a live bookmark tab
      const itemKey = getItemKeyForTab(tab.id!);
      let element: Element | null = null;

      if (itemKey && itemKey.startsWith('bookmark-'))
      {
        // It's a live bookmark tab - scroll to the bookmark element
        const bookmarkId = itemKey.substring('bookmark-'.length);
        element = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
      }
      else
      {
        // Regular tab - scroll to the tab element
        element = document.querySelector(`[data-tab-id="${tab.id}"]`);
      }

      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  // Render a tab row (shared between audible tabs and last audible tab)
  const renderTabRow = (tab: chrome.tabs.Tab, showSpeakerIcon: boolean) =>
  {
    const icon = tab.favIconUrl ? (
      <img src={tab.favIconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
    ) : (
      <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
    );

    return (
      <button
        key={tab.id}
        onClick={() => handleSelectTab(tab)}
        className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {icon}
        <span className="truncate flex-1">{tab.title || tab.url}</span>
        {showSpeakerIcon && <Volume2 size={14} className="text-blue-500 flex-shrink-0" />}
      </button>
    );
  };

  // Determine what to render
  const hasAudibleTabs = tabs.length > 0;
  const hasLastAudibleTab = !hasAudibleTabs && lastAudibleTab;

  return (
    <QuickDismissDialog isOpen={isOpen} onClose={onClose} title="Audio Playing">
      <div className="py-1 max-h-64 overflow-y-auto">
        {hasAudibleTabs ? (
          tabs.map((tab) => renderTabRow(tab, true))
        ) : hasLastAudibleTab ? (
          renderTabRow(lastAudibleTab, false)
        ) : (
          <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
            No audio playing
          </div>
        )}
      </div>
    </QuickDismissDialog>
  );
};
