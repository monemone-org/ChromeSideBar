import { useCallback } from 'react';
import { Globe, Volume2 } from 'lucide-react';
import * as DropdownMenu from './menu/DropdownMenu';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { scrollToBookmark, scrollToTab } from '../utils/scrollHelpers';
import { useFontSize } from '../contexts/FontSizeContext';

export interface AudioTabsDropdownProps
{
  playingTabs: chrome.tabs.Tab[];
  historyTabs?: chrome.tabs.Tab[];
}

export const AudioTabsDropdown = ({
  playingTabs,
  historyTabs
}: AudioTabsDropdownProps) =>
{
  const { getItemKeyForTab } = useBookmarkTabsContext();
  const fontSize = useFontSize();

  const handleSelectTab = useCallback(async (tab: chrome.tabs.Tab) =>
  {
    if (tab.id === undefined) return;

    // Use the new unified message to activate tab and switch space atomically
    // This handles: tab activation, space lookup, space switching, and history
    // The background will send STATE_CHANGED message to update SpacesContext automatically
    await chrome.runtime.sendMessage({
      action: 'set-active-tab-and-space',
      tabId: tab.id,
      skipHistory: false
    });

    // Scroll to the tab/bookmark after space switch renders
    const itemKey = getItemKeyForTab(tab.id!);
    if (itemKey && itemKey.startsWith('bookmark-'))
    {
      scrollToBookmark(itemKey.substring('bookmark-'.length));
    }
    else
    {
      scrollToTab(tab.id!);
    }
  }, [getItemKeyForTab]);

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
