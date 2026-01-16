import React, { useState, useCallback, useRef, useEffect, forwardRef } from 'react';
import { useBookmarks, SortOption } from '../hooks/useBookmarks';
import { Space, useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { FolderPickerDialog } from './FolderPickerDialog';
import { SpaceNavigatorDialog } from './SpaceNavigatorDialog';
import { useDragDrop } from '../hooks/useDragDrop';
import { getIndentPadding } from '../utils/indent';
import { DropPosition, calculateDropPosition } from '../utils/dragDrop';
import { matchesFilter } from '../utils/searchParser';
import { DropIndicators } from './DropIndicators';
import { ExternalDropTarget, ResolveBookmarkDropTarget } from './TabList';
import { BookmarkOpenMode } from './SettingsDialog';
import { BookmarkEditModal } from './BookmarkEditModal';
import { BookmarkCreateFolderModal } from './BookmarkCreateFolderModal';
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
  FolderOpen,
  FolderInput,
  ArrowDownAZ,
  Calendar,
  Pin,
  X,
  Volume2,
  Copy,
  ExternalLink,
  SquareStack
} from 'lucide-react';
import { getRandomGroupColor } from '../utils/groupColors';
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
  onExpandAll?: (folderId: string) => void;
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
  liveTitle?: string;
  checkIsLoaded?: (bookmarkId: string) => boolean;
  checkIsAudible?: (bookmarkId: string) => boolean;
  checkIsActive?: (bookmarkId: string) => boolean;
  getLiveTitle?: (bookmarkId: string) => string | undefined;
  onOpenBookmark?: (bookmarkId: string, url: string) => void;
  onCloseBookmark?: (bookmarkId: string) => void;
  onOpenAsTabGroup?: (folderId: string, folderName: string) => void;
  onOpenAllTabs?: (folderId: string) => void;
  onOpenAllTabsInNewWindow?: (folderId: string) => void;
  onMoveToSpace?: (bookmarkId: string) => void;
  onMoveBookmark?: (bookmarkId: string, isFolder: boolean) => void;
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
  onExpandAll,
  onPin,
  isDragging: _isDragging,
  activeId,
  dropTargetId,
  dropPosition,
  bookmarkOpenMode = 'arc',
  isLoaded,
  isAudible,
  isActive,
  liveTitle,
  onOpenBookmark,
  onCloseBookmark,
  onOpenAsTabGroup,
  onOpenAllTabs,
  onOpenAllTabsInNewWindow,
  onMoveToSpace,
  onMoveBookmark,
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
      {({ isOpen }) => (
        <>
          <ContextMenu.Trigger asChild>
            <TreeRow
              ref={ref}
              depth={depth}
              title={bookmarkOpenMode === 'arc' && isLoaded && liveTitle ? `${node.title} - ${liveTitle}` : node.title}
              tooltip={node.url ? `${node.title}\n${node.url}` : undefined}
              icon={combinedIcon}
              hasChildren={isFolder}
              isExpanded={expandedState[node.id]}
              onToggle={() => toggleFolder(node.id, !expandedState[node.id])}
              onClick={handleRowClick}
              isActive={bookmarkOpenMode === 'arc' && isActive}
              isHighlighted={isOpen}
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
              {onExpandAll && (
                <ContextMenu.Item onSelect={() => onExpandAll(node.id)}>
                  <span className="w-[14px] mr-2" /> Expand All
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => onSort(node.id, 'name')}>
                <ArrowDownAZ size={14} className="mr-2" /> Sort by Name
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onSort(node.id, 'dateAdded')}>
                <Calendar size={14} className="mr-2" /> Sort by Date
              </ContextMenu.Item>
              <ContextMenu.Separator />
              {onOpenAllTabs && (
                <ContextMenu.Item onSelect={() => onOpenAllTabs(node.id)}>
                  <ExternalLink size={14} className="mr-2" /> Open All Tabs
                </ContextMenu.Item>
              )}
              {onOpenAllTabsInNewWindow && (
                <ContextMenu.Item onSelect={() => onOpenAllTabsInNewWindow(node.id)}>
                  <ExternalLink size={14} className="mr-2" /> Open All Tabs in New Window
                </ContextMenu.Item>
              )}
              {onOpenAsTabGroup && (
                <ContextMenu.Item onSelect={() => onOpenAsTabGroup(node.id, node.title)}>
                  <FolderOpen size={14} className="mr-2" /> Open as Tab Group
                </ContextMenu.Item>
              )}
              {onMoveToSpace && (
                <ContextMenu.Item onSelect={() => onMoveToSpace(node.id)}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )}
              {onMoveBookmark && !isSpecialFolder && (
                <ContextMenu.Item onSelect={() => onMoveBookmark(node.id, true)}>
                  <FolderInput size={14} className="mr-2" /> Move Folder...
                </ContextMenu.Item>
              )}
            </>
          )}
          {!isFolder && node.url && (
            <>
              {onPin && (
                <ContextMenu.Item onSelect={() => onPin(node.url!, node.title, getFaviconUrl(node.url!))}>
                  <Pin size={14} className="mr-2" /> Pin to Sidebar
                </ContextMenu.Item>
              )}
              <ContextMenu.Item onSelect={() => onDuplicate(node.id)}>
                <Copy size={14} className="mr-2" /> Duplicate
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => {
                chrome.tabs.create({ url: node.url }, (tab) => {
                  if (tab?.id) chrome.tabs.ungroup(tab.id);
                });
              }}>
                <ExternalLink size={14} className="mr-2" /> Open in New Tab
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => chrome.windows.create({ url: node.url })}>
                <ExternalLink size={14} className="mr-2" /> Open in New Window
              </ContextMenu.Item>
              {onMoveToSpace && (
                <ContextMenu.Item onSelect={() => onMoveToSpace(node.id)}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )}
              {onMoveBookmark && (
                <ContextMenu.Item onSelect={() => onMoveBookmark(node.id, false)}>
                  <FolderInput size={14} className="mr-2" /> Move Bookmark...
                </ContextMenu.Item>
              )}
            </>
          )}
          {!isSpecialFolder && (
            <>
              <ContextMenu.Separator />
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
        </>
      )}
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
  const { node, expandedState, depth = 0, checkIsLoaded, checkIsAudible, checkIsActive, getLiveTitle } = props;
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
              liveTitle={getLiveTitle ? getLiveTitle(child.id) : undefined}
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
  filterText?: string;
  activeSpace?: Space | null;
  onShowToast?: (message: string) => void;
  useSpaces?: boolean;
}

