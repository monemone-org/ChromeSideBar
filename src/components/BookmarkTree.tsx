import React, { useState, useCallback, useRef, useEffect, forwardRef, useMemo } from 'react';
import { useBookmarks, SortOption } from '../hooks/useBookmarks';
import { Space, useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { SelectionItem } from '../contexts/SelectionContext';
import { useSelection } from '../hooks/useSelection';
import { FolderPickerDialog } from './FolderPickerDialog';
import { SpaceNavigatorDialog } from './SpaceNavigatorDialog';
import { useExternalLinkDrop } from '../hooks/useExternalLinkDrop';
import { getIndentPadding } from '../utils/indent';
import { scrollToBookmark } from '../utils/scrollHelpers';
import { DropPosition, calculateDropPosition } from '../utils/dragDrop';
import { matchesFilter } from '../utils/searchParser';
import { getIconUrl } from '../utils/iconify';
import { DropIndicators } from './DropIndicators';
import { ExternalDropTarget, ResolveBookmarkDropTarget } from './TabList';
import { BookmarkOpenMode } from './SettingsDialog';
import { BookmarkEditModal } from './BookmarkEditModal';
import { BookmarkCreateFolderModal } from './BookmarkCreateFolderModal';
import * as ContextMenu from './menu/ContextMenu';
import { TreeRow } from './TreeRow';
import { useInView } from '../hooks/useInView';
import { SPEAKER_ICON_SIZE } from '../constants';
import {
  Folder,
  Globe,
  Trash,
  Edit,
  FolderPlus,
  FilePlus,
  FolderOpen,
  FolderInput,
  ArrowDownAZ,
  Calendar,
  Pin,
  X,
  Volume2,
  Copy,
  ExternalLink,
  SquareArrowOutUpRight,
  SquareStack,
  ArrowRightFromLine,
  Link
} from 'lucide-react';
import { getRandomGroupColor, GROUP_COLORS } from '../utils/groupColors';
import clsx from 'clsx';
import {
  useDraggable,
  useDroppable,
  DraggableAttributes,
} from '@dnd-kit/core';
import { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useUnifiedDnd, DropHandler } from '../contexts/UnifiedDndContext';
import { DragData, DragFormat, DragItem, DropData, createBookmarkDragData, createBookmarkDragItem, acceptsFormatsIf, getPrimaryItem, getItemsByFormat, hasFormat } from '../types/dragDrop';
import { getFaviconUrl } from '../utils/favicon';
import { saveTabGroupAsBookmarkFolder } from '../utils/bookmarkOperations';
import { UndoableAction } from '../actions/types';
import { DeleteBookmarkAction } from '../actions/deleteBookmarkAction';

// Standard Chrome bookmark folder IDs
const BOOKMARKS_BAR_ID = '1';
const OTHER_BOOKMARKS_ID = '2';
const MOBILE_BOOKMARKS_ID = '3';

// Storage key for persisting folder expand/collapse state
const getExpandedStateKey = (windowId: number, spaceId: string) =>
  `bookmarkExpandedState_${windowId}_${spaceId}`;

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
  onCreateBookmark: (parentId: string) => void;
  onSort: (folderId: string, sortBy: SortOption) => void;
  onDuplicate: (id: string) => void;
  onExpandAll?: (folderId: string) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  matchingSpace?: Space;  // Space that uses this folder as its bookmark folder
  globalDragActive?: boolean;  // True when any drag is in progress (disables hover borders)
  isMultiDrag?: boolean;
  activeId?: string | null;
  dropTargetId?: string | null;
  dropPosition?: DropPosition;
  // Bookmark opening behavior
  bookmarkOpenMode?: BookmarkOpenMode;
  arcSingleClickOpensTab?: boolean;
  isLoaded?: boolean;
  isAudible?: boolean;
  isActive?: boolean;
  liveTitle?: string;
  isSelected?: boolean;
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
  onMoveToTabs?: (bookmarkId: string) => void;
  onMoveBookmark?: (bookmarkId: string, isFolder: boolean) => void;
  getMatchingSpace?: (folderId: string) => Space | undefined;
  // External drop target (from tab drag)
  externalDropTarget?: ExternalDropTarget | null;
  // Selection handlers
  onSelectionClick?: (e: React.MouseEvent) => void;
  onSelectionContextMenu?: () => void;
  selectionCount?: number;
  // Selection helpers for recursive items
  checkIsSelected?: (id: string) => boolean;
  getSelectionItem?: (id: string, isFolder: boolean) => SelectionItem;
  onChildSelectionClick?: (item: SelectionItem, e: React.MouseEvent) => void;
  onChildSelectionContextMenu?: (item: SelectionItem) => void;
  // Multi-selection actions
  onOpenInNewTabs?: (url: string) => void;
  onOpenInNewWindow?: (url: string) => void;
  onMoveSelectedBookmarks?: () => void;
  onMoveSelectedToSpace?: () => void;
  hasSelectedBookmarks?: boolean;
  allSelectedAreLive?: boolean;
  onCloseSelectedBookmarks?: () => void;
  onCopyUrl?: (url: string) => void;
  onCopyUrls?: () => void;
  // Drag-drop attributes
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
  // Window ID for tab creation
  windowId?: number;
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
  onCreateBookmark,
  onSort,
  onDuplicate,
  onExpandAll,
  onPin,
  matchingSpace,
  globalDragActive,
  isMultiDrag,
  activeId,
  dropTargetId,
  dropPosition,
  bookmarkOpenMode = 'arc',
  arcSingleClickOpensTab = true,
  isLoaded,
  isAudible,
  isActive,
  liveTitle,
  isSelected,
  onOpenBookmark,
  onCloseBookmark,
  onOpenAsTabGroup,
  onOpenAllTabs,
  onOpenAllTabsInNewWindow,
  onMoveToSpace,
  onMoveToTabs,
  onMoveBookmark,
  externalDropTarget,
  onSelectionClick,
  onSelectionContextMenu,
  selectionCount,
  onOpenInNewTabs,
  onOpenInNewWindow,
  onMoveSelectedBookmarks,
  onMoveSelectedToSpace,
  hasSelectedBookmarks,
  allSelectedAreLive,
  onCloseSelectedBookmarks,
  onCopyUrl,
  onCopyUrls,
  attributes,
  listeners,
  windowId,
}, ref) => {
  const isFolder = !node.url;
  const dndId = `bookmark-${node.id}`;
  const isSpecialFolder = SPECIAL_FOLDER_IDS.includes(node.id);

  const isBeingDragged = isMultiDrag ? isSelected : activeId === node.id;
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

    // Option+click: open bookmark in new tab
    if (e.altKey && node.url)
    {
      chrome.tabs.create({ url: node.url, active: false, windowId: windowId ?? undefined });
      return;
    }

    // Always update selection state on click
    onSelectionClick?.(e);

    // For modifier clicks (Ctrl/Cmd/Shift), only update selection, don't perform action
    if (e.metaKey || e.ctrlKey || e.shiftKey)
    {
      return;
    }

    // Plain click: perform action for bookmarks (folders only expand/collapse via chevron)
    // Arc mode: open/activate bookmark on single click if setting enabled
    if (node.url && bookmarkOpenMode === 'arc' && onOpenBookmark && arcSingleClickOpensTab)
    {
      onOpenBookmark(node.id, node.url);
      return;
    }

    // Non-Arc modes: open bookmark based on setting
    if (node.url && bookmarkOpenMode !== 'arc')
    {
      if (bookmarkOpenMode === 'activeTab')
      {
        // Replace current tab with bookmark
        chrome.tabs.update({ url: node.url });
      }
      else
      {
        // newTab: open in new active tab
        chrome.tabs.create({ url: node.url, active: true, windowId: windowId ?? undefined });
      }
    }
  };

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

  const icon = isFolder ? (
    matchingSpace ? (
      <div className="relative">
        <Folder size={16} className={spaceColorClass} />
        <span className="absolute -bottom-[5px] -right-[5px] flex items-center justify-center">
          {renderSpaceIconOverlay(matchingSpace.icon, GROUP_COLORS[matchingSpace.color] || GROUP_COLORS.grey)}
        </span>
      </div>
    ) : (
      <Folder size={16} className="text-gray-500" />
    )
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
    <div className="flex items-center">
      {/* Pin button - visible on hover */}
      {!isFolder && onPin && node.url && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPin(node.url!, node.title, getFaviconUrl(node.url!)); }}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded bg-white dark:bg-gray-900 opacity-0 group-hover:opacity-100"
          title="Pin"
          aria-label="Pin bookmark"
        >
          <Pin size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      )}
      {/* Open button - visible on hover when bookmark is not loaded (Arc-style only) */}
      {!isFolder && bookmarkOpenMode === 'arc' && !isLoaded && onOpenBookmark && node.url && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (e.metaKey || e.ctrlKey)
            {
              // Cmd/Ctrl+click: open in new tab
              chrome.tabs.create({ url: node.url!, active: true, windowId });
            }
            else if (e.shiftKey)
            {
              // Shift+click: open in new window
              chrome.windows.create({ url: node.url! });
            }
            else
            {
              // Default: open via Arc-style handler
              onOpenBookmark(node.id, node.url!);
            }
          }}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded bg-white dark:bg-gray-900 opacity-0 group-hover:opacity-100"
          title="Open tab"
          aria-label="Open tab"
        >
          <SquareArrowOutUpRight size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      )}
      {/* Close button - always visible when tab is loaded (Arc-style only) */}
      {!isFolder && bookmarkOpenMode === 'arc' && isLoaded && onCloseBookmark && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCloseBookmark(node.id); }}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded bg-white dark:bg-gray-900"
          title="Close tab"
          aria-label="Close tab"
        >
          <X size={14} className="text-gray-700 dark:text-gray-200" />
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
              title={bookmarkOpenMode === 'arc' && isLoaded && liveTitle ? liveTitle : node.title}
              tooltip={node.url ? `${node.title}\n${node.url}` : undefined}
              icon={combinedIcon}
              hasChildren={isFolder}
              isExpanded={expandedState[node.id]}
              onToggle={() => toggleFolder(node.id, !expandedState[node.id])}
              onClick={handleRowClick}
              onDoubleClick={() => {
                if (node.url && bookmarkOpenMode === 'arc' && onOpenBookmark) {
                  onOpenBookmark(node.id, node.url);
                }
              }}
              onContextMenu={() => onSelectionContextMenu?.()}
              isActive={bookmarkOpenMode === 'arc' && isActive}
              isSelected={isSelected}
              isHighlighted={!isSelected && isOpen}
              isDragging={isBeingDragged}
              disableHoverBorder={globalDragActive}
              dndAttributes={attributes}
              dndListeners={listeners}
              data-bookmark-id={node.id}
              data-is-folder={isFolder}
              data-depth={depth}
              data-dnd-id={dndId}
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
          {selectionCount && selectionCount > 1 ? (
            // Multi-selection menu
            <>
              {hasSelectedBookmarks && onPin && (
                <ContextMenu.Item onSelect={() => onPin(node.url || '', node.title, node.url ? getFaviconUrl(node.url) : undefined)}>
                  <Pin size={14} className="mr-2" /> Pin to Sidebar
                </ContextMenu.Item>
              )}
              {hasSelectedBookmarks && onCopyUrls && (
                <ContextMenu.Item onSelect={onCopyUrls}>
                  <Link size={14} className="mr-2" /> Copy URLs
                </ContextMenu.Item>
              )}
              {hasSelectedBookmarks && (onPin || onCopyUrls) && (
                <ContextMenu.Separator />
              )}
              <ContextMenu.Item onSelect={() => onOpenInNewTabs?.(node.url || '')}>
                <ExternalLink size={14} className="mr-2" /> Open in New Tabs
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onOpenInNewWindow?.(node.url || '')}>
                <ExternalLink size={14} className="mr-2" /> Open in New Window
              </ContextMenu.Item>
              <ContextMenu.Separator />
              {onMoveSelectedBookmarks && (
                <ContextMenu.Item onSelect={onMoveSelectedBookmarks}>
                  <FolderInput size={14} className="mr-2" /> Move Bookmarks...
                </ContextMenu.Item>
              )}
              {onMoveSelectedToSpace && (
                <ContextMenu.Item onSelect={onMoveSelectedToSpace}>
                  <SquareStack size={14} className="mr-2" /> Move To Space...
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
              {allSelectedAreLive ? (
                <ContextMenu.Item onSelect={onCloseSelectedBookmarks}>
                  <X size={14} className="mr-2" /> Close {selectionCount} Bookmarks
                </ContextMenu.Item>
              ) : (
                <ContextMenu.Item danger onSelect={() => onRemove(node.id)}>
                  <Trash size={14} className="mr-2" /> Delete {selectionCount} Bookmarks
                </ContextMenu.Item>
              )}
            </>
          ) : (
            // Single-item menu
            <>
          {isFolder && (
            <>
              <ContextMenu.Item onSelect={() => onCreateFolder(node.id)}>
                <FolderPlus size={14} className="mr-2" /> New Folder
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onCreateBookmark(node.id)}>
                <FilePlus size={14} className="mr-2" /> New Bookmark
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
              {(onOpenAsTabGroup || onOpenAllTabsInNewWindow) && (
                <ContextMenu.Separator />
              )}
              {onMoveBookmark && !isSpecialFolder && (
                <ContextMenu.Item onSelect={() => onMoveBookmark(node.id, true)}>
                  <FolderInput size={14} className="mr-2" /> Move Folder...
                </ContextMenu.Item>
              )}
              {onMoveToSpace && !isSpecialFolder && (
                <ContextMenu.Item onSelect={() => onMoveToSpace(node.id)}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
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
              <ContextMenu.Item onSelect={() => onCopyUrl?.(node.url!)}>
                <Link size={14} className="mr-2" /> Copy URL
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => onOpenInNewTabs?.(node.url!)}>
                <ExternalLink size={14} className="mr-2" /> Open in New Tab
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onOpenInNewWindow?.(node.url!)}>
                <ExternalLink size={14} className="mr-2" /> Open in New Window
              </ContextMenu.Item>
              <ContextMenu.Separator />
              {onMoveBookmark && (
                <ContextMenu.Item onSelect={() => onMoveBookmark(node.id, false)}>
                  <FolderInput size={14} className="mr-2" /> Move Bookmark...
                </ContextMenu.Item>
              )}
              {onMoveToSpace && (
                <ContextMenu.Item onSelect={() => onMoveToSpace(node.id)}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )}
              {isLoaded && onMoveToTabs && (
                <ContextMenu.Item onSelect={() => onMoveToTabs(node.id)}>
                  <ArrowRightFromLine size={14} className="mr-2" /> Move To Tabs
                </ContextMenu.Item>
              )}
            </>
          )}
          {!isSpecialFolder && (
            <>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => onEdit(node)}>
                <Edit size={14} className="mr-2" /> Edit Bookmark...
              </ContextMenu.Item>
              {isLoaded && !isFolder && onCloseBookmark ? (
                <ContextMenu.Item onSelect={() => onCloseBookmark(node.id)}>
                  <X size={14} className="mr-2" /> Close
                </ContextMenu.Item>
              ) : (
                <ContextMenu.Item danger onSelect={() => onRemove(node.id)}>
                  <Trash size={14} className="mr-2" /> Delete
                </ContextMenu.Item>
              )}
            </>
          )}
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
  const isFolder = !props.node.url;
  const bookmarkId = `bookmark-${props.node.id}`;

  // Draggable setup with DragData
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: bookmarkId,
    disabled: isSpecialFolder,
    data: createBookmarkDragData(
      props.node.id,
      isFolder,
      props.node.title,
      props.node.url,
      props.node.parentId,
      props.depth
    ),
  });

  // Droppable setup with DropData
  const nodeId = props.node.id;
  // Droppable - accepts BOOKMARK (move), TAB_GROUP (save as folder), URL (create bookmark)
  const { setNodeRef: setDropRef } = useDroppable({
    id: bookmarkId,
    data: {
      zone: 'bookmarkTree',
      targetId: nodeId,
      canAccept: acceptsFormatsIf(
        [DragFormat.BOOKMARK, DragFormat.TAB_GROUP, DragFormat.URL],
        (dragData, format) => {
          // Can't drop bookmark on itself
          const primaryItem = getPrimaryItem(dragData);
          if (format === DragFormat.BOOKMARK && primaryItem?.bookmark?.bookmarkId === nodeId)
          {
            return false;
          }
          return true;
        }
      ),
      isFolder,
      isExpanded: isFolder && !!props.expandedState[nodeId],
      depth: props.depth,
      parentId: props.node.parentId,
    } as DropData,
  });

  // Merge refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [setDragRef, setDropRef, ref]
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
  const {
    node,
    expandedState,
    depth = 0,
    checkIsLoaded,
    checkIsAudible,
    checkIsActive,
    getLiveTitle,
    getMatchingSpace,
    checkIsSelected,
    getSelectionItem,
    onChildSelectionClick,
    onChildSelectionContextMenu,
    selectionCount
  } = props;
  const isFolder = !node.url;
  const { ref, isInView } = useInView<HTMLDivElement>();

  // Compute matchingSpace for folders
  const matchingSpace = isFolder && getMatchingSpace ? getMatchingSpace(node.id) : undefined;

  return (
    <>
      {isInView ? (
        <DraggableBookmarkRow ref={ref} {...props} matchingSpace={matchingSpace} />
      ) : (
        <StaticBookmarkRow ref={ref} {...props} matchingSpace={matchingSpace} />
      )}

      {isFolder && expandedState[node.id] && node.children && (
        <div>
          {node.children.map((child, childIndex) =>
          {
            const childIsFolder = !child.url;
            // Always create a selection item for child - use parent's getSelectionItem if available,
            // otherwise create a fallback with relative index
            const childSelectionItem: SelectionItem = getSelectionItem
              ? getSelectionItem(child.id, childIsFolder)
              : { id: child.id, type: childIsFolder ? 'folder' : 'bookmark', index: childIndex };
            return (
              <BookmarkItem
                key={child.id}
                {...props} // Pass through all handlers
                node={child}
                depth={depth + 1}
                isLoaded={checkIsLoaded ? checkIsLoaded(child.id) : false}
                isAudible={checkIsAudible ? checkIsAudible(child.id) : false}
                isActive={checkIsActive ? checkIsActive(child.id) : false}
                liveTitle={getLiveTitle ? getLiveTitle(child.id) : undefined}
                isSelected={checkIsSelected ? checkIsSelected(child.id) : false}
                onSelectionClick={onChildSelectionClick
                  ? (e) => onChildSelectionClick(childSelectionItem, e)
                  : undefined
                }
                onSelectionContextMenu={onChildSelectionContextMenu
                  ? () => onChildSelectionContextMenu(childSelectionItem)
                  : undefined
                }
                selectionCount={selectionCount}
              />
            );
          })}
        </div>
      )}
    </>
  );
};

