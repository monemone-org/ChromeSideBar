import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Globe, Edit, Trash, X, RotateCcw, Play, Copy, ExternalLink } from 'lucide-react';
import { Dialog } from './Dialog';
import { PinnedSite, getFaviconUrl, fetchFaviconAsBase64 } from '../hooks/usePinnedSites';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import * as ContextMenu from './menu/ContextMenu';
import { IconColorPicker, PINNED_SITE_COLORS, DEFAULT_ICON_COLOR } from './IconColorPicker';
import { iconToDataUrl } from '../utils/iconify';
import { createPinDragData, DropData, DropPosition, DragFormat, acceptsFormats } from '../types/dragDrop';

/**
 * Shared visual component for pinned icon rendering.
 * Used by both PinnedIcon and PinOverlay (drag overlay) for consistent appearance.
 */
interface PinnedIconVisualProps
{
  favicon?: string;
  iconSize: number;
  title?: string;
  className?: string;
}

export const PinnedIconVisual: React.FC<PinnedIconVisualProps> = ({
  favicon,
  iconSize,
  title,
  className,
}) => (
  <div
    style={{ width: iconSize + 8, height: iconSize + 8 }}
    title={title}
    className={clsx(
      "relative flex items-center justify-center rounded",
      className
    )}
  >
    {favicon ? (
      <img src={favicon} alt="" style={{ width: iconSize, height: iconSize }} />
    ) : (
      <Globe style={{ width: iconSize, height: iconSize }} className="text-gray-400" />
    )}
  </div>
);

interface PinnedIconProps
{
  site: PinnedSite;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (
    id: string,
    title: string,
    url: string,
    favicon?: string,
    customIconName?: string,
    iconColor?: string
  ) => void;
  onResetFavicon: (id: string) => void;
  onDuplicate: (id: string) => void;
  onOpen: (site: PinnedSite) => void;
  onClose?: (id: string) => void;
  onMoveToNewWindow?: (id: string) => void;
  isLoaded?: boolean;
  isActive?: boolean;
  isAudible?: boolean;
  iconSize: number;
  windowId?: number;
  isDropTarget?: boolean;
  dropPosition?: DropPosition;
}

