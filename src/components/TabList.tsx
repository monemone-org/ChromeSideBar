import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTabGroups } from '../hooks/useTabGroups';
import { useDragDrop } from '../hooks/useDragDrop';
import { X, Globe, ChevronRight, ChevronDown, Layers, Volume2, Pin, MoreHorizontal, List } from 'lucide-react';
import {
  Chapter,
  getYouTubeVideoId,
  fetchYouTubeChapters,
  jumpToChapter
} from '../utils/youtube';
import { getIndentPadding } from '../utils/indent';
import { calculateDropPosition } from '../utils/dragDrop';
import { DropIndicators } from './DropIndicators';
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
} from '@dnd-kit/core';
import clsx from 'clsx';

// Chrome tab group color mapping to Tailwind classes
const GROUP_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  grey: { bg: 'bg-gray-200 dark:bg-gray-600', text: 'text-gray-700 dark:text-gray-200', dot: 'bg-gray-500' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-200', dot: 'bg-blue-500' },
  red: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-200', dot: 'bg-red-500' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-200', dot: 'bg-yellow-500' },
  green: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-200', dot: 'bg-green-500' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-200', dot: 'bg-pink-500' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-200', dot: 'bg-purple-500' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-200', dot: 'bg-cyan-500' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-200', dot: 'bg-orange-500' },
};

interface DraggableTabProps {
  tab: chrome.tabs.Tab;
  indentLevel: number;
  isBeingDragged: boolean;
  showDropBefore: boolean;
  showDropAfter: boolean;
  onClose: (id: number) => void;
  onActivate: (id: number) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
}

