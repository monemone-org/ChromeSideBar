import { useEffect, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PinnedIcon } from './PinnedIcon';
import { PinnedSite } from '../hooks/usePinnedSites';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useUnifiedDnd, DropHandler } from '../contexts/UnifiedDndContext';
import { BookmarkOpenMode } from './SettingsDialog';
import { matchesFilter } from '../utils/searchParser';
import { DragData, DragFormat, DropData, DropPosition, acceptsFormats, getItemsByFormat, getPrimaryItem, hasFormat } from '../types/dragDrop';

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
  movePin: (activeId: string, overId: string, position?: 'before' | 'after') => void;
  duplicatePin: (id: string) => void;
  addPin: (url: string, title: string, faviconUrl?: string, atIndex?: number) => void;
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
  const { openPinnedTab, closePinnedTab, isPinnedLoaded, isPinnedActive, isPinnedAudible, getTabIdForPinned, deassociatePinnedTab } = useBookmarkTabsContext();
  const { windowId } = useSpacesContext();
  const { activeDragData, overId, dropPosition, registerDropHandler, unregisterDropHandler } = useUnifiedDnd();

  // Move pinned tab to a new window
  const movePinnedToNewWindow = (pinnedId: string) =>
  {
    const tabId = getTabIdForPinned(pinnedId);
    if (tabId)
    {
      chrome.windows.create({ tabId });
    }
  };

  // Handle unpin: deassociate tab first so it shows in All space, then remove pin
  const handleRemovePin = useCallback((pinnedId: string) =>
  {
    deassociatePinnedTab(pinnedId);
    removePin(pinnedId);
  }, [deassociatePinnedTab, removePin]);

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

    const primaryItem = getPrimaryItem(dragData);
    if (!primaryItem) return;

    // Handle drop at the end placeholder
    const isEndDrop = dropData.targetId === 'pinnedBar-end';

    switch (acceptedFormat)
    {
      case DragFormat.PIN:
        // Reorder pins
        if (primaryItem.pin)
        {
          if (isEndDrop)
          {
            // Move to end - use last pin as target with 'after' position
            const lastPin = pinnedSites[pinnedSites.length - 1];
            if (lastPin && primaryItem.pin.siteId !== lastPin.id)
            {
              movePin(primaryItem.pin.siteId, lastPin.id, 'after');
            }
          }
          else if (primaryItem.pin.siteId !== dropData.targetId)
          {
            movePin(primaryItem.pin.siteId, dropData.targetId, position as 'before' | 'after');
          }
        }
        break;

      case DragFormat.URL:
        // Create new pins from URLs at the drop position
        const urlItems = getItemsByFormat(dragData, DragFormat.URL);
        if (urlItems.length > 0)
        {
          let insertIndex: number | undefined;
          if (!isEndDrop)
          {
            // Find the index of the target pin
            const targetIndex = pinnedSites.findIndex(p => p.id === dropData.targetId);
            if (targetIndex !== -1)
            {
              insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
            }
          }
          // If isEndDrop or target not found, insertIndex stays undefined (append to end)
          // Add each URL as a pin, incrementing index to preserve order
          for (const item of urlItems)
          {
            if (item.url)
            {
              addPin(item.url.url, item.url.title || item.url.url, item.url.faviconUrl, insertIndex);
              if (insertIndex !== undefined) insertIndex++;
            }
          }
        }
        break;
    }
  }, [movePin, addPin, pinnedSites]);

  // Register drop handler
  useEffect(() =>
  {
    registerDropHandler('pinnedBar', handleDrop);
    return () => unregisterDropHandler('pinnedBar');
  }, [registerDropHandler, unregisterDropHandler, handleDrop]);

  // End placeholder droppable (for appending at the end)
  const { setNodeRef: setEndPlaceholderRef } = useDroppable({
    id: 'pinnedBar-end',
    data: {
      zone: 'pinnedBar',
      targetId: 'pinnedBar-end',
      canAccept: acceptsFormats(DragFormat.PIN, DragFormat.URL),
      isHorizontal: true,
      index: pinnedSites.length,
    } as DropData,
  });

  if (visiblePinnedSites.length === 0)
  {
    return null;
  }

  // Show drop indicators when dragging PIN or URL (both use before/after positioning)
  const showDropIndicators = !!(activeDragData && (
    hasFormat(activeDragData, DragFormat.PIN) || hasFormat(activeDragData, DragFormat.URL)
  ));

  // Check if end placeholder is drop target
  const isEndDropTarget = showDropIndicators && overId === 'pinnedBar-end';

  return (
    <div
      className="flex flex-wrap gap-1.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700"
      data-dnd-zone="pinnedBar"
    >
      {visiblePinnedSites.map((site, index) => (
        <PinnedIcon
          key={site.id}
          site={site}
          index={index}
          onRemove={handleRemovePin}
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
      {/* End placeholder for dropping after the last pin */}
      <div
        ref={setEndPlaceholderRef}
        data-dnd-id="pinnedBar-end"
        className="relative flex-1 min-w-4"
        style={{ minHeight: iconSize + 8 }}
      >
        {/* Drop indicator - shows on left side (= after last icon) */}
        {isEndDropTarget && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
        )}
      </div>
    </div>
  );
};
