import React from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

  // useSortable combines draggable + droppable
  // The data object includes BOTH drag data AND drop data
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: spaceId,
    data: {
      // Drag data (for when this item is being dragged)
      ...createSpaceDragData(space.id, space.name, space.icon, space.color),
      // Drop data (for when items are dropped onto this)
      zone: 'spaceBar',
      targetId: space.id,
      canAccept: acceptsFormats(DragFormat.SPACE, DragFormat.TAB, DragFormat.URL),
      isHorizontal: true,
      // TAB/URL drops go "into" the space; SPACE drops are before/after for reordering
      isContainerForFormat: (format: DragFormat) =>
        format === DragFormat.TAB || format === DragFormat.URL,
      index,
    } as DropData,
    disabled: !isDraggable,
  });

  // Apply transform style for sortable animation
  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : undefined;

  const iconButton = (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      title={space.name}
      data-space-id={space.id}
      data-space-button="true"
      data-dnd-id={spaceId}
      className={clsx(
        "relative",
        "hover:scale-105 focus:outline-none",
        !isActive && "hover:opacity-80",
        isDropTarget && (dropPosition === 'into' || dropPosition === 'intoFirst') && "ring-2 ring-blue-500 scale-110"
      )}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
      {isAllSpace ? (
        <div
          className={clsx(
            "w-7 h-7 rounded flex items-center justify-center flex-shrink-0",
            isActive
              ? "bg-[#5F6368] dark:bg-[#BDC1C6]"      // grey.badge
              : "bg-[#F1F3F4] dark:bg-[#5F6368]/30"   // grey.bg
          )}
        >
          <span
            className={clsx(
              "text-[9px] font-bold",
              isActive
                ? "text-white dark:text-black"              // standard active
                : "text-[#5F6368] dark:text-[#BDC1C6]"      // grey.text
            )}
          >
            ALL
          </span>
        </div>
      ) : (
        <SpaceIconVisual
          icon={space.icon}
          color={space.color}
          isActive={isActive}
        />
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
