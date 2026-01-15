import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { SpaceIcon, SpaceIconOverlay } from './SpaceIcon';
import { useSpacesContext, Space } from '../contexts/SpacesContext';

interface SpaceBarProps
{
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
}

export const SpaceBar: React.FC<SpaceBarProps> = ({
  onCreateSpace,
  onEditSpace,
  onDeleteSpace,
}) =>
{
  const { allSpaces, activeSpaceId, setActiveSpaceId, moveSpace, getSpaceById } = useSpacesContext();
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to make active space visible
  useEffect(() =>
  {
    const container = scrollContainerRef.current;
    if (!container) return;

    const activeButton = container.querySelector(`[data-space-id="${activeSpaceId}"]`);
    if (activeButton)
    {
      activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeSpaceId]);

  // Drag-drop sensors with activation distance to allow clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSpaceClick = (spaceId: string) =>
  {
    setActiveSpaceId(spaceId);
    // Tab group is NOT created on space switch
    // It will be created when first tab/bookmark is opened
  };

  const handleDelete = (space: Space) =>
  {
    onDeleteSpace(space);
  };

  const handleDragStart = (event: DragStartEvent) =>
  {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) =>
  {
    const { active, over } = event;
    if (over && active.id !== over.id)
    {
      moveSpace(active.id as string, over.id as string);
    }
    setActiveId(null);
  };

  const activeSpace = activeId ? getSpaceById(activeId) : null;

  return (
    <div className="flex items-stretch border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      {/* Vertical "SPACE" label */}
      <div className="flex items-center justify-center px-0.5 border-r border-gray-200 dark:border-gray-700">
        <span
          className="text-[8px] font-medium text-gray-400 dark:text-gray-500 tracking-wide"
          style={{
            writingMode: 'vertical-lr',
            transform: 'rotate(180deg)',
          }}
        >
          SPACE
        </span>
      </div>

      {/* Horizontal scrollable space icons */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center gap-1 px-1 py-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* All spaces in SortableContext for proper position calculation */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={allSpaces.map(s => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            {allSpaces.map((space) => (
              <SpaceIcon
                key={space.id}
                space={space}
                isActive={space.id === activeSpaceId}
                onClick={() => handleSpaceClick(space.id)}
                onEdit={() => onEditSpace(space)}
                onDelete={() => handleDelete(space)}
                isAllSpace={space.id === 'all'}
                isDraggable={space.id !== 'all'}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeSpace && (
              <SpaceIconOverlay
                space={activeSpace}
                isActive={activeSpace.id === activeSpaceId}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Fixed "+" button */}
      <div className="flex items-center px-1 border-l border-gray-200 dark:border-gray-700">
        <button
          onClick={onCreateSpace}
          title="Create new space"
          className={clsx(
            "w-7 h-7 rounded flex items-center justify-center",
            "bg-gray-100 dark:bg-gray-700",
            "hover:bg-gray-200 dark:hover:bg-gray-600",
            "text-gray-600 dark:text-gray-300",
            "transition-colors"
          )}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};
