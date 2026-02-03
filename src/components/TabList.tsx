import { useState, useRef, useEffect, useMemo, useCallback, forwardRef } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTabGroups } from '../hooks/useTabGroups';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useSpacesContext, Space } from '../contexts/SpacesContext';
import { SelectionItem } from '../contexts/SelectionContext';
import { useSelection } from '../hooks/useSelection';
import type { DropPosition } from '../utils/dragDrop';
import { useUnifiedDnd, DropHandler } from '../contexts/UnifiedDndContext';
import { DragData, DragFormat, DragItem, DropData, createTabDragData, createTabGroupDragData, createTabDragItem, createTabGroupDragItem, acceptsFormats, getPrimaryItem, hasFormat } from '../types/dragDrop';

// Re-export DropPosition for components that need it
export type { DropPosition };
import { useExternalUrlDropForTabs, TabDropTarget } from '../hooks/useExternalUrlDropForTabs';
import { useBookmarks } from '../hooks/useBookmarks';
import { SPEAKER_ICON_SIZE } from '../constants';
import { scrollToTab } from '../utils/scrollHelpers';
import { moveTabToSpace as moveTabToSpaceUtil } from '../utils/tabOperations';
import { filterBookmarkableTabs, saveTabGroupAsBookmarkFolder } from '../utils/bookmarkOperations';

// External drop target type for tab → bookmark drops
export interface ExternalDropTarget
{
  bookmarkId: string;
  position: DropPosition;
  isFolder: boolean;
}

// Function type for resolving bookmark drop targets
export type ResolveBookmarkDropTarget = (
  x: number,
  y: number,
  excludeId?: string
) => ExternalDropTarget | null;
import { Toast } from './Toast';
import { TreeRow } from './TreeRow';
import { FolderPickerDialog } from './FolderPickerDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { SpaceNavigatorDialog } from './SpaceNavigatorDialog';
import { AddToGroupDialog } from './AddToGroupDialog';
import { ChangeGroupColorDialog } from './ChangeGroupColorDialog';
import { ExportConflictDialog, ExportConflictMode } from './ExportConflictDialog';
import { RenameGroupDialog } from './RenameGroupDialog';
import { Globe, Volume2, Pin, Plus, X, ArrowDownAZ, ArrowDownZA, Edit, Palette, FolderPlus, Copy, SquareStack, Bookmark, ExternalLink, Link } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { getIndentPadding } from '../utils/indent';
import { matchesFilter } from '../utils/searchParser';
import { moveSingleTab, moveTabAfter } from '../utils/tabMove';
import { moveSingleGroup, moveGroupAfter } from '../utils/groupMove';
import { DropIndicators } from './DropIndicators';
import * as ContextMenu from './menu/ContextMenu';
import { useInView } from '../hooks/useInView';
import {
  useDraggable,
  useDroppable,
  DraggableAttributes,
} from '@dnd-kit/core';
import { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import clsx from 'clsx';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIcon } from '../utils/spaceIcons';

const getTabGroupExpandedStateKey = (windowId: number) => `tabGroupExpandedState_${windowId}`;

interface DraggableTabProps {
  tab: chrome.tabs.Tab;
  indentLevel: number;
  isBeingDragged: boolean;
  globalDragActive?: boolean;  // True when any drag is in progress (disables hover borders)
  showDropBefore: boolean;
  showDropAfter: boolean;
  beforeIndentPx?: number;
  afterIndentPx?: number;
  groupColor?: string;
  isLastInGroup?: boolean;
  isSelected?: boolean;
  onClose: (id: number) => void;
  onActivate: (id: number) => void;
  onDuplicate?: (id: number) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  onOpenAddToGroupDialog?: (tabId: number, currentGroupId?: number) => void;
  onOpenMoveToSpaceDialog?: (tabId: number, currentSpaceId?: string) => void;
  onAddToBookmark?: (tab: chrome.tabs.Tab) => void;
  onMoveToNewWindow?: (tabId: number) => void;
  onCloseTabsBefore?: (tabId: number) => void;
  onCloseTabsAfter?: (tabId: number) => void;
  onCloseOthers?: (tabId: number) => void;
  onSelectionClick?: (e: React.MouseEvent) => void;
  onSelectionContextMenu?: () => void;
  selectionCount?: number;
  // Multi-selection actions
  isMultiSelection?: boolean;
  hasSelectedTabs?: boolean;
  onAddSelectedToBookmark?: () => void;
  onMoveSelectedToSpace?: () => void;
  onMoveSelectedToNewWindow?: () => void;
  onCopyUrl?: (url: string) => void;
  onCopyUrls?: () => void;
  // Drag attributes
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}

