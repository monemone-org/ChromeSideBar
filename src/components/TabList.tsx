import { useState, useRef, useEffect } from 'react';
import { useTabs } from '../hooks/useTabs';
import { X, Globe, ChevronRight, ChevronDown, Layers, Volume2, Pin, MoreHorizontal } from 'lucide-react';
import { getIndentPadding } from '../utils/indent';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';

interface SortableTabProps {
  tab: chrome.tabs.Tab;
  onClose: (id: number) => void;
  onActivate: (id: number) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
}

const SortableTab = ({ tab, onClose, onActivate, onPin }: SortableTabProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: tab.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${getIndentPadding(1)}px`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "group relative flex items-center py-1 px-2 rounded-md cursor-pointer",
        tab.active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100"
          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
      )}
      onClick={() => onActivate(tab.id!)}
    >
      {/* Speaker placeholder - matches chevron spacing in BookmarkTree */}
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
      {/* Action buttons - positioned absolutely to overlap title */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-2 opacity-0 group-hover:opacity-100 bg-inherit rounded">
        {onPin && tab.url && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
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
          onClick={(e) => {
            e.stopPropagation();
            if (tab.id) onClose(tab.id);
          }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
        >
          <X size={14} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>
    </div>
  );
};


interface TabListProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
}

export const TabList = ({ onPin }: TabListProps) => {
  const { tabs, closeTab, activateTab, moveTab, sortTabs, closeAllTabs } = useTabs();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuButtonRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id);
      const newIndex = tabs.findIndex((t) => t.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
          moveTab(active.id as number, newIndex);
      }
    }
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
              onClick={(e) => { e.stopPropagation(); sortTabs(); setShowMenu(false); }}
            >
              Sort by Domain
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
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabs.map(t => t.id!)}
            strategy={verticalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                onClose={closeTab}
                onActivate={activateTab}
                onPin={onPin}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </>
  );
};
