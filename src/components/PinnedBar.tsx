import { useEffect, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PinnedIcon } from './PinnedIcon';
import { PinnedSite } from '../hooks/usePinnedSites';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useUnifiedDnd, DropHandler } from '../contexts/UnifiedDndContext';
import { BookmarkOpenMode } from './SettingsDialog';
import { matchesFilter } from '../utils/searchParser';
import { DragData, DragFormat, DropData, DropPosition, acceptsFormats } from '../types/dragDrop';

interface PinnedBarProps
{
  pinnedSites: PinnedSite[];
  removePin: (id: string) => void;
  updatePin: (id: string,
              title: string,
              url: string,
              favicon?: string,
              customIconName?: string,
              iconColor?: string) => void;
  resetFavicon: (id: string) => void;
  movePin: (activeId: string, overId: string) => void;
  duplicatePin: (id: string) => void;
  addPin: (url: string, title: string, faviconUrl?: string) => void;
  iconSize: number;
  bookmarkOpenMode?: BookmarkOpenMode;
  filterLiveTabs?: boolean;
  filterText?: string;
}

export const PinnedBar = ({
  pinnedSites,
  removePin,
  updatePin,
  resetFavicon,
  movePin,
  duplicatePin,
  addPin,
  iconSize,
  bookmarkOpenMode = 'arc',
  filterLiveTabs = false,
  filterText = '',
}: PinnedBarProps) =>
{
  const { openPinnedTab, closePinnedTab, isPinnedLoaded, isPinnedActive, isPinnedAudible, getTabIdForPinned } = useBookmarkTabsContext();
  const { windowId } = useSpacesContext();
  const { sourceZone, overId, dropPosition, registerDropHandler, unregisterDropHandler } = useUnifiedDnd();

  // Move pinned tab to a new window
  const movePinnedToNewWindow = (pinnedId: string) =>
  {
    const tabId = getTabIdForPinned(pinnedId);
    if (tabId)
    {
      chrome.windows.create({ tabId });
    }
  };

  // Filter pinned sites based on active filters
  const hasFilters = filterLiveTabs || filterText.trim();
  const visiblePinnedSites = hasFilters
    ? pinnedSites.filter(site =>
      {
        if (filterLiveTabs && !isPinnedLoaded(site.id)) return false;
        if (filterText.trim() && !matchesFilter(site.title, site.url, filterText)) return false;
        return true;
      })
    : pinnedSites;

  // Drop handler for PinnedBar zone
  const handleDrop: DropHandler = useCallback(async (
    dragData: DragData,
    dropData: DropData,
    position: DropPosition,
    acceptedFormat: DragFormat
  ) =>
  {
    if (!position) return;

    switch (acceptedFormat)
    {
      case DragFormat.PIN:
        // Reorder pins
        if (dragData.pin && dragData.pin.siteId !== dropData.targetId)
        {
          movePin(dragData.pin.siteId, dropData.targetId);
        }
        break;

      case DragFormat.URL:
        // Create new pin from URL
        if (dragData.url)
        {
          addPin(dragData.url.url, dragData.url.title || dragData.url.url, dragData.url.faviconUrl);
        }
        break;
    }
  }, [movePin, addPin]);

  // Register drop handler
  useEffect(() =>
  {
    registerDropHandler('pinnedBar', handleDrop);
    return () => unregisterDropHandler('pinnedBar');
  }, [registerDropHandler, unregisterDropHandler, handleDrop]);

  // Container droppable (for drops not on specific pins)
  const { setNodeRef: setContainerRef } = useDroppable({
    id: 'pinnedBar-container',
    data: {
      zone: 'pinnedBar',
      targetId: 'pinnedBar-container',
      canAccept: acceptsFormats(DragFormat.PIN, DragFormat.URL),
    } as DropData,
  });

  if (visiblePinnedSites.length === 0)
  {
    return null;
  }

  // Only show drop indicators when dragging from within PinnedBar
  const showDropIndicators = sourceZone === 'pinnedBar';

  return (
    <div
      ref={setContainerRef}
      className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700"
      data-dnd-zone="pinnedBar"
    >
      {visiblePinnedSites.map((site, index) => (
        <PinnedIcon
          key={site.id}
          site={site}
          index={index}
          onRemove={removePin}
          onUpdate={updatePin}
          onResetFavicon={resetFavicon}
          onDuplicate={duplicatePin}
          onOpen={
            bookmarkOpenMode === 'arc'
              ? (s) => openPinnedTab(s.id, s.url)
              : bookmarkOpenMode === 'activeTab'
                ? (s) => chrome.tabs.update({ url: s.url })
                : (s) => chrome.tabs.create({ url: s.url, active: true, windowId: windowId ?? undefined })
          }
          onClose={bookmarkOpenMode === 'arc' ? closePinnedTab : undefined}
          onMoveToNewWindow={bookmarkOpenMode === 'arc' ? movePinnedToNewWindow : undefined}
          isLoaded={bookmarkOpenMode === 'arc' ? isPinnedLoaded(site.id) : false}
          isActive={bookmarkOpenMode === 'arc' ? isPinnedActive(site.id) : false}
          isAudible={bookmarkOpenMode === 'arc' ? isPinnedAudible(site.id) : false}
          iconSize={iconSize}
          windowId={windowId ?? undefined}
          isDropTarget={showDropIndicators && overId === `pin-${site.id}`}
          dropPosition={showDropIndicators && overId === `pin-${site.id}` ? dropPosition : null}
        />
      ))}
    </div>
  );
};
