import { useState, useRef, useEffect, useMemo, useCallback, forwardRef } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTabGroups } from '../hooks/useTabGroups';
import { useDragDrop } from '../hooks/useDragDrop';
import { Dialog } from './Dialog';
import { Globe, ChevronRight, ChevronDown, Layers, Volume2, Pin, List, Plus, X, ArrowDownAZ, ArrowDownZA, Edit, Palette, Trash, FolderPlus } from 'lucide-react';
import {
  Chapter,
  getYouTubeVideoId,
  fetchYouTubeChapters,
  jumpToChapter
} from '../utils/youtube';
import { getIndentPadding } from '../utils/indent';
import { calculateDropPosition } from '../utils/dragDrop';
import { DropIndicators } from './DropIndicators';
import * as ContextMenu from './ContextMenu';
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

// Chrome tab group color mapping (exact Chrome hex codes)
// Light theme: badge uses darker colors, Dark theme: badge uses lighter/pastel colors
// bg: subtle background for grouped tabs, bgStrong: stronger background when group has active tab
const GROUP_COLORS: Record<string, { bg: string; bgStrong: string; badge: string; dot: string }> = {
  grey:   { bg: 'bg-[#F1F3F4] dark:bg-[#5F6368]/30', bgStrong: 'bg-[#E8EAED] dark:bg-[#5F6368]/50', badge: 'bg-[#5F6368] dark:bg-[#BDC1C6]', dot: 'bg-[#5F6368] dark:bg-[#BDC1C6]' },
  blue:   { bg: 'bg-[#E8F0FE] dark:bg-[#8AB4F8]/20', bgStrong: 'bg-[#D2E3FC] dark:bg-[#8AB4F8]/40', badge: 'bg-[#1A73E8] dark:bg-[#8AB4F8]', dot: 'bg-[#1A73E8] dark:bg-[#8AB4F8]' },
  red:    { bg: 'bg-[#FCE8E6] dark:bg-[#F28B82]/20', bgStrong: 'bg-[#F9D0CC] dark:bg-[#F28B82]/40', badge: 'bg-[#D93025] dark:bg-[#F28B82]', dot: 'bg-[#D93025] dark:bg-[#F28B82]' },
  yellow: { bg: 'bg-[#FEF7E0] dark:bg-[#FDD663]/20', bgStrong: 'bg-[#FCEFC7] dark:bg-[#FDD663]/40', badge: 'bg-[#E37400] dark:bg-[#FDD663]', dot: 'bg-[#E37400] dark:bg-[#FDD663]' },
  green:  { bg: 'bg-[#E6F4EA] dark:bg-[#81C995]/20', bgStrong: 'bg-[#CEEAD6] dark:bg-[#81C995]/40', badge: 'bg-[#188038] dark:bg-[#81C995]', dot: 'bg-[#188038] dark:bg-[#81C995]' },
  pink:   { bg: 'bg-[#FEE7F5] dark:bg-[#FF8BCB]/20', bgStrong: 'bg-[#FCCFEB] dark:bg-[#FF8BCB]/40', badge: 'bg-[#D01884] dark:bg-[#FF8BCB]', dot: 'bg-[#D01884] dark:bg-[#FF8BCB]' },
  purple: { bg: 'bg-[#F3E8FD] dark:bg-[#D7AEFB]/20', bgStrong: 'bg-[#E8D0FB] dark:bg-[#D7AEFB]/40', badge: 'bg-[#9333EA] dark:bg-[#D7AEFB]', dot: 'bg-[#9333EA] dark:bg-[#D7AEFB]' },
  cyan:   { bg: 'bg-[#E4F7FB] dark:bg-[#78D9EC]/20', bgStrong: 'bg-[#CBEFF7] dark:bg-[#78D9EC]/40', badge: 'bg-[#11858E] dark:bg-[#78D9EC]', dot: 'bg-[#11858E] dark:bg-[#78D9EC]' },
  orange: { bg: 'bg-[#FEF1E8] dark:bg-[#FCAD70]/20', bgStrong: 'bg-[#FCE3D1] dark:bg-[#FCAD70]/40', badge: 'bg-[#FA903E] dark:bg-[#FCAD70]', dot: 'bg-[#FA903E] dark:bg-[#FCAD70]' },
};

