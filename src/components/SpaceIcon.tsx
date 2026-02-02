import React, { useCallback } from 'react';
import clsx from 'clsx';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import * as ContextMenu from './menu/ContextMenu';
import { Space } from '../contexts/SpacesContext';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIcon } from '../utils/spaceIcons';
import { SpaceContextMenuContent } from './SpaceContextMenuContent';
import { createSpaceDragData, DropData, DropPosition, DragFormat, acceptsFormats } from '../types/dragDrop';

/**
 * Shared visual component for space icon rendering.
 * Used by both SpaceIcon and SpaceOverlay (drag overlay) for consistent appearance.
 */
interface SpaceIconVisualProps
{
  icon: string;
  color: string;
  isActive?: boolean;
  className?: string;
}

export const SpaceIconVisual: React.FC<SpaceIconVisualProps> = ({
  icon,
  color,
  isActive = false,
  className,
}) =>
{
  const colorStyle = GROUP_COLORS[color] || GROUP_COLORS.grey;

  return (
    <div
      className={clsx(
        "w-7 h-7 rounded flex items-center justify-center flex-shrink-0",
        isActive ? colorStyle.badge : colorStyle.bg,
        className
      )}
    >
      <span
        className={clsx(
          "flex items-center justify-center",
          isActive ? "text-white dark:text-black" : colorStyle.text
        )}
      >
        {getIcon(icon, 14, isActive)}
      </span>
    </div>
  );
};

interface SpaceIconProps
{
  space: Space;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCloseAllTabs?: () => void;
  isAllSpace?: boolean;
  isDraggable?: boolean;
  isDropTarget?: boolean;
  dropPosition?: DropPosition;
}

export const SpaceIcon: React.FC<SpaceIconProps> = ({
  space,
  index,
  isActive,
  onClick,
  onEdit,
  onDelete,
  onCloseAllTabs,
  isAllSpace = false,
  isDraggable = false,
  isDropTarget = false,
  dropPosition,
}) =>
{
  const spaceId = `space-${space.id}`;

  // Draggable setup
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: spaceId,
    data: createSpaceDragData(space.id, space.name, space.icon, space.color),
    disabled: !isDraggable,
  });

  // Droppable setup - accepts SPACE (reorder), TAB (move to space), or URL (create tab in space)
  const { setNodeRef: setDropRef } = useDroppable({
    id: spaceId,
    data: {
      zone: 'spaceBar',
      targetId: space.id,
      canAccept: acceptsFormats(DragFormat.SPACE, DragFormat.TAB, DragFormat.URL),
      index,
    } as DropData,
  });

  // Combine refs
  const setRefs = useCallback((node: HTMLButtonElement | null) =>
  {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  // Drop indicator styles
  const showDropBefore = isDropTarget && dropPosition === 'before';
  const showDropAfter = isDropTarget && dropPosition === 'after';

  const iconButton = (
    <button
      ref={setRefs}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onClick={onClick}
      title={space.name}
      data-space-id={space.id}
      data-space-button="true"
      data-dnd-id={spaceId}
      className={clsx(
        "relative transition-all",
        "hover:scale-105 focus:outline-none",
        !isActive && "hover:opacity-80",
        isDropTarget && !dropPosition && "ring-2 ring-blue-500 scale-110"
      )}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
      {/* Drop indicator - before */}
      {showDropBefore && (
        <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
      )}

      <SpaceIconVisual
        icon={space.icon}
        color={space.color}
        isActive={isActive}
      />

      {/* Drop indicator - after */}
      {showDropAfter && (
        <div className="absolute -right-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
      )}
    </button>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {iconButton}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content>
          <SpaceContextMenuContent
            isAllSpace={isAllSpace}
            onEdit={onEdit}
            onDelete={onDelete}
            onCloseAllTabs={onCloseAllTabs}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};