export const PinnedIcon = ({
  site,
  index,
  onRemove,
  onUpdate,
  onResetFavicon: _onResetFavicon,
  onDuplicate,
  onOpen,
  onClose,
  onMoveToNewWindow,
  isLoaded,
  isActive,
  isAudible,
  iconSize,
  windowId,
  isDropTarget,
  dropPosition,
}: PinnedIconProps) =>
{
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(site.title);
  const [editUrl, setEditUrl] = useState(site.url);
  const [editFavicon, setEditFavicon] = useState(site.favicon);
  const [editCustomIconName, setEditCustomIconName] = useState(site.customIconName);
  const [editIconColor, setEditIconColor] = useState(site.iconColor || DEFAULT_ICON_COLOR);
  const [customHexInput, setCustomHexInput] = useState('');
  const iconRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);

  const pinId = `pin-${site.id}`;

  // Draggable setup
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: pinId,
    data: createPinDragData(site.id, site.url, site.title, site.favicon),
  });

  // Droppable setup - accepts PIN (reorder) or URL (create new pin)
  const { setNodeRef: setDropRef } = useDroppable({
    id: pinId,
    data: {
      zone: 'pinnedBar',
      targetId: site.id,
      canAccept: acceptsFormats(DragFormat.PIN, DragFormat.URL),
      index,
    } as DropData,
  });

  // Combine refs
  const setRefs = useCallback((node: HTMLDivElement | null) =>
  {
    setDragRef(node);
    setDropRef(node);
    (iconRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [setDragRef, setDropRef]);

  // Track when dragging ends to prevent click
  useEffect(() =>
  {
    if (isDragging)
    {
      wasDraggingRef.current = true;
    }
  }, [isDragging]);

  const handleClick = (e: React.MouseEvent) =>
  {
    // Only handle left-clicks
    if (e.button !== 0)
    {
      return;
    }

    // Prevent navigation if we just finished dragging
    if (wasDraggingRef.current)
    {
      wasDraggingRef.current = false;
      return;
    }

    if (e.shiftKey)
    {
      // Shift+click: open in new window
      chrome.windows.create({ url: site.url });
    }
    else if (e.metaKey || e.ctrlKey)
    {
      // Cmd+click (Mac) or Ctrl+click (Windows/Linux): open in new tab
      chrome.tabs.create({ url: site.url, windowId });
    }
    else
    {
      // Normal click: open as new pinned tab
      onOpen(site);
    }
  };

  const handleEdit = () =>
  {
    setEditTitle(site.title);
    setEditUrl(site.url);
    setEditFavicon(site.favicon);
    setEditCustomIconName(site.customIconName);
    setEditIconColor(site.iconColor || DEFAULT_ICON_COLOR);
    setCustomHexInput('');
    setShowEditModal(true);
  };

  const handleSaveEdit = () =>
  {
    onUpdate(
      site.id,
      editTitle,
      editUrl,
      editFavicon,
      editCustomIconName,
      editCustomIconName ? editIconColor : undefined
    );
    setShowEditModal(false);
  };

  const handleSelectIcon = useCallback(async (iconName: string) =>
  {
    const dataUrl = await iconToDataUrl(iconName, editIconColor);
    setEditFavicon(dataUrl);
    setEditCustomIconName(iconName);
  }, [editIconColor]);

  const handleColorChange = useCallback(async (color: string) =>
  {
    setEditIconColor(color);
    // Regenerate icon with new color if a custom icon is selected
    if (editCustomIconName)
    {
      const dataUrl = await iconToDataUrl(editCustomIconName, color);
      setEditFavicon(dataUrl);
    }
  }, [editCustomIconName]);

  const handleCustomHexSubmit = useCallback(() =>
  {
    const hex = customHexInput.trim();
    // Validate hex color format
    if (/^#?[0-9A-Fa-f]{6}$/.test(hex))
    {
      const color = hex.startsWith('#') ? hex : `#${hex}`;
      handleColorChange(color);
      setCustomHexInput('');
    }
  }, [customHexInput, handleColorChange]);

  const handleResetIcon = useCallback(async () =>
  {
    // Fetch site favicon and update local edit state
    const chromeFaviconUrl = getFaviconUrl(editUrl || site.url);
    const favicon = await fetchFaviconAsBase64(chromeFaviconUrl);
    setEditFavicon(favicon);
    setEditCustomIconName(undefined);
    setEditIconColor(DEFAULT_ICON_COLOR);
  }, [editUrl, site.url]);

  const handleUnpin = () =>
  {
    onRemove(site.id);
  };

  // Current icon preview for IconColorPicker
  const currentIconPreview = editFavicon ? (
    <img src={editFavicon} alt="" className="w-5 h-5" />
  ) : (
    <Globe className="w-5 h-5 text-gray-400" />
  );

  // Reset to site icon button for IconColorPicker header
  const resetIconButton = (
    <button
      onClick={handleResetIcon}
      className="flex items-center text-[0.85em] text-blue-500 hover:text-blue-600"
    >
      <RotateCcw size={12} className="mr-1" />
      Reset to site icon
    </button>
  );

  // Drop indicator styles
  const showDropBefore = isDropTarget && dropPosition === 'before';
  const showDropAfter = isDropTarget && dropPosition === 'after';

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            ref={setRefs}
            style={{ width: iconSize + 8, height: iconSize + 8 }}
            {...attributes}
            {...listeners}
            title={site.title}
            data-dnd-id={pinId}
            className={clsx(
              "group/pin relative flex items-center justify-center rounded",
              isDragging ? "cursor-grabbing opacity-50" : "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700",
              // Active state: ring only (dot indicator added separately below)
              isActive && !isDragging && "ring-2 ring-cyan-500 dark:ring-cyan-400"
            )}
            onMouseUp={handleClick}
          >
            {/* Drop indicator - before */}
            {showDropBefore && (
              <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
            )}

            <PinnedIconVisual favicon={site.favicon} iconSize={iconSize} />            

            {/* Drop indicator - after */}
            {showDropAfter && (
              <div className="absolute -right-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />
            )}

            {/* Loaded state indicator - bottom-right corner */}
            {/* Play triangle when audible, dot otherwise */}
            {isLoaded && !isDragging && (
              isAudible ? (
                <Play
                  size={14}
                  className={clsx(
                    "absolute bottom-0 right-0 fill-current",
                    isActive
                      ? "text-cyan-400 dark:text-cyan-300"
                      : "text-cyan-500 dark:text-cyan-400"
                  )}
                />
              ) : (
                <span
                  className={clsx(
                    "absolute bottom-0 right-0 w-2 h-2 rounded-full",
                    isActive
                      ? "bg-cyan-400 dark:bg-cyan-300"
                      : "bg-cyan-500 dark:bg-cyan-400"
                  )}
                />
              )
            )}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            {isLoaded && onClose && (
              <>
                <ContextMenu.Item onSelect={() => onClose(site.id)}>
                  <X size={14} className="mr-2" /> Close Tab
                </ContextMenu.Item>
                {onMoveToNewWindow && (
                  <ContextMenu.Item onSelect={() => onMoveToNewWindow(site.id)}>
                    <ExternalLink size={14} className="mr-2" /> Move to New Window
                  </ContextMenu.Item>
                )}
                <ContextMenu.Separator />
              </>
            )}
            <ContextMenu.Item onSelect={() =>
            {
              chrome.tabs.create({ url: site.url, windowId }, (tab) =>
              {
                if (tab?.id)
                {
                  chrome.tabs.ungroup(tab.id);
                }
              });
            }}>
              <ExternalLink size={14} className="mr-2" /> Open in New Tab
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={handleEdit}>
              <Edit size={14} className="mr-2" /> Edit
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => onDuplicate(site.id)}>
              <Copy size={14} className="mr-2" /> Duplicate
            </ContextMenu.Item>
            <ContextMenu.Item danger onSelect={handleUnpin}>
              <Trash size={14} className="mr-2" /> Unpin
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <Dialog
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Pin"
        maxWidth="max-w-sm"
        footer={
          <div className="flex justify-end space-x-2 p-4 pt-3">
            <button
              onClick={() => setShowEditModal(false)}
              className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="px-4 space-y-3">
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
              Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
              URL
            </label>
            <input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Icon and Color picker */}
          <IconColorPicker
            selectedIcon={editCustomIconName}
            selectedColor={editIconColor}
            currentIconPreview={currentIconPreview}
            onIconSelect={handleSelectIcon}
            onColorSelect={handleColorChange}
            colorOptions={PINNED_SITE_COLORS}
            showCustomHex
            customHexValue={customHexInput}
            onCustomHexChange={setCustomHexInput}
            onCustomHexSubmit={handleCustomHexSubmit}
            currentCustomColor={editIconColor}
            iconHeaderAction={resetIconButton}
          />
        </div>
      </Dialog>
    </>
  );
};