// Chrome tab group color options for new group creation
const GROUP_COLOR_OPTIONS: { value: chrome.tabGroups.ColorEnum; dot: string }[] = [
  { value: 'grey', dot: 'bg-[#5F6368] dark:bg-[#BDC1C6]' },
  { value: 'blue', dot: 'bg-[#1A73E8] dark:bg-[#8AB4F8]' },
  { value: 'red', dot: 'bg-[#D93025] dark:bg-[#F28B82]' },
  { value: 'yellow', dot: 'bg-[#E37400] dark:bg-[#FDD663]' },
  { value: 'green', dot: 'bg-[#188038] dark:bg-[#81C995]' },
  { value: 'pink', dot: 'bg-[#D01884] dark:bg-[#FF8BCB]' },
  { value: 'purple', dot: 'bg-[#9333EA] dark:bg-[#D7AEFB]' },
  { value: 'cyan', dot: 'bg-[#11858E] dark:bg-[#78D9EC]' },
  { value: 'orange', dot: 'bg-[#FA903E] dark:bg-[#FCAD70]' },
];

// --- Add to Group Dialog ---
interface AddToGroupDialogProps {
  isOpen: boolean;
  tabId: number | null;
  tabGroups: chrome.tabGroups.TabGroup[];
  currentGroupId?: number;
  onAddToGroup: (tabId: number, groupId: number) => void;
  onCreateGroup: (tabId: number, title: string, color: chrome.tabGroups.ColorEnum) => void;
  onClose: () => void;
}

const AddToGroupDialog = ({
  isOpen,
  tabId,
  tabGroups,
  currentGroupId,
  onAddToGroup,
  onCreateGroup,
  onClose
}: AddToGroupDialogProps) =>
{
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<chrome.tabGroups.ColorEnum>('blue');

  // Filter out current group
  const availableGroups = tabGroups.filter(g => g.id !== currentGroupId);

  // Reset state when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      setIsCreatingNew(false);
      setNewGroupName('');
      setNewGroupColor('blue');
    }
  }, [isOpen]);

  if (tabId === null) return null;

  const handleSelectGroup = (groupId: number) =>
  {
    onAddToGroup(tabId, groupId);
    onClose();
  };

  const handleCreateGroup = () =>
  {
    if (newGroupName.trim())
    {
      onCreateGroup(tabId, newGroupName.trim(), newGroupColor);
      onClose();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isCreatingNew ? 'Create New Group' : 'Add to Group'}
    >
      {isCreatingNew ? (
        <div className="p-3 space-y-3">
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
              Group Name
            </label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter group name"
              autoFocus
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={(e) =>
              {
                if (e.key === 'Enter' && newGroupName.trim())
                {
                  handleCreateGroup();
                }
              }}
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
              Color
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {GROUP_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewGroupColor(opt.value)}
                  className={clsx(
                    "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                    opt.dot,
                    newGroupColor === opt.value
                      ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                      : "border-transparent"
                  )}
                  title={opt.value}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsCreatingNew(false)}
              className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Back
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md"
            >
              Create
            </button>
          </div>
        </div>
      ) : (
        <div className="py-1 max-h-64 overflow-y-auto">
          {/* Existing groups */}
          {availableGroups.map((group) =>
          {
            const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;
            return (
              <button
                key={group.id}
                onClick={() => handleSelectGroup(group.id)}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
              >
                <span className={clsx("w-3 h-3 rounded-full flex-shrink-0", colorStyle.dot)} />
                <span className="truncate">{group.title || 'Unnamed Group'}</span>
              </button>
            );
          })}

          {/* Create new group option at bottom */}
          <button
            onClick={() => setIsCreatingNew(true)}
            className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-blue-600 dark:text-blue-400"
          >
            <Plus size={16} />
            <span>Create New Group</span>
          </button>
        </div>
      )}
    </Dialog>
  );
};

// --- Change Group Color Dialog ---
interface ChangeGroupColorDialogProps {
  isOpen: boolean;
  group: chrome.tabGroups.TabGroup | null;
  onChangeColor: (groupId: number, color: chrome.tabGroups.ColorEnum) => void;
  onClose: () => void;
}

