import React, { useState, useCallback, useRef, useEffect, forwardRef } from 'react';
import { useBookmarks, SortOption } from '../hooks/useBookmarks';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useDragDrop } from '../hooks/useDragDrop';
import { getIndentPadding } from '../utils/indent';
import { DropPosition, calculateDropPosition } from '../utils/dragDrop';
import { DropIndicators } from './DropIndicators';
import { ExternalDropTarget, ResolveBookmarkDropTarget } from './TabList';
import { BookmarkOpenMode } from './SettingsDialog';
import { Dialog } from './Dialog';
import * as ContextMenu from './ContextMenu';
import { TreeRow } from './TreeRow';
import { useInView } from '../hooks/useInView';
import { SPEAKER_ICON_SIZE } from '../constants';
import {
  Folder,
  Globe,
  Trash,
  Edit,
  FolderPlus,
  ArrowDownAZ,
  Calendar,
  Pin,
  X,
  Volume2,
  Copy
} from 'lucide-react';
import clsx from 'clsx';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  DragStartEvent,
  DragMoveEvent,
  DragEndEvent,
  DraggableAttributes,
} from '@dnd-kit/core';
import { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

// Get favicon URL using Chrome's internal favicon cache
const getFaviconUrl = (url: string): string => {
  try {
    // Use Chrome's _favicon API (requires "favicon" permission in manifest)
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  } catch {
    return '';
  }
};

// --- Edit Modal Component ---
interface EditModalProps {
  isOpen: boolean;
  node: chrome.bookmarks.BookmarkTreeNode | null;
  onSave: (id: string, title: string, url?: string) => void;
  onClose: () => void;
}

const EditModal = ({ isOpen, node, onSave, onClose }: EditModalProps) =>
{
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen && node)
    {
      setTitle(node.title);
      setUrl(node.url || '');
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, node]);

  if (!node) return null;

  const isFolder = !node.url;

  const handleSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    onSave(node.id, title, isFolder ? undefined : url);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${isFolder ? 'Folder' : 'Bookmark'}`}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div>
          <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Name</label>
          <input
            ref={inputRef}
            className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {!isFolder && (
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">URL</label>
            <input
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
};

// --- Create Folder Modal Component ---
interface CreateFolderModalProps {
  isOpen: boolean;
  parentId: string | null;
  onSave: (parentId: string, title: string) => void;
  onClose: () => void;
}

const CreateFolderModal = ({ isOpen, parentId, onSave, onClose }: CreateFolderModalProps) =>
{
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen && parentId)
    {
      setTitle('');
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, parentId]);

  if (!parentId) return null;

  const handleSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    if (title.trim())
    {
      onSave(parentId, title.trim());
      onClose();
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Folder" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div>
          <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Folder Name</label>
          <input
            ref={inputRef}
            className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter folder name"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md"
          >
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
};

// Standard Chrome bookmark folder IDs
const BOOKMARKS_BAR_ID = '1';
const OTHER_BOOKMARKS_ID = '2';
const MOBILE_BOOKMARKS_ID = '3';

// Special folder IDs that cannot be edited/deleted
const SPECIAL_FOLDER_IDS = [BOOKMARKS_BAR_ID, OTHER_BOOKMARKS_ID, MOBILE_BOOKMARKS_ID];

// Helper: Check if targetId is a descendant of nodeId
const isDescendant = (
  nodeId: string,
  targetId: string,
  bookmarks: chrome.bookmarks.BookmarkTreeNode[]
): boolean => {
  const findNode = (nodes: chrome.bookmarks.BookmarkTreeNode[], id: string): chrome.bookmarks.BookmarkTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const checkDescendants = (node: chrome.bookmarks.BookmarkTreeNode): boolean => {
    if (node.id === targetId) return true;
    if (node.children) {
      return node.children.some(child => checkDescendants(child));
    }
    return false;
  };

  const sourceNode = findNode(bookmarks, nodeId);
  return sourceNode ? checkDescendants(sourceNode) : false;
};

// --- Bookmark Row (Pure UI) ---
interface BookmarkRowProps {
  node: chrome.bookmarks.BookmarkTreeNode;
  depth: number;
  expandedState: Record<string, boolean>;
  toggleFolder: (id: string, expanded: boolean) => void;
  onRemove: (id: string) => void;
  onEdit: (node: chrome.bookmarks.BookmarkTreeNode) => void;
  onCreateFolder: (parentId: string) => void;
  onSort: (folderId: string, sortBy: SortOption) => void;
  onDuplicate: (id: string) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  isDragging?: boolean;
  activeId?: string | null;
  dropTargetId?: string | null;
  dropPosition?: DropPosition;
  // Bookmark opening behavior
  bookmarkOpenMode?: BookmarkOpenMode;
  isLoaded?: boolean;
  isAudible?: boolean;
  isActive?: boolean;
  checkIsLoaded?: (bookmarkId: string) => boolean;
  checkIsAudible?: (bookmarkId: string) => boolean;
  checkIsActive?: (bookmarkId: string) => boolean;
  onOpenBookmark?: (bookmarkId: string, url: string) => void;
  onCloseBookmark?: (bookmarkId: string) => void;
  // External drop target (from tab drag)
  externalDropTarget?: ExternalDropTarget | null;
  // Drag-drop attributes
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}

// Forward ref to attach to the main div
const BookmarkRow = forwardRef<HTMLDivElement, BookmarkRowProps>(({
  node,
  depth,
  expandedState,
  toggleFolder,
  onRemove,
  onEdit,
  onCreateFolder,
  onSort,
  onDuplicate,
  onPin,
  isDragging: _isDragging,
  activeId,
  dropTargetId,
  dropPosition,
  bookmarkOpenMode = 'arc',
  isLoaded,
  isAudible,
  isActive,
  onOpenBookmark,
  onCloseBookmark,
  externalDropTarget,
  attributes,
  listeners
}, ref) => {
  const isFolder = !node.url;
  const isSpecialFolder = SPECIAL_FOLDER_IDS.includes(node.id);

  const isBeingDragged = activeId === node.id;
  const isDropTarget = dropTargetId === node.id;
  // Check for external drop target (tab → bookmark)
  const isExternalDropTarget = externalDropTarget?.bookmarkId === node.id;
  const effectiveDropPosition = isExternalDropTarget ? externalDropTarget.position : dropPosition;
  const showDropBefore = (isDropTarget || isExternalDropTarget) && effectiveDropPosition === 'before';
  const showDropAfter = (isDropTarget || isExternalDropTarget) && (effectiveDropPosition === 'after' || effectiveDropPosition === 'intoFirst');
  const showDropInto = (isDropTarget || isExternalDropTarget) && effectiveDropPosition === 'into' && isFolder;

  const insideFolder = depth > 0;
  const beforeIndentPx = showDropBefore && insideFolder ? getIndentPadding(depth) : undefined;
  // Calculate afterIndentPx based on position type
  let afterIndentPx: number | undefined;
  if (showDropAfter)
  {
    if (effectiveDropPosition === 'intoFirst')
    {
      // 'intoFirst' always indented (going inside folder at first position)
      afterIndentPx = getIndentPadding(depth + 1);
    }
    else if (insideFolder)
    {
      // Inside a folder: indent to current depth
      afterIndentPx = getIndentPadding(depth);
    }
    else
    {
      afterIndentPx = undefined;
    }
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if (isFolder) {
      toggleFolder(node.id, !expandedState[node.id]);
    } else if (node.url) {
      if (e.shiftKey) {
        // Shift+Click: open in new window
        chrome.windows.create({ url: node.url });
      } else if (e.metaKey || e.ctrlKey) {
        // Cmd+Click: open as unmanaged new tab (ungrouped)
        chrome.tabs.create({ url: node.url }, (tab) => {
          if (tab?.id) {
            chrome.tabs.ungroup(tab.id);
          }
        });
      } else if (bookmarkOpenMode === 'arc' && onOpenBookmark) {
        // Arc-style: open as managed tab in SideBarForArc group
        onOpenBookmark(node.id, node.url);
      } else if (bookmarkOpenMode === 'activeTab') {
        // Replace current tab with bookmark
        chrome.tabs.update({ url: node.url });
      } else {
        // newTab: open in new active tab
        chrome.tabs.create({ url: node.url, active: true });
      }
    }
  };

  const icon = isFolder ? (
    <Folder size={16} className="text-gray-500" />
  ) : node.url ? (
    <img
      src={getFaviconUrl(node.url)}
      alt=""
      className="w-4 h-4"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        e.currentTarget.nextElementSibling?.classList.remove('hidden');
      }}
    />
  ) : (
    <Globe size={16} className="text-gray-500" />
  );

  // Hidden fallback globe
  const fallbackIcon = !isFolder && node.url && (
    <Globe size={16} className="hidden text-gray-500" />
  );

  const combinedIcon = (
    <>
      {icon}
      {fallbackIcon}
    </>
  );

  const actions = (
    <div className="flex items-center gap-0.5">
       {/* Pin button - only on hover */}
       {!isFolder && onPin && node.url && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPin(node.url!, node.title, getFaviconUrl(node.url!)); }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded bg-white dark:bg-gray-900 opacity-0 group-hover:opacity-100"
          title="Pin"
          aria-label="Pin bookmark"
        >
          <Pin size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      )}
      {/* Close button - always visible when tab is loaded (Arc-style only) */}
      {!isFolder && bookmarkOpenMode === 'arc' && isLoaded && onCloseBookmark && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCloseBookmark(node.id); }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded bg-white dark:bg-gray-900"
          title="Close tab"
          aria-label="Close tab"
        >
          <X size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      )}
      {/* Delete button - visible on hover when tab is NOT loaded (or non-Arc style) */}
      {!isFolder && !isSpecialFolder && (bookmarkOpenMode !== 'arc' || !isLoaded) && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded bg-white dark:bg-gray-900 opacity-0 group-hover:opacity-100"
          title="Delete bookmark"
          aria-label="Delete bookmark"
        >
          <Trash size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      )}
    </div>
  );

  // Speaker indicator - at absolute left edge (Arc-style only)
  const leadingIndicator = !isFolder && bookmarkOpenMode === 'arc' && isAudible
    ? <Volume2 size={SPEAKER_ICON_SIZE} />
    : undefined;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <TreeRow
          ref={ref}
          depth={depth}
          title={node.title}
          icon={combinedIcon}
          hasChildren={isFolder}
          isExpanded={expandedState[node.id]}
          onToggle={() => toggleFolder(node.id, !expandedState[node.id])}
          onClick={handleRowClick}
          isActive={bookmarkOpenMode === 'arc' && isActive}
          isDragging={isBeingDragged}
          dndAttributes={attributes}
          dndListeners={listeners}
          data-bookmark-id={node.id}
          data-is-folder={isFolder}
          data-depth={depth}
          className={clsx(
            showDropInto && "bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500",
            !isSpecialFolder && "touch-none"
          )}
          actions={actions}
          leadingIndicator={leadingIndicator}
        >
          <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} beforeIndentPx={beforeIndentPx} afterIndentPx={afterIndentPx} />
        </TreeRow>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content>
          {isFolder && (
            <>
              <ContextMenu.Item onSelect={() => onCreateFolder(node.id)}>
                <FolderPlus size={14} className="mr-2" /> New Folder
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onSort(node.id, 'name')}>
                <ArrowDownAZ size={14} className="mr-2" /> Sort by Name
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onSort(node.id, 'dateAdded')}>
                <Calendar size={14} className="mr-2" /> Sort by Date
              </ContextMenu.Item>
              {!isSpecialFolder && <ContextMenu.Separator />}
            </>
          )}
          {!isFolder && onPin && node.url && (
            <>
              <ContextMenu.Item onSelect={() => onPin(node.url!, node.title, getFaviconUrl(node.url!))}>
                <Pin size={14} className="mr-2" /> Pin to Sidebar
              </ContextMenu.Item>
            </>
          )}
          {!isSpecialFolder && (
            <>
              {!isFolder && (
                <ContextMenu.Item onSelect={() => onDuplicate(node.id)}>
                  <Copy size={14} className="mr-2" /> Duplicate
                </ContextMenu.Item>
              )}
              <ContextMenu.Item onSelect={() => onEdit(node)}>
                <Edit size={14} className="mr-2" /> Edit
              </ContextMenu.Item>
              <ContextMenu.Item danger onSelect={() => onRemove(node.id)}>
                <Trash size={14} className="mr-2" /> Delete
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});
BookmarkRow.displayName = 'BookmarkRow';

// --- Draggable Wrapper ---
const DraggableBookmarkRow = forwardRef<HTMLDivElement, BookmarkRowProps>((props, ref) => {
  const isSpecialFolder = SPECIAL_FOLDER_IDS.includes(props.node.id);
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: props.node.id,
    disabled: isSpecialFolder
  });

  // Merge refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [setNodeRef, ref]
  );

  return (
    <BookmarkRow
      ref={setRefs}
      {...props}
      attributes={attributes}
      listeners={listeners}
    />
  );
});
DraggableBookmarkRow.displayName = 'DraggableBookmarkRow';

// --- Static Wrapper ---
const StaticBookmarkRow = forwardRef<HTMLDivElement, BookmarkRowProps>((props, ref) => {
  return <BookmarkRow ref={ref} {...props} />;
});
StaticBookmarkRow.displayName = 'StaticBookmarkRow';

// --- Recursive Item ---
const BookmarkItem = (props: BookmarkRowProps) => {
  const { node, expandedState, depth = 0, checkIsLoaded, checkIsAudible, checkIsActive } = props;
  const isFolder = !node.url;
  const { ref, isInView } = useInView<HTMLDivElement>();

  return (
    <>
      {isInView ? (
        <DraggableBookmarkRow ref={ref} {...props} />
      ) : (
        <StaticBookmarkRow ref={ref} {...props} />
      )}

      {isFolder && expandedState[node.id] && node.children && (
        <div>
          {node.children.map((child) => (
            <BookmarkItem
              key={child.id}
              {...props} // Pass through all handlers
              node={child}
              depth={depth + 1}
              isLoaded={checkIsLoaded ? checkIsLoaded(child.id) : false}
              isAudible={checkIsAudible ? checkIsAudible(child.id) : false}
              isActive={checkIsActive ? checkIsActive(child.id) : false}
            />
          ))}
        </div>
      )}
    </>
  );
};

// --- Drag Overlay Content ---
interface DragOverlayContentProps {
  node: chrome.bookmarks.BookmarkTreeNode;
  depth: number;
}

const DragOverlayContent = ({ node, depth }: DragOverlayContentProps) => {
  const isFolder = !node.url;
  
  const icon = isFolder ? (
    <Folder size={16} className="text-gray-500" />
  ) : node.url ? (
    <img
      src={getFaviconUrl(node.url)}
      alt=""
      className="w-4 h-4"
    />
  ) : (
    <Globe size={16} className="text-gray-500" />
  );

  return (
    <TreeRow
      depth={depth}
      title={node.title}
      icon={icon}
      hasChildren={isFolder}
      className="pointer-events-none"
    />
  );
};

interface BookmarkTreeProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  hideOtherBookmarks?: boolean;
  externalDropTarget?: ExternalDropTarget | null;
  bookmarkOpenMode?: BookmarkOpenMode;
  onResolverReady?: (resolver: ResolveBookmarkDropTarget) => void;
  filterLiveTabs?: boolean;
  filterAudible?: boolean;
}

export const BookmarkTree = ({ onPin, hideOtherBookmarks = false, externalDropTarget, bookmarkOpenMode = 'arc', onResolverReady, filterLiveTabs = false, filterAudible = false }: BookmarkTreeProps) => {
  const { bookmarks, removeBookmark, updateBookmark, createFolder, sortBookmarks, moveBookmark, duplicateBookmark } = useBookmarks();
  const { openBookmarkTab, closeBookmarkTab, isBookmarkLoaded, isBookmarkAudible, isBookmarkActive, getActiveItemKey } = useBookmarkTabsContext();

  // Recursively filter bookmarks based on a predicate function
  const filterBookmarksRecursive = useCallback((
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    predicate: (id: string) => boolean
  ): chrome.bookmarks.BookmarkTreeNode[] =>
  {
    return nodes.reduce<chrome.bookmarks.BookmarkTreeNode[]>((acc, node) =>
    {
      const isFolder = !node.url;

      if (isFolder)
      {
        // For folders, recursively filter children
        const filteredChildren = node.children
          ? filterBookmarksRecursive(node.children, predicate)
          : [];
        // Only include folder if it has filtered children
        if (filteredChildren.length > 0)
        {
          acc.push({ ...node, children: filteredChildren });
        }
      }
      else
      {
        // For bookmarks, include only if predicate returns true
        if (predicate(node.id))
        {
          acc.push(node);
        }
      }
      return acc;
    }, []);
  }, []);

  // Filter out "Other Bookmarks" (id "2") if hidden
  let visibleBookmarks = hideOtherBookmarks
    ? bookmarks.filter(node => node.id !== '2')
    : bookmarks;

  // Apply live tabs filter if enabled
  if (filterLiveTabs)
  {
    visibleBookmarks = filterBookmarksRecursive(visibleBookmarks, isBookmarkLoaded);
  }

  // Apply audible filter if enabled
  if (filterAudible)
  {
    visibleBookmarks = filterBookmarksRecursive(visibleBookmarks, isBookmarkAudible);
  }

  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  const [editingNode, setEditingNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);

  // Auto-scroll to active bookmark when it changes
  const prevActiveItemKeyRef = useRef<string | null>(null);
  useEffect(() =>
  {
    const activeItemKey = getActiveItemKey();
    // Only handle bookmark keys (not pinned sites)
    if (activeItemKey?.startsWith('bookmark-') && activeItemKey !== prevActiveItemKeyRef.current)
    {
      prevActiveItemKeyRef.current = activeItemKey;
      const bookmarkId = activeItemKey.replace('bookmark-', '');
      // Scroll after DOM updates
      setTimeout(() =>
      {
        const element = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
    else if (!activeItemKey?.startsWith('bookmark-'))
    {
      // Reset ref when not a bookmark
      prevActiveItemKeyRef.current = null;
    }
  }, [getActiveItemKey]);

  // Shared drag-drop state from hook
  const {
    activeId,
    setActiveId,
    dropTargetId,
    setDropTargetId,
    dropPosition,
    setDropPosition,
    pointerPositionRef,
    wasValidDropRef,
    setAutoExpandTimer,
    clearAutoExpandTimer,
  } = useDragDrop<string>();

  // Bookmark-specific drag state
  const [activeNode, setActiveNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [activeDepth, setActiveDepth] = useState<number>(0);

  // Find a node by ID in the bookmark tree
  const findNode = useCallback((id: string): chrome.bookmarks.BookmarkTreeNode | null => {
    const search = (nodes: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return search(bookmarks);
  }, [bookmarks]);

  // Resolve bookmark drop target - shared logic for internal and external drops
  const resolveBookmarkDropTarget = useCallback((
    x: number,
    y: number,
    excludeId?: string
  ): ExternalDropTarget | null =>
  {
    // Find the bookmark element under the pointer
    const elements = document.elementsFromPoint(x, y);
    const targetElement = elements.find(el =>
      el.hasAttribute('data-bookmark-id') &&
      el.getAttribute('data-bookmark-id') !== excludeId
    ) as HTMLElement | undefined;

    if (!targetElement)
    {
      clearAutoExpandTimer();
      return null;
    }

    const bookmarkId = targetElement.getAttribute('data-bookmark-id');
    if (!bookmarkId)
    {
      clearAutoExpandTimer();
      return null;
    }

    const isFolder = targetElement.getAttribute('data-is-folder') === 'true';
    let position = calculateDropPosition(targetElement, y, isFolder);
    const isExpandedFolder = isFolder && !!expandedState[bookmarkId];

    // For expanded folders, 'after' (bottom 25%) becomes 'intoFirst' (insert at index 0)
    if (isExpandedFolder && position === 'after')
    {
      position = 'intoFirst';
    }

    // Handle auto-expand timer for folders in middle 50% zone
    if (isFolder && position === 'into')
    {
      setAutoExpandTimer(bookmarkId, () =>
      {
        setExpandedState(prev => ({ ...prev, [bookmarkId]: !prev[bookmarkId] }));
      });
    }
    else
    {
      clearAutoExpandTimer();
    }

    return { bookmarkId, position: position!, isFolder };
  }, [expandedState, setAutoExpandTimer, clearAutoExpandTimer]);

  // Provide the resolver function to parent
  useEffect(() =>
  {
    onResolverReady?.(resolveBookmarkDropTarget);
  }, [onResolverReady, resolveBookmarkDropTarget]);

  // Configure sensors with 8px activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  const toggleFolder = (id: string, expanded: boolean) => {
    setExpandedState(prev => ({ ...prev, [id]: expanded }));
  };

  const handleCreateFolder = (parentId: string) => {
    setCreatingFolderParentId(parentId);
  };

  // Drag start handler
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setActiveNode(findNode(id));
    // Read depth from DOM element
    const element = document.querySelector(`[data-bookmark-id="${id}"]`);
    const depth = element?.getAttribute('data-depth');
    setActiveDepth(depth ? parseInt(depth, 10) : 0);
  }, [findNode, setActiveId]);

  // Drag move handler - calculate drop position based on pointer
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { active } = event;
    const sourceId = active.id as string;

    // Use tracked pointer position (accurate during scroll)
    const currentX = pointerPositionRef.current.x;
    const currentY = pointerPositionRef.current.y;

    // Use shared resolver to get drop target
    const target = resolveBookmarkDropTarget(currentX, currentY, sourceId);

    if (!target)
    {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    // Additional validation for internal bookmark drags

    // Can't drop folder into its own descendants
    if (isDescendant(sourceId, target.bookmarkId, bookmarks))
    {
      setDropTargetId(null);
      setDropPosition(null);
      clearAutoExpandTimer();
      return;
    }

    // Can't move special folders (Bookmarks Bar, Other Bookmarks)
    const sourceNode = findNode(sourceId);
    if (sourceNode && SPECIAL_FOLDER_IDS.includes(sourceNode.id))
    {
      setDropTargetId(null);
      setDropPosition(null);
      clearAutoExpandTimer();
      return;
    }

    setDropTargetId(target.bookmarkId);
    setDropPosition(target.position);
  }, [bookmarks, findNode, resolveBookmarkDropTarget, clearAutoExpandTimer, setDropTargetId, setDropPosition]);

  // Drag end handler
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    clearAutoExpandTimer();

    const { active } = event;
    const sourceId = active.id as string;

    // Track if this is a valid drop (for animation decision)
    const isValidDrop = !!(dropTargetId && dropPosition);
    wasValidDropRef.current = isValidDrop;

    // Perform the move if we have a valid drop target
    if (isValidDrop) {
      moveBookmark(sourceId, dropTargetId!, dropPosition!);

      // Auto-expand folder if dropping into it
      if ((dropPosition === 'into') && !expandedState[dropTargetId!]) {
        setExpandedState(prev => ({ ...prev, [dropTargetId!]: true }));
      }
    }

    // Reset drag state
    setActiveId(null);
    setActiveNode(null);
    setActiveDepth(0);
    setDropTargetId(null);
    setDropPosition(null);
  }, [dropTargetId, dropPosition, moveBookmark, expandedState, findNode, clearAutoExpandTimer, setActiveId, setDropTargetId, setDropPosition]);

  // Drag cancel handler (e.g., Escape key)
  const handleDragCancel = useCallback(() => {
    clearAutoExpandTimer();
    wasValidDropRef.current = false;

    // Reset drag state
    setActiveId(null);
    setActiveNode(null);
    setActiveDepth(0);
    setDropTargetId(null);
    setDropPosition(null);
  }, [clearAutoExpandTimer, setActiveId, setDropTargetId, setDropPosition]);

  return (
    <>
      <DndContext
        sensors={sensors}
        autoScroll={{
          threshold: { x: 0.1, y: 0.1 },
          acceleration: 7,
          interval: 10,
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {visibleBookmarks.map((node) => (
          <BookmarkItem
            key={node.id}
            node={node}
            depth={0}
            expandedState={expandedState}
            toggleFolder={toggleFolder}
            onRemove={removeBookmark}
            onEdit={setEditingNode}
            onCreateFolder={handleCreateFolder}
            onSort={sortBookmarks}
            onDuplicate={duplicateBookmark}
            onPin={onPin}
            isDragging={!!activeId}
            activeId={activeId}
            dropTargetId={dropTargetId}
            dropPosition={dropPosition}
            bookmarkOpenMode={bookmarkOpenMode}
            isLoaded={isBookmarkLoaded(node.id)}
            isAudible={isBookmarkAudible(node.id)}
            isActive={isBookmarkActive(node.id)}
            checkIsLoaded={isBookmarkLoaded}
            checkIsAudible={isBookmarkAudible}
            checkIsActive={isBookmarkActive}
            onOpenBookmark={openBookmarkTab}
            onCloseBookmark={closeBookmarkTab}
            externalDropTarget={externalDropTarget}
          />
        ))}

        {/* Drag overlay - no animation for valid drops, default animation for cancelled */}
        <DragOverlay dropAnimation={wasValidDropRef.current ? null : undefined}>
          {activeNode ? <DragOverlayContent node={activeNode} depth={activeDepth} /> : null}
        </DragOverlay>
      </DndContext>

      <EditModal
        isOpen={editingNode !== null}
        node={editingNode}
        onSave={updateBookmark}
        onClose={() => setEditingNode(null)}
      />

      <CreateFolderModal
        isOpen={creatingFolderParentId !== null}
        parentId={creatingFolderParentId}
        onSave={(parentId, title) => {
          createFolder(parentId, title, (newNode) => {
            // Auto-expand parent folder to show the new folder
            setExpandedState(prev => ({ ...prev, [parentId]: true }));
            // Scroll to the new folder after DOM updates
            setTimeout(() => {
              const element = document.querySelector(`[data-bookmark-id="${newNode.id}"]`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
          });
        }}
        onClose={() => setCreatingFolderParentId(null)}
      />
    </>
  );
};