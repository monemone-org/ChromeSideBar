import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { getIconUrl } from './iconify';

// Get icon element by name - uses Iconify CDN for dynamic icons
// isActive: when true, icon needs to be white (light) or black (dark) for contrast on badge
export const getIcon = (iconName: string, size: number = 14, isActive: boolean = false): React.ReactNode =>
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
        // Hide icon on error
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};
