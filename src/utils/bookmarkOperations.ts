/**
 * Shared bookmark operations for drag-and-drop and other bookmark management.
 */

/**
 * Filter out tabs that shouldn't be bookmarked (empty new tabs, chrome:// pages, etc.)
 */
export function filterBookmarkableTabs(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[]
{
  return tabs.filter(tab =>
    tab.url &&
    tab.url !== 'chrome://newtab/' 
  );
}

/**
 * Create multiple bookmarks in a folder.
 *
 * @param parentId - The folder ID to create bookmarks in
 * @param items - Array of bookmark items with title and url
 * @returns Object with success status and optional error message
 */
export async function createBookmarksInFolder(
  parentId: string,
  items: Array<{ title: string; url: string }>
): Promise<{ success: boolean; error?: string }>
{
  for (const item of items)
  {
    const error = await new Promise<string | null>((resolve) =>
    {
      chrome.bookmarks.create({
        parentId,
        title: item.title,
        url: item.url
      }, () =>
      {
        if (chrome.runtime.lastError)
        {
          resolve(chrome.runtime.lastError.message || 'Unknown error');
        }
        else
        {
          resolve(null);
        }
      });
    });

    if (error)
    {
      if (import.meta.env.DEV)
      {
        console.error('[createBookmarksInFolder] Failed:', error);
      }
      return { success: false, error };
    }
  }

  return { success: true };
}

/**
 * Save a tab group as a bookmark folder.
 *
 * @param parentId - The parent folder ID to create the folder in
 * @param folderName - The title for the bookmark folder
 * @param tabs - The tabs to save as bookmarks
 * @param index - Optional index position in the parent folder
 * @returns Object with success status, created folder, and optional error
 */
export async function saveTabGroupAsBookmarkFolder(
  parentId: string,
  folderName: string,
  tabs: chrome.tabs.Tab[],
  index?: number
): Promise<{ success: boolean; folder?: chrome.bookmarks.BookmarkTreeNode; error?: string }>
{
  const bookmarkableTabs = filterBookmarkableTabs(tabs);

  if (bookmarkableTabs.length === 0)
  {
    return { success: false, error: 'No bookmarkable tabs' };
  }

  // Create folder
  const folder = await new Promise<chrome.bookmarks.BookmarkTreeNode | null>((resolve) =>
  {
    chrome.bookmarks.create({ parentId, title: folderName, index }, (node) =>
    {
      if (chrome.runtime.lastError)
      {
        if (import.meta.env.DEV)
        {
          console.error('[saveTabGroupAsBookmarkFolder] Create folder failed:', chrome.runtime.lastError);
        }
        resolve(null);
      }
      else
      {
        resolve(node);
      }
    });
  });

  if (!folder)
  {
    return { success: false, error: 'Failed to create folder' };
  }

  // Create bookmarks for each tab
  const items = bookmarkableTabs
    .filter(tab => tab.url && tab.title)
    .map(tab => ({ title: tab.title!, url: tab.url! }));

  const result = await createBookmarksInFolder(folder.id, items);
  if (!result.success)
  {
    return { success: false, folder, error: result.error };
  }

  return { success: true, folder };
}

export interface BookmarkItem
{
  url: string;
  tabId: number | null;
}

/**
 * Recursively get all bookmark items within a folder, resolving live tabs when possible.
 *
 * @param folderId - The folder ID to get items from
 * @param getTabIdForBookmark - Optional lookup to find a live tab for a bookmark ID
 * @returns Array of { url, tabId } from all bookmarks in the folder (recursive)
 */
export async function getAllBookmarkItemsInFolder(
  folderId: string,
  getTabIdForBookmark?: (bookmarkId: string) => number | undefined
): Promise<BookmarkItem[]>
{
  const results: BookmarkItem[] = [];

  const children = await chrome.bookmarks.getChildren(folderId);

  for (const child of children)
  {
    if (child.url)
    {
      const tabId = getTabIdForBookmark?.(child.id);
      results.push({ url: child.url, tabId: tabId ?? null });
    }
    else
    {
      const subItems = await getAllBookmarkItemsInFolder(child.id, getTabIdForBookmark);
      results.push(...subItems);
    }
  }

  return results;
}

/**
 * Recursively get all bookmark URLs within a folder (convenience wrapper).
 */
export async function getAllBookmarkUrlsInFolder(folderId: string): Promise<string[]>
{
  const items = await getAllBookmarkItemsInFolder(folderId);
  return items.map(item => item.url);
}
