import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { PinnedIcon } from './PinnedIcon';
import { PinnedSite } from '../hooks/usePinnedSites';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useSpacesContext } from '../contexts/SpacesContext';
import { BookmarkOpenMode } from './SettingsDialog';
import { matchesFilter } from '../utils/searchParser';

interface PinnedBarProps {
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
  iconSize,
  bookmarkOpenMode = 'arc',
  filterLiveTabs = false,
  filterText = '',
}: PinnedBarProps) => {
  const { openPinnedTab, closePinnedTab, isPinnedLoaded, isPinnedActive, isPinnedAudible, getTabIdForPinned } = useBookmarkTabsContext();
  const { windowId } = useSpacesContext();

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      movePin(active.id as string, over.id as string);
    }
  };

  if (visiblePinnedSites.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={{
          threshold: { x: 0.1, y: 0.1 },
          acceleration: 7,
          interval: 10,
        }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visiblePinnedSites.map(s => s.id)}
          strategy={rectSortingStrategy}
        >
          {visiblePinnedSites.map((site) => (
            <PinnedIcon
              key={site.id}
              site={site}
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
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};
