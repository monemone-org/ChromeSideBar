/**
 * Unified Drag-and-Drop Types
 *
 * Multi-item, multi-format drag data system:
 * - DragData contains multiple DragItems (for multi-selection)
 * - Each DragItem can provide multiple formats (for format negotiation)
 *
 * Similar to native DataTransfer with multiple MIME types, but extended
 * to support dragging multiple items at once.
 */

// Re-export DropPosition from utils for convenience
export type { DropPosition } from '../utils/dragDrop';
export { calculateDropPosition } from '../utils/dragDrop';

import { getAllBookmarkUrlsInFolder } from '../utils/bookmarkOperations';

// Drop zones - each component that participates in DnD
export type DropZone = 'pinnedBar' | 'spaceBar' | 'tabList' | 'bookmarkTree';

/**
 * Drag data formats - what kind of data is available.
 * A single DragItem can provide multiple formats (e.g., a tab provides TAB + URL).
 */
export enum DragFormat
{
  URL = 'url',           // Generic URL (any source can provide this)
  TAB = 'tab',           // Chrome tab (has tabId)
  TAB_GROUP = 'tabGroup', // Chrome tab group (has groupId, contains tabs)
  BOOKMARK = 'bookmark', // Bookmark node (has bookmarkId)
  PIN = 'pin',           // Pinned site (has siteId)
  SPACE = 'space',       // Space (has spaceId)
}

// ============================================================================
// Format-specific data interfaces
// ============================================================================

/**
 * Generic URL data - the most universal format.
 * Any item with a URL can provide this format.
 */
export interface UrlData
{
  url: string;
  title?: string;
  faviconUrl?: string;
}

/**
 * Chrome tab data - for moving/reordering tabs.
 */
export interface TabData
{
  tabId: number;
  groupId?: number;
  url?: string;
  title: string;
  faviconUrl?: string;
}

/**
 * Chrome tab group data - for moving/reordering groups.
 */
export interface TabGroupData
{
  groupId: number;
  tabCount: number;
  title: string;
  color?: chrome.tabGroups.ColorEnum;
  matchedSpaceIcon?: string;
}

/**
 * Bookmark node data - for moving/reordering bookmarks.
 */
export interface BookmarkData
{
  bookmarkId: string;
  isFolder: boolean;
  url?: string;
  title: string;
  parentId?: string;
  depth?: number;
}

/**
 * Pinned site data - for moving/reordering pins.
 */
export interface PinData
{
  siteId: string;
  url: string;
  title: string;
  faviconUrl?: string;
}

/**
 * Space data - for moving/reordering spaces.
 */
export interface SpaceData
{
  spaceId: string;
  name: string;
  icon: string;
  color: string;
}

// ============================================================================
// DragItem - single item with multiple formats
// ============================================================================

/**
 * A single dragged item that can provide multiple formats.
 *
 * @example A tab provides TAB + URL:
 * {
 *   formats: [DragFormat.TAB, DragFormat.URL],
 *   tab: { tabId: 123, title: 'Google', url: '...' },
 *   url: { url: '...', title: 'Google' }
 * }
 *
 * @example A folder only provides BOOKMARK:
 * {
 *   formats: [DragFormat.BOOKMARK],
 *   bookmark: { bookmarkId: '123', isFolder: true, title: 'Work' }
 * }
 */
export interface DragItem
{
  // Available formats for this item (first = most specific)
  formats: DragFormat[];

  // Format-specific data (present if format is in the formats array)
  url?: UrlData;
  tab?: TabData;
  tabGroup?: TabGroupData;
  bookmark?: BookmarkData;
  pin?: PinData;
  space?: SpaceData;
}

// ============================================================================
// DragData - multi-item container
// ============================================================================

/**
 * DragData contains multiple items being dragged (for multi-selection).
 * Each item can provide multiple formats.
 *
 * @example Dragging a single tab:
 * {
 *   items: [{
 *     formats: [DragFormat.TAB, DragFormat.URL],
 *     tab: { tabId: 123, ... },
 *     url: { url: '...', ... }
 *   }]
 * }
 *
 * @example Dragging a group + 2 tabs (multi-selection):
 * {
 *   items: [
 *     { formats: [DragFormat.TAB_GROUP], tabGroup: { groupId: 1, ... } },
 *     { formats: [DragFormat.TAB, DragFormat.URL], tab: { tabId: 101, ... }, url: { ... } },
 *     { formats: [DragFormat.TAB, DragFormat.URL], tab: { tabId: 102, ... }, url: { ... } },
 *   ]
 * }
 */
export interface DragData
{
  items: DragItem[];
}

// ============================================================================
// DropData - drop target configuration
// ============================================================================

/**
 * Drop target data - attached to useDroppable({ data }).
 * The canAccept function checks if any items have acceptable formats.
 */
