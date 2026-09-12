import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { getIconUrl } from './iconify';
import { isEmoji } from './emoji';

// Get icon element by name - uses Iconify CDN for dynamic icons
// isActive: when true, icon needs to be white (light) or black (dark) for contrast on badge
export const getIcon = (iconName: string, size: number = 14, isActive: boolean = false): React.ReactNode =>
{
  // Emoji icons render as text
  if (isEmoji(iconName))
  {
    return <span style={{ fontSize: size }} className="leading-none">{iconName}</span>;
  }

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
  // key={iconName} forces a fresh <img> element when the icon changes, so an
  // onError-hidden state from a previous (invalid) icon name doesn't stick
  // around on a reused DOM node - React never manages `style` since it's
  // never passed as a prop, so it wouldn't reset it on its own.
  return (
    <img
      key={iconName}
      src={getIconUrl(iconName)}
      alt={iconName}
      width={size}
      height={size}
      className={filterClass}
      onError={(e) =>
      {
        // Hide icon on error
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};
