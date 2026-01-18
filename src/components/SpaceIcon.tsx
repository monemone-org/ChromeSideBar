import React from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as ContextMenu from './menu/ContextMenu';
import { LayoutGrid } from 'lucide-react';
import { Space } from '../contexts/SpacesContext';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIconUrl } from '../utils/iconify';
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
}

// Get icon element by name - uses Iconify CDN for dynamic icons
// isActive: when true, icon needs to be white (light) or black (dark) for contrast on badge
const getIcon = (iconName: string, size: number = 14, isActive: boolean = false): React.ReactNode =>
{
  // Special case: LayoutGrid is used for the "All" space
  if (iconName === 'LayoutGrid')
  {
    return <LayoutGrid size={size} />;
  }

  // Icon filter classes:
  // - Normal: dark:invert (black in light mode, white in dark mode)
  // - Active: invert dark:invert-0 (white in light mode, black in dark mode)
  const filterClass = isActive ? "invert dark:invert-0" : "dark:invert";

  // Use Iconify CDN for Lucide icons
  return (
    <img
      src={getIconUrl(iconName)}
      alt={iconName}
      width={size}
      height={size}
      className={filterClass}
      onError={(e) =>
      {
        // Fallback to Circle icon on error
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};

export const SpaceIcon: React.FC<SpaceIconProps> = ({
  space,
  isActive,
  onClick,
  onEdit,
  onDelete,
  onCloseAllTabs,
  isAllSpace = false,
  isDraggable = false,
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
      className={clsx(
        "w-7 h-7 rounded flex items-center justify-center transition-all flex-shrink-0",
        "hover:scale-105 focus:outline-none",
        isActive ? colorStyle.badge : [colorStyle.bg, "hover:opacity-80"]
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