export interface DropData
{
  zone: DropZone;
  targetId: string;
  /**
   * Returns the format this target can accept, or null to reject.
   * For multi-item drags, returns the format if ANY item can be accepted.
   */
  canAccept: (dragData: DragData) => DragFormat | null;
  isFolder?: boolean;       // for bookmarks - determines if can drop into
  isGroup?: boolean;        // for tab groups - determines if can drop into
  isHorizontal?: boolean;   // for horizontal bars (PinnedBar, SpaceBar) - use X for position
  isExpanded?: boolean;     // for groups/folders - whether expanded (affects drop position)
  /**
   * Dynamic container check based on accepted format.
   * Used when a drop target acts as a container for some formats but not others.
   * e.g., SpaceIcon is a container for TAB/URL (drop into) but not for SPACE (reorder).
   */
  isContainerForFormat?: (format: DragFormat) => boolean;
  depth?: number;           // for indent calculation
  parentId?: string;        // parent container ID
  index?: number;           // position in parent for reordering
}

// ============================================================================
// Helper functions for DragData
// ============================================================================

/**
 * Get all unique formats available across all items.
 */
export const getAllFormats = (dragData: DragData): DragFormat[] =>
  [...new Set(dragData.items.flatMap(item => item.formats))];

/**
 * Check if any item has the specified format.
 */
export const hasFormat = (dragData: DragData, format: DragFormat): boolean =>
  dragData.items.some(item => item.formats.includes(format));

/**
 * Get all items that have the specified format.
 */
export const getItemsByFormat = (dragData: DragData, format: DragFormat): DragItem[] =>
  dragData.items.filter(item => item.formats.includes(format));

/**
 * Get the first item (primary dragged item).
 */
export const getPrimaryItem = (dragData: DragData): DragItem | undefined =>
  dragData.items[0];

/**
 * Check if this is a multi-item drag.
 */
export const isMultiDrag = (dragData: DragData): boolean =>
  dragData.items.length > 1;

/**
 * Find the first format from the preferred list that exists in any item.
 * Returns the format or null if none match.
 *
 * @example
 * // PinnedBar accepts PIN (for reorder) or URL (to create new pin)
 * findFirstFormat(dragData, [DragFormat.PIN, DragFormat.URL])
 */
export const findFirstFormat = (
  dragData: DragData,
  preferredFormats: DragFormat[]
): DragFormat | null =>
{
  for (const format of preferredFormats)
  {
    if (hasFormat(dragData, format))
    {
      return format;
    }
  }
  return null;
};

/**
 * Create a canAccept function that accepts the first matching format.
 *
 * @example
 * canAccept: acceptsFormats(DragFormat.PIN, DragFormat.URL)
 */
export const acceptsFormats = (...formats: DragFormat[]) =>
  (dragData: DragData): DragFormat | null => findFirstFormat(dragData, formats);

/**
 * Create a canAccept function with custom validation.
 * The validator receives the dragData and the matched format.
 *
 * @example
 * canAccept: acceptsFormatsIf(
 *   [DragFormat.BOOKMARK, DragFormat.URL],
 *   (dragData, format) => {
 *     // Reject if primary item is dropping on itself
 *     const primary = getPrimaryItem(dragData);
 *     if (format === DragFormat.BOOKMARK && primary?.bookmark?.bookmarkId === myId) {
 *       return false;
 *     }
 *     return true;
 *   }
 * )
 */
export const acceptsFormatsIf = (
  formats: DragFormat[],
  validator: (dragData: DragData, format: DragFormat) => boolean
) =>
  (dragData: DragData): DragFormat | null =>
  {
    const format = findFirstFormat(dragData, formats);
    if (format && validator(dragData, format))
    {
      return format;
    }
    return null;
  };

/**
 * Collect all URLs from drag items.
 * Handles bookmarks (including folders with recursive URL collection), and URL items.
 * Supports multi-selection.
 */
export async function collectUrlsFromDragItems(dragData: DragData): Promise<string[]>
{
  const urls: string[] = [];

  for (const item of dragData.items)
  {
    if (item.bookmark?.isFolder)
    {
      // Bookmark folder - recursively get all URLs
      const folderUrls = await getAllBookmarkUrlsInFolder(item.bookmark.bookmarkId);
      urls.push(...folderUrls);
    }
    else if (item.bookmark?.url)
    {
      // Leaf bookmark
      urls.push(item.bookmark.url);
    }
    else if (item.url?.url)
    {
      // URL item
      urls.push(item.url.url);
    }
    else if (item.tab?.url)
    {
      // TAB item
      urls.push(item.tab.url);
    }
  }

  return urls;
}

// ============================================================================
// DragItem factory functions
// ============================================================================

/**
 * Create a DragItem for a pinned site.
 * Provides: PIN, URL
 */
export const createPinDragItem = (
  siteId: string,
  url: string,
  title: string,
  faviconUrl?: string
): DragItem => ({
  formats: [DragFormat.PIN, DragFormat.URL],
  pin: { siteId, url, title, faviconUrl },
  url: { url, title, faviconUrl },
});

/**
 * Create a DragItem for a bookmark.
 * Provides: BOOKMARK, URL (if not a folder)
 */
