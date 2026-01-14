import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Globe } from 'lucide-react';
import clsx from 'clsx';
import { getIconUrl, getIconNames } from '../utils/iconify';
import { COLOR_CIRCLE_SIZE } from '../utils/groupColors';

// Color option interface - works for both hex colors and tab group colors
export interface ColorOption
{
  value: string;
  name: string;
  // For hex colors, use style; for tab group colors, use className
  style?: React.CSSProperties;
  className?: string;
}

interface IconColorPickerProps
{
  // Current values
  selectedIcon: string | undefined;
  selectedColor: string;
  currentIconPreview?: React.ReactNode;

  // Callbacks
  onIconSelect: (iconName: string) => void;
  onColorSelect: (color: string) => void;

  // Color options
  colorOptions: ColorOption[];

  // Optional features
  showCustomHex?: boolean;
  customHexValue?: string;
  onCustomHexChange?: (value: string) => void;
  onCustomHexSubmit?: () => void;
  currentCustomColor?: string; // For showing non-preset colors

  // Labels
  iconLabel?: string;
  colorLabel?: string;

  // Optional header action (e.g., "Reset to site icon" button)
  iconHeaderAction?: React.ReactNode;

  // Size customization
  iconGridHeight?: number; // Default: 128 (~3.5 rows)
  colorCircleSize?: string; // Tailwind size class, default: 'w-5 h-5'
}

// Grid layout constants
const COLS = 7;
const ICON_SIZE = 32; // w-8 = 2rem = 32px
const GAP = 4; // gap-1 = 0.25rem = 4px
const PADDING = 8; // p-2 = 0.5rem = 8px
const ROW_HEIGHT = ICON_SIZE + GAP;
const DEFAULT_VISIBLE_HEIGHT = 128; // max-h-32 = 8rem = 128px (~3.5 rows)