// --- Pure UI Row Component ---
const TabRow = forwardRef<HTMLDivElement, DraggableTabProps>(({
  tab,
  indentLevel,
  isBeingDragged,
  globalDragActive,
  showDropBefore,
  showDropAfter,
  beforeIndentPx,
  afterIndentPx,
  groupColor,
  isLastInGroup,
  isSelected,
  onClose,
  onActivate,
  onDuplicate,
  onPin,
  onOpenAddToGroupDialog,
  onOpenMoveToSpaceDialog,
  onAddToBookmark,
  onMoveToNewWindow,
  onCloseTabsBefore,
  onCloseTabsAfter,
  onCloseOthers,
  onSelectionClick,
  onSelectionContextMenu,
  selectionCount,
  isMultiSelection,
  hasSelectedTabs,
  onAddSelectedToBookmark,
  onMoveSelectedToSpace,
  onMoveSelectedToNewWindow,
  onCopyUrl,
  onCopyUrls,
  attributes,
  listeners,
}, ref) => {
  const dndId = `tab-${tab.id}`;
  const icon = tab.favIconUrl ? (
    <img src={tab.favIconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
  ) : (
    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
  );

  const actions = (
    <div className="flex items-center opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-900 rounded">
      {onPin && tab.url && !tab.pinned && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) =>
          {
            e.stopPropagation();
            onPin(tab.url!, tab.title || tab.url!, tab.favIconUrl);
          }}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 rounded"
          title="Pin"
          aria-label="Pin tab"
        >
          <Pin size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      )}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) =>
        {
          e.stopPropagation();
          if (tab.id) onClose(tab.id);
        }}
        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 rounded"
        aria-label="Close tab"
      >
        <X size={14} className="text-gray-700 dark:text-gray-200" />
      </button>
    </div>
  );

  // Speaker indicator - at absolute left edge
  const leadingIndicator = tab.audible ? <Volume2 size={SPEAKER_ICON_SIZE} /> : undefined;

  const badges = (
    <div className="flex items-center gap-1">
      {/* Pin indicator for Chrome pinned tabs */}
      {tab.pinned && (
        <span className="text-gray-400">
          <Pin size={14} />
        </span>
      )}
    </div>
  );

  // Computed class for coloring
  // Grouped tabs: all styling via className (bg + text)
  // Ungrouped tabs: TreeRow handles active ring, selection bg, hover ring, text colors
  const rowClassName = clsx(
    groupColor ? (isLastInGroup ? "rounded-b-lg rounded-t-none" : "rounded-none") : "",
    tab.active && "font-semibold",
    groupColor && (
      isSelected
        ? clsx(GROUP_COLORS[groupColor]?.bgSelected, "text-gray-900 dark:text-gray-100")
        : tab.active
          ? clsx(GROUP_COLORS[groupColor]?.bgStrong, "text-gray-900 dark:text-gray-100")
          : clsx(GROUP_COLORS[groupColor]?.bg, "text-gray-700 dark:text-gray-200")
    )
  );

  return (
    <ContextMenu.Root>
      {({ isOpen }) => (
        <>
          <ContextMenu.Trigger asChild>
            <TreeRow
              ref={ref}
              depth={indentLevel}
              title={tab.title}
              tooltip={tab.url ? `${tab.title}\n${tab.url}` : undefined}
              icon={icon}
              hasChildren={false}
              isActive={tab.active}
              isSelected={isSelected && !groupColor}  // Don't show selection highlight for grouped tabs (they have their own color)
              isHighlighted={!groupColor && !isSelected && isOpen}
              isDragging={isBeingDragged}
              dndAttributes={attributes}
              dndListeners={listeners}
              className={rowClassName}
              onClick={(e) =>
              {
                // Always update selection state on click
                onSelectionClick?.(e);

                // For plain clicks (no modifiers), also activate the tab
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey)
                {
                  onActivate(tab.id!);
                }
              }}
              onContextMenu={() => onSelectionContextMenu?.()}
              leadingIndicator={leadingIndicator}
              actions={actions}
              badges={badges}
              data-tab-id={tab.id}
              data-group-id={tab.groupId ?? -1}
              data-dnd-id={dndId}
            >
              {/* Border overlay for grouped tabs - shows on hover or context menu, hidden during drag */}
              {groupColor && !globalDragActive && (
                <div className={clsx(
                  "absolute inset-0 rounded-md border-2 pointer-events-none",
                  GROUP_COLORS[groupColor]?.border,
                  (isOpen && !isSelected) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )} />
              )}
              <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} beforeIndentPx={beforeIndentPx} afterIndentPx={afterIndentPx} />
            </TreeRow>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
          {isMultiSelection ? (
            // Multi-selection menu
            <>
              {hasSelectedTabs && onPin && (
                <ContextMenu.Item onSelect={() => onPin(tab.url || '', tab.title || tab.url || '', tab.favIconUrl)}>
                  <Pin size={14} className="mr-2" /> Pin to Sidebar
                </ContextMenu.Item>
              )}
              {hasSelectedTabs && onCopyUrls && (
                <ContextMenu.Item onSelect={onCopyUrls}>
                  <Link size={14} className="mr-2" /> Copy URLs
                </ContextMenu.Item>
              )}
              {hasSelectedTabs && (onPin || onCopyUrls) && (
                <ContextMenu.Separator />
              )}
              {onAddSelectedToBookmark && (
                <ContextMenu.Item onSelect={onAddSelectedToBookmark}>
                  <Bookmark size={14} className="mr-2" /> Add to Bookmark...
                </ContextMenu.Item>
              )}
              {onMoveSelectedToSpace && (
                <ContextMenu.Item onSelect={onMoveSelectedToSpace}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )}
              {onMoveSelectedToNewWindow && (
                <ContextMenu.Item onSelect={onMoveSelectedToNewWindow}>
                  <ExternalLink size={14} className="mr-2" /> Move to New Window
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
              <ContextMenu.Item danger onSelect={() => { if (tab.id) onClose(tab.id); }}>
                <X size={14} className="mr-2" /> Close {selectionCount} Tabs
              </ContextMenu.Item>
            </>
          ) : (
            // Single-item menu
            <>
          {onPin && tab.url && !tab.pinned && (
            <ContextMenu.Item onSelect={() => onPin(tab.url!, tab.title || tab.url!, tab.favIconUrl)}>
              <Pin size={14} className="mr-2" /> Pin to Sidebar
            </ContextMenu.Item>
          )}
          {onDuplicate && tab.url && (
            <ContextMenu.Item onSelect={() => onDuplicate(tab.id!)}>
              <Copy size={14} className="mr-2" /> Duplicate
            </ContextMenu.Item>
          )}
          {tab.url && (
            <ContextMenu.Item onSelect={() => onCopyUrl?.(tab.url!)}>
              <Link size={14} className="mr-2" /> Copy URL
            </ContextMenu.Item>
          )}
          {/* Separator after Pin/Duplicate section - only if items exist above AND below */}
          {((onPin && tab.url && !tab.pinned) || (onDuplicate && tab.url)) &&
           (onAddToBookmark || onOpenAddToGroupDialog || onOpenMoveToSpaceDialog || onMoveToNewWindow ||
            onCloseTabsBefore || onCloseTabsAfter || onCloseOthers) && (
            <ContextMenu.Separator />
          )}
          {onAddToBookmark && tab.url && (
            <ContextMenu.Item onSelect={() => onAddToBookmark(tab)}>
              <Bookmark size={14} className="mr-2" /> Add to Bookmark
            </ContextMenu.Item>
          )}
          {onOpenAddToGroupDialog && (
            <ContextMenu.Item onSelect={() => onOpenAddToGroupDialog(tab.id!, tab.groupId)}>
              <FolderPlus size={14} className="mr-2" /> Add to Group
            </ContextMenu.Item>
          )}
          {onOpenMoveToSpaceDialog && (
            <ContextMenu.Item onSelect={() => onOpenMoveToSpaceDialog(tab.id!)}>
              <SquareStack size={14} className="mr-2" /> Move to Space...
            </ContextMenu.Item>
          )}
          {onMoveToNewWindow && (
            <ContextMenu.Item onSelect={() => onMoveToNewWindow(tab.id!)}>
              <ExternalLink size={14} className="mr-2" /> Move to New Window
            </ContextMenu.Item>
          )}
          {/* Separator after organize section - only if items exist above AND below */}
          {(onAddToBookmark || onOpenAddToGroupDialog || onOpenMoveToSpaceDialog || onMoveToNewWindow) &&
           (onCloseTabsBefore || onCloseTabsAfter || onCloseOthers) && (
            <ContextMenu.Separator />
          )}
          {onCloseTabsBefore && (
            <ContextMenu.Item onSelect={() => onCloseTabsBefore(tab.id!)}>
              <span className="w-[14px] mr-2" /> Close Tabs Before
            </ContextMenu.Item>
          )}
          {onCloseTabsAfter && (
            <ContextMenu.Item onSelect={() => onCloseTabsAfter(tab.id!)}>
              <span className="w-[14px] mr-2" /> Close Tabs After
            </ContextMenu.Item>
          )}
          {onCloseOthers && (
            <ContextMenu.Item onSelect={() => onCloseOthers(tab.id!)}>
              <span className="w-[14px] mr-2" /> Close Other Tabs
            </ContextMenu.Item>
          )}
          {/* Separator before Close - only if items exist above */}
          {((onPin && tab.url && !tab.pinned) || (onDuplicate && tab.url) ||
            onAddToBookmark || onOpenAddToGroupDialog || onOpenMoveToSpaceDialog || onMoveToNewWindow ||
            onCloseTabsBefore || onCloseTabsAfter || onCloseOthers) && (
            <ContextMenu.Separator />
          )}
          <ContextMenu.Item danger onSelect={() => { if (tab.id) onClose(tab.id); }}>
            <X size={14} className="mr-2" /> Close
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
TabRow.displayName = 'TabRow';

// --- Draggable Wrapper ---
const DraggableTabRow = forwardRef<HTMLDivElement, DraggableTabProps>((props, ref) => {
  const tabId = `tab-${props.tab.id!}`;

  // Draggable with DragData
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: tabId,
    data: createTabDragData(
      props.tab.id!,
      props.tab.title || '',
      props.tab.url,
      props.tab.groupId,
      props.tab.favIconUrl
    ),
  });

  // Droppable with DropData
  // Droppable - accepts TAB (move), TAB_GROUP (move), URL (create new tab)
  const { setNodeRef: setDropRef } = useDroppable({
    id: tabId,
    data: {
      zone: 'tabList',
      targetId: String(props.tab.id),
      canAccept: acceptsFormats(DragFormat.TAB, DragFormat.TAB_GROUP, DragFormat.URL),
      isGroup: false,
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
    <TabRow
      ref={setRefs}
      {...props}
      attributes={attributes}
      listeners={listeners}
    />
  );
});
DraggableTabRow.displayName = 'DraggableTabRow';

// --- Static Wrapper ---
const StaticTabRow = forwardRef<HTMLDivElement, DraggableTabProps>((props, ref) => {
  return <TabRow ref={ref} {...props} />;
});
StaticTabRow.displayName = 'StaticTabRow';

// --- DraggableTab Component (Lazy Loading) ---
const DraggableTab = (props: DraggableTabProps) => {
  const { ref, isInView } = useInView<HTMLDivElement>();

  return isInView ? (
    <DraggableTabRow ref={ref} {...props} />
  ) : (
    <StaticTabRow ref={ref} {...props} />
  );
};

interface TabGroupHeaderProps {
  group: chrome.tabGroups.TabGroup;
  matchedSpace?: Space;
  isExpanded: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  globalDragActive?: boolean;  // True when any drag is in progress (disables hover borders)
  showDropBefore: boolean;
  showDropAfter: boolean;
  showDropInto: boolean;
  afterDropIndentPx?: number;
  onClick?: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onCloseGroup: () => void;
  onSortGroup: (direction: 'asc' | 'desc') => void;
  onChangeColor: () => void;
  onRename: () => void;
  onNewTab: () => void;
  onExportToBookmarks: () => void;
  // Multi-selection props
  isMultiSelection?: boolean;
  onlyGroupsSelected?: boolean;
  onSaveGroupsToBookmarks?: () => void;
  onMoveSelectedToSpace?: () => void;
  onMoveSelectedToNewWindow?: () => void;
  onCloseSelected?: () => void;
  // Drag attributes
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}

const TabGroupHeader = forwardRef<HTMLDivElement, TabGroupHeaderProps>(({
  group,
  matchedSpace,
  isExpanded,
  isSelected,
  isDragging,
  globalDragActive,
  showDropBefore,
  showDropAfter,
  showDropInto,
  afterDropIndentPx,
  onClick,
  onToggle,
  onCloseGroup,
  onSortGroup,
  onChangeColor,
  onRename,
  onNewTab,
  onExportToBookmarks,
  isMultiSelection,
  onlyGroupsSelected,
  onSaveGroupsToBookmarks,
  onMoveSelectedToSpace,
  onMoveSelectedToNewWindow,
  onCloseSelected,
  attributes,
  listeners,
}, ref) =>
{
  const dndId = `group-${group.id}`;
  const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

  // Show space icon if group title matches a space, otherwise generic SquareStack
  // Icon is shown inside the badge with inverted colors for contrast
  const iconElement = matchedSpace
    ? getIcon(matchedSpace.icon, 12, true)
    : <SquareStack size={12} />;

  // Render badge as the title component with icon inside
  const titleComponent = (
    <span className={clsx("px-2 py-0.5 rounded-full font-medium text-white dark:text-black flex items-center gap-1 w-fit", colorStyle.badge)}>
      {iconElement}
      {group.title || 'Unnamed Group'}
    </span>
  );

  return (
    <ContextMenu.Root>
      {({ isOpen }) => (
        <>
          <ContextMenu.Trigger asChild>
            <TreeRow
              ref={ref}
              depth={0}
              title={titleComponent}
              hideIcon
              hasChildren={true} // It's a group
              isExpanded={isExpanded}
              onToggle={(e) => { e.stopPropagation(); onToggle(); }}
              onClick={onClick}
              isActive={false}
              isSelected={false}  // Handle selection via className for consistent group styling
              isDragging={isDragging}
              dndAttributes={attributes}
              dndListeners={listeners}
              className={clsx(
                "rounded-t-lg rounded-b-none",
                showDropInto
                  ? "bg-blue-100 dark:bg-blue-900/50"
                  : isSelected
                    ? colorStyle.bgSelected
                    : colorStyle.bg
              )}
              data-group-header-id={group.id}
              data-is-group-header="true"
              data-dnd-id={dndId}
            >
              {/* Hover border overlay - shows on hover or context menu, hidden during drag */}
              {!showDropInto && !globalDragActive && (
                <div className={clsx(
                  "absolute inset-0 rounded-md border-2 pointer-events-none",
                  colorStyle.border,
                  (isOpen && !isSelected) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )} />
              )}
              {showDropInto && (
                <div className="absolute inset-0 rounded-lg ring-2 ring-blue-500 pointer-events-none" />
              )}
              <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} afterIndentPx={afterDropIndentPx} />
            </TreeRow>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
          {isMultiSelection && onlyGroupsSelected ? (
            // Groups-only multi-selection menu
            <>
              {onSaveGroupsToBookmarks && (
                <ContextMenu.Item onSelect={onSaveGroupsToBookmarks}>
                  <FolderPlus size={14} className="mr-2" /> Save to Bookmarks
                </ContextMenu.Item>
              )}
              {onSaveGroupsToBookmarks && (onMoveSelectedToSpace || onMoveSelectedToNewWindow) && (
                <ContextMenu.Separator />
              )}
              {onMoveSelectedToSpace && (
                <ContextMenu.Item onSelect={onMoveSelectedToSpace}>
                  <SquareStack size={14} className="mr-2" /> Move to Space...
                </ContextMenu.Item>
              )}
              {onMoveSelectedToNewWindow && (
                <ContextMenu.Item onSelect={onMoveSelectedToNewWindow}>
                  <ExternalLink size={14} className="mr-2" /> Move to New Window
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
              <ContextMenu.Item danger onSelect={onCloseSelected}>
                <X size={14} className="mr-2" /> Close
              </ContextMenu.Item>
            </>
          ) : (
            // Single-group menu
            <>
          <ContextMenu.Item onSelect={onNewTab}>
            <Plus size={14} className="mr-2" /> New Tab
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => onSortGroup('asc')}>
            <ArrowDownAZ size={14} className="mr-2" /> Sort by Domain (A-Z)
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => onSortGroup('desc')}>
            <ArrowDownZA size={14} className="mr-2" /> Sort by Domain (Z-A)
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={onExportToBookmarks}>
            <FolderPlus size={14} className="mr-2" /> Save to Bookmarks
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={onRename}>
            <Edit size={14} className="mr-2" /> Rename Group
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={onChangeColor}>
            <Palette size={14} className="mr-2" /> Change Color
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item danger onSelect={onCloseGroup}>
            <X size={14} className="mr-2" /> Close All Tabs in Group
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
TabGroupHeader.displayName = 'TabGroupHeader';

// --- Draggable Group Header Wrapper ---
interface DraggableGroupHeaderProps extends Omit<TabGroupHeaderProps, 'attributes' | 'listeners' | 'isDragging'> {
  tabCount: number;
  multiDragInfo?: { count: number } | null;
}

const DraggableGroupHeader = ({ group, tabCount, matchedSpace, multiDragInfo, isSelected, ...props }: DraggableGroupHeaderProps) =>
{
  const groupId = `group-${group.id}`;

  // Draggable with DragData - use matchedSpace from props for consistency
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: groupId,
    data: createTabGroupDragData(
      group.id,
      group.title || 'Unnamed Group',
      tabCount,
      group.color,
      matchedSpace?.icon
    ),
  });

  // Droppable with DropData
  // Droppable - accepts TAB (move into group), TAB_GROUP (reorder), URL (create tab in group)
  const { setNodeRef: setDropRef } = useDroppable({
    id: groupId,
    data: {
      zone: 'tabList',
      targetId: `group-${group.id}`,
      canAccept: acceptsFormats(DragFormat.TAB, DragFormat.TAB_GROUP, DragFormat.URL),
      isGroup: true,
      isExpanded: props.isExpanded,
    } as DropData,
  });

  // Merge refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  // Show as dragging if actively dragged OR part of multi-selection drag
  const isBeingDragged = isDragging || (!!multiDragInfo && !!isSelected);

  return (
    <TabGroupHeader
      ref={setRefs}
      group={group}
      matchedSpace={matchedSpace}
      isSelected={isSelected}
      isDragging={isBeingDragged}
      attributes={attributes}
      listeners={listeners}
      {...props}
    />
  );
};

// Display item types for rendering
type DisplayItem =
  | { type: 'group'; group: chrome.tabGroups.TabGroup; tabs: chrome.tabs.Tab[]; startIndex: number }
  | { type: 'tab'; tab: chrome.tabs.Tab };

interface TabListProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  onPinMultiple?: (pins: Array<{ url: string; title: string; faviconUrl?: string }>) => void;
  sortGroupsFirst?: boolean;
  onExternalDropTargetChange?: (target: ExternalDropTarget | null) => void;
  resolveBookmarkDropTarget?: () => ResolveBookmarkDropTarget | null;
  arcStyleEnabled?: boolean;
  filterText?: string;
  activeSpace?: Space;  // If provided, use this instead of context
  useSpaces?: boolean;  // When true, show "Add to Space" menu; when false, show "Add to Group" menu
  onSpaceDropTargetChange?: (spaceId: string | null) => void;
}

export const TabList = ({ onPin, onPinMultiple, sortGroupsFirst = true, onExternalDropTargetChange: _onExternalDropTargetChange, resolveBookmarkDropTarget: _resolveBookmarkDropTarget, arcStyleEnabled = false, filterText = '', activeSpace: activeSpaceProp, useSpaces = true, onSpaceDropTargetChange: _onSpaceDropTargetChange }: TabListProps) =>
{
  const { spaces, activeSpace: activeSpaceFromContext, windowId } = useSpacesContext();
  const { tabs, closeTab, closeTabs, activateTab, moveTab, groupTab, ungroupTab, createGroupWithTab, createTabInGroup, createTab, duplicateTab, sortTabs, sortGroupTabs, error } = useTabs(windowId ?? undefined);
  const { tabGroups, updateGroup, moveGroup } = useTabGroups();
  const { getManagedTabIds, associateExistingTab } = useBookmarkTabsContext();

  // Use prop if provided, otherwise use context
  const activeSpace = activeSpaceProp ?? activeSpaceFromContext;

  // Check if we're in a non-"all" space
  const isInSpace = activeSpace && activeSpace.id !== 'all';

  // Filter out tabs managed by bookmark-tab associations (Arc-style persistent tabs)
  // Also apply text filter and space filter (using Chrome tab groups)
  const visibleTabs = useMemo(() =>
  {
    const managedTabIds = getManagedTabIds();
    let filtered = tabs.filter(tab => !managedTabIds.has(tab.id!));

    // Space filter: when in a space, show tabs in Chrome group matching Space name
    if (isInSpace && activeSpace)
    {
      // Find Chrome group with matching name
      const matchingGroup = tabGroups.find(g => g.title === activeSpace.name);
      if (matchingGroup)
      {
        filtered = filtered.filter(tab => tab.groupId === matchingGroup.id);
      }
      else
      {
        // Space has no group yet - show no tabs
        filtered = [];
      }
    }

    if (filterText.trim())
    {
      filtered = filtered.filter(tab =>
        matchesFilter(tab.title ?? '', tab.url ?? '', filterText)
      );
    }
    return filtered;
  }, [tabs, getManagedTabIds, filterText, isInSpace, activeSpace, tabGroups]);

  // Get all tab groups in current window
  // Spaces link to Chrome groups by matching Space.name to group.title
  const visibleTabGroups = tabGroups;

  // Create new tab - background.ts will auto-add to active space
  const handleNewTab = useCallback(async () =>
  {
    createTab();
  }, [createTab]);

  // Space-aware close all tabs - closes only visible tabs
  const handleCloseAllTabs = useCallback(() =>
  {
    const tabIds = visibleTabs
      .map(tab => tab.id!)
      .filter(id => id !== undefined);
    if (tabIds.length > 0)
    {
      closeTabs(tabIds);
    }
  }, [visibleTabs, closeTabs]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedGroupsLoaded, setExpandedGroupsLoaded] = useState(false);

  // Load expanded state from session storage on mount
  useEffect(() =>
  {
    if (!windowId) return;

    const storageKey = getTabGroupExpandedStateKey(windowId);
    chrome.storage.session.get(storageKey, (result) =>
    {
      if (result[storageKey])
      {
        setExpandedGroups(result[storageKey]);
      }
      setExpandedGroupsLoaded(true);
    });
  }, [windowId]);

  // Save expanded state to session storage on change (debounced)
  useEffect(() =>
  {
    if (!windowId || !expandedGroupsLoaded) return;

    const timeoutId = setTimeout(() =>
    {
      const storageKey = getTabGroupExpandedStateKey(windowId);
      chrome.storage.session.set({ [storageKey]: expandedGroups });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [expandedGroups, windowId, expandedGroupsLoaded]);

  // External URL drop state (for web page link drops)
  const tabListContainerRef = useRef<HTMLDivElement>(null);
  const [externalUrlDropTarget, setExternalUrlDropTarget] = useState<TabDropTarget | null>(null);

  // Add to Group dialog state
  const [addToGroupDialog, setAddToGroupDialog] = useState<{
    isOpen: boolean;
    tabId: number | null;
    currentGroupId?: number;
  }>({ isOpen: false, tabId: null });

  const openAddToGroupDialog = useCallback((tabId: number, currentGroupId?: number) =>
  {
    setAddToGroupDialog({ isOpen: true, tabId, currentGroupId });
  }, []);

  const closeAddToGroupDialog = useCallback(() =>
  {
    setAddToGroupDialog({ isOpen: false, tabId: null });
  }, []);

  // Move to Space dialog state
  const [moveToSpaceDialog, setMoveToSpaceDialog] = useState<{
    isOpen: boolean;
    tabId: number | null;
    currentSpaceId?: string;
  }>({ isOpen: false, tabId: null });

  const openMoveToSpaceDialog = useCallback((tabId: number, currentSpaceId?: string) =>
  {
    setMoveToSpaceDialog({ isOpen: true, tabId, currentSpaceId });
  }, []);

  const closeMoveToSpaceDialog = useCallback(() =>
  {
    setMoveToSpaceDialog({ isOpen: false, tabId: null });
  }, []);

  // Toast state (moved here so handleMoveToSpace can use it)
  const [toastState, setToastState] = useState<{
    isVisible: boolean;
    message: string;
  }>({ isVisible: false, message: '' });

  const showToast = useCallback((message: string) =>
  {
    setToastState({ isVisible: true, message });
  }, []);

  const hideToast = useCallback(() =>
  {
    setToastState({ isVisible: false, message: '' });
  }, []);

  // Core function to move a tab to a space (adds to Chrome group matching Space name)
  // Special case: "all" space ungroups the tab
  const moveTabToSpace = useCallback(async (tabId: number, spaceId: string) =>
  {
    if (!windowId) return;

    const result = await moveTabToSpaceUtil(tabId, spaceId, spaces, windowId);
    if (result.message)
    {
      showToast(result.message);
    }
    else if (result.error)
    {
      showToast(result.error);
    }
  }, [spaces, showToast, windowId]);

  // Handler for dialog-based move to space
  const handleMoveToSpace = useCallback(async (spaceId: string) =>
  {
    const tabId = moveToSpaceDialog.tabId;
    if (tabId === null) return;
    await moveTabToSpace(tabId, spaceId);
  }, [moveToSpaceDialog.tabId, moveTabToSpace]);

  // Change Group Color dialog state
  const [changeColorDialog, setChangeColorDialog] = useState<{
    isOpen: boolean;
    group: chrome.tabGroups.TabGroup | null;
  }>({ isOpen: false, group: null });

  const openChangeColorDialog = useCallback((group: chrome.tabGroups.TabGroup) =>
  {
    setChangeColorDialog({ isOpen: true, group });
  }, []);

  const closeChangeColorDialog = useCallback(() =>
  {
    setChangeColorDialog({ isOpen: false, group: null });
  }, []);

  // Rename Group dialog state
  const [renameGroupDialog, setRenameGroupDialog] = useState<{
    isOpen: boolean;
    group: chrome.tabGroups.TabGroup | null;
  }>({ isOpen: false, group: null });

  const openRenameGroupDialog = useCallback((group: chrome.tabGroups.TabGroup) =>
  {
    setRenameGroupDialog({ isOpen: true, group });
  }, []);

  const closeRenameGroupDialog = useCallback(() =>
  {
    setRenameGroupDialog({ isOpen: false, group: null });
  }, []);

  // Add to Bookmark dialog state
  const [addToBookmarkDialog, setAddToBookmarkDialog] = useState<{
    isOpen: boolean;
    tab: chrome.tabs.Tab | null;
  }>({ isOpen: false, tab: null });

  const openAddToBookmarkDialog = useCallback((tab: chrome.tabs.Tab) =>
  {
    setAddToBookmarkDialog({ isOpen: true, tab });
  }, []);

  const closeAddToBookmarkDialog = useCallback(() =>
  {
    setAddToBookmarkDialog({ isOpen: false, tab: null });
  }, []);

  // Bookmarks functions for export and tab-to-bookmark drops
  const { findFolderInParent, findFolderByPath, createFolder, createBookmark, createBookmarksBatch, getChildren, clearFolder, getBookmarkPath } = useBookmarks();

  const handleAddToBookmarkFolderSelect = useCallback(async (folderId: string) =>
  {
    const tab = addToBookmarkDialog.tab;
    if (!tab || !tab.url || !tab.title) return;

    // Create bookmark in the selected folder
    const { node: newBookmark } = await createBookmark(folderId, tab.title, tab.url);

    // If Arc style is enabled, associate the tab with the new bookmark
    if (arcStyleEnabled && newBookmark && tab.id)
    {
      await associateExistingTab(tab.id, newBookmark.id);
    }

    closeAddToBookmarkDialog();
  }, [addToBookmarkDialog.tab, createBookmark, arcStyleEnabled, associateExistingTab, closeAddToBookmarkDialog]);

  const [exportConflictDialog, setExportConflictDialog] = useState<{
    isOpen: boolean;
    folderName: string;
    existingFolder: chrome.bookmarks.BookmarkTreeNode | null;
    tabsToExport: chrome.tabs.Tab[];
    parentFolderId: string;
  }>({ isOpen: false, folderName: '', existingFolder: null, tabsToExport: [], parentFolderId: '2' });

  const [folderPickerDialog, setFolderPickerDialog] = useState<{
    isOpen: boolean;
    group: chrome.tabGroups.TabGroup | null;
    groupTabs: chrome.tabs.Tab[];
  }>({ isOpen: false, group: null, groupTabs: [] });

  // Create bookmarks in a folder using batch operation for better performance
  // (uses useBookmarks hook's createBookmarksBatch which does single refetch)
  const createBookmarksInFolderBatch = useCallback(async (
    folderId: string,
    tabList: chrome.tabs.Tab[]
  ) =>
  {
    const items = tabList
      .filter(tab => tab.url && tab.title)
      .map(tab => ({ title: tab.title!, url: tab.url! }));
    await createBookmarksBatch(folderId, items);
  }, [createBookmarksBatch]);

  // Handle export to bookmarks - opens folder picker dialog
  const handleExportToBookmarks = useCallback((
    group: chrome.tabGroups.TabGroup,
    groupTabs: chrome.tabs.Tab[]
  ) =>
  {
    const bookmarkableTabs = filterBookmarkableTabs(groupTabs);

    if (bookmarkableTabs.length === 0)
    {
      showToast('No bookmarkable tabs to export');
      return;
    }

    // Open folder picker dialog
    setFolderPickerDialog({
      isOpen: true,
      group,
      groupTabs: bookmarkableTabs
    });
  }, [showToast]);

  // Handle folder selection from folder picker
  const handleFolderSelected = useCallback(async (parentFolderId: string) =>
  {
    const { group, groupTabs } = folderPickerDialog;
    if (!group) return;

    const folderName = group.title || 'Unnamed Group';

    // Close folder picker
    setFolderPickerDialog({ isOpen: false, group: null, groupTabs: [] });

    // Check for existing folder with same name in selected parent
    const existingFolder = await findFolderInParent(parentFolderId, folderName);

    if (existingFolder)
    {
      // Show conflict dialog (reuse existing)
      setExportConflictDialog({
        isOpen: true,
        folderName,
        existingFolder,
        tabsToExport: groupTabs,
        parentFolderId
      });
    }
    else
    {
      // Create new subfolder and add bookmarks
      createFolder(parentFolderId, folderName, async (newFolder) =>
      {
        await createBookmarksInFolderBatch(newFolder.id, groupTabs);
        const folderPath = await getBookmarkPath(newFolder.id);
        showToast(`Bookmark folder "${folderPath}" is created`);
      });
    }
  }, [folderPickerDialog, findFolderInParent, createFolder, createBookmarksInFolderBatch, getBookmarkPath, showToast]);

  const closeFolderPickerDialog = useCallback(() =>
  {
    setFolderPickerDialog({ isOpen: false, group: null, groupTabs: [] });
  }, []);

  // Handle conflict dialog confirmation
  const handleExportConflictConfirm = useCallback(async (mode: ExportConflictMode) =>
  {
    const { existingFolder, tabsToExport } = exportConflictDialog;
    if (!existingFolder) return;

    // Get the full path for toast messages
    const folderPath = await getBookmarkPath(existingFolder.id);

    if (mode === 'overwrite')
    {
      // Clear existing bookmarks and add new ones
      await clearFolder(existingFolder.id);
      await createBookmarksInFolderBatch(existingFolder.id, tabsToExport);
      showToast(`Bookmark folder "${folderPath}" is updated`);
    }
    else
    {
      // Merge: skip existing, add new
      const existingChildren = await getChildren(existingFolder.id);
      const existingSet = new Set(
        existingChildren.map(child => `${child.title}|${child.url}`)
      );

      const newTabs = tabsToExport.filter(tab =>
        !existingSet.has(`${tab.title}|${tab.url}`)
      );

      if (newTabs.length > 0)
      {
        await createBookmarksInFolderBatch(existingFolder.id, newTabs);
        showToast(`Added ${newTabs.length} new bookmarks to "${folderPath}"`);
      }
      else
      {
        showToast('All tabs already exist in folder');
      }
    }
  }, [exportConflictDialog, clearFolder, createBookmarksInFolderBatch, getChildren, getBookmarkPath, showToast]);

  const closeExportConflictDialog = useCallback(() =>
  {
    setExportConflictDialog({ isOpen: false, folderName: '', existingFolder: null, tabsToExport: [], parentFolderId: '2' });
  }, []);

  // Unified DnD context
  const {
    activeId: unifiedActiveId,
    activeDragData,
    overId,
    dropPosition,
    registerDropHandler,
    unregisterDropHandler,
    registerDragItemsProvider,
    unregisterDragItemsProvider,
    setWasValidDrop,
    setMultiDragInfo: setContextMultiDragInfo,
  } = useUnifiedDnd();

  // Map unified activeId to local activeId format (tabs use number IDs, groups use "group-X" strings)
  const activeId = useMemo(() =>
  {
    if (typeof unifiedActiveId === 'string')
    {
      if (unifiedActiveId.startsWith('tab-'))
      {
        return parseInt(unifiedActiveId.replace('tab-', ''), 10);
      }
      if (unifiedActiveId.startsWith('group-'))
      {
        return unifiedActiveId;
      }
    }
    return null;
  }, [unifiedActiveId]);

  // Map unified overId to dropTargetId
  const dropTargetId = useMemo(() =>
  {
    if (typeof overId === 'string')
    {
      if (overId.startsWith('tab-'))
      {
        return overId.replace('tab-', '');
      }
      if (overId.startsWith('group-'))
      {
        return overId;
      }
    }
    return null;
  }, [overId]);

  // Multi-selection drag state - first item can be tab or group
  type MultiDragFirstItem =
    | { type: 'tab'; tab: chrome.tabs.Tab }
    | { type: 'group'; group: chrome.tabGroups.TabGroup; matchedSpace?: Space; tabCount: number };
  const [multiDragInfo, setMultiDragInfo] = useState<{ count: number; firstItem: MultiDragFirstItem } | null>(null);

  // Handle external URL drop - create a new tab
  const handleExternalUrlDrop = useCallback(async (
    url: string,
    _title: string,
    target: TabDropTarget | null
  ) =>
  {
    if (import.meta.env.DEV)
    {
      console.log('[TabList] Creating tab from external URL drop:', { url, target });
    }

    try
    {
      // Determine where to create the tab
      let index: number | undefined;
      let groupId: number | undefined;

      if (target)
      {
        if (target.isGroup)
        {
          // Dropping on a group - add to that group
          groupId = target.groupId;
          if (target.position === 'into' || target.position === 'intoFirst')
          {
            // Find first tab in the group for position
            const groupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === groupId);
            if (target.position === 'intoFirst' && groupTabs.length > 0)
            {
              index = groupTabs[0].index;
            }
            else if (groupTabs.length > 0)
            {
              // Add at end of group
              index = groupTabs[groupTabs.length - 1].index + 1;
            }
          }
        }
        else
        {
          // Dropping on a tab
          const targetTab = visibleTabs.find(t => String(t.id) === target.targetId);
          if (targetTab)
          {
            if (target.position === 'before')
            {
              index = targetTab.index;
            }
            else if (target.position === 'after')
            {
              index = targetTab.index + 1;
            }
            // If target tab is in a group, add to that group
            if (targetTab.groupId && targetTab.groupId > 0)
            {
              groupId = targetTab.groupId;
            }
          }
        }
      }

      // Create the tab
      const newTab = await chrome.tabs.create({
        url,
        index,
        active: false,
        windowId: windowId ?? undefined,
      });

      // Add to group if specified
      if (newTab.id && groupId)
      {
        await chrome.tabs.group({ tabIds: [newTab.id], groupId });
      }

      showToast('Tab created from dropped link');
    }
    catch (err)
    {
      console.error('[TabList] Failed to create tab from dropped URL:', err);
    }
  }, [visibleTabs, showToast]);

  // Set up external URL drop handling (web page links)
  useExternalUrlDropForTabs({
    containerRef: tabListContainerRef,
    onDropTargetChange: setExternalUrlDropTarget,
    onDrop: handleExternalUrlDrop,
    expandedGroups,
    setExpandedGroups,
  });

  // Helper to clear local DnD state (unified context handles shared state)
  const clearDndState = useCallback(() =>
  {
    setMultiDragInfo(null);
  }, []);

  // Helper to check if we're dragging a group
  const isDraggingGroup = typeof activeId === 'string' && String(activeId).startsWith('group-');

  // Initialize all groups as expanded when they first appear
  useEffect(() =>
  {
    if (!expandedGroupsLoaded) return;

    setExpandedGroups((prev) =>
    {
      let hasChanges = false;
      const newState = { ...prev };
      visibleTabGroups.forEach((g) =>
      {
        if (!(g.id in newState))
        {
          newState[g.id] = true;
          hasChanges = true;
        }
      });
      return hasChanges ? newState : prev;
    });
  }, [visibleTabGroups, expandedGroupsLoaded]);

  // Ref for end-of-list drop zone detection
  const endOfListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active tab when it changes or when space changes
  const prevActiveTabIdRef = useRef<number | null>(null);
  const prevSpaceIdRef = useRef<string | undefined>(undefined);
  useEffect(() =>
  {
    const activeTab = visibleTabs.find(t => t.active);
    const currentSpaceId = activeSpace?.id;
    const spaceChanged = currentSpaceId !== prevSpaceIdRef.current;
    const tabChanged = activeTab && activeTab.id !== prevActiveTabIdRef.current;

    // Update refs
    prevSpaceIdRef.current = currentSpaceId;
    if (activeTab)
    {
      prevActiveTabIdRef.current = activeTab.id ?? null;
    }

    // Scroll if tab changed or space changed (and there's an active tab to scroll to)
    if (activeTab && (tabChanged || spaceChanged))
    {
      // Scroll after DOM updates
      scrollToTab(activeTab.id!, 50);
    }
  }, [visibleTabs, activeSpace]);

  // Sensors are now configured in UnifiedDndContext

  // Build display items: groups and ungrouped tabs in natural browser order
  // Uses visibleTabs and visibleTabGroups to exclude SideBarForArc group
  // Managed tabs (bookmarks) are filtered via getManagedTabIds() in useTabs hook
  const displayItems = useMemo<DisplayItem[]>(() =>
  {
    const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
    visibleTabGroups.forEach((g) =>
    {
      groupMap.set(g.id, g);
    });

    const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();

    visibleTabs.forEach((tab) =>
    {
      const groupId = tab.groupId ?? -1;
      if (groupId !== -1)
      {
        if (!tabsByGroup.has(groupId))
        {
          tabsByGroup.set(groupId, []);
        }
        tabsByGroup.get(groupId)!.push(tab);
      }
    });

    const items: DisplayItem[] = [];
    const processedGroups = new Set<number>();

    visibleTabs.forEach((tab, index) =>
    {
      const groupId = tab.groupId ?? -1;

      if (groupId === -1)
      {
        items.push({ type: 'tab', tab });
      }
      else if (!processedGroups.has(groupId))
      {
        processedGroups.add(groupId);
        const group = groupMap.get(groupId);
        const groupTabs = tabsByGroup.get(groupId) || [];
        if (group)
        {
          items.push({ type: 'group', group, tabs: groupTabs, startIndex: index });
        }
      }
    });

    return items;
  }, [visibleTabs, visibleTabGroups]);

  // Build flat list of visible items for selection range calculation
  const flatVisibleItems = useMemo((): SelectionItem[] =>
  {
    const items: SelectionItem[] = [];
    let index = 0;

    for (const displayItem of displayItems)
    {
      if (displayItem.type === 'tab')
      {
        items.push({
          id: String(displayItem.tab.id),
          type: 'tab',
          index: index++
        });
      }
      else if (displayItem.type === 'group')
      {
        // Add group header
        items.push({
          id: `group-${displayItem.group.id}`,
          type: 'group',
          index: index++
        });
        // Add tabs in expanded groups
        if (expandedGroups[displayItem.group.id])
        {
          for (const tab of displayItem.tabs)
          {
            items.push({
              id: String(tab.id),
              type: 'tab',
              index: index++
            });
          }
        }
      }
    }
    return items;
  }, [displayItems, expandedGroups]);

  // Get items in range for shift-click selection
  const getTabItemsInRange = useCallback((startIndex: number, endIndex: number): SelectionItem[] =>
  {
    return flatVisibleItems.filter(item => item.index >= startIndex && item.index <= endIndex);
  }, [flatVisibleItems]);

  // Selection hook
  const {
    isSelected: isTabSelected,
    handleClick: handleSelectionClick,
    handleContextMenu: handleSelectionContextMenu,
    selectionCount,
    getSelectedItems,
    clearSelection,
  } = useSelection({
    section: 'tabs',
    getItemsInRange: getTabItemsInRange
  });

  // Confirm delete dialog for multi-close
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState<{
    isOpen: boolean;
    tabIds: number[];
  }>({ isOpen: false, tabIds: [] });

  // Sync local overlay state when unified context drag starts/ends
  useEffect(() =>
  {
    if (activeDragData && hasFormat(activeDragData, DragFormat.TAB) && activeId)
    {
      // Tab is being dragged
      const tabId = typeof activeId === 'number' ? activeId : parseInt(String(activeId).replace('tab-', ''), 10);
      const tabIdStr = String(tabId);

      // Handle selection for multi-drag
      if (isTabSelected(tabIdStr))
      {
        const selectedItems = getSelectedItems();
        const selectedTabItems = selectedItems.filter(item => item.type === 'tab');

        if (selectedTabItems.length > 1)
        {
          const sortedTabItems = [...selectedTabItems].sort((a, b) => a.index - b.index);
          const firstTabItem = sortedTabItems[0];
          const firstTab = visibleTabs.find(t => String(t.id) === firstTabItem.id);
          if (firstTab)
          {
            setMultiDragInfo({
              count: selectedTabItems.length,
              firstItem: { type: 'tab', tab: firstTab }
            });
            setContextMultiDragInfo(selectedTabItems.length);
          }
        }
        else
        {
          setMultiDragInfo(null);
          setContextMultiDragInfo(1);
        }
      }
      else
      {
        clearSelection();
        setMultiDragInfo(null);
        setContextMultiDragInfo(1);
      }

    }
    else if (activeDragData && hasFormat(activeDragData, DragFormat.TAB_GROUP) && activeId)
    {
      // Group is being dragged
      const groupIdStr = typeof activeId === 'string' ? activeId : `group-${activeId}`;

      // Handle selection for multi-drag
      if (isTabSelected(groupIdStr))
      {
        const selectedItems = getSelectedItems();
        const selectedTabItems = selectedItems.filter(item => item.type === 'tab');

        if (selectedTabItems.length > 0)
        {
          const sortedTabItems = [...selectedTabItems].sort((a, b) => a.index - b.index);
          const firstTabItem = sortedTabItems[0];
          const tab = visibleTabs.find(t => String(t.id) === firstTabItem.id);
          if (tab)
          {
            setMultiDragInfo({
              count: selectedTabItems.length,
              firstItem: { type: 'tab', tab }
            });
            setContextMultiDragInfo(selectedTabItems.length);
          }
        }
        else
        {
          setMultiDragInfo(null);
          setContextMultiDragInfo(1);
        }
      }
      else
      {
        clearSelection();
        setMultiDragInfo(null);
        setContextMultiDragInfo(1);
      }
    }
    else if (!activeDragData)
    {
      // Drag ended - reset local state
      clearDndState();
    }
  }, [activeDragData, activeId, visibleTabs, visibleTabGroups, isTabSelected, clearSelection, getSelectedItems, setContextMultiDragInfo, clearDndState]);

  // handleDragMove is no longer needed - unified context handles drop target detection via useDroppable

  // Drop handler for tabList zone - handles tab and group reordering
  const handleTabListDrop: DropHandler = useCallback(async (
    dragData: DragData,
    dropData: DropData,
    position: DropPosition,
    acceptedFormat: DragFormat
  ) =>
  {
    if (!position) return;

    const targetId = dropData.targetId;
    const isGroupHeaderTarget = targetId.startsWith('group-');

    try
    {
      const primaryItem = getPrimaryItem(dragData);

      if (acceptedFormat === DragFormat.TAB && primaryItem?.tab)
      {
        // Tab being dropped on tabList
        const tabId = primaryItem.tab.tabId;
        const sourceTab = visibleTabs.find(t => t.id === tabId);
        if (!sourceTab) return;

        // Check for multi-selection
        const selectedItems = getSelectedItems();
        const selectedTabIds = selectedItems
          .filter(item => item.type === 'tab')
          .map(item => parseInt(item.id, 10))
          .filter(id => !isNaN(id));

        const isMultiDrag = selectedTabIds.length > 1 && selectedTabIds.includes(tabId);

        if (isMultiDrag)
        {
          // Multi-tab drag
          const selectedTabs = selectedTabIds
            .map(id => visibleTabs.find(t => t.id === id))
            .filter((t): t is chrome.tabs.Tab => t !== undefined)
            .sort((a, b) => a.index - b.index);

          if (selectedTabs.length === 0) return;

          let result = await moveSingleTab({
            tabId: selectedTabs[0].id!,
            sourceIndex: selectedTabs[0].index,
            sourceGroupId: selectedTabs[0].groupId ?? -1,
            dropTargetId: targetId,
            dropPosition: position,
            isGroupHeaderTarget,
            visibleTabs,
            moveTab,
            groupTab,
            ungroupTab
          });

          if (result)
          {
            for (let i = 1; i < selectedTabs.length; i++)
            {
              const tab = selectedTabs[i];
              result = await moveTabAfter({
                tabId: tab.id!,
                sourceIndex: tab.index,
                sourceGroupId: tab.groupId ?? -1,
                targetTab: result,
                moveTab,
                groupTab,
                ungroupTab
              });
            }
          }

          clearSelection();
        }
        else
        {
          // Single tab drag
          await moveSingleTab({
            tabId,
            sourceIndex: sourceTab.index,
            sourceGroupId: sourceTab.groupId ?? -1,
            dropTargetId: targetId,
            dropPosition: position,
            isGroupHeaderTarget,
            visibleTabs,
            moveTab,
            groupTab,
            ungroupTab
          });
        }

        setWasValidDrop(true);
      }
      else if (acceptedFormat === DragFormat.TAB_GROUP && primaryItem?.tabGroup)
      {
        // Tab group being dropped on tabList
        const groupId = primaryItem.tabGroup.groupId;

        // Check for multi-group selection
        const selectedItems = getSelectedItems();
        const selectedGroupIds = selectedItems
          .filter(item => item.type === 'group')
          .map(item => parseInt(item.id.replace('group-', ''), 10))
          .filter(id => !isNaN(id));

        const isMultiGroupDrag = selectedGroupIds.length > 1 && selectedGroupIds.includes(groupId);

        if (isMultiGroupDrag)
        {
          // Multi-group drag
          const sortedGroups = selectedGroupIds
            .map(gid =>
            {
              const tabs = visibleTabs.filter(t => (t.groupId ?? -1) === gid);
              return {
                groupId: gid,
                firstIndex: tabs[0]?.index ?? 0,
                tabCount: tabs.length
              };
            })
            .sort((a, b) => a.firstIndex - b.firstIndex);

          let result = moveSingleGroup({
            groupId: sortedGroups[0].groupId,
            sourceFirstIndex: sortedGroups[0].firstIndex,
            sourceTabCount: sortedGroups[0].tabCount,
            dropTargetId: targetId,
            dropPosition: position,
            visibleTabs,
            moveGroup
          });

          if (result)
          {
            for (let i = 1; i < sortedGroups.length; i++)
            {
              const group = sortedGroups[i];
              result = moveGroupAfter({
                groupId: group.groupId,
                sourceFirstIndex: group.firstIndex,
                sourceTabCount: group.tabCount,
                targetIndex: result.index,
                moveGroup
              });
            }
          }

          clearSelection();
        }
        else
        {
          // Single group drag
          const sourceGroupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === groupId);
          moveSingleGroup({
            groupId,
            sourceFirstIndex: sourceGroupTabs[0]?.index ?? 0,
            sourceTabCount: sourceGroupTabs.length,
            dropTargetId: targetId,
            dropPosition: position,
            visibleTabs,
            moveGroup
          });
        }

        setWasValidDrop(true);
      }
      else if (acceptedFormat === DragFormat.URL && primaryItem?.url)
      {
        // URL dropped on tabList - open as new tab at specific position
        let targetIndex: number | undefined;
        let targetGroupId: number | undefined;

        if (isGroupHeaderTarget)
        {
          // Dropped on a group header
          const groupId = parseInt(targetId.replace('group-', ''));
          const groupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === groupId);

          if (groupTabs.length > 0)
          {
            if (position === 'into' || position === 'after')
            {
              // Add to end of group
              targetIndex = groupTabs[groupTabs.length - 1].index + 1;
              targetGroupId = groupId;
            }
            else if (position === 'intoFirst')
            {
              // Add to start of group
              targetIndex = groupTabs[0].index;
              targetGroupId = groupId;
            }
            else
            {
              // 'before' - add before group (ungrouped)
              targetIndex = groupTabs[0].index;
            }
          }
        }
        else if (targetId === 'end-of-list')
        {
          // Drop at end of list - no specific index needed
          targetIndex = undefined;
        }
        else
        {
          // Dropped on a specific tab
          const targetTabId = parseInt(targetId);
          const targetTab = visibleTabs.find(t => t.id === targetTabId);

          if (targetTab)
          {
            targetIndex = position === 'before' ? targetTab.index : targetTab.index + 1;
            // Inherit target tab's group
            if (targetTab.groupId && targetTab.groupId > 0)
            {
              targetGroupId = targetTab.groupId;
            }
          }
        }

        // Create the tab
        const newTab = await chrome.tabs.create({
          url: primaryItem.url.url,
          active: false,
          windowId: windowId ?? undefined,
          index: targetIndex
        });

        // Add to group if needed
        if (newTab.id && targetGroupId)
        {
          await chrome.tabs.group({ tabIds: [newTab.id], groupId: targetGroupId });
        }

        setWasValidDrop(true);
      }
    }
    catch (error)
    {
      console.error('TabList drop operation failed:', error);
    }
  }, [visibleTabs, getSelectedItems, moveTab, groupTab, ungroupTab, moveGroup, clearSelection, setWasValidDrop, windowId]);

  // Register drop handler for tabList zone
  useEffect(() =>
  {
    registerDropHandler('tabList', handleTabListDrop);
    return () => unregisterDropHandler('tabList');
  }, [registerDropHandler, unregisterDropHandler, handleTabListDrop]);

  // Drag items provider - builds multi-item DragData from selection
  const getDragItems = useCallback((draggedId: string | number): DragItem[] =>
  {
    const selectedItems = getSelectedItems();
    const draggedIdStr = String(draggedId);

    // Check if dragged item is in selection
    const isTabInSelection = selectedItems.some(
      item => item.type === 'tab' && item.id === draggedIdStr.replace('tab-', '')
    );
    const isGroupInSelection = selectedItems.some(
      item => item.type === 'group' && `group-${item.id.replace('group-', '')}` === draggedIdStr
    );

    if (import.meta.env.DEV)
    {
      console.log('[getDragItems]', {
        draggedId,
        draggedIdStr,
        draggedIdWithoutPrefix: draggedIdStr.replace('tab-', ''),
        selectedItems,
        isTabInSelection,
        isGroupInSelection,
      });
    }

    if ((isTabInSelection || isGroupInSelection) && selectedItems.length > 1)
    {
      // Multi-drag: build DragItems for all selected
      return selectedItems
        .map(item =>
        {
          if (item.type === 'tab')
          {
            const tab = visibleTabs.find(t => t.id === parseInt(item.id, 10));
            if (tab)
            {
              return createTabDragItem(tab.id!, tab.title || '', tab.url, tab.groupId);
            }
          }
          else if (item.type === 'group')
          {
            const groupId = parseInt(item.id.replace('group-', ''), 10);
            const group = visibleTabGroups.find(g => g.id === groupId);
            const tabCount = visibleTabs.filter(t => t.groupId === groupId).length;
            if (group)
            {
              return createTabGroupDragItem(groupId, group.title || '', tabCount, group.color);
            }
          }
          return null;
        })
        .filter((item): item is DragItem => item !== null);
    }

    // Single drag: return empty array to use fallback from useDraggable data
    return [];
  }, [getSelectedItems, visibleTabs, visibleTabGroups]);

  // Register drag items provider for tabList zone
  useEffect(() =>
  {
    registerDragItemsProvider('tabList', getDragItems);
    return () => unregisterDragItemsProvider('tabList');
  }, [registerDragItemsProvider, unregisterDragItemsProvider, getDragItems]);

  const toggleGroup = (groupId: number | string) =>
  {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const closeGroup = (groupTabs: chrome.tabs.Tab[]) =>
  {
    const tabIds = groupTabs.map(tab => tab.id).filter((id): id is number => id !== undefined);
    closeTabs(tabIds);
  };

  // Move tab to a new window
  const moveToNewWindow = useCallback((tabId: number) =>
  {
    chrome.windows.create({ tabId });
  }, []);

  // Close tabs before/after/others (bounded to group if tab is grouped)
  const closeTabsBefore = useCallback((tabId: number) =>
  {
    const targetTab = visibleTabs.find(t => t.id === tabId);
    if (!targetTab) return;

    // If target tab is in a group, only operate on tabs in that group
    const scopedTabs = (targetTab.groupId && targetTab.groupId > 0)
      ? visibleTabs.filter(t => t.groupId === targetTab.groupId)
      : visibleTabs;

    const index = scopedTabs.findIndex(t => t.id === tabId);
    if (index <= 0) return;
    const tabIds = scopedTabs.slice(0, index)
      .map(t => t.id)
      .filter((id): id is number => id !== undefined);
    closeTabs(tabIds);
  }, [visibleTabs, closeTabs]);

  const closeTabsAfter = useCallback((tabId: number) =>
  {
    const targetTab = visibleTabs.find(t => t.id === tabId);
    if (!targetTab) return;

    const scopedTabs = (targetTab.groupId && targetTab.groupId > 0)
      ? visibleTabs.filter(t => t.groupId === targetTab.groupId)
      : visibleTabs;

    const index = scopedTabs.findIndex(t => t.id === tabId);
    if (index < 0 || index >= scopedTabs.length - 1) return;
    const tabIds = scopedTabs.slice(index + 1)
      .map(t => t.id)
      .filter((id): id is number => id !== undefined);
    closeTabs(tabIds);
  }, [visibleTabs, closeTabs]);

  const closeOthers = useCallback((tabId: number) =>
  {
    const targetTab = visibleTabs.find(t => t.id === tabId);
    if (!targetTab) return;

    const scopedTabs = (targetTab.groupId && targetTab.groupId > 0)
      ? visibleTabs.filter(t => t.groupId === targetTab.groupId)
      : visibleTabs;

    const tabIds = scopedTabs
      .filter(t => t.id !== tabId)
      .map(t => t.id)
      .filter((id): id is number => id !== undefined);
    closeTabs(tabIds);
  }, [visibleTabs, closeTabs]);

  // Close selected tabs (or single tab if not in selection)
  const handleCloseSelectedTabs = useCallback((clickedTabId: number) =>
  {
    const selectedItems = getSelectedItems();
    if (selectedItems.length > 1)
    {
      // Multiple selected - show confirmation dialog
      const tabIds = selectedItems
        .filter(item => item.type === 'tab')
        .map(item => parseInt(item.id, 10))
        .filter(id => !isNaN(id));
      setConfirmDeleteDialog({ isOpen: true, tabIds });
    }
    else
    {
      // Single tab - close directly
      closeTab(clickedTabId);
    }
  }, [getSelectedItems, closeTab]);

  // Pin selected tabs to sidebar (or single tab if not in selection)
  const handlePinSelectedTabs = useCallback((
    clickedUrl: string,
    clickedTitle: string,
    clickedFaviconUrl?: string
  ) =>
  {
    if (!onPin) return;

    const selectedItems = getSelectedItems();
    if (selectedItems.length > 1 && onPinMultiple)
    {
      // Multiple selected - pin all selected tabs that have URLs
      const selectedTabsToPin = selectedItems
        .filter(item => item.type === 'tab')
        .map(item => visibleTabs.find(t => t.id === parseInt(item.id, 10)))
        .filter((t): t is chrome.tabs.Tab => !!t && !!t.url && !t.pinned);

      const pins = selectedTabsToPin.map(tab => ({
        url: tab.url!,
        title: tab.title || tab.url!,
        faviconUrl: tab.favIconUrl,
      }));
      onPinMultiple(pins);
      clearSelection();
    }
    else
    {
      // Single tab - pin directly
      onPin(clickedUrl, clickedTitle, clickedFaviconUrl);
    }
  }, [onPin, onPinMultiple, getSelectedItems, visibleTabs, clearSelection]);

  // Confirm multi-close
  const handleConfirmMultiClose = useCallback(() =>
  {
    closeTabs(confirmDeleteDialog.tabIds);
    clearSelection();
    setConfirmDeleteDialog({ isOpen: false, tabIds: [] });
  }, [confirmDeleteDialog.tabIds, closeTabs, clearSelection]);

  // Get selection info for multi-selection actions
  const getTabSelectionInfo = useCallback(() =>
  {
    const items = getSelectedItems();
    const hasTabs = items.some(item => item.type === 'tab');
    const hasGroups = items.some(item => item.type === 'group');
    const onlyGroups = hasGroups && !hasTabs;

    // Get selected tab IDs
    const selectedTabIds = items
      .filter(item => item.type === 'tab')
      .map(item => parseInt(item.id, 10))
      .filter(id => !isNaN(id));

    // Get actual tab objects
    const selectedTabs = visibleTabs.filter(t => t.id && selectedTabIds.includes(t.id));

    // Get selected group IDs
    const selectedGroupIds = items
      .filter(item => item.type === 'group')
      .map(item => parseInt(item.id.replace('group-', ''), 10))
      .filter(id => !isNaN(id));

    // Get actual group objects
    const selectedGroups = visibleTabGroups.filter(g => selectedGroupIds.includes(g.id));

    // Collect all tab IDs including those in selected groups
    const allTabIds = new Set(selectedTabIds);
    for (const group of selectedGroups)
    {
      visibleTabs.filter(t => t.groupId === group.id).forEach(t => { if (t.id) allTabIds.add(t.id); });
    }

    return { items, hasTabs, hasGroups, onlyGroups, selectedTabs, selectedGroups, allTabIds: Array.from(allTabIds) };
  }, [getSelectedItems, visibleTabs, visibleTabGroups]);

  // Multi-selection dialogs
  const [addToBookmarkMultiDialog, setAddToBookmarkMultiDialog] = useState({ isOpen: false });
  const [moveToSpaceMultiDialog, setMoveToSpaceMultiDialog] = useState({ isOpen: false });
  const [saveGroupsToBookmarksDialog, setSaveGroupsToBookmarksDialog] = useState({ isOpen: false });

  // Open add to bookmark dialog for multi-selection
  const openAddSelectedToBookmarkDialog = useCallback(() =>
  {
    setAddToBookmarkMultiDialog({ isOpen: true });
  }, []);

  // Handle adding selected tabs to bookmark folder
  const handleAddSelectedToBookmarkFolder = useCallback(async (folderId: string) =>
  {
    const { selectedTabs, selectedGroups } = getTabSelectionInfo();

    // Create bookmarks for individual tabs
    for (const tab of selectedTabs)
    {
      if (tab.url && tab.title)
      {
        await createBookmark(folderId, tab.title, tab.url);
      }
    }

    // Create folders for groups with their tabs
    for (const group of selectedGroups)
    {
      const groupTabs = visibleTabs.filter(t => t.groupId === group.id && t.url);
      const folderName = group.title || 'Unnamed Group';
      createFolder(folderId, folderName, async (newFolder) =>
      {
        for (const tab of groupTabs)
        {
          if (tab.url && tab.title)
          {
            await createBookmark(newFolder.id, tab.title, tab.url);
          }
        }
      });
    }

    clearSelection();
    setAddToBookmarkMultiDialog({ isOpen: false });
    showToast('Added to bookmarks');
  }, [getTabSelectionInfo, visibleTabs, createBookmark, createFolder, clearSelection, showToast]);

  // Open move to space dialog for multi-selection
  const openMoveSelectedToSpaceDialog = useCallback(() =>
  {
    setMoveToSpaceMultiDialog({ isOpen: true });
  }, []);

  // Handle moving selected tabs/groups to a space
  const handleMoveSelectedToSpace = useCallback(async (spaceId: string) =>
  {
    const { allTabIds } = getTabSelectionInfo();
    for (const tabId of allTabIds)
    {
      await moveTabToSpace(tabId, spaceId);
    }
    clearSelection();
    setMoveToSpaceMultiDialog({ isOpen: false });
  }, [getTabSelectionInfo, moveTabToSpace, clearSelection]);

  // Move selected tabs/groups to new window
  const handleMoveSelectedToNewWindow = useCallback(async () =>
  {
    const { allTabIds } = getTabSelectionInfo();
    if (allTabIds.length > 0)
    {
      const newWindow = await chrome.windows.create({ tabId: allTabIds[0] });
      if (newWindow.id && allTabIds.length > 1)
      {
        await chrome.tabs.move(allTabIds.slice(1), { windowId: newWindow.id, index: -1 });
      }
    }
    clearSelection();
  }, [getTabSelectionInfo, clearSelection]);

  // Close selected tabs/groups (without requiring a clicked tab ID)
  const handleCloseSelectedFromMenu = useCallback(() =>
  {
    const { allTabIds } = getTabSelectionInfo();
    if (allTabIds.length > 1)
    {
      setConfirmDeleteDialog({ isOpen: true, tabIds: allTabIds });
    }
    else if (allTabIds.length === 1)
    {
      closeTab(allTabIds[0]);
      clearSelection();
    }
  }, [getTabSelectionInfo, closeTab, clearSelection]);

  // Open save groups to bookmarks dialog
  const openSaveGroupsToBookmarksDialog = useCallback(() =>
  {
    setSaveGroupsToBookmarksDialog({ isOpen: true });
  }, []);

  // Handle saving selected groups to bookmarks
  const handleSaveGroupsToBookmarksFolder = useCallback(async (folderId: string) =>
  {
    const { selectedGroups } = getTabSelectionInfo();
    let savedCount = 0;
    for (const group of selectedGroups)
    {
      const groupTabs = visibleTabs.filter(t => t.groupId === group.id);
      const folderName = group.title || 'Unnamed Group';
      const result = await saveTabGroupAsBookmarkFolder(folderId, folderName, groupTabs);
      if (result.success)
      {
        savedCount++;
      }
    }
    clearSelection();
    setSaveGroupsToBookmarksDialog({ isOpen: false });
    showToast('Groups saved to bookmarks');
  }, [getTabSelectionInfo, visibleTabs, clearSelection, showToast]);

  // Copy single URL to clipboard
  const handleCopyUrl = useCallback(async (url: string) =>
  {
    await navigator.clipboard.writeText(url);
  }, []);

  // Copy URLs of all selected tabs to clipboard
  const handleCopyUrls = useCallback(async () =>
  {
    const selectedItems = getSelectedItems();
    const urls: string[] = [];
    for (const item of selectedItems)
    {
      if (item.type === 'tab')
      {
        const tab = visibleTabs.find(t => t.id === parseInt(item.id, 10));
        if (tab?.url) urls.push(tab.url);
      }
    }
    if (urls.length > 0)
    {
      await navigator.clipboard.writeText(urls.join('\n'));
    }
  }, [getSelectedItems, visibleTabs]);

  // Check if multi-selection
  const isMultiSelection = (selectionCount ?? 0) > 1;

  // Check if selection has tabs
  const hasSelectedTabs = useCallback((): boolean =>
  {
    const { hasTabs } = getTabSelectionInfo();
    return hasTabs;
  }, [getTabSelectionInfo]);

  // Check if only groups are selected
  const onlyGroupsSelected = useCallback((): boolean =>
  {
    const { onlyGroups } = getTabSelectionInfo();
    return onlyGroups;
  }, [getTabSelectionInfo]);

  // Build menu content for Tabs section header
  const tabsMenuContent = (
    <>
      <ContextMenu.Item onSelect={() => {
        sortTabs('asc', visibleTabGroups, sortGroupsFirst);
      }}>
        <ArrowDownAZ size={14} className="mr-2" /> Sort by Domain (A-Z)
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => {
        sortTabs('desc', visibleTabGroups, sortGroupsFirst);
      }}>
        <ArrowDownZA size={14} className="mr-2" /> Sort by Domain (Z-A)
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={handleCloseAllTabs}>
        <X size={14} className="mr-2" /> Close Tabs
      </ContextMenu.Item>
    </>
  );

  return (
    <>
      {/* Tabs Label Row */}
      <SectionHeader
        label="Tabs"
        menuContent={tabsMenuContent}
        menuTitle="Tab options"
      />

      {/* Tabs list */}
      <div ref={tabListContainerRef} data-dnd-zone="tabList">
          {displayItems.map((item) =>
          {
            if (item.type === 'tab')
            {
              const tabId = String(item.tab.id);
              const isTarget = dropTargetId === tabId;
              const isExternalTarget = externalUrlDropTarget?.targetId === tabId;
              const itemIndex = flatVisibleItems.findIndex(i => i.id === tabId);
              const selectionItem: SelectionItem = { id: tabId, type: 'tab', index: itemIndex };
              return (
                <DraggableTab
                  key={item.tab.id}
                  tab={item.tab}
                  indentLevel={0}
                  isBeingDragged={multiDragInfo ? isTabSelected(tabId) : activeId === item.tab.id}
                  globalDragActive={!!activeId || !!externalUrlDropTarget}
                  showDropBefore={(isTarget && dropPosition === 'before') || (isExternalTarget && externalUrlDropTarget?.position === 'before')}
                  showDropAfter={(isTarget && dropPosition === 'after') || (isExternalTarget && externalUrlDropTarget?.position === 'after')}
                  isSelected={isTabSelected(tabId)}
                  onClose={handleCloseSelectedTabs}
                  onActivate={activateTab}
                  onDuplicate={duplicateTab}
                  onPin={handlePinSelectedTabs}
                  onOpenAddToGroupDialog={!useSpaces ? openAddToGroupDialog : undefined}
                  onOpenMoveToSpaceDialog={useSpaces && spaces.length > 0 ? openMoveToSpaceDialog : undefined}
                  onAddToBookmark={openAddToBookmarkDialog}
                  onMoveToNewWindow={moveToNewWindow}
                  onCloseTabsBefore={closeTabsBefore}
                  onCloseTabsAfter={closeTabsAfter}
                  onCloseOthers={closeOthers}
                  onSelectionClick={(e) => handleSelectionClick(selectionItem, e)}
                  onSelectionContextMenu={() => handleSelectionContextMenu(selectionItem)}
                  selectionCount={selectionCount}
                  isMultiSelection={isMultiSelection}
                  hasSelectedTabs={hasSelectedTabs()}
                  onAddSelectedToBookmark={openAddSelectedToBookmarkDialog}
                  onMoveSelectedToSpace={useSpaces && spaces.length > 0 ? openMoveSelectedToSpaceDialog : undefined}
                  onMoveSelectedToNewWindow={handleMoveSelectedToNewWindow}
                  onCopyUrl={handleCopyUrl}
                  onCopyUrls={handleCopyUrls}
                />
              );
            }
            else if (item.type === 'group')
            {
              // When in a space, show tabs without group header (flat list)
              if (isInSpace)
              {
                return (
                  <div key={`group-${item.group.id}`}>
                    {item.tabs.map((tab) =>
                    {
                      const tabId = String(tab.id);
                      const isTabTarget = dropTargetId === tabId;
                      const isExternalTabTarget = externalUrlDropTarget?.targetId === tabId;
                      const itemIndex = flatVisibleItems.findIndex(i => i.id === tabId);
                      const selectionItem: SelectionItem = { id: tabId, type: 'tab', index: itemIndex };
                      return (
                        <DraggableTab
                          key={tab.id}
                          tab={tab}
                          indentLevel={0}
                          isBeingDragged={multiDragInfo ? isTabSelected(tabId) : activeId === tab.id}
                          globalDragActive={!!activeId || !!externalUrlDropTarget}
                          showDropBefore={(isTabTarget && dropPosition === 'before') || (isExternalTabTarget && externalUrlDropTarget?.position === 'before')}
                          showDropAfter={(isTabTarget && dropPosition === 'after') || (isExternalTabTarget && externalUrlDropTarget?.position === 'after')}
                          isSelected={isTabSelected(tabId)}
                          onClose={handleCloseSelectedTabs}
                          onActivate={activateTab}
                          onDuplicate={duplicateTab}
                          onPin={handlePinSelectedTabs}
                          onOpenAddToGroupDialog={!useSpaces ? openAddToGroupDialog : undefined}
                          onOpenMoveToSpaceDialog={useSpaces && spaces.length > 0 ? openMoveToSpaceDialog : undefined}
                          onAddToBookmark={openAddToBookmarkDialog}
                          onMoveToNewWindow={moveToNewWindow}
                          onCloseTabsBefore={closeTabsBefore}
                          onCloseTabsAfter={closeTabsAfter}
                          onCloseOthers={closeOthers}
                          onSelectionClick={(e) => handleSelectionClick(selectionItem, e)}
                          onSelectionContextMenu={() => handleSelectionContextMenu(selectionItem)}
                          selectionCount={selectionCount}
                          isMultiSelection={isMultiSelection}
                          hasSelectedTabs={hasSelectedTabs()}
                          onAddSelectedToBookmark={openAddSelectedToBookmarkDialog}
                          onMoveSelectedToSpace={useSpaces && spaces.length > 0 ? openMoveSelectedToSpaceDialog : undefined}
                          onMoveSelectedToNewWindow={handleMoveSelectedToNewWindow}
                          onCopyUrl={handleCopyUrl}
                          onCopyUrls={handleCopyUrls}
                        />
                      );
                    })}
                  </div>
                );
              }

              // Normal view: show group header and indented tabs
              const isGroupExpanded = expandedGroups[item.group.id];
              const groupTargetId = `group-${item.group.id}`;
              const isTarget = dropTargetId === groupTargetId;
              const isExternalGroupTarget = externalUrlDropTarget?.targetId === groupTargetId;
              // When dragging a group, never show 'into' indicator (groups can't nest)
              const showDropInto = (!isDraggingGroup && isTarget && dropPosition === 'into') || (isExternalGroupTarget && externalUrlDropTarget?.position === 'into');
              // When dragging a group with 'after', show indicator on last tab instead of header
              const isGroupAfterTarget = isDraggingGroup && isTarget && dropPosition === 'after';
              // Show 'after' indicator for both 'after' and 'intoFirst' positions
              const showDropAfter = (!isDraggingGroup && isTarget && (dropPosition === 'after' || dropPosition === 'intoFirst')) ||
                (isExternalGroupTarget && (externalUrlDropTarget?.position === 'after' || externalUrlDropTarget?.position === 'intoFirst'));
              // Selection item for group header
              const groupItemIndex = flatVisibleItems.findIndex(i => i.id === groupTargetId);
              const groupSelectionItem: SelectionItem = { id: groupTargetId, type: 'group', index: groupItemIndex };
              return (
                <div key={`group-${item.group.id}`}>
                  <DraggableGroupHeader
                    group={item.group}
                    matchedSpace={spaces.find(s => s.name === item.group.title)}
                    tabCount={item.tabs.length}
                    isExpanded={isGroupExpanded}
                    isSelected={isTabSelected(groupTargetId)}
                    multiDragInfo={multiDragInfo}
                    globalDragActive={!!activeId || !!externalUrlDropTarget}
                    showDropBefore={(isTarget && dropPosition === 'before') || (isExternalGroupTarget && externalUrlDropTarget?.position === 'before')}
                    showDropAfter={showDropAfter}
                    showDropInto={showDropInto}
                    afterDropIndentPx={
                      ((isTarget && dropPosition === 'intoFirst' && !isDraggingGroup) ||
                       (isExternalGroupTarget && externalUrlDropTarget?.position === 'intoFirst'))
                        ? getIndentPadding(1)
                        : undefined
                    }
                    onClick={(e) => handleSelectionClick(groupSelectionItem, e)}
                    onToggle={() => toggleGroup(item.group.id)}
                    onCloseGroup={() => closeGroup(item.tabs)}
                    onSortGroup={(direction) => sortGroupTabs(item.group.id, direction)}
                    onChangeColor={() => openChangeColorDialog(item.group)}
                    onRename={() => openRenameGroupDialog(item.group)}
                    onNewTab={() => createTabInGroup(item.group.id)}
                    onExportToBookmarks={() => handleExportToBookmarks(item.group, item.tabs)}
                    isMultiSelection={isMultiSelection}
                    onlyGroupsSelected={onlyGroupsSelected()}
                    onSaveGroupsToBookmarks={openSaveGroupsToBookmarksDialog}
                    onMoveSelectedToSpace={useSpaces && spaces.length > 0 ? openMoveSelectedToSpaceDialog : undefined}
                    onMoveSelectedToNewWindow={handleMoveSelectedToNewWindow}
                    onCloseSelected={handleCloseSelectedFromMenu}
                  />
                  {isGroupExpanded && item.tabs.map((tab, index) =>
                  {
                    const tabId = String(tab.id);
                    const isTabTarget = dropTargetId === tabId;
                    const isExternalTabTarget = externalUrlDropTarget?.targetId === tabId;
                    const isLastTab = index === item.tabs.length - 1;
                    // When dragging a group with 'after', show indicator on last tab
                    const showGroupAfterOnLastTab = isLastTab && isGroupAfterTarget;
                    // Indent lines for tabs in group since drop stays within group
                    const indentPx = (isTabTarget || isExternalTabTarget) ? getIndentPadding(1) : undefined;
                    const itemIndex = flatVisibleItems.findIndex(i => i.id === tabId);
                    const selectionItem: SelectionItem = { id: tabId, type: 'tab', index: itemIndex };
                    // Check position for indent calculation
                    const effectivePosition = isExternalTabTarget ? externalUrlDropTarget?.position : dropPosition;
                    return (
                      <DraggableTab
                        key={tab.id}
                        tab={tab}
                        indentLevel={1}
                        isBeingDragged={multiDragInfo ? isTabSelected(tabId) : activeId === tab.id}
                        globalDragActive={!!activeId || !!externalUrlDropTarget}
                        showDropBefore={(isTabTarget && dropPosition === 'before') || (isExternalTabTarget && externalUrlDropTarget?.position === 'before')}
                        showDropAfter={(isTabTarget && dropPosition === 'after') || showGroupAfterOnLastTab || (isExternalTabTarget && externalUrlDropTarget?.position === 'after')}
                        beforeIndentPx={effectivePosition === 'before' ? indentPx : undefined}
                        afterIndentPx={effectivePosition === 'after' ? indentPx : undefined}
                        groupColor={item.group.color}
                        isLastInGroup={isLastTab}
                        isSelected={isTabSelected(tabId)}
                        onClose={handleCloseSelectedTabs}
                        onActivate={activateTab}
                        onDuplicate={duplicateTab}
                        onPin={handlePinSelectedTabs}
                        onOpenAddToGroupDialog={!useSpaces ? openAddToGroupDialog : undefined}
                        onOpenMoveToSpaceDialog={useSpaces && spaces.length > 0 ? openMoveToSpaceDialog : undefined}
                        onAddToBookmark={openAddToBookmarkDialog}
                        onMoveToNewWindow={moveToNewWindow}
                        onCloseTabsBefore={closeTabsBefore}
                        onCloseTabsAfter={closeTabsAfter}
                        onCloseOthers={closeOthers}
                        onSelectionClick={(e) => handleSelectionClick(selectionItem, e)}
                        onSelectionContextMenu={() => handleSelectionContextMenu(selectionItem)}
                        selectionCount={selectionCount}
                        isMultiSelection={isMultiSelection}
                        hasSelectedTabs={hasSelectedTabs()}
                        onAddSelectedToBookmark={openAddSelectedToBookmarkDialog}
                        onMoveSelectedToSpace={useSpaces && spaces.length > 0 ? openMoveSelectedToSpaceDialog : undefined}
                        onMoveSelectedToNewWindow={handleMoveSelectedToNewWindow}
                        onCopyUrl={handleCopyUrl}
                        onCopyUrls={handleCopyUrls}
                      />
                    );
                  })}
                </div>
              );
            }
          })}

          {/* + New Tab Row (also serves as end-of-list drop zone) */}
          <TreeRow
            ref={endOfListRef}
            depth={0}
            icon={<Plus size={14} />}
            title="New Tab"
            hasChildren={false}
            onClick={handleNewTab}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
          >
            {dropTargetId === 'end-of-list' && (
              <div
                className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 z-20"
              />
            )}
          </TreeRow>

          {/* Error message */}
          {error && (
            <p className="text-red-500 text-sm px-2 py-1 text-center">{error}</p>
          )}


      </div>

      <AddToGroupDialog
        isOpen={addToGroupDialog.isOpen}
        tabId={addToGroupDialog.tabId}
        tabGroups={visibleTabGroups}
        currentGroupId={addToGroupDialog.currentGroupId}
        onAddToGroup={groupTab}
        onCreateGroup={createGroupWithTab}
        onClose={closeAddToGroupDialog}
      />

      <SpaceNavigatorDialog
        isOpen={moveToSpaceDialog.isOpen}
        onClose={closeMoveToSpaceDialog}
        title="Move to Space"
        hideAllSpace
        excludeSpaceId={moveToSpaceDialog.currentSpaceId}
        onSelectSpace={handleMoveToSpace}
        showCurrentIndicator={false}
      />

      <ChangeGroupColorDialog
        isOpen={changeColorDialog.isOpen}
        group={changeColorDialog.group}
        onChangeColor={(groupId, color) => updateGroup(groupId, { color })}
        onClose={closeChangeColorDialog}
      />

      <RenameGroupDialog
        isOpen={renameGroupDialog.isOpen}
        group={renameGroupDialog.group}
        onRename={(groupId, title) => updateGroup(groupId, { title })}
        onClose={closeRenameGroupDialog}
      />

      <FolderPickerDialog
        isOpen={folderPickerDialog.isOpen}
        title="Select Destination Folder"
        onSelect={handleFolderSelected}
        onClose={closeFolderPickerDialog}
      />

      <FolderPickerDialog
        isOpen={addToBookmarkDialog.isOpen}
        title="Add Tab to Bookmark Folder"
        onSelect={handleAddToBookmarkFolderSelect}
        onClose={closeAddToBookmarkDialog}
        defaultFolderId={
          activeSpace?.bookmarkFolderPath
            ? findFolderByPath(activeSpace.bookmarkFolderPath)?.id
            : undefined
        }
      />

      <ExportConflictDialog
        isOpen={exportConflictDialog.isOpen}
        folderName={exportConflictDialog.folderName}
        onConfirm={handleExportConflictConfirm}
        onClose={closeExportConflictDialog}
      />

      <ConfirmDeleteDialog
        isOpen={confirmDeleteDialog.isOpen}
        itemCount={confirmDeleteDialog.tabIds.length}
        itemType="tabs"
        onConfirm={handleConfirmMultiClose}
        onClose={() => setConfirmDeleteDialog({ isOpen: false, tabIds: [] })}
      />

      {/* Multi-selection dialogs */}
      <FolderPickerDialog
        isOpen={addToBookmarkMultiDialog.isOpen}
        title="Add to Bookmark Folder"
        onSelect={handleAddSelectedToBookmarkFolder}
        onClose={() => setAddToBookmarkMultiDialog({ isOpen: false })}
        defaultFolderId={
          activeSpace?.bookmarkFolderPath
            ? findFolderByPath(activeSpace.bookmarkFolderPath)?.id
            : undefined
        }
      />

      <SpaceNavigatorDialog
        isOpen={moveToSpaceMultiDialog.isOpen}
        onClose={() => setMoveToSpaceMultiDialog({ isOpen: false })}
        title="Move to Space"
        hideAllSpace
        excludeSpaceId={activeSpace?.id}
        onSelectSpace={handleMoveSelectedToSpace}
        showCurrentIndicator={false}
      />

      <FolderPickerDialog
        isOpen={saveGroupsToBookmarksDialog.isOpen}
        title="Save Groups to Bookmark Folder"
        onSelect={handleSaveGroupsToBookmarksFolder}
        onClose={() => setSaveGroupsToBookmarksDialog({ isOpen: false })}
        defaultFolderId={
          activeSpace?.bookmarkFolderPath
            ? findFolderByPath(activeSpace.bookmarkFolderPath)?.id
            : undefined
        }
      />

      <Toast
        message={toastState.message}
        isVisible={toastState.isVisible}
        onDismiss={hideToast}
      />
    </>
  );
};