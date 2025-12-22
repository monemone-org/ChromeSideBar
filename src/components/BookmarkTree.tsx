import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBookmarks, SortOption } from '../hooks/useBookmarks';
import { getIndentPadding } from '../utils/indent';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Globe,
  Trash,
  Edit,
  X,
  FolderPlus,
  ArrowDownAZ,
  Calendar,
  MoreHorizontal,
  Pin
} from 'lucide-react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
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

// Types for drag-drop
type DropPosition = 'before' | 'after' | 'into' | null;

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
  node: chrome.bookmarks.BookmarkTreeNode;
  onSave: (id: string, title: string, url?: string) => void;
  onClose: () => void;
}

const EditModal = ({ node, onSave, onClose }: EditModalProps) => {
  const [title, setTitle] = useState(node.title);
  const [url, setUrl] = useState(node.url || '');
  const isFolder = !node.url;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(node.id, title, isFolder ? undefined : url);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Edit {isFolder ? 'Folder' : 'Bookmark'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Name</label>
            <input
              autoFocus
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
      </div>
    </div>
  );
};

// --- Create Folder Modal Component ---
interface CreateFolderModalProps {
  parentId: string;
  onSave: (parentId: string, title: string) => void;
  onClose: () => void;
}

const CreateFolderModal = ({ parentId, onSave, onClose }: CreateFolderModalProps) => {
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSave(parentId, title.trim());
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            New Folder
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Folder Name</label>
            <input
              autoFocus
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
      </div>
    </div>
  );
};

// Special folder IDs that cannot be edited/deleted
const SPECIAL_FOLDER_IDS = ['1', '2']; // Bookmarks Bar, Other Bookmarks

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

// Helper: Calculate drop position based on pointer Y position
const calculateDropPosition = (
  element: HTMLElement,
  pointerY: number,
  isFolder: boolean
): DropPosition => {
  const rect = element.getBoundingClientRect();
  const relativeY = pointerY - rect.top;
  const height = rect.height;

  if (isFolder) {
    if (relativeY < height * 0.25) return 'before';
    if (relativeY > height * 0.75) return 'after';
    return 'into';
  } else {
    return relativeY < height * 0.5 ? 'before' : 'after';
  }
};

// --- Context Menu Component ---
interface ContextMenuProps {
  isFolder: boolean;
  isSpecialFolder: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCreateFolder?: () => void;
  onSortByName?: () => void;
  onSortByDate?: () => void;
  onClose: () => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement>;
}

const ContextMenu = ({
  isFolder,
  isSpecialFolder,
  onEdit,
  onDelete,
  onCreateFolder,
  onSortByName,
  onSortByDate,
  onClose,
  toggleButtonRef
}: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Ignore clicks on the toggle button (let button handle it)
      if (toggleButtonRef?.current?.contains(target)) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, toggleButtonRef]);

  const menuItemClass = "flex items-center w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200";

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-32"
    >
      {isFolder && (
        <>
          <button className={menuItemClass} onClick={() => { onCreateFolder?.(); onClose(); }}>
            <FolderPlus size={14} className="mr-2" /> New Folder
          </button>
          <button className={menuItemClass} onClick={() => { onSortByName?.(); onClose(); }}>
            <ArrowDownAZ size={14} className="mr-2" /> Sort by Name
          </button>
          <button className={menuItemClass} onClick={() => { onSortByDate?.(); onClose(); }}>
            <Calendar size={14} className="mr-2" /> Sort by Date
          </button>
          {!isSpecialFolder && <div className="border-t border-gray-200 dark:border-gray-700 my-1" />}
        </>
      )}
      {!isSpecialFolder && (
        <>
          <button className={menuItemClass} onClick={() => { onEdit(); onClose(); }}>
            <Edit size={14} className="mr-2" /> Edit
          </button>
          <button className={clsx(menuItemClass, "text-red-500 dark:text-red-400")} onClick={() => { onDelete(); onClose(); }}>
            <Trash size={14} className="mr-2" /> Delete
          </button>
        </>
      )}
    </div>
  );
};

// --- Bookmark Item ---
interface BookmarkItemProps {
  node: chrome.bookmarks.BookmarkTreeNode;
  depth?: number;
  expandedState: Record<string, boolean>;
  toggleFolder: (id: string, expanded: boolean) => void;
  onRemove: (id: string) => void;
  onEdit: (node: chrome.bookmarks.BookmarkTreeNode) => void;
  onCreateFolder: (parentId: string) => void;
  onSort: (folderId: string, sortBy: SortOption) => void;
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  openInNewTab?: boolean;
  // Drag-drop props
  isDragging?: boolean;
  activeId?: string | null;
  dropTargetId?: string | null;
  dropPosition?: DropPosition;
  onPointerEnter?: (id: string) => void;
  onPointerLeave?: () => void;
}