export const createBookmarkDragItem = (
  bookmarkId: string,
  isFolder: boolean,
  title: string,
  url?: string,
  parentId?: string,
  depth?: number
): DragItem =>
{
  const bookmark: BookmarkData = { bookmarkId, isFolder, title, url, parentId, depth };

  if (isFolder)
  {
    return {
      formats: [DragFormat.BOOKMARK],
      bookmark,
    };
  }

  return {
    formats: [DragFormat.BOOKMARK, DragFormat.URL],
    bookmark,
    url: url ? { url, title } : undefined,
  };
};

/**
 * Create a DragItem for a live bookmark (has associated tab).
 * Provides: TAB, BOOKMARK, URL
 */
export const createLiveBookmarkDragItem = (
  bookmarkId: string,
  title: string,
  url: string,
  tabId: number,
  groupId?: number,
  parentId?: string,
  depth?: number
): DragItem => ({
  formats: [DragFormat.TAB, DragFormat.BOOKMARK, DragFormat.URL],
  tab: { tabId, groupId, url, title },
  bookmark: { bookmarkId, isFolder: false, url, title, parentId, depth },
  url: { url, title },
});

/**
 * Create a DragItem for a Chrome tab.
 * Provides: TAB, URL
 */
export const createTabDragItem = (
  tabId: number,
  title: string,
  url?: string,
  groupId?: number,
  faviconUrl?: string
): DragItem => ({
  formats: url ? [DragFormat.TAB, DragFormat.URL] : [DragFormat.TAB],
  tab: { tabId, groupId, url, title, faviconUrl },
  url: url ? { url, title, faviconUrl } : undefined,
});

/**
 * Create a DragItem for a Chrome tab group.
 * Provides: TAB_GROUP only
 */
export const createTabGroupDragItem = (
  groupId: number,
  title: string,
  tabCount: number,
  color?: chrome.tabGroups.ColorEnum,
  matchedSpaceIcon?: string
): DragItem => ({
  formats: [DragFormat.TAB_GROUP],
  tabGroup: { groupId, title, tabCount, color, matchedSpaceIcon },
});

/**
 * Create a DragItem for a space.
 * Provides: SPACE only
 */
export const createSpaceDragItem = (
  spaceId: string,
  name: string,
  icon: string,
  color: string
): DragItem => ({
  formats: [DragFormat.SPACE],
  space: { spaceId, name, icon, color },
});

/**
 * Create a DragItem for a generic URL.
 * Provides: URL only
 */
export const createUrlDragItem = (
  url: string,
  title?: string,
  faviconUrl?: string
): DragItem => ({
  formats: [DragFormat.URL],
  url: { url, title, faviconUrl },
});

// ============================================================================
// DragData factory functions
// ============================================================================

/**
 * Create DragData from a single item.
 */
export const createDragData = (item: DragItem): DragData => ({
  items: [item],
});

/**
 * Create DragData from multiple items.
 */
export const createMultiDragData = (items: DragItem[]): DragData => ({
  items,
});

// Convenience functions for single-item drags (backwards compatible signatures)

export const createPinDragData = (
  siteId: string,
  url: string,
  title: string,
  faviconUrl?: string
): DragData => createDragData(createPinDragItem(siteId, url, title, faviconUrl));

export const createBookmarkDragData = (
  bookmarkId: string,
  isFolder: boolean,
  title: string,
  url?: string,
  parentId?: string,
  depth?: number
): DragData => createDragData(createBookmarkDragItem(bookmarkId, isFolder, title, url, parentId, depth));

export const createLiveBookmarkDragData = (
  bookmarkId: string,
  title: string,
  url: string,
  tabId: number,
  groupId?: number,
  parentId?: string,
  depth?: number
): DragData => createDragData(createLiveBookmarkDragItem(bookmarkId, title, url, tabId, groupId, parentId, depth));

export const createTabDragData = (
  tabId: number,
  title: string,
  url?: string,
  groupId?: number,
  faviconUrl?: string
): DragData => createDragData(createTabDragItem(tabId, title, url, groupId, faviconUrl));

export const createTabGroupDragData = (
  groupId: number,
  title: string,
  tabCount: number,
  color?: chrome.tabGroups.ColorEnum,
  matchedSpaceIcon?: string
): DragData => createDragData(createTabGroupDragItem(groupId, title, tabCount, color, matchedSpaceIcon));

export const createSpaceDragData = (
  spaceId: string,
  name: string,
  icon: string,
  color: string
): DragData => createDragData(createSpaceDragItem(spaceId, name, icon, color));

export const createUrlDragData = (
  url: string,
  title?: string,
  faviconUrl?: string
): DragData => createDragData(createUrlDragItem(url, title, faviconUrl));

// ============================================================================
// DropData factory
// ============================================================================

/**
 * Helper to create DropData for drop targets
 */
export const createDropData = (
  zone: DropZone,
  targetId: string,
  canAccept: (dragData: DragData) => DragFormat | null,
  options: Partial<Omit<DropData, 'zone' | 'targetId' | 'canAccept'>> = {}
): DropData => ({
  zone,
  targetId,
  canAccept,
  ...options,
});

// ============================================================================
// Legacy compatibility - to be removed after migration
// ============================================================================

/** @deprecated Use DragFormat instead */
export const DragType = DragFormat;

/** @deprecated Use DragFormat instead */
export type DragItemType = DragFormat;