interface BookmarkTreeProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  onPinMultiple?: (pins: Array<{ url: string; title: string; faviconUrl?: string }>) => void;
  hideOtherBookmarks?: boolean;
  externalDropTarget?: ExternalDropTarget | null;
  bookmarkOpenMode?: BookmarkOpenMode;
  arcSingleClickOpensTab?: boolean;
  onResolverReady?: (resolver: ResolveBookmarkDropTarget) => void;
  filterLiveTabs?: boolean;
  filterText?: string;
  activeSpace?: Space | null;
  onShowToast?: (message: string) => void;
  onPerformAction?: (action: UndoableAction) => Promise<void>;
  useSpaces?: boolean;
  suppressAutoScrollRef?: React.RefObject<boolean>;
}

export const BookmarkTree = ({ onPin, onPinMultiple, hideOtherBookmarks = false, externalDropTarget, bookmarkOpenMode = 'arc', arcSingleClickOpensTab = true, onResolverReady, filterLiveTabs = false, filterText = '', activeSpace, onShowToast, onPerformAction, useSpaces = true, suppressAutoScrollRef }: BookmarkTreeProps) => {
  const { bookmarks, updateBookmark, createFolder, createBookmark, sortBookmarks, moveBookmark, duplicateBookmark, findFolderByPath, getAllBookmarksInFolder, getBookmarkPath, getBookmark, error } = useBookmarks();
  const { openBookmarkTab, closeBookmarkTab, isBookmarkLoaded, isBookmarkAudible, isBookmarkActive, getActiveItemKey, getBookmarkLiveTitle, deassociateBookmarkTab, getTabIdForBookmark } = useBookmarkTabsContext();
  const { spaces, updateSpace, windowId } = useSpacesContext();

  // Build lookup: folderId → Space (only when in "All" space)
  const folderIdToSpace = useMemo(() =>
  {
    if (activeSpace?.id !== 'all') return new Map<string, Space>();

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
  }, [activeSpace?.id, spaces, findFolderByPath]);

  // Lookup function to get matching Space for a folder
  const getMatchingSpace = useCallback((folderId: string): Space | undefined =>
  {
    return folderIdToSpace.get(folderId);
  }, [folderIdToSpace]);

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
      const tab = await chrome.tabs.create({ url: bookmark.url, active: false, windowId: windowId ?? undefined });
      if (tab.id) createdTabIds.push(tab.id);
    }

    if (createdTabIds.length > 0)
    {
      const groupId = await chrome.tabs.group({
        tabIds: createdTabIds,
        createProperties: windowId ? { windowId } : undefined
      });
      await chrome.tabGroups.update(groupId, {
        title: folderName,
        color: getRandomGroupColor()
      });
      // Activate the first tab in the group
      await chrome.tabs.update(createdTabIds[0], { active: true });
      onShowToast?.(`Opened ${createdTabIds.length} tabs as "${folderName}"`);
    }
  }, [getAllBookmarksInFolder, onShowToast, windowId]);

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
      await chrome.tabs.create({ url: bookmark.url, active: false, windowId: windowId ?? undefined });
    }
    onShowToast?.(`Opened ${bookmarksList.length} tabs`);
  }, [getAllBookmarksInFolder, onShowToast, windowId]);

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
  const [expandedStateLoaded, setExpandedStateLoaded] = useState(false);
  const [editingNode, setEditingNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);
  const [creatingBookmarkParentId, setCreatingBookmarkParentId] = useState<string | null>(null);
  const [showSpaceFolderPicker, setShowSpaceFolderPicker] = useState(false);
  const [moveToSpaceDialog, setMoveToSpaceDialog] = useState<{
    isOpen: boolean;
    bookmarkId: string | null;
    isMulti: boolean;
  }>({ isOpen: false, bookmarkId: null, isMulti: false });
  const [moveBookmarkDialog, setMoveBookmarkDialog] = useState<{
    isOpen: boolean;
    bookmarkId: string | null;
    isFolder: boolean;
  }>({ isOpen: false, bookmarkId: null, isFolder: false });

  // Move multiple bookmarks dialog
  const [moveMultiBookmarkDialog, setMoveMultiBookmarkDialog] = useState({
    isOpen: false
  });

  // External link drop state (for web page link drops)
  const bookmarkContainerRef = useRef<HTMLDivElement>(null);
  const [webLinkDropTarget, setWebLinkDropTarget] = useState<ExternalDropTarget | null>(null);

  // Build flat list of visible bookmark items for selection range calculation
  const flatVisibleBookmarkItems = useMemo((): SelectionItem[] =>
  {
    const items: SelectionItem[] = [];
    let index = 0;

    const flattenNode = (node: chrome.bookmarks.BookmarkTreeNode, isExpanded: boolean) =>
    {
      const isFolder = !node.url;
      const isSpecialFolder = SPECIAL_FOLDER_IDS.includes(node.id);

      // Add non-special items to the list
      if (!isSpecialFolder)
      {
        items.push({
          id: node.id,
          type: isFolder ? 'folder' : 'bookmark',
          index: index++
        });
      }

      // Include children if folder is expanded (even for special folders)
      if (isFolder && isExpanded && node.children)
      {
        for (const child of node.children)
        {
          flattenNode(child, !!expandedState[child.id]);
        }
      }
    };

    for (const bookmark of visibleBookmarks)
    {
      flattenNode(bookmark, !!expandedState[bookmark.id]);
    }

    return items;
  }, [visibleBookmarks, expandedState]);

  // Get items in range for shift-click selection
  const getBookmarkItemsInRange = useCallback((startIndex: number, endIndex: number): SelectionItem[] =>
  {
    return flatVisibleBookmarkItems.filter(item => item.index >= startIndex && item.index <= endIndex);
  }, [flatVisibleBookmarkItems]);

  // Selection hook
  const {
    isSelected: isBookmarkSelected,
    handleClick: handleSelectionClick,
    handleContextMenu: handleSelectionContextMenu,
    selectionCount,
    getSelectedItems,
    clearSelection,
  } = useSelection({
    section: 'bookmarks',
    getItemsInRange: getBookmarkItemsInRange
  });

  // Load expanded state from session storage on mount
  useEffect(() =>
  {
    if (!windowId) return;

    const spaceId = activeSpace?.id || 'all';
    const storageKey = getExpandedStateKey(windowId, spaceId);
    chrome.storage.session.get(storageKey, (result) =>
    {
      if (result[storageKey])
      {
        setExpandedState(result[storageKey]);
      }
      setExpandedStateLoaded(true);
    });
  }, [windowId, activeSpace?.id]);

  // Save expanded state to session storage on change (debounced)
  useEffect(() =>
  {
    if (!windowId || !expandedStateLoaded) return;

    const spaceId = activeSpace?.id || 'all';
    const timeoutId = setTimeout(() =>
    {
      const storageKey = getExpandedStateKey(windowId, spaceId);
      chrome.storage.session.set({ [storageKey]: expandedState });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [expandedState, windowId, expandedStateLoaded, activeSpace?.id]);

  // Auto-expand space folder when it changes (wait for loaded state)
  useEffect(() =>
  {
    if (!expandedStateLoaded || !spaceFolder) return;

    setExpandedState(prev =>
    {
      // Respect saved state (expanded or collapsed)
      if (spaceFolder.id in prev) return prev;
      // No saved state - auto-expand
      return { ...prev, [spaceFolder.id]: true };
    });
  }, [spaceFolder?.id, expandedStateLoaded]);

  // Auto-expand and scroll to active bookmark when it changes
  const prevActiveItemKeyRef = useRef<string | null>(null);
  useEffect(() =>
  {
    const activeItemKey = getActiveItemKey();
    // Only handle bookmark keys (not pinned sites)
    if (activeItemKey?.startsWith('bookmark-') && activeItemKey !== prevActiveItemKeyRef.current)
    {
      prevActiveItemKeyRef.current = activeItemKey;
      const bookmarkId = activeItemKey.replace('bookmark-', '');

      // Walk up parentId chain to collect ancestor folder IDs, then expand and scroll
      (async () =>
      {
        const ancestorIds: string[] = [];
        let currentId: string | undefined = bookmarkId;

        while (currentId)
        {
          try
          {
            const results: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.get(currentId as string);
            const node = results[0];
            if (!node?.parentId || node.parentId === '0') break;
            currentId = node.parentId;
            ancestorIds.push(node.parentId);
          }
          catch
          {
            break;
          }
        }

        // Expand any collapsed ancestor folders
        if (ancestorIds.length > 0)
        {
          setExpandedState(prev =>
          {
            const allExpanded = ancestorIds.every(id => prev[id]);
            if (allExpanded) return prev;
            const next = { ...prev };
            for (const id of ancestorIds) { next[id] = true; }
            return next;
          });
        }

        // Scroll after DOM updates from expansion (skip if scroll position is being restored)
        if (!suppressAutoScrollRef?.current)
        {
          scrollToBookmark(bookmarkId, 150);
        }
      })();
    }
    else if (!activeItemKey?.startsWith('bookmark-'))
    {
      // Reset ref when not a bookmark
      prevActiveItemKeyRef.current = null;
    }
  }, [getActiveItemKey]);

  // Unified DnD context
  const {
    activeId: unifiedActiveId,
    activeDragData,
    overId,
    dropPosition,
    isMultiDrag,
    setAutoExpandTimer,
    clearAutoExpandTimer,
    registerDropHandler,
    unregisterDropHandler,
    registerDragItemsProvider,
    unregisterDragItemsProvider,
    setWasValidDrop,
    setMultiDragInfo,
  } = useUnifiedDnd();

  // Map unified activeId to local activeId (strip 'bookmark-' prefix if present)
  const activeId = useMemo(() =>
  {
    if (typeof unifiedActiveId === 'string' && unifiedActiveId.startsWith('bookmark-'))
    {
      return unifiedActiveId.replace('bookmark-', '');
    }
    return null;
  }, [unifiedActiveId]);

  // Map unified overId to dropTargetId (strip 'bookmark-' prefix if present)
  const dropTargetId = useMemo(() =>
  {
    if (typeof overId === 'string' && overId.startsWith('bookmark-'))
    {
      return overId.replace('bookmark-', '');
    }
    return null;
  }, [overId]);

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
    let position = calculateDropPosition(targetElement, x, y, isFolder);
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

  // Set up external link drop handling (web page links)
  useExternalLinkDrop({
    containerRef: bookmarkContainerRef,
    resolveBookmarkDropTarget,
    onDropTargetChange: setWebLinkDropTarget,
    getBookmark,
    expandedState,
    setExpandedState,
  });

  // Merge external drop targets: tab drops (from parent) OR web link drops (from this hook)
  const effectiveExternalDropTarget = externalDropTarget || webLinkDropTarget;

  // Sensors are now configured in UnifiedDndContext

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

  const handleCreateBookmark = (parentId: string) => {
    setCreatingBookmarkParentId(parentId);
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
    setMoveToSpaceDialog({ isOpen: true, bookmarkId, isMulti: false });
  }, []);

  const openMoveSelectedToSpaceDialog = useCallback(() =>
  {
    setMoveToSpaceDialog({ isOpen: true, bookmarkId: null, isMulti: true });
  }, []);

  const closeMoveToSpaceDialog = useCallback(() =>
  {
    setMoveToSpaceDialog({ isOpen: false, bookmarkId: null, isMulti: false });
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
  const handleMoveBookmarkToFolder = useCallback(async (folderId: string) =>
  {
    if (moveBookmarkDialog.bookmarkId)
    {
      await moveBookmark(moveBookmarkDialog.bookmarkId, folderId, 'into');
    }
    closeMoveBookmarkDialog();
  }, [moveBookmarkDialog.bookmarkId, moveBookmark, closeMoveBookmarkDialog]);

  // Delete selected bookmarks (or single bookmark if not in selection)
  const handleDeleteSelectedBookmarks = useCallback((clickedBookmarkId: string) =>
  {
    const selectedItems = getSelectedItems();
    const ids = selectedItems.length > 1
      ? selectedItems.map(item => item.id)
      : [clickedBookmarkId];

    const action = new DeleteBookmarkAction(ids, getTabIdForBookmark);

    if (onPerformAction)
    {
      onPerformAction(action);
    }
    else
    {
      // Fallback: execute without undo support
      action.do();
    }

    if (selectedItems.length > 1)
    {
      clearSelection();
    }
  }, [getSelectedItems, onPerformAction, clearSelection, getTabIdForBookmark]);

  // Pin selected bookmarks (or single if not multi-selected)
  const handlePinSelectedBookmarks = useCallback((
    clickedUrl: string,
    clickedTitle: string,
    clickedFaviconUrl?: string
  ) =>
  {
    if (!onPin) return;

    const selectedItems = getSelectedItems();
    if (selectedItems.length > 1 && onPinMultiple)
    {
      // Multiple selected - pin all bookmarks (not folders)
      const pins = selectedItems
        .filter(item => item.type === 'bookmark')
        .map(item => findNode(item.id))
        .filter((node): node is chrome.bookmarks.BookmarkTreeNode => !!node && !!node.url)
        .map(node => ({
          url: node.url!,
          title: node.title || node.url!,
          faviconUrl: getFaviconUrl(node.url!),
        }));
      onPinMultiple(pins);
      clearSelection();
    }
    else
    {
      onPin(clickedUrl, clickedTitle, clickedFaviconUrl);
    }
  }, [onPin, onPinMultiple, getSelectedItems, findNode, clearSelection]);

  // Collect all URLs from selected bookmarks and folders (including folder contents)
  const collectSelectedBookmarkUrls = useCallback(async (): Promise<string[]> =>
  {
    const selectedItems = getSelectedItems();
    const urls: string[] = [];

    for (const item of selectedItems)
    {
      if (item.type === 'bookmark')
      {
        const node = findNode(item.id);
        if (node?.url) urls.push(node.url);
      }
      else if (item.type === 'folder')
      {
        const folderBookmarks = await getAllBookmarksInFolder(item.id);
        urls.push(...folderBookmarks.map(b => b.url));
      }
    }

    return urls;
  }, [getSelectedItems, findNode, getAllBookmarksInFolder]);

  // Open selected bookmarks in new tabs (or single if not multi-selected)
  const handleOpenSelectedInNewTabs = useCallback(async (clickedUrl: string) =>
  {
    const selectedItems = getSelectedItems();
    if (selectedItems.length > 1)
    {
      // Multiple selected - open all bookmarks and folder contents
      const urls = await collectSelectedBookmarkUrls();

      urls.forEach(url =>
      {
        chrome.tabs.create({ url, windowId: windowId ?? undefined });
        // chrome.tabs.create({ url }, (tab) =>
        // {
        //   if (tab?.id) chrome.tabs.ungroup(tab.id);
        // });
      });
      clearSelection();
    }
    else
    {
      // Single bookmark
      chrome.tabs.create({ url: clickedUrl, windowId: windowId ?? undefined });
      // chrome.tabs.create({ url: clickedUrl }, (tab) =>
      // {
      //   //if (tab?.id) chrome.tabs.ungroup(tab.id);
      // });
    }
  }, [getSelectedItems, collectSelectedBookmarkUrls, clearSelection, windowId]);

  // Open selected bookmarks in new window (or single if not multi-selected)
  const handleOpenSelectedInNewWindow = useCallback(async (clickedUrl: string) =>
  {
    const selectedItems = getSelectedItems();
    if (selectedItems.length > 1)
    {
      // Multiple selected - open all bookmarks and folder contents in one new window
      const urls = await collectSelectedBookmarkUrls();

      if (urls.length > 0)
      {
        chrome.windows.create({ url: urls });
      }
      clearSelection();
    }
    else
    {
      // Single bookmark
      chrome.windows.create({ url: clickedUrl });
    }
  }, [getSelectedItems, collectSelectedBookmarkUrls, clearSelection]);

  // Open move dialog for selected bookmarks
  const openMoveSelectedBookmarksDialog = useCallback(() =>
  {
    setMoveMultiBookmarkDialog({ isOpen: true });
  }, []);

  // Handle moving selected bookmarks to a folder
  const handleMoveSelectedBookmarksToFolder = useCallback(async (folderId: string) =>
  {
    const selectedItems = getSelectedItems();

    // Filter out descendants of selected folders (they move with parent)
    const selectedFolderIds = selectedItems
      .filter(item => item.type === 'folder')
      .map(item => item.id);

    const itemsToMove = selectedItems.filter(item =>
    {
      // For both folders and bookmarks, check if any selected folder is an ancestor
      for (const selectedFolderId of selectedFolderIds)
      {
        if (selectedFolderId === item.id) continue;
        if (isDescendant(selectedFolderId, item.id, bookmarks))
        {
          return false;
        }
      }
      return true;
    });

    // Move items in order
    for (const item of itemsToMove)
    {
      await moveBookmark(item.id, folderId, 'into');
    }

    clearSelection();
    setMoveMultiBookmarkDialog({ isOpen: false });
  }, [getSelectedItems, bookmarks, moveBookmark, clearSelection]);

  // Handle moving bookmark to a space's folder
  // Returns error message if failed, undefined if successful
  const handleMoveBookmarkToSpace = useCallback(async (spaceId: string): Promise<string | void> =>
  {
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

    if (moveToSpaceDialog.isMulti)
    {
      await handleMoveSelectedBookmarksToFolder(folder.id);
      onShowToast?.(`Moved selection to ${space.name}`);
    }
    else
    {
      const bookmarkId = moveToSpaceDialog.bookmarkId;
      if (!bookmarkId) return 'No bookmark selected';

      try
      {
        await moveBookmark(bookmarkId, folder.id, 'into');
        onShowToast?.(`Moved to ${space.name}. New location: ${space.bookmarkFolderPath}`);
      }
      catch (err)
      {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return `Failed to move bookmark: ${message}`;
      }
    }
  }, [moveToSpaceDialog.bookmarkId, moveToSpaceDialog.isMulti, spaces, findFolderByPath,
    handleMoveSelectedBookmarksToFolder, moveBookmark, onShowToast]);

  // Check if selection has any bookmarks (vs only folders)
  const hasSelectedBookmarks = useCallback((): boolean =>
  {
    const selectedItems = getSelectedItems();
    return selectedItems.some(item => item.type === 'bookmark');
  }, [getSelectedItems]);

  // Check if ALL selected items are "live" bookmarks (have open tabs)
  const areAllSelectedBookmarksLive = useCallback((): boolean =>
  {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) return false;

    // Only check bookmark items (not folders), and they must all be loaded
    const bookmarkItems = selectedItems.filter(item => item.type === 'bookmark');
    if (bookmarkItems.length === 0) return false;
    if (bookmarkItems.length !== selectedItems.length) return false; // Has folders

    return bookmarkItems.every(item => isBookmarkLoaded(item.id));
  }, [getSelectedItems, isBookmarkLoaded]);

  // Close tabs for all selected bookmarks
  const handleCloseSelectedBookmarks = useCallback(() =>
  {
    const selectedItems = getSelectedItems();
    for (const item of selectedItems)
    {
      if (item.type === 'bookmark')
      {
        closeBookmarkTab(item.id);
      }
    }
    clearSelection();
  }, [getSelectedItems, closeBookmarkTab, clearSelection]);

  // Copy single URL to clipboard
  const handleCopyUrl = useCallback(async (url: string) =>
  {
    await navigator.clipboard.writeText(url);
  }, []);

  // Copy URLs of all selected bookmarks to clipboard
  const handleCopyUrls = useCallback(async () =>
  {
    const selectedItems = getSelectedItems();
    const urls: string[] = [];
    for (const item of selectedItems)
    {
      if (item.type === 'bookmark')
      {
        const node = findNode(item.id);
        if (node?.url) urls.push(node.url);
      }
    }
    if (urls.length > 0)
    {
      await navigator.clipboard.writeText(urls.join('\n'));
    }
  }, [getSelectedItems, findNode]);

  // Update multi-drag info when bookmark drag starts
  useEffect(() =>
  {
    if (activeDragData && hasFormat(activeDragData, DragFormat.BOOKMARK) && activeId)
    {
      if (isBookmarkSelected(activeId))
      {
        const selectedItems = getSelectedItems();
        setMultiDragInfo(selectedItems.length);
      }
      else
      {
        clearSelection();
        setMultiDragInfo(1);
      }
    }
  }, [activeDragData, activeId, isBookmarkSelected, getSelectedItems, clearSelection, setMultiDragInfo]);

  // Drop handler for bookmarkTree zone
  const handleBookmarkDrop: DropHandler = useCallback(async (
    dragData: DragData,
    dropData: DropData,
    position: DropPosition,
    acceptedFormat: DragFormat
  ) =>
  {
    if (!position || !dropData.targetId) return;

    try
    {
      const targetId = dropData.targetId;

      switch (acceptedFormat)
      {
        case DragFormat.BOOKMARK:
        {
          // Bookmark reordering
          const primaryItem = getPrimaryItem(dragData);
          if (!primaryItem?.bookmark) return;
          const sourceId = primaryItem.bookmark.bookmarkId;

          // Validation: Can't drop folder into its own descendants
          if (isDescendant(sourceId, targetId, bookmarks))
          {
            return;
          }

          // Can't move special folders
          if (SPECIAL_FOLDER_IDS.includes(sourceId))
          {
            return;
          }

          // Space boundary validation
          if (spaceFolder && targetId === spaceFolder.id && position === 'before')
          {
            return;
          }

          // Get items to move (handle multi-selection)
          const selectedItems = getSelectedItems();
          const selectedIds = new Set(selectedItems.map(item => item.id));
          const idsToMove = selectedIds.has(sourceId) && selectedIds.size >= 1
            ? Array.from(selectedIds)
            : [sourceId];

          // Get bookmark info for items to sort by index
          const bookmarkInfos = await Promise.all(
            idsToMove.map(async (id) =>
            {
              const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) =>
              {
                chrome.bookmarks.get(id, (res) => resolve(res || []));
              });
              return results[0] || null;
            })
          );

          // Filter out nulls and sort by index
          const validBookmarks = bookmarkInfos.filter((b): b is chrome.bookmarks.BookmarkTreeNode => b !== null);
          validBookmarks.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

          // Filter out descendants of selected folders
          const selectedFolderIds = validBookmarks
            .filter(b => !b.url)
            .map(b => b.id);

          const bookmarksToMove = validBookmarks.filter(bookmark =>
          {
            for (const folderId of selectedFolderIds)
            {
              if (folderId === bookmark.id) continue;
              if (isDescendant(folderId, bookmark.id, bookmarks))
              {
                return false;
              }
            }
            return true;
          });

          // Move items
          let lastMoved: chrome.bookmarks.BookmarkTreeNode | null = null;
          for (const bookmark of bookmarksToMove)
          {
            if (!lastMoved)
            {
              lastMoved = await moveBookmark(bookmark.id, targetId, position);
            }
            else
            {
              lastMoved = await moveBookmark(bookmark.id, lastMoved.id, 'after');
            }
          }

          // Auto-expand folder if dropping into it
          if ((position === 'into' || position === 'intoFirst') && !expandedState[targetId])
          {
            setExpandedState(prev => ({ ...prev, [targetId]: true }));
          }

          // Clear selection if more than 1 item was moved
          if (bookmarksToMove.length > 1)
          {
            clearSelection();
          }

          setWasValidDrop(true);
          break;
        }

        case DragFormat.URL:
        {
          // URL dropped on bookmark tree - create bookmarks for all URLs
          const urlItems = getItemsByFormat(dragData, DragFormat.URL);
          if (urlItems.length === 0) return;

          let parentId: string;
          let index: number | undefined;

          if (position === 'into' && dropData.isFolder)
          {
            parentId = targetId;
            const children = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) =>
            {
              chrome.bookmarks.getChildren(targetId, (res) => resolve(res || []));
            });
            index = children.length;
          }
          else if (position === 'intoFirst')
          {
            parentId = targetId;
            index = 0;
          }
          else
          {
            const targetBookmark = await getBookmark(targetId);
            if (targetBookmark?.parentId !== undefined && targetBookmark.index !== undefined)
            {
              parentId = targetBookmark.parentId;
              index = position === 'before' ? targetBookmark.index : targetBookmark.index + 1;
            }
            else
            {
              parentId = targetId;
            }
          }

          // Create bookmark for each URL, incrementing index to maintain order
          for (const item of urlItems)
          {
            if (item.url)
            {
              await createBookmark(parentId, item.url.title || item.url.url, item.url.url, index);
              if (index !== undefined) index++;
            }
          }
          setWasValidDrop(true);
          break;
        }

        case DragFormat.TAB_GROUP:
        {
          // Tab group dropped - create folder with all group's tabs as bookmarks
          const primaryItem = getPrimaryItem(dragData);
          if (!primaryItem?.tabGroup) return;

          const groupId = primaryItem.tabGroup.groupId;
          const folderName = primaryItem.tabGroup.title || 'Unnamed Group';

          // Get tabs in the group
          const groupTabs = await chrome.tabs.query({ groupId });

          // Determine where to create the folder
          let parentId: string;
          let index: number | undefined;

          if (position === 'into' && dropData.isFolder)
          {
            parentId = targetId;
            const children = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) =>
            {
              chrome.bookmarks.getChildren(targetId, (res) => resolve(res || []));
            });
            index = children.length;
          }
          else if (position === 'intoFirst')
          {
            parentId = targetId;
            index = 0;
          }
          else
          {
            const targetBookmark = await getBookmark(targetId);
            if (targetBookmark?.parentId !== undefined && targetBookmark.index !== undefined)
            {
              parentId = targetBookmark.parentId;
              index = position === 'before' ? targetBookmark.index : targetBookmark.index + 1;
            }
            else
            {
              parentId = targetId;
            }
          }

          // Use shared utility to save tab group as bookmark folder
          const result = await saveTabGroupAsBookmarkFolder(parentId, folderName, groupTabs, index);
          if (result.success)
          {
            setWasValidDrop(true);
          }
          break;
        }
      }
    }
    catch (error)
    {
      console.error('Bookmark drop operation failed:', error);
    }
  }, [bookmarks, spaceFolder, getSelectedItems, moveBookmark, expandedState, setExpandedState,
    clearSelection, setWasValidDrop, getBookmark, createBookmark]);

  // Register drop handler
  useEffect(() =>
  {
    registerDropHandler('bookmarkTree', handleBookmarkDrop);
    return () => unregisterDropHandler('bookmarkTree');
  }, [registerDropHandler, unregisterDropHandler, handleBookmarkDrop]);

  // Helper to find a bookmark node by ID in the tree
  const findBookmarkById = useCallback((
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    id: string
  ): chrome.bookmarks.BookmarkTreeNode | null =>
  {
    for (const node of nodes)
    {
      if (node.id === id) return node;
      if (node.children)
      {
        const found = findBookmarkById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Drag items provider - builds multi-item DragData from selection
  const getDragItems = useCallback((draggedId: string | number): DragItem[] =>
  {
    const selectedItems = getSelectedItems();
    const draggedIdStr = String(draggedId).replace('bookmark-', '');

    // Check if dragged item is in selection
    const isInSelection = selectedItems.some(item => item.id === draggedIdStr);

    if (isInSelection && selectedItems.length > 1)
    {
      // Multi-drag: build DragItems for all selected
      return selectedItems
        .map(item =>
        {
          const node = findBookmarkById(bookmarks, item.id);
          if (node)
          {
            return createBookmarkDragItem(
              node.id,
              !node.url,  // isFolder
              node.title,
              node.url,
              node.parentId
            );
          }
          return null;
        })
        .filter((item): item is DragItem => item !== null);
    }

    // Single drag: return empty array to use fallback from useDraggable data
    return [];
  }, [getSelectedItems, bookmarks, findBookmarkById]);

  // Register drag items provider for bookmarkTree zone
  useEffect(() =>
  {
    registerDragItemsProvider('bookmarkTree', getDragItems);
    return () => unregisterDragItemsProvider('bookmarkTree');
  }, [registerDragItemsProvider, unregisterDragItemsProvider, getDragItems]);

  // Auto-expand collapsed folders when hovering over them during internal DnD
  useEffect(() =>
  {
    // Only handle bookmark IDs - don't interfere with other zones' timers
    const isBookmarkZoneId = typeof overId === 'string' && overId.startsWith('bookmark-');

    if (!overId || !dropPosition)
    {
      // Only clear timer if we were handling a bookmark zone ID (or no ID at all)
      if (!overId || isBookmarkZoneId)
      {
        clearAutoExpandTimer();
      }
      return;
    }

    // Ignore IDs from other zones
    if (!isBookmarkZoneId)
    {
      return;
    }

    // Check if hovering over a collapsed folder with 'into' position
    // overId format for bookmarks: "bookmark-{id}"
    const bookmarkId = overId.replace('bookmark-', '');
    const node = findNode(bookmarkId);

    // Check if it's a folder (has children array or no url)
    const isFolder = node && (node.children !== undefined || !node.url);
    const isExpanded = expandedState[bookmarkId];

    if (isFolder && !isExpanded && dropPosition === 'into')
    {
      setAutoExpandTimer(overId, () =>
      {
        setExpandedState(prev => prev[bookmarkId] ? prev : { ...prev, [bookmarkId]: true });
      });
      return;
    }

    clearAutoExpandTimer();
  }, [overId, dropPosition, expandedState, findNode, setAutoExpandTimer, clearAutoExpandTimer, setExpandedState]);

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
      <div ref={bookmarkContainerRef} data-dnd-zone="bookmarkTree">
        {visibleBookmarks.map((node) =>
        {
          const itemIndex = flatVisibleBookmarkItems.findIndex(i => i.id === node.id);
          const selectionItem: SelectionItem = {
            id: node.id,
            type: !node.url ? 'folder' : 'bookmark',
            index: itemIndex
          };
          return (
            <BookmarkItem
              key={node.id}
              node={node}
              depth={0}
              expandedState={expandedState}
              toggleFolder={toggleFolder}
              onRemove={handleDeleteSelectedBookmarks}
              onEdit={setEditingNode}
              onCreateFolder={handleCreateFolder}
              onCreateBookmark={handleCreateBookmark}
              onSort={sortBookmarks}
              onDuplicate={duplicateBookmark}
              onExpandAll={handleExpandAll}
              onPin={handlePinSelectedBookmarks}
              globalDragActive={!!unifiedActiveId}
              isMultiDrag={isMultiDrag}
              activeId={activeId}
              dropTargetId={dropTargetId}
              dropPosition={dropPosition}
              bookmarkOpenMode={bookmarkOpenMode}
              arcSingleClickOpensTab={arcSingleClickOpensTab}
              isLoaded={isBookmarkLoaded(node.id)}
              isAudible={isBookmarkAudible(node.id)}
              isActive={isBookmarkActive(node.id)}
              liveTitle={getBookmarkLiveTitle(node.id)}
              isSelected={isBookmarkSelected(node.id)}
              checkIsLoaded={isBookmarkLoaded}
              checkIsAudible={isBookmarkAudible}
              checkIsActive={isBookmarkActive}
              getLiveTitle={getBookmarkLiveTitle}
              onOpenBookmark={(bookmarkId, url) => openBookmarkTab(bookmarkId, url, activeSpace?.id)}
              onCloseBookmark={closeBookmarkTab}
              onOpenAsTabGroup={!useSpaces ? handleOpenAsTabGroup : undefined}
              onOpenAllTabs={handleOpenAllTabs}
              onOpenAllTabsInNewWindow={handleOpenAllTabsInNewWindow}
              onMoveToSpace={useSpaces ? openMoveToSpaceDialog : undefined}
              onMoveToTabs={deassociateBookmarkTab}
              onMoveBookmark={openMoveBookmarkDialog}
              getMatchingSpace={getMatchingSpace}
              externalDropTarget={effectiveExternalDropTarget}
              onSelectionClick={(e) => handleSelectionClick(selectionItem, e)}
              onSelectionContextMenu={() => handleSelectionContextMenu(selectionItem)}
              selectionCount={selectionCount}
              checkIsSelected={isBookmarkSelected}
              getSelectionItem={(id, isFolder) =>
              {
                const idx = flatVisibleBookmarkItems.findIndex(i => i.id === id);
                return { id, type: isFolder ? 'folder' : 'bookmark', index: idx };
              }}
              onChildSelectionClick={handleSelectionClick}
              onChildSelectionContextMenu={handleSelectionContextMenu}
              onOpenInNewTabs={handleOpenSelectedInNewTabs}
              onOpenInNewWindow={handleOpenSelectedInNewWindow}
              onMoveSelectedBookmarks={openMoveSelectedBookmarksDialog}
              onMoveSelectedToSpace={useSpaces ? openMoveSelectedToSpaceDialog : undefined}
              hasSelectedBookmarks={hasSelectedBookmarks()}
              allSelectedAreLive={areAllSelectedBookmarksLive()}
              onCloseSelectedBookmarks={handleCloseSelectedBookmarks}
              onCopyUrl={handleCopyUrl}
              onCopyUrls={handleCopyUrls}
              windowId={windowId ?? undefined}
            />
          );
        })}

        {/* Empty filter results message */}
        {hasFilters && !hasVisibleBookmarks && (
          <div className="p-4 text-gray-500 dark:text-gray-400 text-center">
            {filterText.trim()
              ? `No bookmarks match "${filterText}"`
              : 'No loaded tabs found'}
          </div>
        )}

      </div>

      {/* Error message */}
      {error && (
        <p className="text-red-500 text-sm px-2 py-1 text-center">{error}</p>
      )}

      {/* Separator - only show when there are visible bookmarks */}
      {hasVisibleBookmarks && (
        <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
      )}

      <BookmarkEditModal
        isOpen={editingNode !== null || creatingBookmarkParentId !== null}
        node={editingNode}
        createInParentId={creatingBookmarkParentId}
        onSave={updateBookmark}
        onCreate={async (parentId, title, url) => {
          const { node: newNode, error } = await createBookmark(parentId, title, url);
          if (error)
          {
            return error;  // Return error to modal for display
          }
          if (newNode)
          {
            // Auto-expand parent folder to show the new bookmark
            setExpandedState(prev => ({ ...prev, [parentId]: true }));
            // Scroll to the new bookmark after DOM updates
            scrollToBookmark(newNode.id);
          }
          return null;  // Success
        }}
        onClose={() => {
          setEditingNode(null);
          setCreatingBookmarkParentId(null);
        }}
      />

      <BookmarkCreateFolderModal
        isOpen={creatingFolderParentId !== null}
        parentId={creatingFolderParentId}
        onSave={(parentId, title) => {
          createFolder(parentId, title, (newNode) => {
            // Auto-expand parent folder to show the new folder
            setExpandedState(prev => ({ ...prev, [parentId]: true }));
            // Scroll to the new folder after DOM updates
            scrollToBookmark(newNode.id);
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

      <FolderPickerDialog
        isOpen={moveMultiBookmarkDialog.isOpen}
        title="Move to..."
        onSelect={handleMoveSelectedBookmarksToFolder}
        onClose={() => setMoveMultiBookmarkDialog({ isOpen: false })}
      />

    </>
  );
};
