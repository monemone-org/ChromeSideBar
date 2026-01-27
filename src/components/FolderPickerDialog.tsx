import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useBookmarks } from '../hooks/useBookmarks';
import { useSpacesContext, Space } from '../contexts/SpacesContext';
import { getIconUrl } from '../utils/iconify';
import { GROUP_COLORS } from '../utils/groupColors';
import { Dialog } from './Dialog';
import { TreeRow } from './TreeRow';
import { Folder, FolderPlus } from 'lucide-react';

// Standard Chrome bookmark folder IDs
const BOOKMARKS_BAR_ID = '1';
const OTHER_BOOKMARKS_ID = '2';
const MOBILE_BOOKMARKS_ID = '3';

interface FolderPickerDialogProps
{
  isOpen: boolean;
  title: string;
  onSelect: (folderId: string) => void;
  onClose: () => void;
  defaultFolderId?: string;  // If provided, pre-select this folder when dialog opens
}

interface FolderItemProps
{
  node: chrome.bookmarks.BookmarkTreeNode;
  depth: number;
  expandedState: Record<string, boolean>;
  selectedFolderId: string;
  creatingInFolderId: string | null;
  newFolderName: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onNewFolderNameChange: (name: string) => void;
  onNewFolderSubmit: () => void;
  onNewFolderCancel: () => void;
  getMatchingSpace: (folderId: string) => Space | undefined;
}

const FolderItem = ({
  node,
  depth,
  expandedState,
  selectedFolderId,
  creatingInFolderId,
  newFolderName,
  onToggle,
  onSelect,
  onNewFolderNameChange,
  onNewFolderSubmit,
  onNewFolderCancel,
  getMatchingSpace
}: FolderItemProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null);
  const isFolder = !node.url;
  if (!isFolder) return null;

  // Filter children to only folders
  const folderChildren = node.children?.filter(child => !child.url) || [];
  const hasChildren = folderChildren.length > 0;
  const isExpanded = expandedState[node.id];
  const isSelected = selectedFolderId === node.id;
  const isCreatingHere = creatingInFolderId === node.id;

  // Check if this folder is linked to a space
  const matchingSpace = getMatchingSpace(node.id);
  const spaceColorClass = matchingSpace ? GROUP_COLORS[matchingSpace.color]?.text : undefined;

  // Render space icon overlay - handles both emoji and Lucide icon names
  const renderSpaceIconOverlay = (iconName: string, colorStyle: typeof GROUP_COLORS[string]) =>
  {
    // Check if it's an emoji (starts with high Unicode codepoint)
    const isEmoji = iconName.codePointAt(0)! > 255;
    if (isEmoji)
    {
      return <span className="text-[10px] leading-none">{iconName}</span>;
    }
    // Lucide icon - load from Iconify CDN, displayed on colored badge
    return (
      <span className={`flex items-center justify-center w-[14px] h-[14px] rounded-full ${colorStyle.badge}`}>
        <img
          src={getIconUrl(iconName)}
          alt=""
          className="w-[10px] h-[10px] invert dark:invert-0"
        />
      </span>
    );
  };

  // Folder icon with optional space overlay
  const folderIcon = matchingSpace ? (
    <div className="relative">
      <Folder size={16} className={spaceColorClass} />
      <span className="absolute -bottom-[5px] -right-[5px] flex items-center justify-center">
        {renderSpaceIconOverlay(matchingSpace.icon, GROUP_COLORS[matchingSpace.color] || GROUP_COLORS.grey)}
      </span>
    </div>
  ) : (
    <Folder size={16} className="text-gray-500" />
  );

  // Focus input when creating folder here
  useEffect(() =>
  {
    if (isCreatingHere && inputRef.current)
    {
      inputRef.current.focus();
    }
  }, [isCreatingHere]);

  return (
    <>
      <div data-folder-id={node.id}>
        <TreeRow
          depth={depth}
          title={node.title || 'Untitled'}
          icon={folderIcon}
          hasChildren={hasChildren || isCreatingHere}
          isExpanded={isExpanded || isCreatingHere}
          isSelected={isSelected}
          onClick={() => onSelect(node.id)}
          onToggle={() => onToggle(node.id)}
        />
      </div>
      {(isExpanded || isCreatingHere) && (
        <>
          {folderChildren.map(child => (
            <FolderItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedState={expandedState}
              selectedFolderId={selectedFolderId}
              creatingInFolderId={creatingInFolderId}
              newFolderName={newFolderName}
              onToggle={onToggle}
              onSelect={onSelect}
              onNewFolderNameChange={onNewFolderNameChange}
              onNewFolderSubmit={onNewFolderSubmit}
              onNewFolderCancel={onNewFolderCancel}
              getMatchingSpace={getMatchingSpace}
            />
          ))}
          {isCreatingHere && (
            <TreeRow
              depth={depth + 1}
              title={
                <input
                  ref={inputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => onNewFolderNameChange(e.target.value)}
                  onKeyDown={(e) =>
                  {
                    if (e.key === 'Enter')
                    {
                      onNewFolderSubmit();
                    }
                    else if (e.key === 'Escape')
                    {
                      onNewFolderCancel();
                    }
                  }}
                  onBlur={() =>
                  {
                    if (newFolderName.trim())
                    {
                      onNewFolderSubmit();
                    }
                    else
                    {
                      onNewFolderCancel();
                    }
                  }}
                  placeholder="New folder name"
                  className="w-full px-1 py-0.5 border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                />
              }
              icon={<Folder size={16} className="text-gray-500" />}
              hasChildren={false}
            />
          )}
        </>
      )}
    </>
  );
};

