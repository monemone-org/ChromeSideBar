import React, { useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { SpaceIcon } from './SpaceIcon';
import { useSpacesContext, Space } from '../contexts/SpacesContext';
import { useUnifiedDnd, DropHandler } from '../contexts/UnifiedDndContext';
import { DragData, DragFormat, DropData, DropPosition, acceptsFormats } from '../types/dragDrop';
import { moveTabToSpace, createTabInSpace } from '../utils/tabOperations';

interface SpaceBarProps
{
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
  dropTargetSpaceId?: string | null;
}

export const SpaceBar: React.FC<SpaceBarProps> = ({
  onCreateSpace,
  onEditSpace,
  onDeleteSpace,
  dropTargetSpaceId,
}) =>
{
  const { allSpaces, spaces, activeSpaceId, switchToSpace, moveSpace, closeAllTabsInSpace, windowId } = useSpacesContext();
  const { sourceZone, overId, dropPosition, registerDropHandler, unregisterDropHandler } = useUnifiedDnd();
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

  const handleSpaceClick = (spaceId: string) =>
  {
    switchToSpace(spaceId);
    // Tab group is NOT created on space switch
    // It will be created when first tab/bookmark is opened
  };

  const handleDelete = (space: Space) =>
  {
    onDeleteSpace(space);
  };

  // Drop handler for SpaceBar zone
  const handleDrop: DropHandler = useCallback(async (
    dragData: DragData,
    dropData: DropData,
    position: DropPosition,
    acceptedFormat: DragFormat
  ) =>
  {
    if (!position) return;

    // Extract space ID from drop target (e.g., "space-work" -> "work")
    const targetSpaceId = dropData.targetId.startsWith('space-')
      ? dropData.targetId.slice(6)
      : dropData.targetId;

    switch (acceptedFormat)
    {
      case DragFormat.SPACE:
        // Reorder spaces
        if (dragData.space && dragData.space.spaceId !== dropData.targetId)
        {
          moveSpace(dragData.space.spaceId, dropData.targetId);
        }
        break;

      case DragFormat.TAB:
        // Move tab to space's Chrome group
        if (dragData.tab && windowId)
        {
          const result = await moveTabToSpace(
            dragData.tab.tabId,
            targetSpaceId,
            spaces,
            windowId
          );
          if (import.meta.env.DEV && !result.success)
          {
            console.error('[SpaceBar] Failed to move tab:', result.error);
          }
        }
        break;

      case DragFormat.URL:
        // Create new tab in space
        if (dragData.url && windowId)
        {
          const result = await createTabInSpace(
            dragData.url.url,
            targetSpaceId,
            spaces,
            windowId
          );
          if (import.meta.env.DEV && !result.success)
          {
            console.error('[SpaceBar] Failed to create tab:', result.error);
          }
        }
        break;
    }
  }, [moveSpace, spaces, windowId]);

  // Register drop handler
  useEffect(() =>
  {
    registerDropHandler('spaceBar', handleDrop);
    return () => unregisterDropHandler('spaceBar');
  }, [registerDropHandler, unregisterDropHandler, handleDrop]);

  // Container droppable
  const { setNodeRef: setContainerRef } = useDroppable({
    id: 'spaceBar-container',
    data: {
      zone: 'spaceBar',
      targetId: 'spaceBar-container',
      canAccept: acceptsFormats(DragFormat.SPACE, DragFormat.TAB, DragFormat.URL),
    } as DropData,
  });

  // Only show drop indicators when dragging from within SpaceBar
  const showDropIndicators = sourceZone === 'spaceBar';

  return (
    <div className="flex items-stretch border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      {/* Vertical "SPACE" label */}
      <div className="flex items-center justify-center px-0.5">
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
        ref={(node) =>
        {
          setContainerRef(node);
          (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className="flex-1 flex items-center gap-1 px-1 py-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        data-dnd-zone="spaceBar"
      >
        {allSpaces.map((space, index) => (
          <SpaceIcon
            key={space.id}
            space={space}
            index={index}
            isActive={space.id === activeSpaceId}
            onClick={() => handleSpaceClick(space.id)}
            onEdit={() => onEditSpace(space)}
            onDelete={() => handleDelete(space)}
            onCloseAllTabs={() => closeAllTabsInSpace(space)}
            isAllSpace={space.id === 'all'}
            isDraggable={space.id !== 'all'}
            isDropTarget={dropTargetSpaceId === space.id || (showDropIndicators && overId === `space-${space.id}`)}
            dropPosition={showDropIndicators && overId === `space-${space.id}` ? dropPosition : null}
          />
        ))}
      </div>

      {/* Fixed "+" button */}
      <div className="flex items-center px-1">
        <button
          onClick={onCreateSpace}
          title="Create new space"
          className={clsx(
            "p-1.5 rounded",
            "text-gray-500 dark:text-gray-400",
            "hover:text-gray-900 dark:hover:text-gray-100",
            "hover:bg-gray-200 dark:hover:bg-gray-700",
            "transition-all duration-150",
            "focus:outline-none"
          )}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};
