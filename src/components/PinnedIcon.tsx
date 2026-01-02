import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Globe, Edit, Trash, X, RotateCcw, Search } from 'lucide-react';
import { PinnedSite } from '../hooks/usePinnedSites';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import * as ContextMenu from './ContextMenu';

// Iconify API for on-demand icon loading
const ICONIFY_API_BASE = 'https://api.iconify.design';
const ICONIFY_COLLECTION_API = `${ICONIFY_API_BASE}/collection?prefix=lucide`;

// Get icon URL from Iconify CDN
function getIconUrl(name: string): string {
  return `${ICONIFY_API_BASE}/lucide/${name}.svg`;
}

// Fetch icon names from Iconify API
async function fetchIconNames(): Promise<string[]> {
  const response = await fetch(ICONIFY_COLLECTION_API);
  const data = await response.json();
  const names: string[] = [];
  if (data.uncategorized) {
    names.push(...data.uncategorized);
  }
  if (data.categories) {
    for (const category of Object.values(data.categories)) {
      names.push(...(category as string[]));
    }
  }
  names.sort();
  return names;
}

// Default icon color
const DEFAULT_ICON_COLOR = '#6b7280';

// Preset color palette
const PRESET_COLORS = [
  { name: 'Gray', value: '#6b7280' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

// Fetch icon SVG from CDN and convert to data URL with color
async function iconToDataUrl(iconName: string, color: string = DEFAULT_ICON_COLOR): Promise<string> {
  try {
    const response = await fetch(getIconUrl(iconName));
    let svg = await response.text();
    // Replace stroke color in the SVG
    svg = svg.replace(/stroke="[^"]*"/g, `stroke="${color}"`);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

interface PinnedIconProps {
  site: PinnedSite;
  onRemove: (id: string) => void;
  onUpdate: (id: string,
             title: string,
             url: string,
             favicon?: string,
             customIconName?: string,
             iconColor?: string) => void;
  onResetFavicon: (id: string) => void;
  onOpen: (site: PinnedSite) => void;
  onClose?: (id: string) => void;
  isLoaded?: boolean;
  iconSize: number;
}

export const PinnedIcon = ({ site, onRemove, onUpdate, onResetFavicon, onOpen, onClose, isLoaded, iconSize }: PinnedIconProps) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(site.title);
  const [editUrl, setEditUrl] = useState(site.url);
  const [editFavicon, setEditFavicon] = useState(site.favicon);
  const [editCustomIconName, setEditCustomIconName] = useState(site.customIconName);
  const [editIconColor, setEditIconColor] = useState(site.iconColor || DEFAULT_ICON_COLOR);
  const [customHexInput, setCustomHexInput] = useState('');
  const [iconSearch, setIconSearch] = useState('');
  const [allIconNames, setAllIconNames] = useState<string[]>([]);
  const [iconsLoading, setIconsLoading] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: site.id });

  // Load icons when modal opens
  useEffect(() => {
    if (showEditModal && allIconNames.length === 0 && !iconsLoading) {
      setIconsLoading(true);
      fetchIconNames().then(names => {
        setAllIconNames(names);
        setIconsLoading(false);
      }).catch(() => {
        setIconsLoading(false);
      });
    }
  }, [showEditModal, allIconNames.length, iconsLoading]);

  // Filter icons based on search
  const allFilteredIcons = useMemo(() => {
    if (!iconSearch.trim()) {
      return allIconNames;
    }
    const search = iconSearch.toLowerCase();
    return allIconNames.filter(name =>
      name.toLowerCase().includes(search)
    );
  }, [iconSearch, allIconNames]);

  // Grid layout constants
  const COLS = 7;
  const ICON_SIZE = 32; // w-8 = 2rem = 32px
  const GAP = 4; // gap-1 = 0.25rem = 4px
  const PADDING = 8; // p-2 = 0.5rem = 8px
  const ROW_HEIGHT = ICON_SIZE + GAP;

  // Calculate total rows and content height
  const totalRows = Math.ceil(allFilteredIcons.length / COLS);
  const totalContentHeight = totalRows * ROW_HEIGHT - GAP + PADDING * 2;

  // Calculate which icons are visible based on scroll position
  const [scrollTop, setScrollTop] = useState(0);
  const visibleHeight = 128; // max-h-32 = 8rem = 128px

  // Determine visible row range with buffer
  const startRow = Math.max(0, Math.floor((scrollTop - PADDING) / ROW_HEIGHT) - 2);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + visibleHeight - PADDING) / ROW_HEIGHT) + 2);

  // Get visible icons
  const visibleIcons = useMemo(() => {
    const startIndex = startRow * COLS;
    const endIndex = endRow * COLS;
    return allFilteredIcons.slice(startIndex, endIndex).map((name, i) => ({
      name,
      index: startIndex + i,
    }));
  }, [allFilteredIcons, startRow, endRow]);

  // Scroll handler updates scroll position
  const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Reset scroll when search changes
  useEffect(() => {
    setScrollTop(0);
  }, [iconSearch]);

  // Track when dragging ends to prevent click
  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
    }
  }, [isDragging]);

  // Escape key handler for edit modal
  useEffect(() => {
    if (!showEditModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEditModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showEditModal]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
    zIndex: isDragging ? 10 : undefined,
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only handle left-clicks
    if (e.button !== 0) {
      return;
    }

    // Prevent navigation if we just finished dragging
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }

    if (e.shiftKey) {
      // Shift+click: open in new window
      chrome.windows.create({ url: site.url });
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd+click (Mac) or Ctrl+click (Windows/Linux): open in new tab
      chrome.tabs.create({ url: site.url });
    } else {
      // Normal click: open as new pinned tab
      onOpen(site);
    }
  };

  const handleEdit = () => {
    setEditTitle(site.title);
    setEditUrl(site.url);
    setEditFavicon(site.favicon);
    setEditCustomIconName(site.customIconName);
    setEditIconColor(site.iconColor || DEFAULT_ICON_COLOR);
    setCustomHexInput('');
    setIconSearch('');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    onUpdate(site.id,
             editTitle,
             editUrl,
             editFavicon,
             editCustomIconName,
             editCustomIconName ? editIconColor : undefined);
    setShowEditModal(false);
  };

  const handleSelectIcon = async (iconName: string) => {
    const dataUrl = await iconToDataUrl(iconName, editIconColor);
    setEditFavicon(dataUrl);
    setEditCustomIconName(iconName);
  };

  const handleColorChange = async (color: string) => {
    setEditIconColor(color);
    // Regenerate icon with new color if a custom icon is selected
    if (editCustomIconName) {
      const dataUrl = await iconToDataUrl(editCustomIconName, color);
      setEditFavicon(dataUrl);
    }
  };

  const handleCustomHexSubmit = () => {
    const hex = customHexInput.trim();
    // Validate hex color format
    if (/^#?[0-9A-Fa-f]{6}$/.test(hex)) {
      const color = hex.startsWith('#') ? hex : `#${hex}`;
      handleColorChange(color);
      setCustomHexInput('');
    }
  };

  const handleResetIcon = () => {
    onResetFavicon(site.id);
    // Clear local edit state to reflect the reset
    setEditFavicon(undefined);
    setEditCustomIconName(undefined);
    setEditIconColor(DEFAULT_ICON_COLOR);
  };

  const handleUnpin = () => {
    onRemove(site.id);
  };

  // Render an icon by name from CDN
  const renderIcon = (iconName: string, size: number = 18) => {
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

  // Combine refs for sortable and icon positioning
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    (iconRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [setNodeRef]);

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            ref={setRefs}
            style={{ ...style, width: iconSize + 8, height: iconSize + 8 }}
            {...attributes}
            {...listeners}
            className={clsx(
              "group/pin relative flex items-center justify-center rounded",
              isDragging ? "cursor-grabbing opacity-50" : "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700",
              // Loaded state: subtle cyan background
              isLoaded && !isDragging && "bg-cyan-500/20 dark:bg-cyan-400/20"
            )}
            onMouseUp={handleClick}
          >
            {site.favicon ? (
              <img src={site.favicon} alt="" style={{ width: iconSize, height: iconSize }} />
            ) : (
              <Globe style={{ width: iconSize, height: iconSize }} className="text-gray-400" />
            )}

            {/* Fast tooltip */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white rounded whitespace-nowrap opacity-0 invisible group-hover/pin:opacity-100 group-hover/pin:visible transition-opacity duration-100 delay-150 pointer-events-none z-50">
              {site.title}
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            {isLoaded && onClose && (
              <>
                <ContextMenu.Item onSelect={() => onClose(site.id)}>
                  <X size={14} className="mr-2" /> Close Tab
                </ContextMenu.Item>
                <ContextMenu.Separator />
              </>
            )}
            <ContextMenu.Item onSelect={handleEdit}>
              <Edit size={14} className="mr-2" /> Edit
            </ContextMenu.Item>
            <ContextMenu.Item danger onSelect={handleUnpin}>
              <Trash size={14} className="mr-2" /> Unpin
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">Edit Pin</h3>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">URL</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-medium text-gray-700 dark:text-gray-300">Icon</label>
                  <button
                    onClick={handleResetIcon}
                    className="flex items-center text-xs text-blue-500 hover:text-blue-600"
                  >
                    <RotateCcw size={12} className="mr-1" />
                    Reset to site icon
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 flex items-center justify-center border rounded-md dark:border-gray-600">
                    {editFavicon ? (
                      <img src={editFavicon} alt="" className="w-5 h-5" />
                    ) : (
                      <Globe className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <span className="text-gray-500 text-xs">Current icon</span>
                </div>
                {/* Search input */}
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    placeholder="Search icons..."
                    className="w-full pl-7 pr-2 py-1 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                  />
                </div>
                {/* Icon grid - virtualized */}
                <div
                  onScroll={handleGridScroll}
                  className="relative bg-gray-50 dark:bg-gray-900 rounded-md max-h-32 overflow-y-auto overflow-x-hidden"
                  style={{ height: Math.min(visibleHeight, Math.max(totalContentHeight, 64)) }}
                >
                  {iconsLoading ? (
                    <div className="flex items-center justify-center h-16 text-gray-400 text-xs">
                      Loading icons...
                    </div>
                  ) : (
                    <div style={{ height: totalContentHeight, position: 'relative' }}>
                      {visibleIcons.map(({ name, index }) => {
                        const row = Math.floor(index / COLS);
                        const col = index % COLS;
                        return (
                          <button
                            key={name}
                            onClick={() => handleSelectIcon(name)}
                            className="absolute w-8 h-8 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
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
                      {allFilteredIcons.length === 0 && !iconsLoading && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
                          No icons found
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {allFilteredIcons.length} icons
                </p>
                {/* Color picker */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Icon Color</label>
                  <div className="flex items-center gap-1 flex-wrap">
                    {PRESET_COLORS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => handleColorChange(preset.value)}
                        className={clsx(
                          "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                          editIconColor === preset.value
                            ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                            : "border-gray-300 dark:border-gray-600"
                        )}
                        style={{ backgroundColor: preset.value }}
                        title={preset.name}
                      />
                    ))}
                    {/* Custom hex input */}
                    <div className="flex items-center gap-1 ml-1">
                      <input
                        type="text"
                        value={customHexInput}
                        onChange={(e) => setCustomHexInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCustomHexSubmit()}
                        placeholder="#hex"
                        className="w-16 px-1.5 py-0.5 text-xs border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                      <button
                        onClick={handleCustomHexSubmit}
                        className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                  {/* Show current color if not a preset */}
                  {!PRESET_COLORS.some(p => p.value === editIconColor) && (
                    <div className="flex items-center gap-1 mt-1">
                      <div
                        className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: editIconColor }}
                      />
                      <span className="text-xs text-gray-500">{editIconColor}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
