import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Globe } from 'lucide-react';
import clsx from 'clsx';
import { getIconUrl, getIconNames } from '../utils/iconify';
import { isEmoji } from '../utils/emoji';
import { COLOR_CIRCLE_SIZE } from '../utils/groupColors';
import { EMOJI_DATA, EMOJI_CATEGORIES } from '../data/emojiData';
import { LayoutGrid } from 'lucide-react';

// Representative emoji for each category (used as filter icons)
const CATEGORY_ICONS: Record<string, string> = {
  'Smileys & Emotion': '😀',
  'People & Body': '👋',
  'Animals & Nature': '🐻',
  'Food & Drink': '🍔',
  'Travel & Places': '🚗',
  'Activities': '⚽',
  'Objects': '💡',
  'Symbols': '💟',
  'Flags': '🚩',
};

// Color option interface - works for both hex colors and tab group colors
export interface ColorOption
{
  value: string;
  name: string;
  // For hex colors, use style; for tab group colors, use className
  style?: React.CSSProperties;
  className?: string;
}

type IconTab = 'icons' | 'emoji';

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

  // Emoji support (optional - when provided, shows Icons/Emoji tab toggle)
  selectedEmoji?: string;
  onEmojiSelect?: (emoji: string) => void;

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
  selectedEmoji,
  onEmojiSelect,
  iconLabel = 'Icon',
  colorLabel = 'Color',
  iconHeaderAction,
  iconGridHeight = DEFAULT_VISIBLE_HEIGHT,
  colorCircleSize = COLOR_CIRCLE_SIZE,
}) =>
{
  const hasEmojiSupport = !!onEmojiSelect;
  const [activeTab, setActiveTab] = useState<IconTab>(selectedEmoji ? 'emoji' : 'icons');
  const [iconSearch, setIconSearch] = useState('');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<string | null>(null);
  const [allIconNames, setAllIconNames] = useState<string[]>([]);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [iconsError, setIconsError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [emojiScrollTop, setEmojiScrollTop] = useState(0);

  // Load icons on mount
  useEffect(() =>
  {
    if (allIconNames.length === 0 && !iconsLoading && !iconsError)
    {
      setIconsLoading(true);
      getIconNames()
        .then((result) =>
        {
          setAllIconNames(result.icons);
          setIconsError(result.error);
          setIconsLoading(false);
        })
        .catch(() =>
        {
          setIconsError('Failed to load icons');
          setIconsLoading(false);
        });
    }
  }, [allIconNames.length, iconsLoading, iconsError]);

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

  // Filter emojis based on search and category
  const filteredEmojis = useMemo(() =>
  {
    let result = EMOJI_DATA;
    if (selectedEmojiCategory)
    {
      result = result.filter((e) => e.category === selectedEmojiCategory);
    }
    if (emojiSearch.trim())
    {
      const search = emojiSearch.toLowerCase();
      result = result.filter((e) => e.name.includes(search));
    }
    return result;
  }, [emojiSearch, selectedEmojiCategory]);

  // Calculate total rows and content height for icons
  const totalRows = Math.ceil(filteredIcons.length / COLS);
  const totalContentHeight = totalRows * ROW_HEIGHT - GAP + PADDING * 2;

  // Calculate total rows and content height for emojis
  const emojiTotalRows = Math.ceil(filteredEmojis.length / COLS);
  const emojiTotalContentHeight = emojiTotalRows * ROW_HEIGHT - GAP + PADDING * 2;

  // Determine visible row range with buffer for icons
  const startRow = Math.max(0, Math.floor((scrollTop - PADDING) / ROW_HEIGHT) - 2);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + iconGridHeight - PADDING) / ROW_HEIGHT) + 2);

  // Determine visible row range with buffer for emojis
  const emojiStartRow = Math.max(0, Math.floor((emojiScrollTop - PADDING) / ROW_HEIGHT) - 2);
  const emojiEndRow = Math.min(emojiTotalRows, Math.ceil((emojiScrollTop + iconGridHeight - PADDING) / ROW_HEIGHT) + 2);

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

  // Get visible emojis
  const visibleEmojis = useMemo(() =>
  {
    const startIndex = emojiStartRow * COLS;
    const endIndex = emojiEndRow * COLS;
    return filteredEmojis.slice(startIndex, endIndex).map((entry, i) => ({
      entry,
      index: startIndex + i,
    }));
  }, [filteredEmojis, emojiStartRow, emojiEndRow]);

  // Scroll handler
  const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) =>
  {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleEmojiGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) =>
  {
    setEmojiScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Reset scroll when search changes
  useEffect(() =>
  {
    setScrollTop(0);
  }, [iconSearch]);

  useEffect(() =>
  {
    setEmojiScrollTop(0);
  }, [emojiSearch, selectedEmojiCategory]);

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
              value={activeTab === 'icons' ? iconSearch : emojiSearch}
              onChange={(e) =>
              {
                const val = e.target.value;
                // Detect emoji typed/pasted in either tab
                // Use Intl.Segmenter to keep compound emojis intact (e.g. 🧒🏻)
                const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                const segments = [...segmenter.segment(val)];
                const char = segments.find(s => isEmoji(s.segment))?.segment;
                if (char && onEmojiSelect)
                {
                  onEmojiSelect(char);
                  if (activeTab === 'icons')
                  {
                    setIconSearch('');
                  }
                  else
                  {
                    setEmojiSearch('');
                  }
                }
                else if (activeTab === 'icons')
                {
                  setIconSearch(val);
                }
                else
                {
                  setEmojiSearch(val);
                }
              }}
              placeholder={activeTab === 'icons' ? 'Search icons...' : 'Search emoji...'}
              className="w-full pl-7 pr-2 py-1 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none text-[0.85em]"
            />
          </div>
        </div>

        {/* Tab bar + grid container (only when emoji support is enabled) */}
        {hasEmojiSupport && (
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('icons')}
              className={clsx(
                "px-3 py-1 text-[0.85em] -mb-px border-b-2",
                activeTab === 'icons'
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              Icons
            </button>
            <button
              onClick={() => setActiveTab('emoji')}
              className={clsx(
                "px-3 py-1 text-[0.85em] -mb-px border-b-2",
                activeTab === 'emoji'
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              Emoji
            </button>
          </div>
        )}

        {/* Icons tab content */}
        {activeTab === 'icons' && (
          <>
            {/* Icon grid - virtualized */}
            <div
              onScroll={handleGridScroll}
              className={clsx(
                "relative bg-gray-50 dark:bg-gray-900 overflow-y-auto overflow-x-hidden",
                hasEmojiSupport ? "rounded-b-md" : "rounded-md"
              )}
              style={{ height: Math.min(iconGridHeight, Math.max(totalContentHeight, 64)) }}
            >
              {iconsLoading ? (
                <div className="flex items-center justify-center h-16 text-gray-400 text-[0.85em]">
                  Loading icons...
                </div>
              ) : iconsError ? (
                <div className="flex items-center justify-center h-16 text-gray-400 text-[0.85em]">
                  {iconsError}
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
                          selectedIcon === name && !selectedEmoji && "bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-500"
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
          </>
        )}

        {/* Emoji tab content */}
        {activeTab === 'emoji' && hasEmojiSupport && (
          <>
            {/* Category filter - emoji icons */}
            <div className="flex items-center gap-0.5 mb-1">
              <button
                onClick={() => setSelectedEmojiCategory(null)}
                className={clsx(
                  "w-7 h-7 flex items-center justify-center rounded",
                  !selectedEmojiCategory
                    ? "bg-blue-100 dark:bg-blue-900/50"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
                title="All"
              >
                <LayoutGrid size={14} className={clsx(
                  !selectedEmojiCategory
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-400 dark:text-gray-500"
                )} />
              </button>
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedEmojiCategory(cat)}
                  className={clsx(
                    "w-7 h-7 flex items-center justify-center rounded text-base",
                    selectedEmojiCategory === cat
                      ? "bg-blue-100 dark:bg-blue-900/50"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 opacity-60 hover:opacity-100"
                  )}
                  title={cat}
                >
                  {CATEGORY_ICONS[cat]}
                </button>
              ))}
            </div>

            {/* Emoji grid - virtualized */}
            <div
              onScroll={handleEmojiGridScroll}
              className="relative bg-gray-50 dark:bg-gray-900 rounded-b-md overflow-y-auto overflow-x-hidden"
              style={{ height: Math.min(iconGridHeight, Math.max(emojiTotalContentHeight, 64)) }}
            >
              <div style={{ height: emojiTotalContentHeight, position: 'relative' }}>
                {visibleEmojis.map(({ entry, index }) =>
                {
                  const row = Math.floor(index / COLS);
                  const col = index % COLS;
                  return (
                    <button
                      key={entry.emoji}
                      onClick={() => onEmojiSelect!(entry.emoji)}
                      className={clsx(
                        "absolute w-8 h-8 flex items-center justify-center rounded",
                        "hover:bg-gray-200 dark:hover:bg-gray-700",
                        selectedEmoji === entry.emoji && "bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-500"
                      )}
                      style={{
                        top: PADDING + row * ROW_HEIGHT,
                        left: PADDING + col * (ICON_SIZE + GAP),
                      }}
                      title={entry.name}
                    >
                      <span className="text-lg">{entry.emoji}</span>
                    </button>
                  );
                })}
                {filteredEmojis.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-[0.85em]">
                    No emoji found
                  </div>
                )}
              </div>
            </div>
          </>
        )}
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

          {/* Custom color dot + hex input (optional) */}
          {showCustomHex && onCustomHexChange && onCustomHexSubmit && (
            <div className="flex items-center gap-1 ml-1">
              {currentCustomColor && !colorOptions.some((o) => o.value === currentCustomColor) && (
                <div
                  className={clsx(
                    colorCircleSize,
                    "rounded-full border-2 flex-shrink-0",
                    isColorSelected(currentCustomColor)
                      ? "border-gray-900 dark:border-white ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: currentCustomColor }}
                  title={currentCustomColor}
                />
              )}
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
                className="px-1.5 py-0.5 text-[0.85em] bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-blue-500 rounded"
              >
                Set
              </button>
            </div>
          )}
        </div>

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