export const FolderPickerDialog = ({
  isOpen,
  title,
  onSelect,
  onClose,
  defaultFolderId
}: FolderPickerDialogProps) =>
{
  const { bookmarks, createFolder, getBookmark, findFolderByPath } = useBookmarks();
  const { spaces } = useSpacesContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Build lookup: folderId → Space (always build it since this is a picker dialog)
  const folderIdToSpace = useMemo(() =>
  {
    const map = new Map<string, Space>();
    spaces.forEach(space =>
    {
      if (space.bookmarkFolderPath)
      {
        const folder = findFolderByPath(space.bookmarkFolderPath);
        if (folder)
        {
          map.set(folder.id, space);
        }
      }
    });
    return map;
  }, [spaces, findFolderByPath]);

  // Lookup function to get matching Space for a folder
  const getMatchingSpace = useCallback((folderId: string): Space | undefined =>
  {
    return folderIdToSpace.get(folderId);
  }, [folderIdToSpace]);

  // Default expand Bookmarks Bar and Other Bookmarks, select Other Bookmarks by default
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({
    [BOOKMARKS_BAR_ID]: true,
    [OTHER_BOOKMARKS_ID]: true,
    [MOBILE_BOOKMARKS_ID]: false
  });
  const [selectedFolderId, setSelectedFolderId] = useState<string>(OTHER_BOOKMARKS_ID);

  // Track folder to scroll to after tree expands
  const [pendingScrollFolderId, setPendingScrollFolderId] = useState<string | null>(null);

  // New folder creation state
  const [creatingInFolderId, setCreatingInFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  // Reset state when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      setCreatingInFolderId(null);
      setNewFolderName('');

      // If defaultFolderId is provided, use it and expand parent folders
      if (defaultFolderId)
      {
        setSelectedFolderId(defaultFolderId);

        // Expand parent folders so the default folder is visible
        const expandParents = async () =>
        {
          const newExpanded: Record<string, boolean> = {
            [BOOKMARKS_BAR_ID]: true,
            [OTHER_BOOKMARKS_ID]: true,
            [MOBILE_BOOKMARKS_ID]: false
          };

          // Walk up the tree to find all parent folders
          let currentId: string | undefined = defaultFolderId;
          while (currentId)
          {
            const node = await getBookmark(currentId);
            if (!node || !node.parentId || node.parentId === '0') break;
            newExpanded[node.parentId] = true;
            currentId = node.parentId;
          }

          setExpandedState(newExpanded);
          // Schedule scroll after tree re-renders with expanded parents
          setPendingScrollFolderId(defaultFolderId);
        };

        expandParents();
      }
      else
      {
        // Default behavior: expand standard folders, select Other Bookmarks
        setExpandedState({
          [BOOKMARKS_BAR_ID]: true,
          [OTHER_BOOKMARKS_ID]: true,
          [MOBILE_BOOKMARKS_ID]: false
        });
        setSelectedFolderId(OTHER_BOOKMARKS_ID);
      }
    }
  }, [isOpen, defaultFolderId, getBookmark]);

  // Scroll to the pending folder after tree has re-rendered
  useEffect(() =>
  {
    if (pendingScrollFolderId && scrollContainerRef.current)
    {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() =>
      {
        const element = scrollContainerRef.current?.querySelector(
          `[data-folder-id="${pendingScrollFolderId}"]`
        );
        if (element)
        {
          element.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
        setPendingScrollFolderId(null);
      });
    }
  }, [pendingScrollFolderId, expandedState]);

  const handleToggle = useCallback((id: string) =>
  {
    setExpandedState(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);

  const handleSelect = useCallback((id: string) =>
  {
    setSelectedFolderId(id);
  }, []);

  const handleNewFolderClick = useCallback(() =>
  {
    // Create new folder inside the selected folder
    setCreatingInFolderId(selectedFolderId);
    setNewFolderName('');
    // Auto-expand the selected folder
    setExpandedState(prev => ({
      ...prev,
      [selectedFolderId]: true
    }));
  }, [selectedFolderId]);

  const handleNewFolderSubmit = useCallback(() =>
  {
    if (!creatingInFolderId || !newFolderName.trim()) return;

    createFolder(creatingInFolderId, newFolderName.trim(), (newFolder) =>
    {
      // Select the newly created folder
      setSelectedFolderId(newFolder.id);
      setCreatingInFolderId(null);
      setNewFolderName('');
    });
  }, [creatingInFolderId, newFolderName, createFolder]);

  const handleNewFolderCancel = useCallback(() =>
  {
    setCreatingInFolderId(null);
    setNewFolderName('');
  }, []);

  const handleConfirm = useCallback(() =>
  {
    onSelect(selectedFolderId);
  }, [onSelect, selectedFolderId]);

  // Filter root bookmarks to only folders (Bookmarks Bar, Other Bookmarks, Mobile Bookmarks)
  const rootFolders = bookmarks.filter(node => !node.url);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="flex flex-col">
        {/* Folder tree */}
        <div ref={scrollContainerRef} className="p-2 max-h-64 overflow-y-auto">
          {rootFolders.map(folder => (
            <FolderItem
              key={folder.id}
              node={folder}
              depth={0}
              expandedState={expandedState}
              selectedFolderId={selectedFolderId}
              creatingInFolderId={creatingInFolderId}
              newFolderName={newFolderName}
              onToggle={handleToggle}
              onSelect={handleSelect}
              onNewFolderNameChange={setNewFolderName}
              onNewFolderSubmit={handleNewFolderSubmit}
              onNewFolderCancel={handleNewFolderCancel}
              getMatchingSpace={getMatchingSpace}
            />
          ))}
        </div>

        {/* Footer with buttons */}
        <div className="flex justify-between items-center p-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleNewFolderClick}
            disabled={creatingInFolderId !== null}
            className="flex items-center gap-1 px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={creatingInFolderId !== null}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