const BookmarkItem = ({
  node,
  depth = 0,
  expandedState,
  toggleFolder,
  onRemove,
  onEdit,
  onCreateFolder,
  onSort,
  onPin,
  openInNewTab = false,
  isDragging,
  activeId,
  dropTargetId,
  dropPosition,
  onPointerEnter,
  onPointerLeave
}: BookmarkItemProps) => {
  const isFolder = !node.url;
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Set up draggable (disabled for special folders)
  const isSpecialFolder = SPECIAL_FOLDER_IDS.includes(node.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform
  } = useDraggable({
    id: node.id,
    disabled: isSpecialFolder
  });

  const style: React.CSSProperties = {
    paddingLeft: `${getIndentPadding(depth)}px`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  // Check if this item is being dragged
  const isBeingDragged = activeId === node.id;

  // Check if this is the drop target
  const isDropTarget = dropTargetId === node.id;

  // Show drop indicators
  const showDropBefore = isDropTarget && dropPosition === 'before';
  const showDropAfter = isDropTarget && dropPosition === 'after';
  const showDropInto = isDropTarget && dropPosition === 'into' && isFolder;

  return (
    <>
      <div
        ref={setNodeRef}
        data-bookmark-id={node.id}
        data-is-folder={isFolder}
        style={style}
        className={clsx(
          "group relative flex items-center py-1 pr-2 rounded cursor-pointer select-none",
          !isDragging && "hover:bg-gray-100 dark:hover:bg-gray-800",
          isBeingDragged && "opacity-50",
          showDropInto && "bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500",
          !isSpecialFolder && "touch-none"
        )}
        onPointerEnter={() => isDragging && onPointerEnter?.(node.id)}
        onPointerLeave={() => isDragging && onPointerLeave?.()}
        {...attributes}
        {...listeners}
      >
        {/* Drop before indicator */}
        {showDropBefore && (
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 z-20" />
        )}

        {/* Drop after indicator */}
        {showDropAfter && (
          <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-500 z-20" />
        )}

        <span
          className={clsx("mr-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700", !isFolder && "invisible")}
          onClick={(e) => { e.stopPropagation(); toggleFolder(node.id, !expandedState[node.id]); }}
        >
          {expandedState[node.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <span className="mr-2 text-gray-500 flex-shrink-0">
          {isFolder ? (
            <Folder size={16} />
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
            <Globe size={16} />
          )}
          {!isFolder && <Globe size={16} className="hidden" />}
        </span>

        <span
          className="flex-1 truncate"
          onClick={(e) => {
            if (isFolder) {
              toggleFolder(node.id, !expandedState[node.id]);
            } else if (node.url) {
              if (e.shiftKey) {
                chrome.windows.create({ url: node.url });
              } else if (e.metaKey || e.ctrlKey) {
                // Cmd+click: invert the default behavior
                if (openInNewTab) {
                  chrome.tabs.update({ url: node.url });
                } else {
                  chrome.tabs.create({ url: node.url, active: false });
                }
              } else {
                // Regular click: use the setting
                if (openInNewTab) {
                  chrome.tabs.create({ url: node.url, active: true });
                } else {
                  chrome.tabs.update({ url: node.url });
                }
              }
            }
          }}
        >
          {node.title}
        </span>

        {!isFolder && onPin && node.url && (
          <button
            onClick={(e) => { e.stopPropagation(); onPin(node.url!, node.title, getFaviconUrl(node.url!)); }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Pin"
          >
            <Pin size={14} />
          </button>
        )}

        <button
          ref={menuButtonRef}
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <MoreHorizontal size={14} />
        </button>

        {showMenu && (
          <ContextMenu
            isFolder={isFolder}
            isSpecialFolder={SPECIAL_FOLDER_IDS.includes(node.id)}
            onEdit={() => onEdit(node)}
            onDelete={() => onRemove(node.id)}
            onCreateFolder={() => onCreateFolder(node.id)}
            onSortByName={() => onSort(node.id, 'name')}
            onSortByDate={() => onSort(node.id, 'dateAdded')}
            onClose={() => setShowMenu(false)}
            toggleButtonRef={menuButtonRef}
          />
        )}
      </div>

      {isFolder && expandedState[node.id] && node.children && (
        <div>
          {node.children.map((child) => (
            <BookmarkItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedState={expandedState}
              toggleFolder={toggleFolder}
              onRemove={onRemove}
              onEdit={onEdit}
              onCreateFolder={onCreateFolder}
              onSort={onSort}
              onPin={onPin}
              openInNewTab={openInNewTab}
              isDragging={isDragging}
              activeId={activeId}
              dropTargetId={dropTargetId}
              dropPosition={dropPosition}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
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
}

const DragOverlayContent = ({ node }: DragOverlayContentProps) => {
  const isFolder = !node.url;
  return (
    <div className="flex items-center py-1 px-2 bg-white dark:bg-gray-800 rounded shadow-lg border border-gray-200 dark:border-gray-700">
      <span className="mr-2 text-gray-500">
        {isFolder ? <Folder size={16} /> : <Globe size={16} />}
      </span>
      <span className="truncate max-w-48">{node.title}</span>
    </div>
  );
};

interface BookmarkTreeProps {
  onPin?: (url: string, title: string, faviconUrl?: string) => void;
  hideOtherBookmarks?: boolean;
  openInNewTab?: boolean;
}

export const BookmarkTree = ({ onPin, hideOtherBookmarks = false, openInNewTab = false }: BookmarkTreeProps) => {
  const { bookmarks, removeBookmark, updateBookmark, createFolder, sortBookmarks, moveBookmark } = useBookmarks();

  // Filter out "Other Bookmarks" (id "2") if hidden
  const visibleBookmarks = hideOtherBookmarks
    ? bookmarks.filter(node => node.id !== '2')
    : bookmarks;

  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  const [editingNode, setEditingNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);

  // Drag-drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);

  // Auto-expand timer for folders
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredFolderRef = useRef<string | null>(null);

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
  }, [findNode]);

  // Drag move handler - calculate drop position based on pointer
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { active, activatorEvent } = event;

    // Get pointer coordinates from the event
    const pointerEvent = activatorEvent as PointerEvent;
    if (!pointerEvent) return;

    // Get the current pointer position (we need to add the delta to get current position)
    const currentX = pointerEvent.clientX + (event.delta?.x || 0);
    const currentY = pointerEvent.clientY + (event.delta?.y || 0);

    // Find the element under the pointer
    const elements = document.elementsFromPoint(currentX, currentY);
    const targetElement = elements.find(el =>
      el.hasAttribute('data-bookmark-id') &&
      el.getAttribute('data-bookmark-id') !== active.id
    ) as HTMLElement | undefined;

    if (!targetElement) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const targetId = targetElement.getAttribute('data-bookmark-id');
    if (!targetId) return;

    // Check restrictions
    const sourceId = active.id as string;

    // Can't drop on self
    if (targetId === sourceId) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    // Can't drop folder into its own descendants
    if (isDescendant(sourceId, targetId, bookmarks)) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    // Can't move special folders (Bookmarks Bar, Other Bookmarks)
    const sourceNode = findNode(sourceId);
    if (sourceNode && SPECIAL_FOLDER_IDS.includes(sourceNode.id)) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const isFolder = targetElement.getAttribute('data-is-folder') === 'true';
    const position = calculateDropPosition(targetElement, currentY, isFolder);

    setDropTargetId(targetId);
    setDropPosition(position);

    // Auto-expand folder on hover
    if (isFolder && position === 'into') {
      if (lastHoveredFolderRef.current !== targetId) {
        // Clear existing timer
        if (autoExpandTimerRef.current) {
          clearTimeout(autoExpandTimerRef.current);
        }
        lastHoveredFolderRef.current = targetId;

        // Set new timer to expand folder after 1 second
        autoExpandTimerRef.current = setTimeout(() => {
          if (targetId && !expandedState[targetId]) {
            setExpandedState(prev => ({ ...prev, [targetId]: true }));
          }
        }, 1000);
      }
    } else {
      // Clear timer if not hovering over folder center
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current);
        autoExpandTimerRef.current = null;
      }
      lastHoveredFolderRef.current = null;
    }
  }, [bookmarks, expandedState, findNode]);

  // Drag end handler
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Clear auto-expand timer
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    lastHoveredFolderRef.current = null;

    const { active } = event;
    const sourceId = active.id as string;

    // Perform the move if we have a valid drop target
    if (dropTargetId && dropPosition) {
      // Check if target is an expanded folder
      const targetNode = findNode(dropTargetId);
      const isExpandedFolder = !!(targetNode && !targetNode.url && expandedState[dropTargetId]);

      moveBookmark(sourceId, dropTargetId, dropPosition, isExpandedFolder);

      // Auto-expand folder if dropping into it
      if ((dropPosition === 'into' || (dropPosition === 'after' && isExpandedFolder)) && !expandedState[dropTargetId]) {
        setExpandedState(prev => ({ ...prev, [dropTargetId]: true }));
      }
    }

    // Reset drag state
    setActiveId(null);
    setActiveNode(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [dropTargetId, dropPosition, moveBookmark, expandedState]);

  // Pointer enter/leave handlers for tracking hover
  const handlePointerEnter = useCallback((_id: string) => {
    // Tracking is done in handleDragMove, but we keep this for potential future use
  }, []);

  const handlePointerLeave = useCallback(() => {
    // Clear target when leaving
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
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
          onPin={onPin}
          openInNewTab={openInNewTab}
          isDragging={!!activeId}
          activeId={activeId}
          dropTargetId={dropTargetId}
          dropPosition={dropPosition}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        />
      ))}

      {/* Drag overlay */}
      <DragOverlay>
        {activeNode ? <DragOverlayContent node={activeNode} /> : null}
      </DragOverlay>

      {editingNode && createPortal(
        <EditModal
          node={editingNode}
          onSave={updateBookmark}
          onClose={() => setEditingNode(null)}
        />,
        document.body
      )}

      {creatingFolderParentId && createPortal(
        <CreateFolderModal
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
        />,
        document.body
      )}
    </DndContext>
  );
};