export const BookmarkTree = ({ onPin, hideOtherBookmarks = false, externalDropTarget, bookmarkOpenMode = 'arc', onResolverReady, filterLiveTabs = false, filterText = '', activeSpace, onShowToast, useSpaces = true }: BookmarkTreeProps) => {
  const { bookmarks, removeBookmark, updateBookmark, createFolder, sortBookmarks, moveBookmark, duplicateBookmark, findFolderByPath, getAllBookmarksInFolder, getBookmarkPath } = useBookmarks();
  const { openBookmarkTab, closeBookmarkTab, isBookmarkLoaded, isBookmarkAudible, isBookmarkActive, getActiveItemKey, getBookmarkLiveTitle } = useBookmarkTabsContext();
  const { spaces, updateSpace } = useSpacesContext();

  // Open all bookmarks in folder as a tab group
  const handleOpenAsTabGroup = useCallback(async (
    folderId: string,
    folderName: string
  ) =>
  {
    const bookmarksList = await getAllBookmarksInFolder(folderId);

    if (bookmarksList.length === 0)
    {
      onShowToast?.('No bookmarks found in folder');
      return;
    }

    const createdTabIds: number[] = [];
    for (const bookmark of bookmarksList)
    {
      const tab = await chrome.tabs.create({ url: bookmark.url, active: false });
      if (tab.id) createdTabIds.push(tab.id);
    }

    if (createdTabIds.length > 0)
    {
      const groupId = await chrome.tabs.group({ tabIds: createdTabIds });
      await chrome.tabGroups.update(groupId, {
        title: folderName,
        color: getRandomGroupColor()
      });
      // Activate the first tab in the group
      await chrome.tabs.update(createdTabIds[0], { active: true });
      onShowToast?.(`Opened ${createdTabIds.length} tabs as "${folderName}"`);
    }
  }, [getAllBookmarksInFolder, onShowToast]);

  // Open all bookmarks in folder as separate tabs (no grouping)
  const handleOpenAllTabs = useCallback(async (folderId: string) =>
  {
    const bookmarksList = await getAllBookmarksInFolder(folderId);
    if (bookmarksList.length === 0)
    {
      onShowToast?.('No bookmarks found in folder');
      return;
    }
    for (const bookmark of bookmarksList)
    {
      await chrome.tabs.create({ url: bookmark.url, active: false });
    }
    onShowToast?.(`Opened ${bookmarksList.length} tabs`);
  }, [getAllBookmarksInFolder, onShowToast]);

  // Open all bookmarks in a new window
  const handleOpenAllTabsInNewWindow = useCallback(async (folderId: string) =>
  {
    const bookmarksList = await getAllBookmarksInFolder(folderId);
    if (bookmarksList.length === 0)
    {
      onShowToast?.('No bookmarks found in folder');
      return;
    }
    const urls = bookmarksList.map(b => b.url).filter(Boolean) as string[];
    await chrome.windows.create({ url: urls });
    onShowToast?.(`Opened ${urls.length} tabs in new window`);
  }, [getAllBookmarksInFolder, onShowToast]);

  // Recursively filter bookmarks based on a predicate function
  const filterBookmarksRecursive = useCallback((
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    predicate: (node: chrome.bookmarks.BookmarkTreeNode) => boolean
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
        if (predicate(node))
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

  // Space folder info - track if folder is found or missing
  const spaceFolderPath = activeSpace?.id !== 'all' ? activeSpace?.bookmarkFolderPath : null;
  const spaceFolder = spaceFolderPath ? findFolderByPath(spaceFolderPath) : null;
  const isSpaceFolderMissing = spaceFolderPath && !spaceFolder;

  // Apply space filter if a space (not "all") is active
  // Show the space folder itself (not just children) so it's always a drop target
  if (spaceFolder)
  {
    visibleBookmarks = [spaceFolder];
  }

  // Apply all filters in a single pass
  const hasFilters = filterLiveTabs || filterText.trim();
  if (hasFilters)
  {
    visibleBookmarks = filterBookmarksRecursive(visibleBookmarks, (node) =>
    {
      if (filterLiveTabs && !isBookmarkLoaded(node.id)) return false;
      if (filterText.trim() && !matchesFilter(node.title, node.url ?? '', filterText)) return false;
      return true;
    });
  }

  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  const [editingNode, setEditingNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);
  const [showSpaceFolderPicker, setShowSpaceFolderPicker] = useState(false);
  const [moveToSpaceDialog, setMoveToSpaceDialog] = useState<{
    isOpen: boolean;
    bookmarkId: string | null;
  }>({ isOpen: false, bookmarkId: null });
  const [moveBookmarkDialog, setMoveBookmarkDialog] = useState<{
    isOpen: boolean;
    bookmarkId: string | null;
    isFolder: boolean;
  }>({ isOpen: false, bookmarkId: null, isFolder: false });

  // Auto-expand space folder when it changes
  useEffect(() =>
  {
    if (spaceFolder)
    {
      setExpandedState(prev =>
      {
        if (prev[spaceFolder.id]) return prev;  // Already expanded
        return { ...prev, [spaceFolder.id]: true };
      });
    }
  }, [spaceFolder?.id]);

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
        setExpandedState(prev => prev[bookmarkId] ? prev : { ...prev, [bookmarkId]: true });
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

  // Expand all descendant folders under a given folder
  const handleExpandAll = useCallback((folderId: string) => {
    const collectFolderIds = (node: chrome.bookmarks.BookmarkTreeNode): string[] => {
      const ids: string[] = [];
      if (!node.url) {
        // It's a folder
        ids.push(node.id);
        if (node.children) {
          for (const child of node.children) {
            ids.push(...collectFolderIds(child));
          }
        }
      }
      return ids;
    };

    const folder = findNode(folderId);
    if (folder) {
      const folderIds = collectFolderIds(folder);
      setExpandedState(prev => {
        const newState = { ...prev };
        for (const id of folderIds) {
          newState[id] = true;
        }
        return newState;
      });
    }
  }, [findNode]);

  const handleCreateFolder = (parentId: string) => {
    setCreatingFolderParentId(parentId);
  };

  // Handle folder selection for updating space's bookmark folder
  const handleSpaceFolderSelected = useCallback(async (folderId: string) =>
  {
    setShowSpaceFolderPicker(false);
    if (!activeSpace || activeSpace.id === 'all') return;

    const path = await getBookmarkPath(folderId);
    updateSpace(activeSpace.id, { bookmarkFolderPath: path });
  }, [activeSpace, getBookmarkPath, updateSpace]);

  // Open move to space dialog
  const openMoveToSpaceDialog = useCallback((bookmarkId: string) =>
  {
    setMoveToSpaceDialog({ isOpen: true, bookmarkId });
  }, []);

  const closeMoveToSpaceDialog = useCallback(() =>
  {
    setMoveToSpaceDialog({ isOpen: false, bookmarkId: null });
  }, []);

  // Open move bookmark dialog
  const openMoveBookmarkDialog = useCallback((bookmarkId: string, isFolder: boolean) =>
  {
    setMoveBookmarkDialog({ isOpen: true, bookmarkId, isFolder });
  }, []);

  const closeMoveBookmarkDialog = useCallback(() =>
  {
    setMoveBookmarkDialog({ isOpen: false, bookmarkId: null, isFolder: false });
  }, []);

  // Handle moving bookmark/folder to a selected folder
  const handleMoveBookmarkToFolder = useCallback((folderId: string) =>
  {
    if (moveBookmarkDialog.bookmarkId)
    {
      moveBookmark(moveBookmarkDialog.bookmarkId, folderId, 'into');
    }
    closeMoveBookmarkDialog();
  }, [moveBookmarkDialog.bookmarkId, moveBookmark, closeMoveBookmarkDialog]);

  // Handle moving bookmark to a space's folder
  // Returns error message if failed, undefined if successful
  const handleMoveBookmarkToSpace = useCallback(async (spaceId: string): Promise<string | void> =>
  {
    const bookmarkId = moveToSpaceDialog.bookmarkId;
    if (!bookmarkId) return 'No bookmark selected';

    const space = spaces.find(s => s.id === spaceId);
    if (!space?.bookmarkFolderPath)
    {
      return `"${space?.name || 'Space'}" has no bookmark folder configured`;
    }

    const folder = findFolderByPath(space.bookmarkFolderPath);
    if (!folder)
    {
      return `Folder "${space.bookmarkFolderPath}" no longer exists`;
    }

    try
    {
      await chrome.bookmarks.move(bookmarkId, { parentId: folder.id });
      onShowToast?.(`Moved to ${space.name}. New location: ${space.bookmarkFolderPath}`);
    }
    catch (err)
    {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return `Failed to move bookmark: ${message}`;
    }
  }, [moveToSpaceDialog.bookmarkId, spaces, findFolderByPath, onShowToast]);

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
    // Note: sourceId is already the bookmark ID, no need to call findNode
    if (SPECIAL_FOLDER_IDS.includes(sourceId))
    {
      setDropTargetId(null);
      setDropPosition(null);
      clearAutoExpandTimer();
      return;
    }

    setDropTargetId(target.bookmarkId);
    setDropPosition(target.position);
  }, [bookmarks, resolveBookmarkDropTarget, clearAutoExpandTimer, setDropTargetId, setDropPosition]);

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

  const hasVisibleBookmarks = visibleBookmarks.length > 0;

  // Show message if space folder is missing
  if (isSpaceFolderMissing)
  {
    return (
      <>
        <div className="p-4 text-gray-500 dark:text-gray-400">
          <span>Folder "{spaceFolderPath}" not found. </span>
          <button
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
            onClick={() => setShowSpaceFolderPicker(true)}
          >
            Pick new folder
          </button>
        </div>
        <FolderPickerDialog
          isOpen={showSpaceFolderPicker}
          title="Select Bookmark Folder"
          onSelect={handleSpaceFolderSelected}
          onClose={() => setShowSpaceFolderPicker(false)}
        />
      </>
    );
  }

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
            onExpandAll={handleExpandAll}
            onPin={onPin}
            isDragging={!!activeId}
            activeId={activeId}
            dropTargetId={dropTargetId}
            dropPosition={dropPosition}
            bookmarkOpenMode={bookmarkOpenMode}
            isLoaded={isBookmarkLoaded(node.id)}
            isAudible={isBookmarkAudible(node.id)}
            isActive={isBookmarkActive(node.id)}
            liveTitle={getBookmarkLiveTitle(node.id)}
            checkIsLoaded={isBookmarkLoaded}
            checkIsAudible={isBookmarkAudible}
            checkIsActive={isBookmarkActive}
            getLiveTitle={getBookmarkLiveTitle}
            onOpenBookmark={openBookmarkTab}
            onCloseBookmark={closeBookmarkTab}
            onOpenAsTabGroup={!useSpaces ? handleOpenAsTabGroup : undefined}
            onOpenAllTabs={handleOpenAllTabs}
            onOpenAllTabsInNewWindow={handleOpenAllTabsInNewWindow}
            onMoveToSpace={useSpaces ? openMoveToSpaceDialog : undefined}
            onMoveBookmark={openMoveBookmarkDialog}
            externalDropTarget={externalDropTarget}
          />
        ))}

        {/* Drag overlay - no animation for valid drops, default animation for cancelled */}
        <DragOverlay dropAnimation={wasValidDropRef.current ? null : undefined}>
          {activeNode ? <DragOverlayContent node={activeNode} depth={activeDepth} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Separator - only show when there are visible bookmarks */}
      {hasVisibleBookmarks && (
        <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
      )}

      <BookmarkEditModal
        isOpen={editingNode !== null}
        node={editingNode}
        onSave={updateBookmark}
        onClose={() => setEditingNode(null)}
      />

      <BookmarkCreateFolderModal
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

      <SpaceNavigatorDialog
        isOpen={moveToSpaceDialog.isOpen}
        onClose={closeMoveToSpaceDialog}
        title="Move to Space"
        hideAllSpace
        excludeSpaceId={activeSpace?.id}
        requireBookmarkFolder
        onSelectSpace={handleMoveBookmarkToSpace}
        showCurrentIndicator={false}
      />

      <FolderPickerDialog
        isOpen={moveBookmarkDialog.isOpen}
        title={moveBookmarkDialog.isFolder ? "Move Folder to..." : "Move Bookmark to..."}
        onSelect={handleMoveBookmarkToFolder}
        onClose={closeMoveBookmarkDialog}
      />
    </>
  );
};