const DraggableTab = ({
  tab,
  indentLevel,
  isBeingDragged,
  showDropBefore,
  showDropAfter,
  onClose,
  onActivate,
  onPin
}: DraggableTabProps) =>
{
  const {
    attributes,
    listeners,
    setNodeRef,
  } = useDraggable({ id: tab.id! });

  const [showChapters, setShowChapters] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [popupAbove, setPopupAbove] = useState(false);
  const chaptersRef = useRef<HTMLDivElement>(null);
  const chaptersButtonRef = useRef<HTMLButtonElement>(null);

  const videoId = tab.url ? getYouTubeVideoId(tab.url) : null;

  useEffect(() =>
  {
    if (!showChapters) return;
    const handleClickOutside = (e: MouseEvent) =>
    {
      const target = e.target as Node;
      if (chaptersButtonRef.current?.contains(target)) return;
      if (chaptersRef.current && !chaptersRef.current.contains(target))
      {
        setShowChapters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChapters]);

  const handleChaptersClick = async (e: React.MouseEvent) =>
  {
    e.stopPropagation();

    const button = chaptersButtonRef.current;
    if (button)
    {
      const rect = button.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPopupAbove(spaceBelow < 280);
    }

    if (!showChapters)
    {
      setLoadingChapters(true);
      const fetchedChapters = await fetchYouTubeChapters(tab.id!);
      setChapters(fetchedChapters);
      setLoadingChapters(false);
    }
    setShowChapters(!showChapters);
  };

  return (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      data-group-id={tab.groupId ?? -1}
      style={{ paddingLeft: `${getIndentPadding(indentLevel)}px` }}
      {...attributes}
      {...listeners}
      className={clsx(
        "group relative flex items-center py-1 px-2 rounded-md cursor-pointer",
        isBeingDragged && "opacity-50",
        tab.active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100"
          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
      )}
      onClick={() => onActivate(tab.id!)}
    >
      <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} />

      {/* Speaker placeholder */}
      <span className={clsx("mr-1 p-0.5", !tab.audible && "invisible")}>
        <Volume2 size={14} className="text-blue-500" />
      </span>
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="w-4 h-4 mr-2 flex-shrink-0" />
      ) : (
        <Globe className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
      )}
      <span className="flex-1 truncate pr-1">
        {tab.title}
      </span>
      {/* Action buttons */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-2 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-900 rounded">
        {videoId && (
          <button
            ref={chaptersButtonRef}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleChaptersClick}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            title="Chapters"
          >
            <List size={14} className="text-gray-700 dark:text-gray-200" />
          </button>
        )}
        {onPin && tab.url && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) =>
            {
              e.stopPropagation();
              onPin(tab.url!, tab.title || tab.url!, tab.favIconUrl);
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            title="Pin"
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
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
        >
          <X size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>

      {/* Chapters popup */}
      {showChapters && (
        <div
          ref={chaptersRef}
          className={clsx(
            "absolute right-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-48 max-h-64 overflow-y-auto",
            popupAbove ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          <div className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
            Chapters
          </div>
          {loadingChapters ? (
            <div className="px-3 py-2 text-gray-500">Loading...</div>
          ) : chapters.length === 0 ? (
            <div className="px-3 py-2 text-gray-500">No chapters found</div>
          ) : (
            chapters.map((chapter, i) => (
              <button
                key={i}
                className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-400"
                onClick={(e) =>
                {
                  e.stopPropagation();
                  jumpToChapter(tab.id!, chapter.url);
                  setShowChapters(false);
                }}
              >
                {chapter.timestamp} - {chapter.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

interface TabGroupHeaderProps {
  group: chrome.tabGroups.TabGroup;
  isExpanded: boolean;
  showDropBefore: boolean;
  showDropAfter: boolean;
  showDropInto: boolean;
  onToggle: () => void;
  onCloseGroup: () => void;
}

const TabGroupHeader = ({
  group,
  isExpanded,
  showDropBefore,
  showDropAfter,
  showDropInto,
  onToggle,
  onCloseGroup
}: TabGroupHeaderProps) =>
{
  const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

  return (
    <div
      data-group-header-id={group.id}
      data-is-group-header="true"
      className={clsx(
        "group relative flex items-center py-1 px-2 rounded-md cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800",
        showDropInto && "bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500"
      )}
      style={{ paddingLeft: `${getIndentPadding(1)}px` }}
      onClick={onToggle}
    >
      <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} />

      <span className="mr-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
      <span className={clsx("w-3 h-3 rounded-full mr-2 flex-shrink-0", colorStyle.dot)} />
      <span className={clsx("flex-1 font-medium truncate", colorStyle.text)}>
        {group.title || 'Unnamed Group'}
      </span>
      <button
        onClick={(e) =>
        {
          e.stopPropagation();
          onCloseGroup();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        title="Close group"
      >
        <X size={14} className="text-gray-500" />
      </button>
    </div>
  );
};

// Drag overlay content - matches tab row layout with transparent background
const TabDragOverlay = ({ tab }: { tab: chrome.tabs.Tab }) =>
{
  return (
    <div className="flex items-center py-1 px-2">
      {/* Speaker placeholder - invisible to match layout */}
      <span className="mr-1 p-0.5 invisible">
        <Volume2 size={14} />
      </span>
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="w-4 h-4 mr-2 flex-shrink-0" />
      ) : (
        <Globe className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
      )}
      <span className="truncate max-w-48 bg-blue-100 dark:bg-blue-900/50 px-1 rounded">
        {tab.title}
      </span>
    </div>
  );
};

// Display item types for rendering
type DisplayItem =
  | { type: 'group'; group: chrome.tabGroups.TabGroup; tabs: chrome.tabs.Tab[]; startIndex: number }
  | { type: 'tab'; tab: chrome.tabs.Tab };

interface TabListProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
}

export const TabList = ({ onPin }: TabListProps) =>
{
  const { tabs, closeTab, activateTab, moveTab, groupTab, ungroupTab, sortTabs, closeAllTabs } = useTabs();
  const { tabGroups } = useTabGroups();
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
  } = useDragDrop<number>();

  // Tab-specific drag state
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);

  // Initialize all groups as expanded when they first appear
  useEffect(() =>
  {
    setExpandedGroups((prev) =>
    {
      let hasChanges = false;
      const newState = { ...prev };
      tabGroups.forEach((g) =>
      {
        if (!(g.id in newState))
        {
          newState[g.id] = true;
          hasChanges = true;
        }
      });
      return hasChanges ? newState : prev;
    });
  }, [tabGroups]);

  useEffect(() =>
  {
    const handleClickOutside = (e: MouseEvent) =>
    {
      const target = e.target as Node;
      if (menuButtonRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target))
      {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Build display items: groups and ungrouped tabs in natural browser order
  const displayItems = useMemo<DisplayItem[]>(() =>
  {
    const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
    tabGroups.forEach((g) => groupMap.set(g.id, g));

    const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();

    tabs.forEach((tab) =>
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

    tabs.forEach((tab, index) =>
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
  }, [tabs, tabGroups]);

  const handleDragStart = useCallback((event: DragStartEvent) =>
  {
    const id = event.active.id as number;
    setActiveId(id);
    setActiveTab(tabs.find(t => t.id === id) || null);
  }, [tabs, setActiveId]);

  const handleDragMove = useCallback((event: DragMoveEvent) =>
  {
    const { active } = event;
    const currentX = pointerPositionRef.current.x;
    const currentY = pointerPositionRef.current.y;

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
        const position = calculateDropPosition(groupHeaderElement, currentY, true);
        setDropTargetId(`group-${groupId}`);
        setDropPosition(position);

        // Auto-expand/collapse group after 1s hover on 'into' zone
        const groupIdNum = parseInt(groupId);
        if (position === 'into')
        {
          setAutoExpandTimer(groupIdNum, () =>
          {
            // Toggle: expand if collapsed, collapse if expanded
            setExpandedGroups(prev => ({ ...prev, [groupIdNum]: !prev[groupIdNum] }));
          });
        }
        else
        {
          clearAutoExpandTimer();
        }
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
        const position = calculateDropPosition(tabElement, currentY, false);
        setDropTargetId(tabId);
        setDropPosition(position);

        clearAutoExpandTimer();
        return;
      }
    }

    // No valid target
    setDropTargetId(null);
    setDropPosition(null);
    clearAutoExpandTimer();
  }, [setDropTargetId, setDropPosition, setAutoExpandTimer, clearAutoExpandTimer]);

  const handleDragEnd = useCallback((_event: DragEndEvent) =>
  {
    clearAutoExpandTimer();

    // Track if this is a valid drop (affects animation)
    const isValidDrop = !!(dropTargetId && dropPosition && activeId);
    wasValidDropRef.current = isValidDrop;

    if (!isValidDrop)
    {
      setActiveId(null);
      setActiveTab(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const sourceTab = tabs.find(t => t.id === activeId);
    if (!sourceTab)
    {
      setActiveId(null);
      setActiveTab(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const sourceGroupId = sourceTab.groupId ?? -1;
    const isGroupHeaderTarget = dropTargetId.startsWith('group-');

    if (isGroupHeaderTarget)
    {
      const targetGroupId = parseInt(dropTargetId.replace('group-', ''));

      if (dropPosition === 'into')
      {
        // Move tab into group
        if (sourceGroupId !== targetGroupId)
        {
          groupTab(activeId, targetGroupId);
        }
      }
      else
      {
        // 'before' or 'after' on group header
        // Find the appropriate tab index
        const groupTabs = tabs.filter(t => (t.groupId ?? -1) === targetGroupId);
        if (groupTabs.length > 0)
        {
          const targetIndex = dropPosition === 'before'
            ? tabs.findIndex(t => t.id === groupTabs[0].id)
            : tabs.findIndex(t => t.id === groupTabs[groupTabs.length - 1].id) + 1;

          // Ungroup if currently in a group
          if (sourceGroupId !== -1)
          {
            ungroupTab(activeId);
          }
          moveTab(activeId, targetIndex);
        }
      }
    }
    else
    {
      // Target is a tab
      const targetTabId = parseInt(dropTargetId);
      const targetTab = tabs.find(t => t.id === targetTabId);

      if (targetTab)
      {
        const targetGroupId = targetTab.groupId ?? -1;

        // Handle group membership change
        if (targetGroupId !== sourceGroupId)
        {
          if (targetGroupId === -1)
          {
            // Target is ungrouped - ungroup source
            if (sourceGroupId !== -1)
            {
              ungroupTab(activeId);
            }
          }
          else
          {
            // Target is in a group - add source to that group
            groupTab(activeId, targetGroupId);
          }
        }

        // Reorder
        const sourceIndex = tabs.findIndex(t => t.id === activeId);
        const targetIndex = tabs.findIndex(t => t.id === targetTabId);
        let newIndex = dropPosition === 'before' ? targetIndex : targetIndex + 1;

        // When moving forward, account for source removal shifting tabs left
        if (sourceIndex < newIndex)
        {
          newIndex--;
        }

        moveTab(activeId, newIndex);
      }
    }

    // Reset state
    setActiveId(null);
    setActiveTab(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [activeId, dropTargetId, dropPosition, tabs, groupTab, ungroupTab, moveTab, clearAutoExpandTimer, setActiveId, setDropTargetId, setDropPosition]);

  // Drag cancel handler (e.g., Escape key)
  const handleDragCancel = useCallback(() =>
  {
    clearAutoExpandTimer();
    wasValidDropRef.current = false;

    // Reset drag state
    setActiveId(null);
    setActiveTab(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [clearAutoExpandTimer, setActiveId, setDropTargetId, setDropPosition]);

  const toggleGroup = (groupId: number) =>
  {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const closeGroup = (groupTabs: chrome.tabs.Tab[]) =>
  {
    groupTabs.forEach((tab) =>
    {
      if (tab.id) closeTab(tab.id);
    });
  };

  return (
    <>
      {/* Virtual Active Tabs Root */}
      <div
        className="group relative flex items-center py-1 rounded cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800 border-2 border-transparent"
        style={{ paddingLeft: `${getIndentPadding(0)}px`, paddingRight: '8px' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="mr-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="mr-2 text-gray-500">
          <Layers size={16} />
        </span>
        <span className="flex-1 font-medium">Active Tabs</span>
        <button
          ref={menuButtonRef}
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <MoreHorizontal size={14} />
        </button>

        {showMenu && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-32"
          >
            <button
              className="flex items-center w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              onClick={(e) => { e.stopPropagation(); sortTabs('asc'); setShowMenu(false); }}
            >
              Sort by Domain (A-Z)
            </button>
            <button
              className="flex items-center w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              onClick={(e) => { e.stopPropagation(); sortTabs('desc'); setShowMenu(false); }}
            >
              Sort by Domain (Z-A)
            </button>
            <button
              className="flex items-center w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 dark:text-red-400"
              onClick={(e) => { e.stopPropagation(); closeAllTabs(); setShowMenu(false); }}
            >
              Close All Tabs
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
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
              return (
                <DraggableTab
                  key={item.tab.id}
                  tab={item.tab}
                  indentLevel={1}
                  isBeingDragged={activeId === item.tab.id}
                  showDropBefore={isTarget && dropPosition === 'before'}
                  showDropAfter={isTarget && dropPosition === 'after'}
                  onClose={closeTab}
                  onActivate={activateTab}
                  onPin={onPin}
                />
              );
            }
            else
            {
              const isGroupExpanded = expandedGroups[item.group.id];
              const groupTargetId = `group-${item.group.id}`;
              const isTarget = dropTargetId === groupTargetId;
              return (
                <div key={`group-${item.group.id}`}>
                  <TabGroupHeader
                    group={item.group}
                    isExpanded={isGroupExpanded}
                    showDropBefore={isTarget && dropPosition === 'before'}
                    showDropAfter={isTarget && dropPosition === 'after'}
                    showDropInto={isTarget && dropPosition === 'into'}
                    onToggle={() => toggleGroup(item.group.id)}
                    onCloseGroup={() => closeGroup(item.tabs)}
                  />
                  {isGroupExpanded && item.tabs.map((tab) =>
                  {
                    const tabId = String(tab.id);
                    const isTabTarget = dropTargetId === tabId;
                    return (
                      <DraggableTab
                        key={tab.id}
                        tab={tab}
                        indentLevel={2}
                        isBeingDragged={activeId === tab.id}
                        showDropBefore={isTabTarget && dropPosition === 'before'}
                        showDropAfter={isTabTarget && dropPosition === 'after'}
                        onClose={closeTab}
                        onActivate={activateTab}
                        onPin={onPin}
                      />
                    );
                  })}
                </div>
              );
            }
          })}

          <DragOverlay dropAnimation={wasValidDropRef.current ? null : undefined}>
            {activeTab && <TabDragOverlay tab={activeTab} />}
          </DragOverlay>
        </DndContext>
      )}
    </>
  );
};
