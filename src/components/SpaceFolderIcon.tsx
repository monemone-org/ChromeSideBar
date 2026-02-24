import { Folder } from 'lucide-react';
import { getIconUrl } from '../utils/iconify';
import { isEmoji } from '../utils/emoji';
import { GROUP_COLORS, getHexColorStyle } from '../utils/groupColors';
import { Space } from '../contexts/SpacesContext';

// Renders the space icon overlay badge (emoji or Lucide icon on colored circle)
const SpaceIconOverlay = ({
  iconName,
  colorStyle,
  hexStyle,
}: {
  iconName: string;
  colorStyle: typeof GROUP_COLORS[string] | undefined;
  hexStyle: ReturnType<typeof getHexColorStyle> | undefined;
}) =>
{
  if (isEmoji(iconName))
  {
    return <span className="text-[10px] leading-none">{iconName}</span>;
  }
  // Lucide icon on colored badge
  if (colorStyle)
  {
    return (
      <span className={`flex items-center justify-center w-[14px] h-[14px] rounded-full ${colorStyle.badge}`}>
        <img
          src={getIconUrl(iconName)}
          alt=""
          className="w-[10px] h-[10px] invert dark:invert-0"
        />
      </span>
    );
  }
  // Hex color fallback
  return (
    <span
      className="flex items-center justify-center w-[14px] h-[14px] rounded-full"
      style={{ backgroundColor: hexStyle?.badge }}
    >
      <img
        src={getIconUrl(iconName)}
        alt=""
        className="w-[10px] h-[10px] invert dark:invert-0"
      />
    </span>
  );
};

// Folder icon with optional space overlay badge
export const SpaceFolderIcon = ({ space }: { space: Space | undefined }) =>
{
  if (!space)
  {
    return <Folder size={16} className="text-gray-500" />;
  }

  const colorStyle = GROUP_COLORS[space.color];
  const hexStyle = !colorStyle ? getHexColorStyle(space.color) : undefined;
  const colorClass = colorStyle?.text;

  return (
    <div className="relative">
      <Folder
        size={16}
        className={colorClass}
        style={hexStyle ? { color: hexStyle.text } : undefined}
      />
      <span className="absolute -bottom-[5px] -right-[5px] flex items-center justify-center">
        <SpaceIconOverlay
          iconName={space.icon}
          colorStyle={colorStyle}
          hexStyle={hexStyle}
        />
      </span>
    </div>
  );
};
