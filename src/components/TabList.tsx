import { useState, useRef, useEffect, useMemo, useCallback, forwardRef } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTabGroups } from '../hooks/useTabGroups';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useSpacesContext, Space } from '../contexts/SpacesContext';
import { SelectionItem } from '../contexts/SelectionContext';
import { useSelection } from '../hooks/useSelection';
import { useDragDrop, DropPosition } from '../hooks/useDragDrop';
import { useBookmarks } from '../hooks/useBookmarks';
import { SPEAKER_ICON_SIZE, LIVEBOOKMARKS_GROUP_NAME } from '../constants';

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
import { Globe, Volume2, Pin, Plus, X, ArrowDownAZ, ArrowDownZA, Edit, Palette, FolderPlus, Copy, SquareStack, Bookmark, ExternalLink, Unlink } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { getIndentPadding } from '../utils/indent';
import { calculateDropPosition } from '../utils/dragDrop';
import { matchesFilter } from '../utils/searchParser';
import { moveSingleTab, moveTabAfter } from '../utils/tabMove';
import { moveSingleGroup, moveGroupAfter } from '../utils/groupMove';
import { DropIndicators } from './DropIndicators';
import * as ContextMenu from './menu/ContextMenu';
import { useInView } from '../hooks/useInView';
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
import clsx from 'clsx';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIcon } from '../utils/spaceIcons';

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
  onKeepAsRegularTab?: (id: number) => void;
  onSelectionClick?: (e: React.MouseEvent) => void;
  onSelectionContextMenu?: () => void;
  selectionCount?: number;
  // Multi-selection actions
  isMultiSelection?: boolean;
  hasSelectedTabs?: boolean;
  onAddSelectedToBookmark?: () => void;
  onMoveSelectedToSpace?: () => void;
  onMoveSelectedToNewWindow?: () => void;
  onKeepSelectedAsRegularTabs?: () => void;
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
  onKeepAsRegularTab,
  onSelectionClick,
  onSelectionContextMenu,
  selectionCount: _selectionCount,
  isMultiSelection,
  hasSelectedTabs,
  onAddSelectedToBookmark,
  onMoveSelectedToSpace,
  onMoveSelectedToNewWindow,
  onKeepSelectedAsRegularTabs,
  attributes,
  listeners
}, ref) => {
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
      {onKeepAsRegularTab && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) =>
          {
            e.stopPropagation();
            if (tab.id) onKeepAsRegularTab(tab.id);
          }}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 rounded"
          title="Keep as Regular Tab"
          aria-label="Keep as regular tab"
        >
          <Unlink size={14} className="text-gray-700 dark:text-gray-200" />
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

  // Computed class for coloring - restore original rounding for background
  // Priority: selected > active > default
  const rowClassName = clsx(
    groupColor ? (isLastInGroup ? "rounded-b-lg rounded-t-none" : "rounded-none") : "",
    tab.active && "font-semibold",
    isSelected && groupColor
      ? clsx(GROUP_COLORS[groupColor]?.bgSelected, "text-gray-900 dark:text-gray-100")
      : tab.active
        ? groupColor
          ? clsx(GROUP_COLORS[groupColor]?.bgStrong, "text-gray-900 dark:text-gray-100")
          : isSelected
            ? undefined  // TreeRow handles selected+active ungrouped tabs
            : "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100"
        : groupColor
          ? clsx(GROUP_COLORS[groupColor]?.bg, "text-gray-700 dark:text-gray-200")
          : globalDragActive
            ? "text-gray-700 dark:text-gray-200"  // No hover ring during drag
            : "hover:ring-2 hover:ring-inset hover:ring-gray-300 dark:hover:ring-gray-600 text-gray-700 dark:text-gray-200"
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
              isActive={false} // Disable default active style, we handle it via className
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
              {onKeepSelectedAsRegularTabs && (
                <>
                  <ContextMenu.Item onSelect={onKeepSelectedAsRegularTabs}>
                    <Unlink size={14} className="mr-2" /> Keep as Regular Tabs
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                </>
              )}
              {hasSelectedTabs && onPin && (
                <>
                  <ContextMenu.Item onSelect={() => onPin(tab.url || '', tab.title || tab.url || '', tab.favIconUrl)}>
                    <Pin size={14} className="mr-2" /> Pin to Sidebar
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                </>
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
                <X size={14} className="mr-2" /> Close
              </ContextMenu.Item>
            </>
          ) : (
            // Single-item menu
            <>
          {onKeepAsRegularTab && (
            <>
              <ContextMenu.Item onSelect={() => { if (tab.id) onKeepAsRegularTab(tab.id); }}>
                <Unlink size={14} className="mr-2" /> Keep as Regular Tab
              </ContextMenu.Item>
              <ContextMenu.Separator />
            </>
          )}
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
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: props.tab.id!
  });

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
  listeners
}, ref) =>
{
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
}

const DraggableGroupHeader = ({ group, tabCount, ...props }: DraggableGroupHeaderProps) =>
{
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `group-${group.id}`,
  });

  return (
    <TabGroupHeader
      ref={setNodeRef}
      group={group}
      isDragging={isDragging}
      attributes={attributes}
      listeners={listeners}
      {...props}
    />
  );
};

