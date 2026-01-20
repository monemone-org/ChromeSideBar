import { useCallback } from 'react';
import { Globe, Volume2 } from 'lucide-react';
import * as DropdownMenu from './menu/DropdownMenu';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useTabGroups } from '../hooks/useTabGroups';
import { useFontSize } from '../contexts/FontSizeContext';

export interface AudioTabsDropdownProps
{
  playingTabs: chrome.tabs.Tab[];
  historyTabs?: chrome.tabs.Tab[];
  onTabSelect: (tabId: number) => void;
}

export const AudioTabsDropdown = ({
  playingTabs,
  historyTabs,
  onTabSelect
}: AudioTabsDropdownProps) =>
{
  const { spaces, setActiveSpaceId, activeSpaceId } = useSpacesContext();
  const { getItemKeyForTab } = useBookmarkTabsContext();
  const { tabGroups } = useTabGroups();
  const fontSize = useFontSize();

  // Find space ID for a tab based on its Chrome group title
  const getSpaceForTab = useCallback((tab: chrome.tabs.Tab): string | null =>
  {
    if (!tab.groupId || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;

    const group = tabGroups.find(g => g.id === tab.groupId);
    if (!group || !group.title) return null;

    const space = spaces.find(s => s.name === group.title);
    return space?.id ?? null;
  }, [tabGroups, spaces]);

  const handleSelectTab = useCallback((tab: chrome.tabs.Tab) =>
  {
    if (tab.id === undefined) return;

    // Find which space the tab belongs to (via Chrome group title)
    const spaceId = getSpaceForTab(tab);

    // Activate the tab
    onTabSelect(tab.id);

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
  }, [getSpaceForTab, onTabSelect, activeSpaceId, setActiveSpaceId, getItemKeyForTab]);

  // Render a tab row as dropdown item
  const renderTabItem = (tab: chrome.tabs.Tab, showSpeakerIcon: boolean) =>
  {
    const icon = tab.favIconUrl ? (
      <img src={tab.favIconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
    ) : (
      <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
    );

    return (
      <DropdownMenu.Item
        key={tab.id}
        onSelect={() => handleSelectTab(tab)}
      >
        {icon}
        <span className="truncate flex-1 ml-2">{tab.title || tab.url}</span>
        {showSpeakerIcon && <Volume2 size={14} className="text-blue-500 flex-shrink-0 ml-2" />}
      </DropdownMenu.Item>
    );
  };

  // Determine what to render
  const hasPlayingTabs = playingTabs.length > 0;
  const hasHistoryTabs = historyTabs && historyTabs.length > 0;

  return (
    <DropdownMenu.Content className="min-w-48 max-w-72 max-h-64 overflow-y-auto">
      {hasPlayingTabs && (
        playingTabs.map((tab) => renderTabItem(tab, true))
      )}
      {hasHistoryTabs && (
        <>
          {hasPlayingTabs && <DropdownMenu.Separator />}
          <div
            className="px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400"
            style={{ fontSize: fontSize - 1 }}
          >
            Recently played
          </div>
          {historyTabs!.map((tab) => renderTabItem(tab, false))}
        </>
      )}
      {!hasPlayingTabs && !hasHistoryTabs && (
        <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
          No audio playing
        </div>
      )}
    </DropdownMenu.Content>
  );
};
