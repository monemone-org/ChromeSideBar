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

/**
 * Recursively get all bookmark URLs within a folder.
 *
 * @param folderId - The folder ID to get URLs from
 * @returns Array of URLs from all bookmarks in the folder (recursive)
 */
export async function getAllBookmarkUrlsInFolder(folderId: string): Promise<string[]>
{
  const results: string[] = [];

  const children = await chrome.bookmarks.getChildren(folderId);

  for (const child of children)
  {
    if (child.url)
    {
      results.push(child.url);
    }
    else
    {
      // Recurse into subfolders
      const subUrls = await getAllBookmarkUrlsInFolder(child.id);
      results.push(...subUrls);
    }
  }

  return results;
}
