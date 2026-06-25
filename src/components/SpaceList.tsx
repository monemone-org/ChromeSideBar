import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Space } from '../utils/spaceMessages';
import { LayoutGrid } from 'lucide-react';
import { getIconUrl } from '../utils/iconify';
import { isEmoji } from '../utils/emoji';
import { GROUP_COLORS, getHexColorStyle } from '../utils/groupColors';
import clsx from 'clsx';

// Maps a list index to its display key label (0-9 only; a-z no longer used as hotkeys).
// firstKeyIsZero=true:  0->"0", 1->"1", ..., 9->"9", 10+->""
// firstKeyIsZero=false: 0->"1", ..., 8->"9", 9+->""
function computeKeyHint(index: number, firstKeyIsZero: boolean): string
{
  if (firstKeyIsZero)
  {
    if (index === 0) return '0';
    return index <= 9 ? String(index) : '';
  }
  const n = index + 1;
  return n <= 9 ? String(n) : '';
}

// Maps a raw key press to a list index for quick-select (0-9 only).
function computeKeyToIndex(key: string, firstKeyIsZero: boolean): number | null
{
  if (firstKeyIsZero)
  {
    if (key === '0') return 0;
    const num = parseInt(key, 10);
    if (num >= 1 && num <= 9) return num;
    return null;
  }
  const num = parseInt(key, 10);
  if (num >= 1 && num <= 9) return num - 1;
  return null;
}