// Drag overlay content for groups
const GroupDragOverlay = ({ group, matchedSpace, tabCount }: { group: chrome.tabGroups.TabGroup; matchedSpace?: Space; tabCount: number }) =>
{
  const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

  // Show space icon if group title matches a space, otherwise generic SquareStack
  // Icon is shown inside the badge with inverted colors for contrast
  const iconElement = matchedSpace
    ? getIcon(matchedSpace.icon, 12, true)
    : <SquareStack size={12} />;

  const titleComponent = (
    <div className="flex items-center">
      <span className={clsx("px-2 py-0.5 rounded-full font-medium text-white dark:text-black flex items-center gap-1 w-fit", colorStyle.badge)}>
        {iconElement}
        {group.title || 'Unnamed Group'}
      </span>
      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
        ({tabCount} {tabCount === 1 ? 'tab' : 'tabs'})
      </span>
    </div>
  );

  return (
    <div className="w-[280px]">
      <TreeRow
        depth={0}
        title={titleComponent}
        hideIcon
        hasChildren={true}
        className="pointer-events-none"
      />
    </div>
  );
};

// Drag overlay content - matches tab row layout with transparent background
const TabDragOverlay = ({ tab }: { tab: chrome.tabs.Tab }) =>
{
  const icon = tab.favIconUrl ? (
    <img src={tab.favIconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
  ) : (
    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
  );

  return (
    <div className="w-[280px]">
      <TreeRow
        depth={0}
        title={tab.title}
        icon={icon}
        hasChildren={false}
        className="pointer-events-none bg-blue-100 dark:bg-blue-900/50 rounded"
      />
    </div>
  );
};

// Multi-tab drag overlay - shows stacked items for multi-selection drag
type MultiDragFirstItemType =
  | { type: 'tab'; tab: chrome.tabs.Tab }
  | { type: 'group'; group: chrome.tabGroups.TabGroup; matchedSpace?: Space; tabCount: number };

interface MultiTabDragOverlayProps {
  count: number;
  firstItem: MultiDragFirstItemType;
}

const MultiTabDragOverlay = ({ count, firstItem }: MultiTabDragOverlayProps) =>
{
  // Render the appropriate overlay component based on first item type
  const overlayContent = firstItem.type === 'group' ? (
    <GroupDragOverlay
      group={firstItem.group}
      matchedSpace={firstItem.matchedSpace}
      tabCount={firstItem.tabCount}
    />
  ) : (
    <TabDragOverlay tab={firstItem.tab} />
  );

  return (
    <div className="relative pointer-events-none w-[280px]">
      {/* Stacked background layers (shown in reverse order for proper z-indexing) */}
      {count > 2 && (
        <div
          className="absolute w-full h-7 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800"
          style={{ top: 12, left: 12 }}
        />
      )}
      {count > 1 && (
        <div
          className="absolute w-full h-7 bg-blue-100 dark:bg-blue-900/70 rounded border border-blue-200 dark:border-blue-700"
          style={{ top: 6, left: 6 }}
        />
      )}
      {/* Front item with content */}
      <div className="relative bg-blue-100 dark:bg-blue-900/50 rounded border border-blue-300 dark:border-blue-600 flex items-center">
        <div className="flex-1">
          {overlayContent}
        </div>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded-full mr-2">
          {count} items
        </span>
      </div>
    </div>
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

export const TabList = ({ onPin, onPinMultiple, sortGroupsFirst = true, onExternalDropTargetChange, resolveBookmarkDropTarget, arcStyleEnabled = false, filterText = '', activeSpace: activeSpaceProp, useSpaces = true, onSpaceDropTargetChange }: TabListProps) =>
{
  const { tabs, closeTab, closeTabs, activateTab, moveTab, groupTab, ungroupTab, createGroupWithTab, createTabInGroup, createTab, duplicateTab, sortTabs, sortGroupTabs } = useTabs();
  const { tabGroups, updateGroup, moveGroup } = useTabGroups();
  const { getManagedTabIds, associateExistingTab } = useBookmarkTabsContext();
  const { spaces, activeSpace: activeSpaceFromContext } = useSpacesContext();

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
  const visibleTabGroups = useMemo(() =>
  {
    return tabGroups;
  }, [tabGroups]);

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
    try
    {
      // Special case: "All" space - ungroup the tab
      if (spaceId === 'all')
      {
        await chrome.tabs.ungroup(tabId);
        showToast('Removed from group');
        return;
      }

      const space = spaces.find(s => s.id === spaceId);
      if (!space) return;

      // Get current window
      const currentWindow = await chrome.windows.getCurrent();
      if (!currentWindow.id) return;

      // Find existing Chrome group with Space's name
      const groups = await chrome.tabGroups.query({ windowId: currentWindow.id, title: space.name });

      if (groups.length > 0)
      {
        // Add to existing group
        await chrome.tabs.group({ tabIds: [tabId], groupId: groups[0].id });
      }
      else
      {
        // Create new group with this tab
        const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
        await chrome.tabGroups.update(newGroupId, {
          title: space.name,
          color: space.color,
        });
      }

      showToast(`Moved to ${space.name}`);
    }
    catch (error)
    {
      if (import.meta.env.DEV) console.error('[moveTabToSpace] Failed:', error);
    }
  }, [spaces, showToast]);

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
  const { findFolderInParent, findFolderByPath, createFolder, createBookmark, createBookmarksBatch, getBookmark, getChildren, clearFolder, getBookmarkPath } = useBookmarks();

  const handleAddToBookmarkFolderSelect = useCallback(async (folderId: string) =>
  {
    const tab = addToBookmarkDialog.tab;
    if (!tab || !tab.url || !tab.title) return;

    // Create bookmark in the selected folder
    const newBookmark = await createBookmark(folderId, tab.title, tab.url);

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

  // Filter out empty new tabs
  const filterBookmarkableTabs = useCallback((tabList: chrome.tabs.Tab[]): chrome.tabs.Tab[] =>
  {
    return tabList.filter(tab =>
      tab.url &&
      tab.url !== 'chrome://newtab/'
    );
  }, []);

  // Create bookmarks in a folder (batch operation for performance)
  const createBookmarksInFolder = useCallback(async (
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
  }, [filterBookmarkableTabs, showToast]);

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
        await createBookmarksInFolder(newFolder.id, groupTabs);
        const folderPath = await getBookmarkPath(newFolder.id);
        showToast(`Bookmark folder "${folderPath}" is created`);
      });
    }
  }, [folderPickerDialog, findFolderInParent, createFolder, createBookmarksInFolder, getBookmarkPath, showToast]);

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
      await createBookmarksInFolder(existingFolder.id, tabsToExport);
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
        await createBookmarksInFolder(existingFolder.id, newTabs);
        showToast(`Added ${newTabs.length} new bookmarks to "${folderPath}"`);
      }
      else
      {
        showToast('All tabs already exist in folder');
      }
    }
  }, [exportConflictDialog, clearFolder, createBookmarksInFolder, getChildren, getBookmarkPath, showToast]);

  const closeExportConflictDialog = useCallback(() =>
  {
    setExportConflictDialog({ isOpen: false, folderName: '', existingFolder: null, tabsToExport: [], parentFolderId: '2' });
  }, []);

  // Shared drag-drop state from hook (supports both tab IDs and group IDs like "group-123")
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
  } = useDragDrop<number | string>();

  // Drag state for tab or group
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const [activeGroup, setActiveGroup] = useState<{ group: chrome.tabGroups.TabGroup; tabCount: number } | null>(null);
  // Multi-selection drag state - first item can be tab or group
  type MultiDragFirstItem =
    | { type: 'tab'; tab: chrome.tabs.Tab }
    | { type: 'group'; group: chrome.tabGroups.TabGroup; matchedSpace?: Space; tabCount: number };
  const [multiDragInfo, setMultiDragInfo] = useState<{ count: number; firstItem: MultiDragFirstItem } | null>(null);

  // Ref to store the computed drag overlay offset (based on cursor position within element at drag start)
  const dragStartOffsetRef = useRef<number>(24);

  // External drop target for cross-context drops (tab → bookmark)
  const [localExternalTarget, setLocalExternalTarget] = useState<ExternalDropTarget | null>(null);

  // Space drop target for tab → space drops
  const [localSpaceDropTarget, setLocalSpaceDropTarget] = useState<string | null>(null);

  // Helper to clear all DnD state
  const clearDndState = useCallback(() =>
  {
    setActiveId(null);
    setActiveTab(null);
    setActiveGroup(null);
    setMultiDragInfo(null);
    setDropTargetId(null);
    setDropPosition(null);
    setLocalExternalTarget(null);
    onExternalDropTargetChange?.(null);
    setLocalSpaceDropTarget(null);
    onSpaceDropTargetChange?.(null);
  }, [setActiveId, setDropTargetId, setDropPosition, onExternalDropTargetChange, onSpaceDropTargetChange]);

  // Helper to check if we're dragging a group
  const isDraggingGroup = typeof activeId === 'string' && String(activeId).startsWith('group-');

  // Initialize all groups as expanded when they first appear
  useEffect(() =>
  {
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
  }, [visibleTabGroups]);

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
      setTimeout(() =>
      {
        const element = document.querySelector(`[data-tab-id="${activeTab.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [visibleTabs, activeSpace]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Build display items: groups and ungrouped tabs in natural browser order
  // Uses visibleTabs and visibleTabGroups to exclude SideBarForArc group
  // Also excludes LiveBookmarks group (managed tabs are shown via bookmarks)
  const displayItems = useMemo<DisplayItem[]>(() =>
  {
    // Find LiveBookmarks group to exclude from normal display
    const liveBookmarksGroup = visibleTabGroups.find(
      g => g.title === LIVEBOOKMARKS_GROUP_NAME
    );
    const liveBookmarksGroupId = liveBookmarksGroup?.id;

    const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
    visibleTabGroups.forEach((g) =>
    {
      // Skip LiveBookmarks group
      if (g.id !== liveBookmarksGroupId)
      {
        groupMap.set(g.id, g);
      }
    });

    const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();

    visibleTabs.forEach((tab) =>
    {
      const groupId = tab.groupId ?? -1;
      // Skip tabs in LiveBookmarks group
      if (groupId !== -1 && groupId !== liveBookmarksGroupId)
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

      // Skip tabs in LiveBookmarks group
      if (groupId === liveBookmarksGroupId)
      {
        return;
      }

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

  const handleDragStart = useCallback((event: DragStartEvent) =>
  {
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

    const id = event.active.id;

    // Check if dragging a group (ID starts with "group-")
    if (typeof id === 'string' && id.startsWith('group-'))
    {
      const groupId = parseInt(id.replace('group-', ''), 10);
      const group = visibleTabGroups.find(g => g.id === groupId);
      const groupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === groupId);

      // For groups: if not in selection, clear selection
      if (!isTabSelected(id))
      {
        clearSelection();
        setMultiDragInfo(null);
      }
      else
      {
        // Group is in selection - check for multi-drag
        // Only count selected tabs (ignore groups in selection)
        const selectedItems = getSelectedItems();
        const selectedTabItems = selectedItems.filter(item => item.type === 'tab');

        if (selectedTabItems.length > 0)
        {
          // Sort by index to get first visible tab
          const sortedTabItems = [...selectedTabItems].sort((a, b) => a.index - b.index);
          const firstTabItem = sortedTabItems[0];

          const tab = visibleTabs.find(t => String(t.id) === firstTabItem.id);
          if (tab)
          {
            setMultiDragInfo({
              count: selectedTabItems.length,
              firstItem: { type: 'tab', tab }
            });
          }
          else
          {
            setMultiDragInfo(null);
          }
        }
        else
        {
          setMultiDragInfo(null);
        }
      }

      setActiveId(id);
      setActiveTab(null);
      setActiveGroup(group ? { group, tabCount: groupTabs.length } : null);
    }
    else
    {
      // Dragging a tab
      const tabId = id as number;
      const tabIdStr = String(tabId);

      // If dragged item is NOT in selection, clear selection and select only this item
      if (!isTabSelected(tabIdStr))
      {
        clearSelection();
        setMultiDragInfo(null);
      }
      else
      {
        // If dragged item IS in selection, keep selection (drag all selected)
        // Only count selected tabs (ignore groups in selection)
        const selectedItems = getSelectedItems();
        const selectedTabItems = selectedItems.filter(item => item.type === 'tab');

        if (selectedTabItems.length > 1)
        {
          // Sort by index to get first visible tab
          const sortedTabItems = [...selectedTabItems].sort((a, b) => a.index - b.index);
          const firstTabItem = sortedTabItems[0];

          const tab = visibleTabs.find(t => String(t.id) === firstTabItem.id);
          if (tab)
          {
            setMultiDragInfo({
              count: selectedTabItems.length,
              firstItem: { type: 'tab', tab }
            });
          }
          else
          {
            setMultiDragInfo(null);
          }
        }
        else
        {
          setMultiDragInfo(null);
        }
      }

      setActiveId(tabId);
      const tab = visibleTabs.find(t => t.id === tabId);
      setActiveTab(tab || null);
      setActiveGroup(null);
    }
  }, [visibleTabs, visibleTabGroups, spaces, setActiveId, isTabSelected, clearSelection, getSelectedItems]);

  const handleDragMove = useCallback((event: DragMoveEvent) =>
  {
    const { active } = event;
    const currentX = pointerPositionRef.current.x;
    const currentY = pointerPositionRef.current.y;

    // Check if we're dragging a group
    const isDraggingGroupNow = typeof active.id === 'string' && String(active.id).startsWith('group-');
    const draggedGroupId = isDraggingGroupNow
      ? parseInt(String(active.id).replace('group-', ''), 10)
      : null;

    // Check if selection contains tabs - if so, treat as tab drag behavior
    // (mixed selection of groups + tabs should behave like tab drag)
    const selectedItems = getSelectedItems();
    const hasSelectedTabs = selectedItems.some(item => item.type === 'tab');
    const treatAsGroupDrag = isDraggingGroupNow && !hasSelectedTabs;

    // Find element under pointer
    const elements = document.elementsFromPoint(currentX, currentY);

    // Check for group header first
    const groupHeaderElement = elements.find(el =>
      el.hasAttribute('data-group-header-id')
    ) as HTMLElement | undefined;

    if (groupHeaderElement)
    {
      const groupId = groupHeaderElement.getAttribute('data-group-header-id');
      if (groupId)
      {
        const targetGroupId = parseInt(groupId, 10);

        // If dragging a group (without tabs in selection), prevent dropping on self
        if (treatAsGroupDrag && targetGroupId === draggedGroupId)
        {
          setDropTargetId(null);
          setDropPosition(null);
          clearAutoExpandTimer();
          return;
        }

        if (treatAsGroupDrag)
        {
          // When dragging groups-only over group header: always "before"
          // (hovering on header = top half of group area)
          setDropTargetId(`group-${groupId}`);
          setDropPosition('before');
          clearAutoExpandTimer();
          // Clear external target when hovering internal target
          setLocalExternalTarget(null);
          onExternalDropTargetChange?.(null);
          return;
        }

        // When dragging a tab: allow before/after/into (isContainer=true)
        let position = calculateDropPosition(groupHeaderElement, currentY, true);

        // For expanded groups, 'after' (bottom 25%) becomes 'intoFirst' (insert at index 0)
        if (expandedGroups[targetGroupId] && position === 'after')
        {
          position = 'intoFirst';
        }

        setDropTargetId(`group-${groupId}`);
        setDropPosition(position);

        // Auto-expand/collapse group after 1s hover on 'into' zone
        if (position === 'into')
        {
          setAutoExpandTimer(targetGroupId, () =>
          {
            // Expand only (don't collapse if already expanded)
            setExpandedGroups(prev => prev[targetGroupId] ? prev : { ...prev, [targetGroupId]: true });
          });
        }
        else
        {
          clearAutoExpandTimer();
        }
        // Clear external target when hovering internal target
        setLocalExternalTarget(null);
        onExternalDropTargetChange?.(null);
        return;
      }
    }

    // Check for tab
    const tabElement = elements.find(el =>
      el.hasAttribute('data-tab-id') &&
      el.getAttribute('data-tab-id') !== String(active.id)
    ) as HTMLElement | undefined;

    if (tabElement)
    {
      const tabId = tabElement.getAttribute('data-tab-id');
      if (tabId)
      {
        const tabGroupId = parseInt(tabElement.getAttribute('data-group-id') || '-1', 10);

        // If dragging groups-only, prevent dropping on own tabs
        if (treatAsGroupDrag && tabGroupId === draggedGroupId)
        {
          setDropTargetId(null);
          setDropPosition(null);
          clearAutoExpandTimer();
          return;
        }

        // If dragging groups-only over another group's tabs, treat the entire group as one unit
        if (treatAsGroupDrag && tabGroupId !== -1)
        {
          // Find the group's bounding area (header + all tabs)
          const groupHeader = document.querySelector(`[data-group-header-id="${tabGroupId}"]`) as HTMLElement | null;
          const groupTabs = document.querySelectorAll(`[data-group-id="${tabGroupId}"]`);

          if (groupHeader && groupTabs.length > 0)
          {
            const headerRect = groupHeader.getBoundingClientRect();
            const lastTabRect = (groupTabs[groupTabs.length - 1] as HTMLElement).getBoundingClientRect();

            // Combined group area: from top of header to bottom of last tab
            const groupTop = headerRect.top;
            const groupBottom = lastTabRect.bottom;
            const groupHeight = groupBottom - groupTop;

            // 50% threshold: before if in top half, after if in bottom half
            const relativeY = currentY - groupTop;
            const position = relativeY < groupHeight * 0.5 ? 'before' : 'after';

            setDropTargetId(`group-${tabGroupId}`);
            setDropPosition(position);
            clearAutoExpandTimer();
            return;
          }
        }

        // Normal tab drop (for tab dragging, or ungrouped tabs)
        const position = calculateDropPosition(tabElement, currentY, false);
        setDropTargetId(tabId);
        setDropPosition(position);
        clearAutoExpandTimer();
        // Clear external target when hovering internal target
        setLocalExternalTarget(null);
        onExternalDropTargetChange?.(null);
        return;
      }
    }

    // Check for bookmark item (external drop target) - use shared resolver
    const resolver = resolveBookmarkDropTarget?.();
    const bookmarkTarget = resolver?.(currentX, currentY);

    if (bookmarkTarget)
    {
      let { position } = bookmarkTarget;

      // For groups on non-folders: only allow before/after (no "into")
      if (isDraggingGroupNow && !bookmarkTarget.isFolder && position === 'into')
      {
        position = 'after';
      }

      const newTarget: ExternalDropTarget = { ...bookmarkTarget, position: position! };

      setLocalExternalTarget(newTarget);
      onExternalDropTargetChange?.(newTarget);
      // Clear internal drop targets
      setDropTargetId(null);
      setDropPosition(null);
      onSpaceDropTargetChange?.(null);
      // Auto-expand timer is managed by the resolver
      return;
    }

    // Check for space button (tab → space drop) - only for tabs, not groups
    if (!isDraggingGroupNow)
    {
      const spaceButton = elements.find(el =>
        el.hasAttribute('data-space-button')
      ) as HTMLElement | undefined;

      if (spaceButton)
      {
        const spaceId = spaceButton.getAttribute('data-space-id');
        if (spaceId)
        {
          // Set space as drop target (both local state and callback)
          setLocalSpaceDropTarget(spaceId);
          onSpaceDropTargetChange?.(spaceId);
          // Clear other drop targets
          setDropTargetId(null);
          setDropPosition(null);
          setLocalExternalTarget(null);
          onExternalDropTargetChange?.(null);
          clearAutoExpandTimer();
          return;
        }
      }
    }

    // Clear space drop target when not hovering space button
    if (localSpaceDropTarget)
    {
      setLocalSpaceDropTarget(null);
      onSpaceDropTargetChange?.(null);
    }

    // Check if pointer is in end-of-list drop zone (using sentinel element)
    // Skip when in a space - dropping here would move tab outside the space group
    const endOfListRect = endOfListRef.current?.getBoundingClientRect();
    if (endOfListRect && currentY >= endOfListRect.top && !isInSpace)
    {
      setDropTargetId('end-of-list');
      setDropPosition('after');
      clearAutoExpandTimer();
      setLocalExternalTarget(null);
      onExternalDropTargetChange?.(null);
      return;
    }

    // No valid target
    setDropTargetId(null);
    setDropPosition(null);
    setLocalExternalTarget(null);
    onExternalDropTargetChange?.(null);
    setLocalSpaceDropTarget(null);
    onSpaceDropTargetChange?.(null);
    clearAutoExpandTimer();
  }, [setDropTargetId, setDropPosition, setAutoExpandTimer, clearAutoExpandTimer, onExternalDropTargetChange, expandedGroups, localSpaceDropTarget, onSpaceDropTargetChange, isInSpace, getSelectedItems]);

  const handleDragEnd = useCallback(async (_event: DragEndEvent) =>
  {
    clearAutoExpandTimer();

    // Handle external drop (tab → bookmark) first
    if (localExternalTarget && activeId && typeof activeId === 'number')
    {
      const tab = visibleTabs.find(t => t.id === activeId);
      if (tab && tab.url && tab.title)
      {
        const { bookmarkId: targetBookmarkId, position, isFolder } = localExternalTarget;

        let parentId: string;
        let index: number | undefined;

        if (position === 'into' && isFolder)
        {
          // Drop into folder - add at the end
          parentId = targetBookmarkId;
          const children = await getChildren(targetBookmarkId);
          index = children.length;
        }
        else if (position === 'intoFirst')
        {
          // Drop into expanded folder at beginning (bottom 25% of expanded folder)
          parentId = targetBookmarkId;
          index = 0;
        }
        else
        {
          // Drop before/after a bookmark - need to get target's parent and index
          const targetBookmark = await getBookmark(targetBookmarkId);
          if (targetBookmark && targetBookmark.parentId !== undefined && targetBookmark.index !== undefined)
          {
            parentId = targetBookmark.parentId;
            index = position === 'before' ? targetBookmark.index : targetBookmark.index + 1;
          }
          else
          {
            // Fallback: drop into parent or cancel
            parentId = targetBookmarkId;
            index = undefined;
          }
        }

        // Create bookmark at the calculated position
        const newBookmark = await createBookmark(parentId, tab.title, tab.url, index);

        // If Arc style is enabled, associate the tab with the new bookmark
        // This makes it a managed/persistent tab (hidden from Tabs section)
        if (arcStyleEnabled && newBookmark && tab.id)
        {
          await associateExistingTab(tab.id, newBookmark.id);
        }
      }

      // Clear all state
      wasValidDropRef.current = true;
      clearDndState();
      return;
    }

    // Handle external drop (group → bookmark) - creates subfolder with group tabs
    if (localExternalTarget && activeGroup)
    {
      const { group, tabCount: _ } = activeGroup;
      const groupTabs = visibleTabs.filter(t => t.groupId === group.id);
      const bookmarkableTabs = filterBookmarkableTabs(groupTabs);

      if (bookmarkableTabs.length === 0)
      {
        showToast('No bookmarkable tabs to export');
      }
      else
      {
        const { bookmarkId: targetBookmarkId, position, isFolder } = localExternalTarget;
        const folderName = group.title || 'Unnamed Group';

        let parentId: string;
        let folderIndex: number | undefined;

        if (position === 'into' && isFolder)
        {
          // Drop into folder - create subfolder at the end
          parentId = targetBookmarkId;
          const children = await getChildren(targetBookmarkId);
          folderIndex = children.length;
        }
        else if (position === 'intoFirst')
        {
          // Drop into expanded folder at beginning (bottom 25% of expanded folder)
          parentId = targetBookmarkId;
          folderIndex = 0;
        }
        else
        {
          // Drop before/after a bookmark - create subfolder as sibling
          const targetBookmark = await getBookmark(targetBookmarkId);
          if (targetBookmark && targetBookmark.parentId !== undefined && targetBookmark.index !== undefined)
          {
            parentId = targetBookmark.parentId;
            folderIndex = position === 'before' ? targetBookmark.index : targetBookmark.index + 1;
          }
          else
          {
            // Fallback: create in target (shouldn't happen)
            parentId = targetBookmarkId;
            folderIndex = undefined;
          }
        }

        // Create subfolder with the group name at the specified position
        const createArg: chrome.bookmarks.BookmarkCreateArg = { parentId, title: folderName };
        if (folderIndex !== undefined)
        {
          createArg.index = folderIndex;
        }

        chrome.bookmarks.create(createArg, async (newFolder) =>
        {
          if (chrome.runtime.lastError || !newFolder)
          {
            console.error('Failed to create bookmark folder:', chrome.runtime.lastError?.message);
            return;
          }
          // Bookmark all tabs in the new folder
          await createBookmarksInFolder(newFolder.id, bookmarkableTabs);
          // Get the full path for the toast message
          const folderPath = await getBookmarkPath(newFolder.id);
          showToast(`Bookmark folder "${folderPath}" is created`);
        });
      }

      // Clear all state
      wasValidDropRef.current = true;
      clearDndState();
      return;
    }

    // Handle space drop (tab → space) - moves tab to space's Chrome group
    if (localSpaceDropTarget && activeId && typeof activeId === 'number')
    {
      await moveTabToSpace(activeId, localSpaceDropTarget);

      // Clear all state
      wasValidDropRef.current = true;
      clearDndState();
      return;
    }

    // Track if this is a valid drop (affects animation)
    const isValidDrop = !!(dropTargetId && dropPosition && activeId);
    wasValidDropRef.current = isValidDrop;

    if (!isValidDrop)
    {
      clearDndState();
      return;
    }

    // Check if we're dragging a group
    const isDraggingGroupNow = typeof activeId === 'string' && String(activeId).startsWith('group-');

    // Calculate selectedTabIds early to decide between GROUP DRAG vs TAB DRAG
    const selectedItems = getSelectedItems();
    const selectedTabIds = selectedItems
      .filter(item => item.type === 'tab')
      .map(item => parseInt(item.id, 10))
      .filter(id => !isNaN(id));
    const hasSelectedTabs = selectedTabIds.length > 0;

    if (isDraggingGroupNow && !hasSelectedTabs)
    {
      // --- GROUP DRAG HANDLING (only when no tabs are selected) ---
      const draggedGroupId = parseInt(String(activeId).replace('group-', ''), 10);

      // Check for multi-group selection
      const selectedGroupIds = selectedItems
        .filter(item => item.type === 'group')
        .map(item => parseInt(item.id.replace('group-', ''), 10))
        .filter(id => !isNaN(id));

      const isMultiGroupDrag = selectedGroupIds.length > 1 &&
        selectedGroupIds.includes(draggedGroupId);

      if (isMultiGroupDrag)
      {
        // --- MULTI-GROUP DRAG ---
        // Sort groups by first tab index to maintain relative order
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

        // First group uses full moveSingleGroup
        let result = moveSingleGroup({
          groupId: sortedGroups[0].groupId,
          sourceFirstIndex: sortedGroups[0].firstIndex,
          sourceTabCount: sortedGroups[0].tabCount,
          dropTargetId,
          dropPosition,
          visibleTabs,
          moveGroup
        });

        // Subsequent groups chain off previous result
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
        // --- SINGLE GROUP DRAG ---
        const sourceGroupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === draggedGroupId);
        moveSingleGroup({
          groupId: draggedGroupId,
          sourceFirstIndex: sourceGroupTabs[0]?.index ?? 0,
          sourceTabCount: sourceGroupTabs.length,
          dropTargetId,
          dropPosition,
          visibleTabs,
          moveGroup
        });
      }
    }
    else
    {
      // --- TAB DRAG HANDLING (single tab or multi-tab selection, ignores groups) ---
      // Note: selectedItems and selectedTabIds are already calculated above

      // Check if dragged item is in selection (multi-drag scenario)
      // When dragging a group with selected tabs, treat as multi-drag of the selected tabs
      const isMultiDrag = selectedTabIds.length > 1 ||
        (isDraggingGroupNow && selectedTabIds.length > 0);

      // When dragging a group, use the first selected tab as the source reference
      const sourceTabId = isDraggingGroupNow ? selectedTabIds[0] : activeId;
      const sourceTab = visibleTabs.find(t => t.id === sourceTabId);

      if (!sourceTab)
      {
        clearDndState();
        return;
      }

      const isGroupHeaderTarget = dropTargetId.startsWith('group-');

      if (isMultiDrag)
      {
        // --- MULTI-TAB DRAG ---
        // Get all selected tabs
        const selectedTabs = selectedTabIds
          .map(id => visibleTabs.find(t => t.id === id))
          .filter((t): t is chrome.tabs.Tab => t !== undefined);

        if (selectedTabs.length === 0)
        {
          return;
        }

        // Sort tabs by index to maintain relative order
        const sortedTabs = [...selectedTabs].sort((a, b) => a.index - b.index);

        // First tab uses full moveSingleTab
        let result = moveSingleTab({
          tabId: sortedTabs[0].id!,
          sourceIndex: sortedTabs[0].index,
          sourceGroupId: sortedTabs[0].groupId ?? -1,
          dropTargetId,
          dropPosition,
          isGroupHeaderTarget,
          visibleTabs,
          moveTab,
          groupTab,
          ungroupTab
        });

        // Subsequent tabs chain off the previous result
        if (result)
        {
          for (let i = 1; i < sortedTabs.length; i++)
          {
            const tab = sortedTabs[i];
            result = moveTabAfter({
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
        // --- SINGLE TAB DRAG ---
        moveSingleTab({
          tabId: activeId as number,
          sourceIndex: sourceTab.index,
          sourceGroupId: sourceTab.groupId ?? -1,
          dropTargetId,
          dropPosition,
          isGroupHeaderTarget,
          visibleTabs,
          moveTab,
          groupTab,
          ungroupTab
        });
      }
    }

    // Reset state
    clearDndState();
  }, [activeId, dropTargetId, dropPosition, visibleTabs, expandedGroups, groupTab, ungroupTab, moveTab, moveGroup, clearAutoExpandTimer, setActiveId, setDropTargetId, setDropPosition, localExternalTarget, onExternalDropTargetChange, createBookmark, getBookmark, getChildren, arcStyleEnabled, associateExistingTab, localSpaceDropTarget, onSpaceDropTargetChange, moveTabToSpace, getSelectedItems, clearSelection, clearDndState]);

  // Drag cancel handler (e.g., Escape key)
  const handleDragCancel = useCallback(() =>
  {
    clearAutoExpandTimer();
    wasValidDropRef.current = false;

    // Reset drag state
    clearDndState();
  }, [clearAutoExpandTimer, clearDndState]);

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
    for (const group of selectedGroups)
    {
      const groupTabs = filterBookmarkableTabs(visibleTabs.filter(t => t.groupId === group.id));
      const folderName = group.title || 'Unnamed Group';
      createFolder(folderId, folderName, async (newFolder) =>
      {
        await createBookmarksInFolder(newFolder.id, groupTabs);
      });
    }
    clearSelection();
    setSaveGroupsToBookmarksDialog({ isOpen: false });
    showToast('Groups saved to bookmarks');
  }, [getTabSelectionInfo, visibleTabs, filterBookmarkableTabs, createFolder, createBookmarksInFolder, clearSelection, showToast]);

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
          {displayItems.map((item) =>
          {
            if (item.type === 'tab')
            {
              const tabId = String(item.tab.id);
              const isTarget = dropTargetId === tabId;
              const itemIndex = flatVisibleItems.findIndex(i => i.id === tabId);
              const selectionItem: SelectionItem = { id: tabId, type: 'tab', index: itemIndex };
              return (
                <DraggableTab
                  key={item.tab.id}
                  tab={item.tab}
                  indentLevel={0}
                  isBeingDragged={activeId === item.tab.id && !multiDragInfo}
                  globalDragActive={!!activeId}
                  showDropBefore={isTarget && dropPosition === 'before'}
                  showDropAfter={isTarget && dropPosition === 'after'}
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
                      const itemIndex = flatVisibleItems.findIndex(i => i.id === tabId);
                      const selectionItem: SelectionItem = { id: tabId, type: 'tab', index: itemIndex };
                      return (
                        <DraggableTab
                          key={tab.id}
                          tab={tab}
                          indentLevel={0}
                          isBeingDragged={activeId === tab.id && !multiDragInfo}
                          globalDragActive={!!activeId}
                          showDropBefore={isTabTarget && dropPosition === 'before'}
                          showDropAfter={isTabTarget && dropPosition === 'after'}
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
              // When dragging a group, never show 'into' indicator (groups can't nest)
              const showDropInto = !isDraggingGroup && isTarget && dropPosition === 'into';
              // When dragging a group with 'after', show indicator on last tab instead of header
              const isGroupAfterTarget = isDraggingGroup && isTarget && dropPosition === 'after';
              // Show 'after' indicator for both 'after' and 'intoFirst' positions
              const showDropAfter = !isDraggingGroup && isTarget && (dropPosition === 'after' || dropPosition === 'intoFirst');
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
                    globalDragActive={!!activeId}
                    showDropBefore={isTarget && dropPosition === 'before'}
                    showDropAfter={showDropAfter}
                    showDropInto={showDropInto}
                    afterDropIndentPx={
                      isTarget && dropPosition === 'intoFirst' && !isDraggingGroup
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
                    const isLastTab = index === item.tabs.length - 1;
                    // When dragging a group with 'after', show indicator on last tab
                    const showGroupAfterOnLastTab = isLastTab && isGroupAfterTarget;
                    // Indent lines for tabs in group since drop stays within group
                    const indentPx = isTabTarget ? getIndentPadding(1) : undefined;
                    const itemIndex = flatVisibleItems.findIndex(i => i.id === tabId);
                    const selectionItem: SelectionItem = { id: tabId, type: 'tab', index: itemIndex };
                    return (
                      <DraggableTab
                        key={tab.id}
                        tab={tab}
                        indentLevel={1}
                        isBeingDragged={activeId === tab.id && !multiDragInfo}
                        globalDragActive={!!activeId}
                        showDropBefore={isTabTarget && dropPosition === 'before'}
                        showDropAfter={(isTabTarget && dropPosition === 'after') || showGroupAfterOnLastTab}
                        beforeIndentPx={dropPosition === 'before' ? indentPx : undefined}
                        afterIndentPx={dropPosition === 'after' ? indentPx : undefined}
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

          {/* Offset modifier so overlay appears below cursor, keeping drop indicator visible */}
          <DragOverlay
            dropAnimation={wasValidDropRef.current ? null : undefined}
            modifiers={[
              ({ transform }) => ({ ...transform, y: transform.y + dragStartOffsetRef.current }),
            ]}
          >
            {multiDragInfo && <MultiTabDragOverlay count={multiDragInfo.count} firstItem={multiDragInfo.firstItem} />}
            {activeTab && !multiDragInfo && <TabDragOverlay tab={activeTab} />}
            {activeGroup && !multiDragInfo && <GroupDragOverlay group={activeGroup.group} matchedSpace={spaces.find(s => s.name === activeGroup.group.title)} tabCount={activeGroup.tabCount} />}
          </DragOverlay>
        </DndContext>

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