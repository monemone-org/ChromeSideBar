import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Globe, X, RotateCcw, Search, icons } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PinnedSite } from '../hooks/usePinnedSites';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';

// Get all icon names from lucide-react
const ALL_ICON_NAMES = Object.keys(icons).sort();

// Convert a Lucide icon component to a data URL
const iconToDataUrl = (iconName: string): string => {
  const IconComponent = icons[iconName as keyof typeof icons];
  if (!IconComponent) return '';

  // Render the icon to static markup
  const svgMarkup = renderToStaticMarkup(
    <IconComponent size={32} stroke="#6b7280" strokeWidth={2} />
  );

  // Encode as data URL
  return `data:image/svg+xml,${encodeURIComponent(svgMarkup)}`;
};

interface PinnedIconProps {
  site: PinnedSite;
  onRemove: (id: string) => void;
  onUpdate: (id: string, title: string, url: string, favicon?: string) => void;
  onResetFavicon: (id: string) => void;
  openInNewTab?: boolean;
}

export const PinnedIcon = ({ site, onRemove, onUpdate, onResetFavicon, openInNewTab = false }: PinnedIconProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(site.title);
  const [editUrl, setEditUrl] = useState(site.url);
  const [editFavicon, setEditFavicon] = useState(site.favicon);
  const [iconSearch, setIconSearch] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
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

  // Filter icons based on search
  const allFilteredIcons = useMemo(() => {
    if (!iconSearch.trim()) {
      return ALL_ICON_NAMES;
    }
    const search = iconSearch.toLowerCase();
    return ALL_ICON_NAMES.filter(name =>
      name.toLowerCase().includes(search)
    );
  }, [iconSearch]);

  // Grid layout constants
  const COLS = 7;
  const ICON_SIZE = 32; // w-8 = 2rem = 32px
  const GAP = 4; // gap-1 = 0.25rem = 4px
  const PADDING = 8; // p-2 = 0.5rem = 8px
  const ROW_HEIGHT = ICON_SIZE + GAP;

  // Calculate total rows and content height
  const totalRows = Math.ceil(allFilteredIcons.length / COLS);
  const totalContentHeight = totalRows * ROW_HEIGHT - GAP + PADDING * 2; // subtract last gap, add padding

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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
    zIndex: isDragging ? 10 : undefined,
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

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

    // Ignore clicks when context menu is open
    if (showMenu) {
      return;
    }

    if (e.shiftKey) {
      chrome.windows.create({ url: site.url });
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd+click: invert the default behavior
      if (openInNewTab) {
        chrome.tabs.update({ url: site.url });
      } else {
        chrome.tabs.create({ url: site.url, active: false });
      }
    } else {
      // Regular click: use the setting
      if (openInNewTab) {
        chrome.tabs.create({ url: site.url, active: true });
      } else {
        chrome.tabs.update({ url: site.url });
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setShowMenu(true);
  };

  const handleEdit = () => {
    setShowMenu(false);
    setEditTitle(site.title);
    setEditUrl(site.url);
    setEditFavicon(site.favicon);
    setIconSearch('');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    onUpdate(site.id, editTitle, editUrl, editFavicon);
    setShowEditModal(false);
  };

  const handleSelectIcon = (iconName: string) => {
    const dataUrl = iconToDataUrl(iconName);
    setEditFavicon(dataUrl);
  };

  const handleResetIcon = () => {
    onResetFavicon(site.id);
    setShowEditModal(false);
  };

  const handleUnpin = () => {
    setShowMenu(false);
    onRemove(site.id);
  };

  // Render an icon by name
  const renderIcon = (iconName: string, size: number = 18) => {
    const IconComponent = icons[iconName as keyof typeof icons];
    if (!IconComponent) return null;
    return <IconComponent size={size} className="text-gray-500" />;
  };

  // Combine refs for sortable and icon positioning
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    (iconRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [setNodeRef]);

  return (
    <>
      <div
        ref={setRefs}
        style={style}
        {...attributes}
        {...listeners}
        className={clsx(
          "group/pin relative w-8 h-8 flex items-center justify-center rounded",
          isDragging ? "cursor-grabbing opacity-50" : "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
        )}
        onMouseUp={handleClick}
        onContextMenu={handleContextMenu}
      >
        {site.favicon ? (
          <img src={site.favicon} alt="" className="w-5 h-5" />
        ) : (
          <Globe className="w-5 h-5 text-gray-400" />
        )}

        {/* Fast tooltip */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover/pin:opacity-100 group-hover/pin:visible transition-opacity duration-100 delay-150 pointer-events-none z-50">
          {site.title}
        </div>

      </div>

      {showMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-32"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
            onClick={handleEdit}
          >
            Edit
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 dark:text-red-400"
            onClick={handleUnpin}
          >
            Unpin
          </button>
        </div>
      )}

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
                  style={{ height: Math.min(visibleHeight, totalContentHeight) }}
                >
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
                    {allFilteredIcons.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
                        No icons found
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {allFilteredIcons.length} icons
                </p>
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