// Keyboard navigation and live search for a space list.
// firstKeyIsZero: when true, "0" = index 0 (All space), "1"-"9" = 1-9.
//                when false (default), "1"-"9" = indexes 0-8.
// Typing any non-0-9 char while the search input is not focused focuses it and starts searching.
// While searching, 0-9 hotkeys are disabled; Escape clears the query first.
// enabled lets dialog callers disable the handler when closed.
export function useSpaceListKeyboard({
  spaces,
  highlightedIndex,
  setHighlightedIndex,
  onSelect,
  itemRefs,
  firstKeyIsZero = false,
  onEscape,
  enabled = true,
}: {
  spaces: Space[];
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  onSelect: (spaceId: string) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  firstKeyIsZero?: boolean;
  onEscape?: () => void;
  enabled?: boolean;
}): { filteredSpaces: Space[]; searchQuery: string; onSearchChange: (text: string) => void; searchInputRef: React.RefObject<HTMLInputElement> }
{
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search-filter the input list; no-op when query is empty
  const filteredSpaces = useMemo(() =>
    searchQuery
      ? spaces.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : spaces,
    [spaces, searchQuery]
  );

  // Reset highlight to first result whenever the query changes
  useEffect(() =>
  {
    setHighlightedIndex(0);
  }, [searchQuery, setHighlightedIndex]);

  // Clear search when the list is hidden (e.g. dialog closes)
  useEffect(() =>
  {
    if (!enabled) setSearchQuery('');
  }, [enabled]);

  // Stable callback for the input's onChange
  const onSearchChange = useCallback((text: string) => setSearchQuery(text), []);

  // Refs so the keydown handler reads current values without re-attaching on every keystroke
  const highlightedRef = useRef(highlightedIndex);
  const searchQueryRef = useRef(searchQuery);
  const filteredSpacesRef = useRef(filteredSpaces);
  useEffect(() => { highlightedRef.current = highlightedIndex; });
  useEffect(() => { searchQueryRef.current = searchQuery; });
  useEffect(() => { filteredSpacesRef.current = filteredSpaces; });

  useEffect(() =>
  {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) =>
    {
      const currentQuery = searchQueryRef.current;
      const currentSpaces = filteredSpacesRef.current;
      const current = highlightedRef.current;
      const isInputFocused = e.target === searchInputRef.current;

      if (isInputFocused)
      {
        // Input has focus: handle navigation/action keys; everything else goes to the input natively
        if (e.key === 'ArrowDown')
        {
          e.preventDefault();
          const next = current < currentSpaces.length - 1 ? current + 1 : 0;
          setHighlightedIndex(next);
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        }
        else if (e.key === 'ArrowUp')
        {
          e.preventDefault();
          const next = current > 0 ? current - 1 : currentSpaces.length - 1;
          setHighlightedIndex(next);
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        }
        else if (e.key === 'Enter')
        {
          e.preventDefault();
          const space = currentSpaces[current];
          if (space) onSelect(space.id);
        }
        else if (e.key === 'Escape')
        {
          if (currentQuery)
          {
            setSearchQuery('');
          }
          else if (onEscape)
          {
            onEscape();
          }
        }
        return;
      }

      // Input not focused: try 0-9 hotkeys when not searching
      if (!currentQuery)
      {
        const index = computeKeyToIndex(e.key, firstKeyIsZero);
        if (index !== null)
        {
          if (index < currentSpaces.length)
          {
            e.preventDefault();
            onSelect(currentSpaces[index].id);
          }
          return;
        }
      }

      // Printable char typed outside the input: focus the input and append the char
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
      {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchQuery(q => q + e.key);
        return;
      }

      // Navigation when input is not focused
      if (e.key === 'ArrowDown')
      {
        e.preventDefault();
        const next = current < currentSpaces.length - 1 ? current + 1 : 0;
        setHighlightedIndex(next);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      }
      else if (e.key === 'ArrowUp')
      {
        e.preventDefault();
        const next = current > 0 ? current - 1 : currentSpaces.length - 1;
        setHighlightedIndex(next);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      }
      else if (e.key === 'Enter')
      {
        e.preventDefault();
        const space = currentSpaces[current];
        if (space) onSelect(space.id);
      }
      else if (e.key === 'Escape')
      {
        if (currentQuery)
        {
          setSearchQuery('');
        }
        else if (onEscape)
        {
          onEscape();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, setHighlightedIndex, onSelect, itemRefs, firstKeyIsZero, onEscape]);

  return { filteredSpaces, searchQuery, onSearchChange, searchInputRef };
}

// Highlights the active space and scrolls to it when the list becomes visible or spaces change.
// onActivate is called whenever the effect fires (e.g. to clear error state on dialog open).
export function useSpaceListHighlight({
  spaces,
  activeSpaceId,
  setHighlightedIndex,
  itemRefs,
  enabled = true,
  onActivate,
}: {
  spaces: Space[];
  activeSpaceId: string;
  setHighlightedIndex: (index: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  enabled?: boolean;
  onActivate?: () => void;
}): void
{
  useEffect(() =>
  {
    if (!enabled || spaces.length === 0) return;
    const idx = spaces.findIndex(s => s.id === activeSpaceId);
    const target = idx >= 0 ? idx : 0;
    setHighlightedIndex(target);
    onActivate?.();
    // Use rAF so refs are populated after portal renders
    requestAnimationFrame(() =>
    {
      itemRefs.current[target]?.scrollIntoView({ block: 'nearest' });
    });
  }, [enabled, spaces, activeSpaceId, setHighlightedIndex, itemRefs, onActivate]);
}

export interface SpaceListProps
{
  spaces: Space[];
  highlightedIndex: number;
  activeSpaceId: string;
  // When true, key hints use "0" for index 0 and "1"-"9" for 1-9.
  // When false (default), key hints are "1"-"9" for indexes 0-8.
  firstKeyIsZero?: boolean;
  // Search input props - when provided, renders a real text input above the list
  searchQuery?: string;
  onSearchChange?: (text: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  onSelect: (spaceId: string) => void;
  onHighlight: (index: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  isDisabled?: (space: Space) => boolean;
  showCurrentIndicator?: boolean;
  errorMessage?: string | null;
}

function renderSpaceIcon(iconName: string, size: number = 16)
{
  if (isEmoji(iconName))
  {
    return <span style={{ fontSize: size }} className="leading-none">{iconName}</span>;
  }

  if (iconName === 'LayoutGrid')
  {
    return <LayoutGrid size={size} />;
  }

  return (
    <img
      src={getIconUrl(iconName)}
      alt={iconName}
      width={size}
      height={size}
      className="dark:invert"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export const SpaceList = ({
  spaces,
  highlightedIndex,
  activeSpaceId,
  firstKeyIsZero = false,
  searchQuery,
  onSearchChange,
  searchInputRef,
  onSelect,
  onHighlight,
  itemRefs,
  isDisabled,
  showCurrentIndicator = true,
  errorMessage,
}: SpaceListProps) =>
{
  const isSearching = Boolean(searchQuery);

  return (
    <div>
      {/* Search input - shown when caller opts in via onSearchChange + searchInputRef */}
      {onSearchChange && searchInputRef && (
        <div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery ?? ''}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search spaces..."
            className={clsx(
              "w-full px-2 py-1 text-xs rounded border outline-none",
              "bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200",
              "placeholder-gray-400 dark:placeholder-gray-500",
              "border-gray-200 dark:border-gray-600",
              "focus:border-blue-300 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800"
            )}
          />
        </div>
      )}

      <div className="py-1">
      {spaces.length === 0 ? (
        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
          {isSearching ? 'No matches' : 'No spaces available'}
        </div>
      ) : (
        spaces.map((space, index) =>
        {
          const colorStyle = GROUP_COLORS[space.color];
          const hexStyle = !colorStyle ? getHexColorStyle(space.color) : undefined;
          const isActive = space.id === activeSpaceId;
          const isHighlighted = index === highlightedIndex;
          const disabled = isDisabled?.(space) ?? false;

          return (
            <button
              key={space.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              onClick={() => onSelect(space.id)}
              onMouseEnter={() => onHighlight(index)}
              className={clsx(
                "w-full h-7 px-2 text-left flex items-center gap-2",
                disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700",
                isHighlighted && !disabled && "bg-blue-50 dark:bg-blue-900/30"
              )}
            >
              {/* Keyboard shortcut hint - hidden during search since 0-9 hotkeys are disabled */}
              <span className={clsx(
                "w-4 font-mono text-xs flex-shrink-0",
                disabled ? "text-gray-300 dark:text-gray-600" : "text-gray-400 dark:text-gray-500"
              )}>
                {isSearching ? '' : computeKeyHint(index, firstKeyIsZero)}
              </span>

              {/* Space icon */}
              <span
                className={clsx("w-5 h-5 rounded flex items-center justify-center flex-shrink-0", colorStyle?.bg)}
                style={hexStyle ? { backgroundColor: hexStyle.bg } : undefined}
              >
                <span className={colorStyle?.text} style={hexStyle ? { color: hexStyle.text } : undefined}>
                  {renderSpaceIcon(space.icon, 12)}
                </span>
              </span>

              {/* Space name */}
              <span className={clsx(
                "truncate flex-1 text-sm",
                disabled ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-700 dark:text-gray-200"
              )}>
                {space.name}
              </span>

              {/* Status indicator */}
              {disabled ? (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">No folder</span>
              ) : showCurrentIndicator && isActive && (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">current</span>
              )}
            </button>
          );
        })
      )}

      {errorMessage && (
        <div className="px-2 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          {errorMessage}
        </div>
      )}
      </div>
    </div>
  );
};
