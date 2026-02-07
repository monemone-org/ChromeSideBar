import { useState, useEffect, useCallback } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';

export type SortOption = 'none' | 'name' | 'dateAdded';

// Module-level flag shared across all hook instances
let isBatchOperation = false;

// Registry of refresh callbacks from all hook instances
const refreshCallbacks = new Set<() => void>();

// Refresh all hook instances
const refreshAll = () => {
  refreshCallbacks.forEach(cb => cb());
};

export { refreshAll as refreshAllBookmarks };

// Wrap an async operation in batch mode to suppress intermediate refetches
export async function runBatchOperation<T>(fn: () => Promise<T>): Promise<T>
{
  isBatchOperation = true;
  try
  {
    return await fn();
  }
  finally
  {
    isBatchOperation = false;
    refreshAll();
  }
}

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    createChromeErrorHandler('Bookmark', setError),
    []
  );

  const fetchBookmarks = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        if (!handleError('fetch')) {
          if (tree && tree.length > 0) {
            setBookmarks(tree[0].children || []);
          }
        }
      });
    }
    else {
      setError('Unable to access browser bookmarks');
    }
  }, [handleError]);

  useEffect(() => {
    fetchBookmarks();

    // Register this instance's refresh callback
    refreshCallbacks.add(fetchBookmarks);

    const listeners = [
      chrome.bookmarks?.onCreated,
      chrome.bookmarks?.onRemoved,
      chrome.bookmarks?.onChanged,
      chrome.bookmarks?.onMoved,
      chrome.bookmarks?.onChildrenReordered,
    ];

    // Debounce to coalesce rapid events
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleUpdate = () => {
      if (isBatchOperation) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchBookmarks();
      }, 50);
    };

    listeners.forEach(listener => listener?.addListener(handleUpdate));

    return () => {
      listeners.forEach(listener => listener?.removeListener(handleUpdate));
      refreshCallbacks.delete(fetchBookmarks);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [fetchBookmarks]);

  const removeBookmark = useCallback((id: string) => {
    chrome.bookmarks.removeTree(id, () => {
      handleError('remove');
    });
  }, [handleError]);

  const createFolder = useCallback((
    parentId: string,
    title: string,
    callback?: (node: chrome.bookmarks.BookmarkTreeNode) => void
  ) => {
    chrome.bookmarks.create({ parentId, title }, (node) => {
      if (!handleError('create folder') && node && callback) {
        callback(node);
      }
    });
  }, [handleError]);

  const updateBookmark = useCallback((id: string, title: string, url?: string) => {
    const changes: chrome.bookmarks.BookmarkChangesArg = { title };
    if (url !== undefined) {
      changes.url = url;
    }
    chrome.bookmarks.update(id, changes, () => {
      handleError('update');
    });
  }, [handleError]);

  const sortBookmarks = useCallback((folderId: string, sortBy: SortOption) => {
    if (sortBy === 'none') return;

    chrome.bookmarks.getChildren(folderId, async (children) => {
      if (handleError('get children') || !children) return;

      // Separate folders and bookmarks
      const folders = children.filter(c => !c.url);
      const bookmarkItems = children.filter(c => c.url);

      // Sort each group
      const sortFn = (a: chrome.bookmarks.BookmarkTreeNode, b: chrome.bookmarks.BookmarkTreeNode) => {
        if (sortBy === 'name') {
          return a.title.localeCompare(b.title);
        } else if (sortBy === 'dateAdded') {
          return (a.dateAdded || 0) - (b.dateAdded || 0);
        }
        return 0;
      };

      folders.sort(sortFn);
      bookmarkItems.sort(sortFn);

      // Folders first, then bookmarks
      const sorted = [...folders, ...bookmarkItems];

      // Batch mode: suppress listener-triggered refetches during moves
      isBatchOperation = true;
      try {
        // Move each item to its new position
        for (const [index, item] of sorted.entries()) {
          await new Promise<void>((resolve) => {
            chrome.bookmarks.move(item.id, { parentId: folderId, index }, () => {
              handleError('sort move');
              resolve();
            });
          });
        }
      } finally {
        isBatchOperation = false;
        refreshAll();
      }
    });
  }, [handleError]);

  const moveBookmark = useCallback(async (
    sourceId: string,
    destinationId: string,
    position: 'before' | 'after' | 'into' | 'intoFirst'
  ): Promise<chrome.bookmarks.BookmarkTreeNode | null> => {
    if (position === 'into') {
      // Move into folder at the end
      const children = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
        chrome.bookmarks.getChildren(destinationId, (result) => {
          if (handleError('get children')) {
            resolve([]);
            return;
          }
          resolve(result || []);
        });
      });
      const index = children.length;
      return new Promise((resolve) => {
        chrome.bookmarks.move(sourceId, { parentId: destinationId, index }, (result) => {
          handleError('move');
          resolve(result || null);
        });
      });
    } else if (position === 'intoFirst') {
      // Move into folder at the beginning (for expanded folders, bottom 25% zone)
      return new Promise((resolve) => {
        chrome.bookmarks.move(sourceId, { parentId: destinationId, index: 0 }, (result) => {
          handleError('move');
          resolve(result || null);
        });
      });
    } else {
      // Move before/after destination item
      const dest = await new Promise<chrome.bookmarks.BookmarkTreeNode | null>((resolve) => {
        chrome.bookmarks.get(destinationId, (results) => {
          if (handleError('get destination') || !results || results.length === 0) {
            resolve(null);
            return;
          }
          resolve(results[0]);
        });
      });

      if (!dest || !dest.parentId || dest.index === undefined) {
        return null;
      }

      let targetIndex = dest.index;
      if (position === 'after') {
        targetIndex += 1;
      }

      // Chrome's move API handles same-parent index adjustment internally
      return new Promise((resolve) => {
        chrome.bookmarks.move(sourceId, { parentId: dest.parentId!, index: targetIndex }, (result) => {
          handleError('move');
          resolve(result || null);
        });
      });
    }
  }, [handleError]);

  // Find a folder by name under a specific parent folder
  const findFolderInParent = useCallback((
    parentId: string,
    folderName: string
  ): Promise<chrome.bookmarks.BookmarkTreeNode | null> =>
  {
    return new Promise((resolve) =>
    {
      chrome.bookmarks.getChildren(parentId, (children) =>
      {
        if (handleError('find folder') || !children)
        {
          resolve(null);
          return;
        }
        const folder = children.find(child => !child.url && child.title === folderName);
        resolve(folder || null);
      });
    });
  }, [handleError]);

  // Create a single bookmark (with URL) at optional index position
  // Returns { node, error } - error is the Chrome API error message if creation failed
  const createBookmark = useCallback((
    parentId: string,
    title: string,
    url: string,
    index?: number
  ): Promise<{ node: chrome.bookmarks.BookmarkTreeNode | null; error: string | null }> =>
  {
    return new Promise((resolve) =>
    {
      const createArg: chrome.bookmarks.BookmarkCreateArg = { parentId, title, url };
      if (index !== undefined)
      {
        createArg.index = index;
      }
      chrome.bookmarks.create(createArg, (node) =>
      {
        const lastError = chrome.runtime.lastError;
        if (lastError)
        {
          // Log the error but also return it for caller to handle
          handleError('create bookmark');
          resolve({ node: null, error: lastError.message || 'Unknown error' });
          return;
        }
        resolve({ node: node || null, error: null });
      });
    });
  }, [handleError]);

  // Get a single bookmark by ID
  const getBookmark = useCallback((
    bookmarkId: string
  ): Promise<chrome.bookmarks.BookmarkTreeNode | null> =>
  {
    return new Promise((resolve) =>
    {
      chrome.bookmarks.get(bookmarkId, (results) =>
      {
        if (handleError('get bookmark') || !results || results.length === 0)
        {
          resolve(null);
          return;
        }
        resolve(results[0]);
      });
    });
  }, [handleError]);

  // Get children of a folder (promise-based)
  const getChildren = useCallback((
    folderId: string
  ): Promise<chrome.bookmarks.BookmarkTreeNode[]> =>
  {
    return new Promise((resolve) =>
    {
      chrome.bookmarks.getChildren(folderId, (children) =>
      {
        if (handleError('get children'))
        {
          resolve([]);
          return;
        }
        resolve(children || []);
      });
    });
  }, [handleError]);

  // Remove all children from a folder
  const clearFolder = useCallback(async (folderId: string): Promise<void> =>
  {
    const children = await getChildren(folderId);

    if (children.length === 0) return;

    // Batch mode: suppress listener-triggered refetches during removals
    isBatchOperation = true;
    try
    {
      for (const child of children)
      {
        await new Promise<void>((resolve) =>
        {
          chrome.bookmarks.removeTree(child.id, () =>
          {
            handleError('clear folder');
            resolve();
          });
        });
      }
    }
    finally
    {
      isBatchOperation = false;
      refreshAll();
    }
  }, [getChildren, handleError]);

  // Batch create multiple bookmarks with single refetch at end
  const createBookmarksBatch = useCallback(async (
    parentId: string,
    items: Array<{ title: string; url: string }>
  ): Promise<void> =>
  {
    if (items.length === 0) return;

    isBatchOperation = true;
    try
    {
      for (const item of items)
      {
        await createBookmark(parentId, item.title, item.url);
      }
    }
    finally
    {
      isBatchOperation = false;
      refreshAll();
    }
  }, [createBookmark]);

  // Get the full path of a bookmark/folder (e.g., "Other Bookmarks/FolderA/FolderB")
  const getBookmarkPath = useCallback(async (bookmarkId: string): Promise<string> =>
  {
    const pathParts: string[] = [];
    let currentId: string | undefined = bookmarkId;

    while (currentId)
    {
      const node = await getBookmark(currentId);
      if (!node) break;

      // Skip the root node (id "0") which has no title
      if (node.id !== '0' && node.title)
      {
        pathParts.unshift(node.title);
      }

      currentId = node.parentId;
    }

    return pathParts.join('/');
  }, [getBookmark]);

  // Duplicate a bookmark (not folder) right after the original
  const duplicateBookmark = useCallback(async (bookmarkId: string): Promise<void> =>
  {
    const original = await getBookmark(bookmarkId);
    if (!original || !original.url || !original.parentId || original.index === undefined) return;

    await createBookmark(original.parentId, original.title, original.url, original.index + 1);
  }, [getBookmark, createBookmark]);

  // Get the actual title of a root folder by its stable ID
  // Root folder IDs are stable across platforms: '1'=Bookmarks Bar, '2'=Other Bookmarks, '3'=Mobile Bookmarks
  const getRootFolderTitle = useCallback((id: '1' | '2' | '3'): string =>
  {
    const folder = bookmarks.find(b => b.id === id);
    return folder?.title || '';
  }, [bookmarks]);

  // Find a folder by its path (e.g., "Bookmarks Bar/Home")
  // Returns the folder node if found, null otherwise
  // Note: First path segment (root folder) is matched case-insensitively to handle
  // platform differences (e.g., "Other Bookmarks" vs "Other bookmarks")
  const findFolderByPath = useCallback((path: string): chrome.bookmarks.BookmarkTreeNode | null =>
  {
    if (!path) return null;

    const pathParts = path.split('/');
    let currentNodes = bookmarks;

    for (let i = 0; i < pathParts.length; i++)
    {
      const part = pathParts[i];
      // First segment is a root folder - match case-insensitively
      const found = i === 0
        ? currentNodes.find(node => node.title.toLowerCase() === part.toLowerCase() && !node.url)
        : currentNodes.find(node => node.title === part && !node.url);
      if (!found) return null;
      currentNodes = found.children || [];
      if (i === pathParts.length - 1)
      {
        return found;
      }
    }

    return null;
  }, [bookmarks]);

  // Get all bookmarks recursively from a folder (including nested subfolders)
  const getAllBookmarksInFolder = useCallback(async (
    folderId: string
  ): Promise<Array<{ id: string; title: string; url: string }>> =>
  {
    const results: Array<{ id: string; title: string; url: string }> = [];

    const collectRecursive = async (id: string): Promise<void> =>
    {
      const children = await getChildren(id);
      for (const child of children)
      {
        if (child.url)
        {
          results.push({ id: child.id, title: child.title, url: child.url });
        }
        else
        {
          await collectRecursive(child.id);
        }
      }
    };

    await collectRecursive(folderId);
    return results;
  }, [getChildren]);

  return {
    bookmarks,
    removeBookmark,
    createFolder,
    updateBookmark,
    sortBookmarks,
    moveBookmark,
    findFolderInParent,
    findFolderByPath,
    getRootFolderTitle,
    createBookmark,
    createBookmarksBatch,
    getBookmark,
    getChildren,
    clearFolder,
    getBookmarkPath,
    duplicateBookmark,
    getAllBookmarksInFolder,
    error
  };
};
