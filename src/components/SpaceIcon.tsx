import React from 'react';
import clsx from 'clsx';
import * as ContextMenu from './ContextMenu';
import {
  LayoutGrid,
  Briefcase,
  Home,
  Rocket,
  Star,
  Heart,
  Folder,
  Code,
  Music,
  Book,
  Camera,
  Coffee,
  Globe,
  Lightbulb,
  Mail,
  MessageCircle,
  Settings,
  ShoppingCart,
  Users,
  Zap,
  Circle,
  LucideIcon,
} from 'lucide-react';
import { Space } from '../hooks/useSpaces';
import { GROUP_COLORS } from '../utils/groupColors';

// Map of supported icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Briefcase,
  Home,
  Rocket,
  Star,
  Heart,
  Folder,
  Code,
  Music,
  Book,
  Camera,
  Coffee,
  Globe,
  Lightbulb,
  Mail,
  MessageCircle,
  Settings,
  ShoppingCart,
  Users,
  Zap,
  Circle,
};

interface SpaceIconProps
{
  space: Space;
  isActive: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isAllSpace?: boolean;
}

// Get icon component by name
const getIcon = (iconName: string, size: number = 18): React.ReactNode =>
{
  const IconComponent = ICON_MAP[iconName];
  if (IconComponent)
  {
    return <IconComponent size={size} />;
  }
  // Fallback: treat as emoji
  if (iconName.length <= 2)
  {
    return <span className="text-sm">{iconName}</span>;
  }
  // Default fallback
  return <Circle size={size} />;
};

export const SpaceIcon: React.FC<SpaceIconProps> = ({
  space,
  isActive,
  onClick,
  onEdit,
  onDelete,
  isAllSpace = false,
}) =>
{
  const colorStyle = GROUP_COLORS[space.color] || GROUP_COLORS.grey;

  const iconButton = (
    <button
      onClick={onClick}
      title={space.name}
      className={clsx(
        "w-7 h-7 rounded flex items-center justify-center transition-all flex-shrink-0",
        "hover:scale-105",
        isActive
          ? [colorStyle.bgStrong, "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900", colorStyle.border.replace('border-', 'ring-')]
          : [colorStyle.bg, "hover:opacity-80"]
      )}
    >
      <span className={clsx(
        "flex items-center justify-center",
        isActive ? "text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-300"
      )}>
        {getIcon(space.icon, 14)}
      </span>
    </button>
  );

  // "All" space has no context menu
  if (isAllSpace)
  {
    return iconButton;
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {iconButton}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content>
          <ContextMenu.Item onSelect={onEdit}>
            Edit...
          </ContextMenu.Item>

          <ContextMenu.Separator />

          <ContextMenu.Item danger onSelect={onDelete}>
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

// Export the icon map for use in icon picker
export { ICON_MAP };
