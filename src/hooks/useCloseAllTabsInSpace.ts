import { useCallback } from 'react';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { useBookmarks } from './useBookmarks';
import { Space } from './useSpaces';

/**
 * Hook that provides a function to close all tabs in a space.
 * Closes both:
 * - Tabs in the space's Chrome tab group
 * - Live bookmark tabs for bookmarks in the space's folder
 */
export const useCloseAllTabsInSpace = () =>
{
  const { getTabIdForBookmark } = useBookmarkTabsContext();
  const { findFolderByPath, getAllBookmarksInFolder } = useBookmarks();

  const closeAllTabsInSpace = useCallback(async (space: Space) =>
  {
    // For "All" space, close all tabs in current window
    if (space.id === 'all')
    {
      try
      {
        const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
        if (tabIds.length > 0)
        {
          await chrome.tabs.remove(tabIds);
        }
      }
      catch (error)
      {
        console.error('Failed to close all tabs:', error);
      }
      return;
    }

    const tabIdsToClose: number[] = [];

    // 1. Find tabs in the space's tab group
    try
    {
      const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
      const matchingGroup = groups.find(g => g.title === space.name);
      if (matchingGroup)
      {
        const tabs = await chrome.tabs.query({ groupId: matchingGroup.id });
        tabs.forEach(t =>
        {
          if (t.id !== undefined) tabIdsToClose.push(t.id);
        });
      }
    }
    catch (error)
    {
      console.error('Failed to query tab groups:', error);
    }

    // 2. Find live bookmark tabs for bookmarks in the space's folder
    const spaceFolder = findFolderByPath(space.bookmarkFolderPath);
    if (spaceFolder)
    {
      const bookmarksInFolder = await getAllBookmarksInFolder(spaceFolder.id);
      bookmarksInFolder.forEach(bookmark =>
      {
        const tabId = getTabIdForBookmark(bookmark.id);
        if (tabId !== undefined && !tabIdsToClose.includes(tabId))
        {
          tabIdsToClose.push(tabId);
        }
      });
    }

    // 3. Close all collected tabs
    if (tabIdsToClose.length > 0)
    {
      try
      {
        await chrome.tabs.remove(tabIdsToClose);
      }
      catch (error)
      {
        console.error('Failed to close tabs:', error);
      }
    }
  }, [findFolderByPath, getAllBookmarksInFolder, getTabIdForBookmark]);

  return closeAllTabsInSpace;
};
