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

interface PinnedBarProps {
  pinnedSites: PinnedSite[];
  removePin: (id: string) => void;
  updatePin: (id: string, title: string, url: string, favicon?: string) => void;
  resetFavicon: (id: string) => void;
  movePin: (activeId: string, overId: string) => void;
}

export const PinnedBar = ({ pinnedSites, removePin, updatePin, resetFavicon, movePin }: PinnedBarProps) => {
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
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};
