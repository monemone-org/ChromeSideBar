import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTabs } from '../hooks/useTabs';
import { useTabGroups } from '../hooks/useTabGroups';
import { useDragDrop } from '../hooks/useDragDrop';
import { Dialog } from './Dialog';
import { Globe, ChevronRight, ChevronDown, Layers, Volume2, Pin, List, Plus, X } from 'lucide-react';
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
}

// Fixed indentation for all tab rows: [speaker][pin][icon] label
const TAB_ROW_PADDING = 12;

const DraggableTab = ({
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
  onOpenAddToGroupDialog
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
        e.stopPropagation();
        e.preventDefault();
        setShowChapters(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape')
      {
        setShowChapters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    return () =>
    {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
          ref={setNodeRef}
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
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content>
          {onPin && tab.url && !tab.pinned && (
            <ContextMenu.Item onSelect={() => onPin(tab.url!, tab.title || tab.url!, tab.favIconUrl)}>
              Pin to Sidebar
            </ContextMenu.Item>
          )}
          {onOpenAddToGroupDialog && (
            <ContextMenu.Item onSelect={() => onOpenAddToGroupDialog(tab.id!, tab.groupId)}>
              Add to Group
            </ContextMenu.Item>
          )}
          <ContextMenu.Item danger onSelect={() => { if (tab.id) onClose(tab.id); }}>
            Close Tab
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

interface TabGroupHeaderProps {
  group: chrome.tabGroups.TabGroup;
  isExpanded: boolean;
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
}

const TabGroupHeader = ({
  group,
  isExpanded,
  showDropBefore,
  showDropAfter,
  showDropInto,
  afterDropIndentPx,
  onToggle,
  onCloseGroup,
  onSortGroup,
  onChangeColor,
  onRename,
  onNewTab
}: TabGroupHeaderProps) =>
{
  const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          data-group-header-id={group.id}
          data-is-group-header="true"
          className={clsx(
            "group relative flex items-center py-1 px-2 rounded-t-lg cursor-pointer select-none",
            showDropInto
              ? "bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500"
              : clsx(colorStyle.bg, "hover:brightness-95 dark:hover:brightness-110")
          )}
          style={{ paddingLeft: `${getIndentPadding(1)}px` }}
          onClick={onToggle}
        >
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
            New Tab
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => onSortGroup('asc')}>
            Sort by Domain (A-Z)
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => onSortGroup('desc')}>
            Sort by Domain (Z-A)
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={onRename}>
            Rename Group
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={onChangeColor}>
            Change Color
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item danger onSelect={onCloseGroup}>
            Close Group
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
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
  sortGroupsFirst?: boolean;
}

export const TabList = ({ onPin, sortGroupsFirst = true }: TabListProps) =>
{
  const { tabs, closeTab, activateTab, moveTab, groupTab, ungroupTab, createGroupWithTab, createTabInGroup, sortTabs, sortGroupTabs, closeAllTabs } = useTabs();
  const { tabGroups, updateGroup } = useTabGroups();
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
        // Move tab into group at the end
        if (sourceGroupId !== targetGroupId)
        {
          groupTab(activeId, targetGroupId);
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

          moveTab(activeId, targetIndex);
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
              ungroupTab(activeId);
            }
            moveTab(activeId, targetIndex);
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
              moveTab(activeId, targetIndex);
              if (sourceGroupId !== targetGroupId)
              {
                groupTab(activeId, targetGroupId);
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
                ungroupTab(activeId);
              }
              moveTab(activeId, targetIndex);
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
              Sort by Domain (A-Z)
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => sortTabs('desc', tabGroups, sortGroupsFirst)}>
              Sort by Domain (Z-A)
            </ContextMenu.Item>
            <ContextMenu.Item danger onSelect={closeAllTabs}>
              Close All Tabs
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
              return (
                <div key={`group-${item.group.id}`}>
                  <TabGroupHeader
                    group={item.group}
                    isExpanded={isGroupExpanded}
                    showDropBefore={isTarget && dropPosition === 'before'}
                    showDropAfter={isTarget && dropPosition === 'after'}
                    showDropInto={isTarget && dropPosition === 'into'}
                    afterDropIndentPx={
                      isTarget && dropPosition === 'after' && isGroupExpanded
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
                    // Indent lines for tabs in group since drop stays within group
                    const indentPx = isTabTarget ? getIndentPadding(2) : undefined;
                    return (
                      <DraggableTab
                        key={tab.id}
                        tab={tab}
                        indentLevel={2}
                        isBeingDragged={activeId === tab.id}
                        showDropBefore={isTabTarget && dropPosition === 'before'}
                        showDropAfter={isTabTarget && dropPosition === 'after'}
                        beforeIndentPx={dropPosition === 'before' ? indentPx : undefined}
                        afterIndentPx={dropPosition === 'after' ? indentPx : undefined}
                        groupColor={item.group.color}
                        isLastInGroup={index === item.tabs.length - 1}
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
