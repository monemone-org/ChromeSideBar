import { Globe, Volume2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';

export interface AudioTabsDialogProps
{
  isOpen: boolean;
  tabs: chrome.tabs.Tab[];
  onTabSelect: (tabId: number) => void;
  onClose: () => void;
}

export const AudioTabsDialog = ({
  isOpen,
  tabs,
  onTabSelect,
  onClose
}: AudioTabsDialogProps) =>
{
  const { getSpaceForTab, setActiveSpaceId, activeSpaceId, setLastActiveTabForSpace } = useSpacesContext();
  const { getItemKeyForTab } = useBookmarkTabsContext();

  const handleSelectTab = (tab: chrome.tabs.Tab) =>
  {
    if (tab.id === undefined) return;

    // Find which space the tab belongs to
    const spaceId = getSpaceForTab(tab.id);

    // Activate the tab
    onTabSelect(tab.id);
    onClose();

    // Switch to the space if needed
    // If tab not found in any space (e.g., live bookmark tab), fall back to "All" space
    const targetSpaceId = spaceId || 'all';
    if (targetSpaceId !== activeSpaceId)
    {
      // Set the audio tab as the "last active tab" for the target space
      // This ensures the space switch won't override our tab activation
      if (spaceId)
      {
        setLastActiveTabForSpace(spaceId, tab.id);
      }
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

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Audio Playing">
      <div className="py-1 max-h-64 overflow-y-auto">
        {tabs.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
            No audio playing
          </div>
        ) : (
          tabs.map((tab) =>
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
                <Volume2 size={14} className="text-blue-500 flex-shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
};