export const IconColorPicker: React.FC<IconColorPickerProps> = ({
  selectedIcon,
  selectedColor,
  currentIconPreview,
  onIconSelect,
  onColorSelect,
  colorOptions,
  showCustomHex = false,
  customHexValue = '',
  onCustomHexChange,
  onCustomHexSubmit,
  currentCustomColor,
  iconLabel = 'Icon',
  colorLabel = 'Color',
  iconHeaderAction,
  iconGridHeight = DEFAULT_VISIBLE_HEIGHT,
  colorCircleSize = COLOR_CIRCLE_SIZE,
}) =>
{
  const [iconSearch, setIconSearch] = useState('');
  const [allIconNames, setAllIconNames] = useState<string[]>([]);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  // Load icons on mount
  useEffect(() =>
  {
    if (allIconNames.length === 0 && !iconsLoading)
    {
      setIconsLoading(true);
      getIconNames()
        .then((names) =>
        {
          setAllIconNames(names);
          setIconsLoading(false);
        })
        .catch(() =>
        {
          setIconsLoading(false);
        });
    }
  }, [allIconNames.length, iconsLoading]);

  // Filter icons based on search
  const filteredIcons = useMemo(() =>
  {
    if (!iconSearch.trim())
    {
      return allIconNames;
    }
    const search = iconSearch.toLowerCase();
    return allIconNames.filter((name) => name.toLowerCase().includes(search));
  }, [iconSearch, allIconNames]);

  // Calculate total rows and content height
  const totalRows = Math.ceil(filteredIcons.length / COLS);
  const totalContentHeight = totalRows * ROW_HEIGHT - GAP + PADDING * 2;

  // Determine visible row range with buffer
  const startRow = Math.max(0, Math.floor((scrollTop - PADDING) / ROW_HEIGHT) - 2);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + iconGridHeight - PADDING) / ROW_HEIGHT) + 2);

  // Get visible icons
  const visibleIcons = useMemo(() =>
  {
    const startIndex = startRow * COLS;
    const endIndex = endRow * COLS;
    return filteredIcons.slice(startIndex, endIndex).map((name, i) => ({
      name,
      index: startIndex + i,
    }));
  }, [filteredIcons, startRow, endRow]);

  // Scroll handler
  const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) =>
  {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Reset scroll when search changes
  useEffect(() =>
  {
    setScrollTop(0);
  }, [iconSearch]);

  // Render an icon by name from CDN
  const renderIcon = (iconName: string, size: number = 18) =>
  {
    return (
      <img
        src={getIconUrl(iconName)}
        alt={iconName}
        width={size}
        height={size}
        className="dark:invert"
      />
    );
  };

  // Check if a color is selected (for both hex and tab group colors)
  const isColorSelected = (colorValue: string): boolean =>
  {
    return selectedColor === colorValue;
  };

  return (
    <div className="space-y-3">
      {/* Icon section */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block font-medium text-gray-700 dark:text-gray-300">
            {iconLabel}
          </label>
          {iconHeaderAction}
        </div>

        {/* Icon preview + Search in one row */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center border rounded-md dark:border-gray-600">
            {currentIconPreview ? (
              currentIconPreview
            ) : selectedIcon ? (
              renderIcon(selectedIcon, 20)
            ) : (
              <Globe className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full pl-7 pr-2 py-1 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none text-[0.85em]"
            />
          </div>
        </div>
        {/* Icon name */}
        <p className="text-[0.85em] text-gray-500 dark:text-gray-400 mb-2">
          {selectedIcon || 'No icon selected'}
        </p>

        {/* Icon grid - virtualized */}
        <div
          onScroll={handleGridScroll}
          className="relative bg-gray-50 dark:bg-gray-900 rounded-md overflow-y-auto overflow-x-hidden"
          style={{ height: Math.min(iconGridHeight, Math.max(totalContentHeight, 64)) }}
        >
          {iconsLoading ? (
            <div className="flex items-center justify-center h-16 text-gray-400 text-[0.85em]">
              Loading icons...
            </div>
          ) : (
            <div style={{ height: totalContentHeight, position: 'relative' }}>
              {visibleIcons.map(({ name, index }) =>
              {
                const row = Math.floor(index / COLS);
                const col = index % COLS;
                return (
                  <button
                    key={name}
                    onClick={() => onIconSelect(name)}
                    className={clsx(
                      "absolute w-8 h-8 flex items-center justify-center rounded",
                      "hover:bg-gray-200 dark:hover:bg-gray-700",
                      selectedIcon === name && "bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-500"
                    )}
                    style={{
                      top: PADDING + row * ROW_HEIGHT,
                      left: PADDING + col * (ICON_SIZE + GAP),
                    }}
                    title={name}
                  >
                    {renderIcon(name)}
                  </button>
                );
              })}
              {filteredIcons.length === 0 && !iconsLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-[0.85em]">
                  No icons found
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-[0.85em] text-gray-400 mt-1">
          {filteredIcons.length} icons
        </p>
      </div>

      {/* Color section */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-1">
          <label className="font-medium text-gray-700 dark:text-gray-300">
            {colorLabel}
          </label>
          <span className="text-[0.85em] text-gray-500 dark:text-gray-400">
            {colorOptions.find((o) => o.value === selectedColor)?.name || selectedColor}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {colorOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onColorSelect(option.value)}
              className={clsx(
                colorCircleSize,
                "rounded-full border-2 transition-transform hover:scale-110",
                option.className,
                isColorSelected(option.value)
                  ? "border-gray-900 dark:border-white ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500"
                  : "border-transparent"
              )}
              style={option.style}
              title={option.name}
              aria-label={`Select ${option.name} color`}
            />
          ))}

          {/* Custom hex input (optional) */}
          {showCustomHex && onCustomHexChange && onCustomHexSubmit && (
            <div className="flex items-center gap-1 ml-1">
              <input
                type="text"
                value={customHexValue}
                onChange={(e) => onCustomHexChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCustomHexSubmit()}
                placeholder="#hex"
                className="w-16 px-1.5 py-0.5 text-[0.85em] border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={onCustomHexSubmit}
                className="px-1.5 py-0.5 text-[0.85em] bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
              >
                Set
              </button>
            </div>
          )}
        </div>

        {/* Show current color if not a preset */}
        {currentCustomColor && !colorOptions.some((o) => o.value === currentCustomColor) && (
          <div className="flex items-center gap-1 mt-1">
            <div
              className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: currentCustomColor }}
            />
            <span className="text-[0.85em] text-gray-500">{currentCustomColor}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Preset color palette for pinned sites
export const PINNED_SITE_COLORS: ColorOption[] = [
  { name: 'Gray', value: '#6b7280', style: { backgroundColor: '#6b7280' } },
  { name: 'Red', value: '#ef4444', style: { backgroundColor: '#ef4444' } },
  { name: 'Orange', value: '#f97316', style: { backgroundColor: '#f97316' } },
  { name: 'Yellow', value: '#eab308', style: { backgroundColor: '#eab308' } },
  { name: 'Green', value: '#22c55e', style: { backgroundColor: '#22c55e' } },
  { name: 'Teal', value: '#14b8a6', style: { backgroundColor: '#14b8a6' } },
  { name: 'Blue', value: '#3b82f6', style: { backgroundColor: '#3b82f6' } },
  { name: 'Purple', value: '#a855f7', style: { backgroundColor: '#a855f7' } },
  { name: 'Pink', value: '#ec4899', style: { backgroundColor: '#ec4899' } },
];

export const DEFAULT_ICON_COLOR = '#6b7280';
