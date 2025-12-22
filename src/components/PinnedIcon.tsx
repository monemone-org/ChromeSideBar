import { useState, useRef, useEffect, useMemo } from 'react';
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
}

export const PinnedIcon = ({ site, onRemove, onUpdate, onResetFavicon }: PinnedIconProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(site.title);
  const [editUrl, setEditUrl] = useState(site.url);
  const [editFavicon, setEditFavicon] = useState(site.favicon);
  const [iconSearch, setIconSearch] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
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
  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) {
      // Show common icons when no search
      const commonIcons = [
        'Home', 'Star', 'Heart', 'Folder', 'Mail', 'Calendar',
        'Music', 'Video', 'Image', 'FileText', 'ShoppingCart', 'Briefcase',
        'BookOpen', 'Coffee', 'Settings', 'User', 'Bell', 'Search',
        'Globe', 'Link', 'Download', 'Upload', 'Cloud', 'Database',
        'Code', 'Terminal', 'Github', 'Slack', 'Chrome', 'Figma',
      ];
      return commonIcons.filter(name => ALL_ICON_NAMES.includes(name));
    }
    const search = iconSearch.toLowerCase();
    return ALL_ICON_NAMES.filter(name =>
      name.toLowerCase().includes(search)
    ).slice(0, 50); // Limit results for performance
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
    // Prevent navigation if we just finished dragging
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }

    if (e.shiftKey) {
      chrome.windows.create({ url: site.url });
    } else if (e.metaKey || e.ctrlKey) {
      chrome.tabs.create({ url: site.url, active: false });
    } else {
      chrome.tabs.update({ url: site.url });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
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

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={clsx(
          "group/pin relative w-8 h-8 flex items-center justify-center rounded",
          isDragging ? "cursor-grabbing opacity-50" : "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
        )}
        onClick={handleClick}
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

        {showMenu && (
          <div
            ref={menuRef}
            className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-32"
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
      </div>

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
                {/* Icon grid */}
                <div className="grid grid-cols-7 gap-1 p-2 bg-gray-50 dark:bg-gray-900 rounded-md max-h-32 overflow-y-auto">
                  {filteredIcons.map((iconName) => (
                    <button
                      key={iconName}
                      onClick={() => handleSelectIcon(iconName)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                      title={iconName}
                    >
                      {renderIcon(iconName)}
                    </button>
                  ))}
                  {filteredIcons.length === 0 && (
                    <div className="col-span-7 text-center text-gray-400 text-xs py-2">
                      No icons found
                    </div>
                  )}
                </div>
                {iconSearch && filteredIcons.length === 50 && (
                  <p className="text-xs text-gray-400 mt-1">Showing first 50 results</p>
                )}
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
