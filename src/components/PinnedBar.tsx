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
import { Settings } from 'lucide-react';
import clsx from 'clsx';
import { PinnedIcon } from './PinnedIcon';
import { PinnedSite } from '../hooks/usePinnedSites';

interface PinnedBarProps {
  pinnedSites: PinnedSite[];
  removePin: (id: string) => void;
  updatePin: (id: string, title: string, url: string, favicon?: string) => void;
  resetFavicon: (id: string) => void;
  movePin: (activeId: string, overId: string) => void;
  openInNewTab?: boolean;
  onSettingsClick: () => void;
}

export const PinnedBar = ({
  pinnedSites,
  removePin,
  updatePin,
  resetFavicon,
  movePin,
  openInNewTab = false,
  onSettingsClick
}: PinnedBarProps) => {
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

  const hasPins = pinnedSites.length > 0;

  return (
    <div
      className={clsx(
        "relative flex flex-wrap gap-1 px-2 pr-8",
        hasPins
          ? "py-1.5 border-b border-gray-200 dark:border-gray-700"
          : "py-1"
      )}
    >
      {hasPins && (
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
                openInNewTab={openInNewTab}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {/* Settings button - top-right corner */}
      <button
        onClick={onSettingsClick}
        title="Settings"
        className="absolute right-1 top-[15px] p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-200"
      >
        <Settings size={16} />
      </button>
    </div>
  );
};
