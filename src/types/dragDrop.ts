/**
 * Unified Drag-and-Drop Types
 *
 * Multi-format drag data system: each drag provides data in multiple formats,
 * and drop targets pick the format they can handle. Similar to native
 * DataTransfer with multiple MIME types.
 */

// Re-export DropPosition from utils for convenience
export type { DropPosition } from '../utils/dragDrop';
export { calculateDropPosition } from '../utils/dragDrop';

// Drop zones - each component that participates in DnD
export type DropZone = 'pinnedBar' | 'spaceBar' | 'tabList' | 'bookmarkTree';

/**
 * Drag data formats - what kind of data is available.
 * A single drag can provide multiple formats (e.g., a tab provides TAB + URL).
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
}

// ============================================================================
// DragData - multi-format container
// ============================================================================

/**
 * DragData contains all available formats for a drag operation.
 * Drop targets check formats[] and use the first format they can handle.
 *
 * @example Dragging a Tab:
 * {
 *   formats: [DragFormat.TAB, DragFormat.URL],
 *   tab: { tabId: 123, title: 'Google', url: '...' },
 *   url: { url: '...', title: 'Google' }
 * }
 *
 * @example Dragging a Live Bookmark (has associated tab):
 * {
 *   formats: [DragFormat.TAB, DragFormat.BOOKMARK, DragFormat.URL],
 *   tab: { tabId: 456, ... },
 *   bookmark: { bookmarkId: 'abc', ... },
 *   url: { url: '...', ... }
 * }
 *
 * @example Dragging a Folder (no URL):
 * {
 *   formats: [DragFormat.BOOKMARK],
 *   bookmark: { bookmarkId: '123', isFolder: true, ... }
 * }
 */
export interface DragData
{
  // Available formats in preference order (first = most specific)
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
// DropData - drop target configuration
// ============================================================================

/**
 * Drop target data - attached to useDroppable({ data }).
 * The canAccept function returns the format it can handle, or null to reject.
 */
export interface DropData
{
  zone: DropZone;
  targetId: string;
  /**
   * Returns the format this target can accept, or null to reject.
   * The drop handler will receive this format to know how to process the drop.
   */
  canAccept: (dragData: DragData) => DragFormat | null;
  isFolder?: boolean;       // for bookmarks - determines if can drop into
  isGroup?: boolean;        // for tab groups - determines if can drop into
  depth?: number;           // for indent calculation
  parentId?: string;        // parent container ID
  index?: number;           // position in parent for reordering
}

// ============================================================================
// Helper functions for canAccept
// ============================================================================

/**
 * Find the first format from the preferred list that exists in dragData.
 * Returns the format or null if none match.
 *
 * @example
 * // PinnedBar accepts PIN (for reorder) or URL (to create new pin)
 * canAccept: (dragData) => findFirstFormat(dragData, [DragFormat.PIN, DragFormat.URL])
 */
export const findFirstFormat = (
  dragData: DragData,
  preferredFormats: DragFormat[]
): DragFormat | null =>
{
  for (const format of preferredFormats)
  {
    if (dragData.formats.includes(format))
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
 * Create a canAccept function with custom validation per format.
 * The validator receives the dragData and the matched format.
 *
 * @example
 * canAccept: acceptsFormatsIf(
 *   [DragFormat.BOOKMARK, DragFormat.URL],
 *   (dragData, format) => {
 *     // Reject dropping bookmark on itself
 *     if (format === DragFormat.BOOKMARK && dragData.bookmark?.bookmarkId === myId) {
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

// ============================================================================
// DragData factory functions
// ============================================================================

/**
 * Create DragData for a pinned site.
 * Provides: PIN, URL
 */
export const createPinDragData = (
  siteId: string,
  url: string,
  title: string,
  faviconUrl?: string
): DragData => ({
  formats: [DragFormat.PIN, DragFormat.URL],
  pin: { siteId, url, title, faviconUrl },
  url: { url, title, faviconUrl },
});

/**
 * Create DragData for a bookmark (non-folder).
 * Provides: BOOKMARK, URL
 */
export const createBookmarkDragData = (
  bookmarkId: string,
  isFolder: boolean,
  title: string,
  url?: string,
  parentId?: string,
  depth?: number
): DragData =>
{
  const bookmark: BookmarkData = { bookmarkId, isFolder, title, url, parentId, depth };

  if (isFolder)
  {
    // Folders only provide BOOKMARK format (no URL)
    return {
      formats: [DragFormat.BOOKMARK],
      bookmark,
    };
  }

  // Regular bookmarks provide BOOKMARK + URL
  return {
    formats: [DragFormat.BOOKMARK, DragFormat.URL],
    bookmark,
    url: url ? { url, title } : undefined,
  };
};

/**
 * Create DragData for a live bookmark (has associated tab).
 * Provides: TAB, BOOKMARK, URL
 */
export const createLiveBookmarkDragData = (
  bookmarkId: string,
  title: string,
  url: string,
  tabId: number,
  groupId?: number,
  parentId?: string,
  depth?: number
): DragData => ({
  formats: [DragFormat.TAB, DragFormat.BOOKMARK, DragFormat.URL],
  tab: { tabId, groupId, url, title },
  bookmark: { bookmarkId, isFolder: false, url, title, parentId, depth },
  url: { url, title },
});

/**
 * Create DragData for a Chrome tab.
 * Provides: TAB, URL
 */
export const createTabDragData = (
  tabId: number,
  title: string,
  url?: string,
  groupId?: number
): DragData => ({
  formats: url ? [DragFormat.TAB, DragFormat.URL] : [DragFormat.TAB],
  tab: { tabId, groupId, url, title },
  url: url ? { url, title } : undefined,
});

/**
 * Create DragData for a Chrome tab group.
 * Provides: TAB_GROUP only (no URL for groups)
 */
export const createTabGroupDragData = (
  groupId: number,
  title: string,
  tabCount: number,
  color?: chrome.tabGroups.ColorEnum
): DragData => ({
  formats: [DragFormat.TAB_GROUP],
  tabGroup: { groupId, title, tabCount, color },
});

/**
 * Create DragData for a space.
 * Provides: SPACE only
 */
export const createSpaceDragData = (
  spaceId: string,
  name: string
): DragData => ({
  formats: [DragFormat.SPACE],
  space: { spaceId, name },
});

/**
 * Create DragData for a generic URL (e.g., from external drop).
 * Provides: URL only
 */
export const createUrlDragData = (
  url: string,
  title?: string,
  faviconUrl?: string
): DragData => ({
  formats: [DragFormat.URL],
  url: { url, title, faviconUrl },
});

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
