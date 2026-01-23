import React, { useState, useCallback, useRef, useEffect, forwardRef, useMemo } from 'react';
import { useBookmarks, SortOption } from '../hooks/useBookmarks';
import { Space, useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { SelectionItem } from '../contexts/SelectionContext';
import { useSelection } from '../hooks/useSelection';
import { FolderPickerDialog } from './FolderPickerDialog';
import { SpaceNavigatorDialog } from './SpaceNavigatorDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { useDragDrop } from '../hooks/useDragDrop';
import { useExternalLinkDrop } from '../hooks/useExternalLinkDrop';
import { getIndentPadding } from '../utils/indent';
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
  SquareArrowOutUpRight
} from 'lucide-react';
import { getRandomGroupColor, GROUP_COLORS } from '../utils/groupColors';
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

// Storage key for persisting folder expand/collapse state
const getExpandedStateKey = (windowId: number) => `bookmarkExpandedState_${windowId}`;

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
  hasSelectedBookmarks?: boolean;
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
  onMoveToSpace: _onMoveToSpace,
  onMoveBookmark,
  externalDropTarget,
  onSelectionClick,
  onSelectionContextMenu,
  selectionCount,
  onOpenInNewTabs,
  onOpenInNewWindow,
  onMoveSelectedBookmarks,
  hasSelectedBookmarks,
  attributes,
  listeners
}, ref) => {
  const isFolder = !node.url;
  const isSpecialFolder = SPECIAL_FOLDER_IDS.includes(node.id);

  const isBeingDragged = activeId === node.id && !isMultiDrag;
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

    // Always update selection state on click
    onSelectionClick?.(e);

    // For modifier clicks (Ctrl/Cmd/Shift), only update selection, don't perform action
    if (e.metaKey || e.ctrlKey || e.shiftKey)
    {
      return;
    }

    // Plain click: perform action for bookmarks (folders only expand/collapse via chevron)
    // Arc mode: if bookmark has a live tab, activate it
    if (node.url && bookmarkOpenMode === 'arc' && isLoaded && onOpenBookmark)
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
        chrome.tabs.create({ url: node.url, active: true });
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
              chrome.tabs.create({ url: node.url!, active: true });
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
              title={bookmarkOpenMode === 'arc' && isLoaded && liveTitle ? `${node.title} - ${liveTitle}` : node.title}
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
                <>
                  <ContextMenu.Item onSelect={() => onPin(node.url || '', node.title, node.url ? getFaviconUrl(node.url) : undefined)}>
                    <Pin size={14} className="mr-2" /> Pin to Sidebar
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                </>
              )}
              <ContextMenu.Item onSelect={() => onOpenInNewTabs?.(node.url || '')}>
                <ExternalLink size={14} className="mr-2" /> Open in New Tabs
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onOpenInNewWindow?.(node.url || '')}>
                <ExternalLink size={14} className="mr-2" /> Open in New Window
              </ContextMenu.Item>
              {onMoveSelectedBookmarks && (
                <ContextMenu.Item onSelect={onMoveSelectedBookmarks}>
                  <FolderInput size={14} className="mr-2" /> Move Bookmarks...
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
              <ContextMenu.Item danger onSelect={() => onRemove(node.id)}>
                <Trash size={14} className="mr-2" /> Delete
              </ContextMenu.Item>
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

              {/* 2026-01-18 mone: disabled "Move to Space". It is confusing. also we have Move folder... which does
              almost the same thing.
                {onMoveToSpace && (
                <ContextMenu.Item onSelect={() => onMoveToSpace(node.id)}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )} */}
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
              <ContextMenu.Item onSelect={() => onOpenInNewTabs?.(node.url!)}>
                <ExternalLink size={14} className="mr-2" /> Open in New Tab
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onOpenInNewWindow?.(node.url!)}>
                <ExternalLink size={14} className="mr-2" /> Open in New Window
              </ContextMenu.Item>
              {/* 2026-01-18 mone: disabled "Move to Space". It is confusing. also we have Move folder... which does
              almost the same thing.
              {onMoveToSpace && (
                <ContextMenu.Item onSelect={() => onMoveToSpace(node.id)}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )} */}
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

// Multi-bookmark drag overlay - shows stacked bookmarks for multi-selection drag
interface MultiBookmarkDragOverlayProps {
  nodes: chrome.bookmarks.BookmarkTreeNode[];
}

const MultiBookmarkDragOverlay = ({ nodes }: MultiBookmarkDragOverlayProps) =>
{
  // Show up to 3 stacked layers
  const maxVisible = 3;
  const visibleNodes = nodes.slice(0, maxVisible);
  const firstNode = visibleNodes[0];
  const isFolder = firstNode && !firstNode.url;

  const icon = isFolder ? (
    <Folder size={16} className="text-gray-500" />
  ) : firstNode?.url ? (
    <img
      src={getFaviconUrl(firstNode.url)}
      alt=""
      className="w-4 h-4"
    />
  ) : (
    <Globe size={16} className="text-gray-500" />
  );

  return (
    <div className="relative pointer-events-none">
      {/* Stacked background layers (shown in reverse order for proper z-indexing) */}
      {visibleNodes.length > 2 && (
        <div
          className="absolute w-full h-7 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800"
          style={{ top: 12, left: 12 }}
        />
      )}
      {visibleNodes.length > 1 && (
        <div
          className="absolute w-full h-7 bg-blue-100 dark:bg-blue-900/70 rounded border border-blue-200 dark:border-blue-700"
          style={{ top: 6, left: 6 }}
        />
      )}
      {/* Front bookmark with content */}
      <div className="relative bg-blue-100 dark:bg-blue-900/50 rounded border border-blue-300 dark:border-blue-600">
        {firstNode && (
          <TreeRow
            depth={0}
            title={firstNode.title}
            icon={icon}
            hasChildren={isFolder}
            badges={
              <span className="text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded-full">
                {nodes.length} items
              </span>
            }
          />
        )}
      </div>
    </div>
  );
};

interface BookmarkTreeProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  onPinMultiple?: (pins: Array<{ url: string; title: string; faviconUrl?: string }>) => void;
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

export const BookmarkTree = ({ onPin, onPinMultiple, hideOtherBookmarks = false, externalDropTarget, bookmarkOpenMode = 'arc', onResolverReady, filterLiveTabs = false, filterText = '', activeSpace, onShowToast, useSpaces = true }: BookmarkTreeProps) => {
  const { bookmarks, removeBookmark, updateBookmark, createFolder, createBookmark, sortBookmarks, moveBookmark, duplicateBookmark, findFolderByPath, getAllBookmarksInFolder, getBookmarkPath, getBookmark } = useBookmarks();
  const { openBookmarkTab, closeBookmarkTab, isBookmarkLoaded, isBookmarkAudible, isBookmarkActive, getActiveItemKey, getBookmarkLiveTitle } = useBookmarkTabsContext();
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
  const [expandedStateLoaded, setExpandedStateLoaded] = useState(false);
  const [editingNode, setEditingNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);
  const [creatingBookmarkParentId, setCreatingBookmarkParentId] = useState<string | null>(null);
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

  // Confirm delete dialog for multi-delete
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState<{
    isOpen: boolean;
    bookmarkIds: string[];
  }>({ isOpen: false, bookmarkIds: [] });

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

    const storageKey = getExpandedStateKey(windowId);
    chrome.storage.session.get(storageKey, (result) =>
    {
      if (result[storageKey])
      {
        setExpandedState(result[storageKey]);
      }
      setExpandedStateLoaded(true);
    });
  }, [windowId]);

  // Save expanded state to session storage on change (debounced)
  useEffect(() =>
  {
    if (!windowId || !expandedStateLoaded) return;

    const timeoutId = setTimeout(() =>
    {
      const storageKey = getExpandedStateKey(windowId);
      chrome.storage.session.set({ [storageKey]: expandedState });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [expandedState, windowId, expandedStateLoaded]);

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
  const [activeSelectedNodes, setActiveSelectedNodes] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);

  // Reset all drag state to initial values
  const resetDragState = useCallback(() =>
  {
    setActiveId(null);
    setActiveNode(null);
    setActiveDepth(0);
    setActiveSelectedNodes([]);
    setDropTargetId(null);
    setDropPosition(null);
  }, [setActiveId, setDropTargetId, setDropPosition]);

  // Ref to store the computed drag overlay offset (based on cursor position within element at drag start)
  const dragStartOffsetRef = useRef<number>(24);

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
  const handleMoveBookmarkToFolder = useCallback(async (folderId: string) =>
  {
    if (moveBookmarkDialog.bookmarkId)
    {
      await moveBookmark(moveBookmarkDialog.bookmarkId, folderId, 'into');
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

  // Delete selected bookmarks (or single bookmark if not in selection)
  const handleDeleteSelectedBookmarks = useCallback((clickedBookmarkId: string) =>
  {
    const selectedItems = getSelectedItems();
    if (selectedItems.length > 1)
    {
      // Multiple selected - show confirmation dialog
      const bookmarkIds = selectedItems.map(item => item.id);
      setConfirmDeleteDialog({ isOpen: true, bookmarkIds });
    }
    else
    {
      // Single bookmark - delete directly
      removeBookmark(clickedBookmarkId);
    }
  }, [getSelectedItems, removeBookmark]);

  // Confirm multi-delete
  const handleConfirmMultiDelete = useCallback(async () =>
  {
    for (const id of confirmDeleteDialog.bookmarkIds)
    {
      try
      {
        await chrome.bookmarks.removeTree(id);
      }
      catch
      {
        // Ignore errors (bookmark might have already been deleted if it was a child)
      }
    }
    clearSelection();
    setConfirmDeleteDialog({ isOpen: false, bookmarkIds: [] });
  }, [confirmDeleteDialog.bookmarkIds, clearSelection]);

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
        chrome.tabs.create({ url });
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
      chrome.tabs.create({ url: clickedUrl });
      // chrome.tabs.create({ url: clickedUrl }, (tab) =>
      // {
      //   //if (tab?.id) chrome.tabs.ungroup(tab.id);
      // });
    }
  }, [getSelectedItems, collectSelectedBookmarkUrls, clearSelection]);

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

  // Check if selection has any bookmarks (vs only folders)
  const hasSelectedBookmarks = useCallback((): boolean =>
  {
    const selectedItems = getSelectedItems();
    return selectedItems.some(item => item.type === 'bookmark');
  }, [getSelectedItems]);

  // Drag start handler
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Calculate overlay offset based on where user clicked in the element
    const activatorEvent = event.activatorEvent as PointerEvent;
    const rect = event.active.rect.current.initial;
    if (rect && activatorEvent)
    {
      const cursorOffsetInElement = activatorEvent.clientY - rect.top;
      // Offset = element height - cursor position + small gap (8px)
      // This keeps overlay consistently below cursor
      dragStartOffsetRef.current = rect.height - cursorOffsetInElement + 8;
    }

    const id = event.active.id as string;

    // If dragged item is NOT in selection, clear selection and reset selected nodes
    if (!isBookmarkSelected(id))
    {
      clearSelection();
      setActiveSelectedNodes([]);
    }
    else
    {
      // Dragged item IS in selection - capture all selected nodes for multi-drag overlay
      const selectedItems = getSelectedItems();
      const selectedNodes = selectedItems
        .map(item => findNode(item.id))
        .filter((node): node is chrome.bookmarks.BookmarkTreeNode => node !== null);
      setActiveSelectedNodes(selectedNodes);
    }

    setActiveId(id);
    setActiveNode(findNode(id));
    // Read depth from DOM element
    const element = document.querySelector(`[data-bookmark-id="${id}"]`);
    const depth = element?.getAttribute('data-depth');
    setActiveDepth(depth ? parseInt(depth, 10) : 0);
  }, [findNode, setActiveId, isBookmarkSelected, clearSelection, getSelectedItems]);

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

    // Space boundary validation - prevent drops outside the space
    // Can't drop 'before' the space root folder (would place outside space)
    if (spaceFolder && target.bookmarkId === spaceFolder.id && target.position === 'before')
    {
      setDropTargetId(null);
      setDropPosition(null);
      clearAutoExpandTimer();
      return;
    }

    setDropTargetId(target.bookmarkId);
    setDropPosition(target.position);
  }, [bookmarks, resolveBookmarkDropTarget, clearAutoExpandTimer, setDropTargetId, setDropPosition, spaceFolder]);

  // Drag end handler
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    clearAutoExpandTimer();

    const { active } = event;
    const sourceId = active.id as string;

    // Track if this is a valid drop (for animation decision)
    const isValidDrop = !!(dropTargetId && dropPosition);
    wasValidDropRef.current = isValidDrop;

    // Perform the move if we have a valid drop target
    if (isValidDrop) {
      // Get items to move (always an array, even if just 1 item)
      const selectedItems = getSelectedItems();
      const selectedIds = new Set(selectedItems.map(item => item.id));
      const idsToMove = selectedIds.has(sourceId) && selectedIds.size >= 1
        ? Array.from(selectedIds)
        : [sourceId];

      // Get bookmark info for items to sort by index
      const bookmarkInfos = await Promise.all(
        idsToMove.map(async (id) => {
          const results = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
            chrome.bookmarks.get(id, (res) => resolve(res || []));
          });
          return results[0] || null;
        })
      );

      // Filter out nulls and sort by index to maintain relative order
      const validBookmarks = bookmarkInfos.filter((b): b is chrome.bookmarks.BookmarkTreeNode => b !== null);
      validBookmarks.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      // Filter out bookmarks that are descendants of selected folders
      // (moving the folder will automatically move its contents)
      const selectedFolderIds = validBookmarks
        .filter(b => !b.url)  // folders have no url
        .map(b => b.id);

      const bookmarksToMove = validBookmarks.filter(bookmark =>
      {
        // For both folders and bookmarks, check if any selected folder is an ancestor
        // If so, skip this item (it will move with its parent folder)
        for (const folderId of selectedFolderIds)
        {
          // Skip checking against self
          if (folderId === bookmark.id) continue;

          if (isDescendant(folderId, bookmark.id, bookmarks))
          {
            return false;
          }
        }
        return true;
      });

      // Move items, chaining with 'after' for subsequent items
      let lastMoved: chrome.bookmarks.BookmarkTreeNode | null = null;
      for (const bookmark of bookmarksToMove)
      {
        if (!lastMoved) {
          lastMoved = await moveBookmark(bookmark.id, dropTargetId!, dropPosition!);
        } else {
          lastMoved = await moveBookmark(bookmark.id, lastMoved.id, 'after');
        }
      }

      // Auto-expand folder if dropping into it
      if ((dropPosition === 'into' || dropPosition === 'intoFirst') && !expandedState[dropTargetId!])
      {
        setExpandedState(prev => ({ ...prev, [dropTargetId!]: true }));
      }

      // Clear selection if more than 1 item was moved
      if (bookmarksToMove.length > 1)
      {
        clearSelection();
      }
    }

    // Reset drag state
    resetDragState();
  }, [dropTargetId, dropPosition, moveBookmark, expandedState, clearAutoExpandTimer, resetDragState, getSelectedItems, clearSelection, bookmarks]);

  // Drag cancel handler (e.g., Escape key)
  const handleDragCancel = useCallback(() => {
    clearAutoExpandTimer();
    wasValidDropRef.current = false;

    // Reset drag state
    resetDragState();
  }, [clearAutoExpandTimer, resetDragState]);

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
      <div ref={bookmarkContainerRef}>
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
              globalDragActive={!!activeId}
              isMultiDrag={activeSelectedNodes.length > 1}
              activeId={activeId}
              dropTargetId={dropTargetId}
              dropPosition={dropPosition}
              bookmarkOpenMode={bookmarkOpenMode}
              isLoaded={isBookmarkLoaded(node.id)}
              isAudible={isBookmarkAudible(node.id)}
              isActive={isBookmarkActive(node.id)}
              liveTitle={getBookmarkLiveTitle(node.id)}
              isSelected={isBookmarkSelected(node.id)}
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
              hasSelectedBookmarks={hasSelectedBookmarks()}
            />
          );
        })}

        {/* Drag overlay - no animation for valid drops, default animation for cancelled */}
        {/* Offset modifier so overlay appears below cursor, keeping drop indicator visible */}
        <DragOverlay
          dropAnimation={wasValidDropRef.current ? null : undefined}
          modifiers={[
            ({ transform }) => ({ ...transform, y: transform.y + dragStartOffsetRef.current }),
          ]}
        >
          {activeSelectedNodes.length > 1 ? (
            <MultiBookmarkDragOverlay nodes={activeSelectedNodes} />
          ) : activeNode ? (
            <DragOverlayContent node={activeNode} depth={activeDepth} />
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>

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
          const newNode = await createBookmark(parentId, title, url);
          if (newNode)
          {
            // Auto-expand parent folder to show the new bookmark
            setExpandedState(prev => ({ ...prev, [parentId]: true }));
            // Scroll to the new bookmark after DOM updates
            setTimeout(() => {
              const element = document.querySelector(`[data-bookmark-id="${newNode.id}"]`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
          }
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

      <FolderPickerDialog
        isOpen={moveMultiBookmarkDialog.isOpen}
        title="Move to..."
        onSelect={handleMoveSelectedBookmarksToFolder}
        onClose={() => setMoveMultiBookmarkDialog({ isOpen: false })}
      />

      <ConfirmDeleteDialog
        isOpen={confirmDeleteDialog.isOpen}
        itemCount={confirmDeleteDialog.bookmarkIds.length}
        itemType="bookmarks"
        onConfirm={handleConfirmMultiDelete}
        onClose={() => setConfirmDeleteDialog({ isOpen: false, bookmarkIds: [] })}
      />
    </>
  );
};