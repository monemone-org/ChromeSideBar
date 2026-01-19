import React from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as ContextMenu from './menu/ContextMenu';
import { Space } from '../contexts/SpacesContext';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIcon } from '../utils/spaceIcons';
import { SpaceContextMenuContent } from './SpaceContextMenuContent';

interface SpaceIconProps
{
  space: Space;
  isActive: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCloseAllTabs?: () => void;
  isAllSpace?: boolean;
  isDraggable?: boolean;
  isDropTarget?: boolean;
}

export const SpaceIcon: React.FC<SpaceIconProps> = ({
  space,
  isActive,
  onClick,
  onEdit,
  onDelete,
  onCloseAllTabs,
  isAllSpace = false,
  isDraggable = false,
  isDropTarget = false,
}) =>
{
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: space.id,
    disabled: !isDraggable,
  });

  // When using DragOverlay, hide the original item while dragging
  const style = isDraggable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }
    : undefined;

  const colorStyle = GROUP_COLORS[space.color] || GROUP_COLORS.grey;

  const iconButton = (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      title={space.name}
      data-space-id={space.id}
      data-space-button="true"
      className={clsx(
        "w-7 h-7 rounded flex items-center justify-center transition-all flex-shrink-0",
        "hover:scale-105 focus:outline-none",
        isActive ? colorStyle.badge : [colorStyle.bg, "hover:opacity-80"],
        isDropTarget && "ring-2 ring-blue-500 scale-110"
      )}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
      <span
        className={clsx(
          "flex items-center justify-center",
          isActive ? "text-white dark:text-black" : colorStyle.text
        )}
      >
        {getIcon(space.icon, 14, isActive)}
      </span>
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

// Static overlay component for DragOverlay - no sortable hooks
interface SpaceIconOverlayProps
{
  space: Space;
  isActive: boolean;
}

export const SpaceIconOverlay: React.FC<SpaceIconOverlayProps> = ({
  space,
  isActive,
}) =>
{
  const colorStyle = GROUP_COLORS[space.color] || GROUP_COLORS.grey;

  return (
    <div
      className={clsx(
        "w-7 h-7 rounded flex items-center justify-center flex-shrink-0 cursor-grabbing",
        isActive ? colorStyle.badge : colorStyle.bg
      )}
    >
      <span
        className={clsx(
          "flex items-center justify-center",
          isActive ? "text-white dark:text-black" : colorStyle.text
        )}
      >
        {getIcon(space.icon, 14, isActive)}
      </span>
    </div>
  );
};
