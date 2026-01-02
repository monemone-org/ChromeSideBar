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
  openAsPinnedTab: (site: PinnedSite) => void;
  movePin: (activeId: string, overId: string) => void;
  iconSize: number;
  arcStyleBookmarks?: boolean;
}

export const PinnedBar = ({
  pinnedSites,
  removePin,
  updatePin,
  resetFavicon,
  openAsPinnedTab: _openAsPinnedTab,
  movePin,
  iconSize,
  arcStyleBookmarks = true,
}: PinnedBarProps) => {
  // Note: _openAsPinnedTab is unused - we use openPinnedTab from context for Arc-style,
  // or chrome.tabs.create for Chrome-style behavior
  const { openPinnedTab, closePinnedTab, isPinnedLoaded, isPinnedActive, isPinnedAudible } = useBookmarkTabsContext();
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

  if (pinnedSites.length === 0) {
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
          items={pinnedSites.map(s => s.id)}
          strategy={rectSortingStrategy}
        >
          {pinnedSites.map((site) => (
            <PinnedIcon
              key={site.id}
              site={site}
              onRemove={removePin}
              onUpdate={updatePin}
              onResetFavicon={resetFavicon}
              onOpen={arcStyleBookmarks
                ? (s) => openPinnedTab(s.id, s.url)
                : (s) => chrome.tabs.create({ url: s.url, active: true })
              }
              onClose={arcStyleBookmarks ? closePinnedTab : undefined}
              isLoaded={arcStyleBookmarks ? isPinnedLoaded(site.id) : false}
              isActive={arcStyleBookmarks ? isPinnedActive(site.id) : false}
              isAudible={arcStyleBookmarks ? isPinnedAudible(site.id) : false}
              iconSize={iconSize}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};