const ChangeGroupColorDialog = ({
  isOpen,
  group,
  onChangeColor,
  onClose
}: ChangeGroupColorDialogProps) =>
{
  const [selectedColor, setSelectedColor] = useState<chrome.tabGroups.ColorEnum>('blue');

  // Reset state when dialog opens
  useEffect(() =>
  {
    if (isOpen && group)
    {
      setSelectedColor(group.color);
    }
  }, [isOpen, group]);

  if (!group) return null;

  const handleSave = () =>
  {
    onChangeColor(group.id, selectedColor);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Change Group Color">
      <div className="p-3 space-y-3">
        <div>
          <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
            Select Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {GROUP_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedColor(opt.value)}
                className={clsx(
                  "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                  opt.dot,
                  selectedColor === opt.value
                    ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                    : "border-transparent"
                )}
                title={opt.value}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// --- Rename Group Dialog ---
interface RenameGroupDialogProps {
  isOpen: boolean;
  group: chrome.tabGroups.TabGroup | null;
  onRename: (groupId: number, title: string) => void;
  onClose: () => void;
}

const RenameGroupDialog = ({
  isOpen,
  group,
  onRename,
  onClose
}: RenameGroupDialogProps) =>
{
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen && group)
    {
      setNewName(group.title || '');
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, group]);

  if (!group) return null;

  const handleSave = () =>
  {
    onRename(group.id, newName.trim());
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Rename Group">
      <div className="p-3 space-y-3">
        <div>
          <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
            Group Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter group name"
            className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={(e) =>
            {
              if (e.key === 'Enter')
              {
                handleSave();
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
};

interface DraggableTabProps {
  tab: chrome.tabs.Tab;
  indentLevel: number;
  isBeingDragged: boolean;
  showDropBefore: boolean;
  showDropAfter: boolean;
  beforeIndentPx?: number;
  afterIndentPx?: number;
  groupColor?: string;
  isLastInGroup?: boolean;
  onClose: (id: number) => void;
  onActivate: (id: number) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  onOpenAddToGroupDialog?: (tabId: number, currentGroupId?: number) => void;
  // Drag attributes
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}

// Fixed indentation for all tab rows: [speaker][pin][icon] label
const TAB_ROW_PADDING = 12;

// --- Pure UI Row Component ---
const TabRow = forwardRef<HTMLDivElement, DraggableTabProps>(({
  tab,
  indentLevel: _indentLevel,
  isBeingDragged,
  showDropBefore,
  showDropAfter,
  beforeIndentPx,
  afterIndentPx,
  groupColor,
  isLastInGroup,
  onClose,
  onActivate,
  onPin,
  onOpenAddToGroupDialog,
  attributes,
  listeners
}, ref) => {
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
    const handleKeyDown = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape') setShowChapters(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={ref}
          data-tab-id={tab.id}
          data-group-id={tab.groupId ?? -1}
          style={{ paddingLeft: `${TAB_ROW_PADDING}px` }}
          {...attributes}
          {...listeners}
          className={clsx(
            "group/tab relative hover:z-10 flex items-center py-1 px-2 cursor-pointer",
            isLastInGroup ? "rounded-b-lg" : "rounded-none",
            isBeingDragged && "opacity-50",
            tab.active
              ? groupColor
                ? clsx(GROUP_COLORS[groupColor]?.bgStrong, "text-gray-900 dark:text-gray-100")
                : "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100"
              : groupColor
                ? clsx(GROUP_COLORS[groupColor]?.bg, "hover:brightness-95 dark:hover:brightness-110 text-gray-700 dark:text-gray-200")
                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
          )}
          onClick={() => onActivate(tab.id!)}
        >
      <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} beforeIndentPx={beforeIndentPx} afterIndentPx={afterIndentPx} />

      {/* Speaker indicator */}
      <span className={clsx("mr-1 p-0.5", !tab.audible && "invisible")}>
        <Volume2 size={14} className="text-blue-500" />
      </span>
      {/* Pin indicator for Chrome pinned tabs */}
      <span className={clsx("mr-1 p-0.5", !tab.pinned && "invisible")}>
        <Pin size={14} className="text-gray-400" />
      </span>
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="w-4 h-4 mr-2 flex-shrink-0" />
      ) : (
        <Globe className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
      )}
      <span className="flex-1 truncate pr-1">
        {tab.title}
      </span>
      {/* Fast URL tooltip */}
      <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white rounded max-w-xs truncate invisible group-hover/tab:visible pointer-events-none z-50">
        {tab.url}
      </div>
      {/* Action buttons */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-2 opacity-0 group-hover/tab:opacity-100 bg-white dark:bg-gray-900 rounded">
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
        {onPin && tab.url && !tab.pinned && (
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
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowChapters(false)}
          />
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
        </>
      )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content>
          {onPin && tab.url && !tab.pinned && (
            <ContextMenu.Item onSelect={() => onPin(tab.url!, tab.title || tab.url!, tab.favIconUrl)}>
              <Pin size={14} className="mr-2" /> Pin to Sidebar
            </ContextMenu.Item>
          )}
          {onOpenAddToGroupDialog && (
            <ContextMenu.Item onSelect={() => onOpenAddToGroupDialog(tab.id!, tab.groupId)}>
              <FolderPlus size={14} className="mr-2" /> Add to Group
            </ContextMenu.Item>
          )}
          <ContextMenu.Item danger onSelect={() => { if (tab.id) onClose(tab.id); }}>
            <X size={14} className="mr-2" /> Close Tab
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
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
  isExpanded: boolean;
  isDragging?: boolean;
  showDropBefore: boolean;
  showDropAfter: boolean;
  showDropInto: boolean;
  afterDropIndentPx?: number;
  onToggle: () => void;
  onCloseGroup: () => void;
  onSortGroup: (direction: 'asc' | 'desc') => void;
  onChangeColor: () => void;
  onRename: () => void;
  onNewTab: () => void;
  // Drag attributes
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}

const TabGroupHeader = forwardRef<HTMLDivElement, TabGroupHeaderProps>(({
  group,
  isExpanded,
  isDragging,
  showDropBefore,
  showDropAfter,
  showDropInto,
  afterDropIndentPx,
  onToggle,
  onCloseGroup,
  onSortGroup,
  onChangeColor,
  onRename,
  onNewTab,
  attributes,
  listeners
}, ref) =>
{
  const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={ref}
          data-group-header-id={group.id}
          data-is-group-header="true"
          {...attributes}
          {...listeners}
          className={clsx(
            "group relative flex items-center py-1 px-2 rounded-t-lg cursor-pointer select-none",
            isDragging && "opacity-50 pointer-events-none",
            showDropInto
              ? "bg-blue-100 dark:bg-blue-900/50"
              : clsx(colorStyle.bg, "hover:brightness-95 dark:hover:brightness-110")
          )}
          style={{ paddingLeft: `${getIndentPadding(1)}px` }}
          onClick={onToggle}
        >
          {/* Drop-into ring indicator with fully rounded corners */}
          {showDropInto && (
            <div className="absolute inset-0 rounded-lg ring-2 ring-blue-500 pointer-events-none" />
          )}
          <DropIndicators showBefore={showDropBefore} showAfter={showDropAfter} afterIndentPx={afterDropIndentPx} />

          <span className="mr-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className={clsx("px-2 py-0.5 rounded-full font-medium truncate text-white dark:text-black", colorStyle.badge)}>
            {group.title || 'Unnamed Group'}
          </span>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content>
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
        </ContextMenu.Content>
      </ContextMenu.Portal>
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
const GroupDragOverlay = ({ group, tabCount }: { group: chrome.tabGroups.TabGroup; tabCount: number }) =>
{
  const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;
  return (
    <div className="flex items-center py-1 px-2 pointer-events-none">
      <ChevronRight size={14} className="mr-1" />
      <span className={clsx("px-2 py-0.5 rounded-full font-medium text-white dark:text-black", colorStyle.badge)}>
        {group.title || 'Unnamed Group'}
      </span>
      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
        ({tabCount} {tabCount === 1 ? 'tab' : 'tabs'})
      </span>
    </div>
  );
};

// Drag overlay content - matches tab row layout with transparent background
const TabDragOverlay = ({ tab }: { tab: chrome.tabs.Tab }) =>
{
  return (
    <div className="flex items-center py-1 px-2 pointer-events-none">
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
  sortGroupsFirst?: boolean;
}

export const TabList = ({ onPin, sortGroupsFirst = true }: TabListProps) =>
{
  const { tabs, closeTab, activateTab, moveTab, groupTab, ungroupTab, createGroupWithTab, createTabInGroup, sortTabs, sortGroupTabs, closeAllTabs } = useTabs();
  const { tabGroups, updateGroup, moveGroup } = useTabGroups();
  const [isExpanded, setIsExpanded] = useState(true);
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

  // Helper to check if we're dragging a group
  const isDraggingGroup = typeof activeId === 'string' && String(activeId).startsWith('group-');

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

  // Auto-scroll to active tab when it changes
  const prevActiveTabIdRef = useRef<number | null>(null);
  useEffect(() =>
  {
    const activeTab = tabs.find(t => t.active);
    if (activeTab && activeTab.id !== prevActiveTabIdRef.current)
    {
      prevActiveTabIdRef.current = activeTab.id ?? null;
      // Scroll after DOM updates
      setTimeout(() =>
      {
        const element = document.querySelector(`[data-tab-id="${activeTab.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [tabs]);

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
    const id = event.active.id;

    // Check if dragging a group (ID starts with "group-")
    if (typeof id === 'string' && id.startsWith('group-'))
    {
      const groupId = parseInt(id.replace('group-', ''), 10);
      const group = tabGroups.find(g => g.id === groupId);
      const groupTabs = tabs.filter(t => (t.groupId ?? -1) === groupId);

      setActiveId(id);
      setActiveTab(null);
      setActiveGroup(group ? { group, tabCount: groupTabs.length } : null);
    }
    else
    {
      // Dragging a tab
      const tabId = id as number;
      setActiveId(tabId);
      setActiveTab(tabs.find(t => t.id === tabId) || null);
      setActiveGroup(null);
    }
  }, [tabs, tabGroups, setActiveId]);

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

        // If dragging a group, prevent dropping on self
        if (isDraggingGroupNow && targetGroupId === draggedGroupId)
        {
          setDropTargetId(null);
          setDropPosition(null);
          clearAutoExpandTimer();
          return;
        }

        if (isDraggingGroupNow)
        {
          // When dragging a group over group header: always "before"
          // (hovering on header = top half of group area)
          setDropTargetId(`group-${groupId}`);
          setDropPosition('before');
          clearAutoExpandTimer();
          return;
        }

        // When dragging a tab: allow before/after/into (isContainer=true)
        const position = calculateDropPosition(groupHeaderElement, currentY, true);
        setDropTargetId(`group-${groupId}`);
        setDropPosition(position);

        // Auto-expand/collapse group after 1s hover on 'into' zone
        if (position === 'into')
        {
          setAutoExpandTimer(targetGroupId, () =>
          {
            // Toggle: expand if collapsed, collapse if expanded
            setExpandedGroups(prev => ({ ...prev, [targetGroupId]: !prev[targetGroupId] }));
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
        const tabGroupId = parseInt(tabElement.getAttribute('data-group-id') || '-1', 10);

        // If dragging a group, prevent dropping on own tabs
        if (isDraggingGroupNow && tabGroupId === draggedGroupId)
        {
          setDropTargetId(null);
          setDropPosition(null);
          clearAutoExpandTimer();
          return;
        }

        // If dragging a group over another group's tabs, treat the entire group as one unit
        if (isDraggingGroupNow && tabGroupId !== -1)
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
      setActiveGroup(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    // Check if we're dragging a group
    const isDraggingGroupNow = typeof activeId === 'string' && String(activeId).startsWith('group-');

    if (isDraggingGroupNow)
    {
      // --- GROUP DRAG HANDLING ---
      const draggedGroupId = parseInt(String(activeId).replace('group-', ''), 10);
      const isGroupHeaderTarget = dropTargetId.startsWith('group-');

      let targetIndex = -1;

      if (isGroupHeaderTarget)
      {
        // Dropping relative to another group
        const targetGroupId = parseInt(dropTargetId.replace('group-', ''), 10);
        const targetGroupTabs = tabs.filter(t => (t.groupId ?? -1) === targetGroupId);

        if (targetGroupTabs.length > 0)
        {
          if (dropPosition === 'before')
          {
            // Move before target group's first tab
            targetIndex = tabs.findIndex(t => t.id === targetGroupTabs[0].id);
          }
          else
          {
            // 'after': Move after target group's last tab
            const lastTab = targetGroupTabs[targetGroupTabs.length - 1];
            targetIndex = tabs.findIndex(t => t.id === lastTab.id) + 1;
          }
        }
      }
      else
      {
        // Dropping relative to a tab
        const targetTabId = parseInt(dropTargetId, 10);
        const targetTab = tabs.find(t => t.id === targetTabId);

        if (targetTab)
        {
          targetIndex = tabs.findIndex(t => t.id === targetTabId);
          if (dropPosition === 'after')
          {
            targetIndex += 1;
          }
        }
      }

      if (targetIndex >= 0)
      {
        // Account for source group tabs being removed when moving down
        const sourceGroupTabs = tabs.filter(t => (t.groupId ?? -1) === draggedGroupId);
        const sourceFirstIndex = tabs.findIndex(t => t.id === sourceGroupTabs[0]?.id);

        // If source is before target (moving down), subtract source tab count
        if (sourceFirstIndex !== -1 && sourceFirstIndex < targetIndex)
        {
          targetIndex -= sourceGroupTabs.length;
        }

        moveGroup(draggedGroupId, targetIndex);
      }
    }
    else
    {
      // --- TAB DRAG HANDLING ---
      const sourceTab = tabs.find(t => t.id === activeId);
      if (!sourceTab)
      {
        setActiveId(null);
        setActiveTab(null);
        setActiveGroup(null);
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
          // Move tab into group at the end
          if (sourceGroupId !== targetGroupId)
          {
            groupTab(activeId as number, targetGroupId);
          }

          // Move to end of group
          const groupTabs = tabs.filter(t => (t.groupId ?? -1) === targetGroupId);
          if (groupTabs.length > 0)
          {
            const lastTabIndex = tabs.findIndex(t => t.id === groupTabs[groupTabs.length - 1].id);
            const sourceIndex = tabs.findIndex(t => t.id === activeId);
            let targetIndex = lastTabIndex + 1;

            // Account for source removal when moving forward
            if (sourceIndex < targetIndex)
            {
              targetIndex--;
            }

            moveTab(activeId as number, targetIndex);
          }
        }
        else
        {
          // 'before' or 'after' on group header
          const groupTabs = tabs.filter(t => (t.groupId ?? -1) === targetGroupId);
          if (groupTabs.length > 0)
          {
            if (dropPosition === 'before')
            {
              // Place before the group (as sibling, outside)
              const targetIndex = tabs.findIndex(t => t.id === groupTabs[0].id);
              if (sourceGroupId !== -1)
              {
                ungroupTab(activeId as number);
              }
              moveTab(activeId as number, targetIndex);
            }
            else
            {
              // 'after' behavior depends on expanded state
              if (expandedGroups[targetGroupId])
              {
                // Expanded: inside group at index 0
                const firstTabIndex = tabs.findIndex(t => t.id === groupTabs[0].id);
                const sourceIndex = tabs.findIndex(t => t.id === activeId);
                let targetIndex = firstTabIndex;
                if (sourceIndex < targetIndex)
                {
                  targetIndex--;
                }
                moveTab(activeId as number, targetIndex);
                if (sourceGroupId !== targetGroupId)
                {
                  groupTab(activeId as number, targetGroupId);
                }
              }
              else
              {
                // Collapsed: sibling after group (after last tab in group)
                const lastTabIndex = tabs.findIndex(t => t.id === groupTabs[groupTabs.length - 1].id);
                const sourceIndex = tabs.findIndex(t => t.id === activeId);
                let targetIndex = lastTabIndex + 1;
                if (sourceIndex < targetIndex)
                {
                  targetIndex--;
                }
                if (sourceGroupId !== -1)
                {
                  ungroupTab(activeId as number);
                }
                moveTab(activeId as number, targetIndex);
              }
            }
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
                ungroupTab(activeId as number);
              }
            }
            else
            {
              // Target is in a group - add source to that group
              groupTab(activeId as number, targetGroupId);
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

          moveTab(activeId as number, newIndex);
        }
      }
    }

    // Reset state
    setActiveId(null);
    setActiveTab(null);
    setActiveGroup(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [activeId, dropTargetId, dropPosition, tabs, expandedGroups, groupTab, ungroupTab, moveTab, moveGroup, clearAutoExpandTimer, setActiveId, setDropTargetId, setDropPosition]);

  // Drag cancel handler (e.g., Escape key)
  const handleDragCancel = useCallback(() =>
  {
    clearAutoExpandTimer();
    wasValidDropRef.current = false;

    // Reset drag state
    setActiveId(null);
    setActiveTab(null);
    setActiveGroup(null);
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
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
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
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            <ContextMenu.Item onSelect={() => sortTabs('asc', tabGroups, sortGroupsFirst)}>
              <ArrowDownAZ size={14} className="mr-2" /> Sort by Domain (A-Z)
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => sortTabs('desc', tabGroups, sortGroupsFirst)}>
              <ArrowDownZA size={14} className="mr-2" /> Sort by Domain (Z-A)
            </ContextMenu.Item>
            <ContextMenu.Item danger onSelect={closeAllTabs}>
              <Trash size={14} className="mr-2" /> Close All Tabs
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

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
                  onOpenAddToGroupDialog={openAddToGroupDialog}
                />
              );
            }
            else
            {
              const isGroupExpanded = expandedGroups[item.group.id];
              const groupTargetId = `group-${item.group.id}`;
              const isTarget = dropTargetId === groupTargetId;
              // When dragging a group, never show 'into' indicator (groups can't nest)
              const showDropInto = !isDraggingGroup && isTarget && dropPosition === 'into';
              // When dragging a group with 'after' position, show on last tab instead of header
              const isGroupAfterTarget = isDraggingGroup && isTarget && dropPosition === 'after';
              return (
                <div key={`group-${item.group.id}`}>
                  <DraggableGroupHeader
                    group={item.group}
                    tabCount={item.tabs.length}
                    isExpanded={isGroupExpanded}
                    showDropBefore={isTarget && dropPosition === 'before'}
                    showDropAfter={!isDraggingGroup && isTarget && dropPosition === 'after'}
                    showDropInto={showDropInto}
                    afterDropIndentPx={
                      isTarget && dropPosition === 'after' && isGroupExpanded && !isDraggingGroup
                        ? getIndentPadding(2)
                        : undefined
                    }
                    onToggle={() => toggleGroup(item.group.id)}
                    onCloseGroup={() => closeGroup(item.tabs)}
                    onSortGroup={(direction) => sortGroupTabs(item.group.id, direction)}
                    onChangeColor={() => openChangeColorDialog(item.group)}
                    onRename={() => openRenameGroupDialog(item.group)}
                    onNewTab={() => createTabInGroup(item.group.id)}
                  />
                  {isGroupExpanded && item.tabs.map((tab, index) =>
                  {
                    const tabId = String(tab.id);
                    const isTabTarget = dropTargetId === tabId;
                    const isLastTab = index === item.tabs.length - 1;
                    // When dragging a group with 'after', show indicator on last tab
                    const showGroupAfterOnLastTab = isLastTab && isGroupAfterTarget;
                    // Indent lines for tabs in group since drop stays within group
                    const indentPx = isTabTarget ? getIndentPadding(2) : undefined;
                    return (
                      <DraggableTab
                        key={tab.id}
                        tab={tab}
                        indentLevel={2}
                        isBeingDragged={activeId === tab.id}
                        showDropBefore={isTabTarget && dropPosition === 'before'}
                        showDropAfter={(isTabTarget && dropPosition === 'after') || showGroupAfterOnLastTab}
                        beforeIndentPx={dropPosition === 'before' ? indentPx : undefined}
                        afterIndentPx={dropPosition === 'after' ? indentPx : undefined}
                        groupColor={item.group.color}
                        isLastInGroup={isLastTab}
                        onClose={closeTab}
                        onActivate={activateTab}
                        onPin={onPin}
                        onOpenAddToGroupDialog={openAddToGroupDialog}
                      />
                    );
                  })}
                </div>
              );
            }
          })}

          <DragOverlay dropAnimation={wasValidDropRef.current ? null : undefined}>
            {activeTab && <TabDragOverlay tab={activeTab} />}
            {activeGroup && <GroupDragOverlay group={activeGroup.group} tabCount={activeGroup.tabCount} />}
          </DragOverlay>
        </DndContext>
      )}

      <AddToGroupDialog
        isOpen={addToGroupDialog.isOpen}
        tabId={addToGroupDialog.tabId}
        tabGroups={tabGroups}
        currentGroupId={addToGroupDialog.currentGroupId}
        onAddToGroup={groupTab}
        onCreateGroup={createGroupWithTab}
        onClose={closeAddToGroupDialog}
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
    </>
  );
};
