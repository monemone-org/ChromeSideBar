import { useState, useEffect, useCallback } from 'react';

export type SortOption = 'none' | 'name' | 'dateAdded';

// Module-level flag shared across all hook instances
let isBatchOperation = false;

// Registry of refresh callbacks from all hook instances
const refreshCallbacks = new Set<() => void>();

// Refresh all hook instances
const refreshAll = () => {
  refreshCallbacks.forEach(cb => cb());
};

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((operation: string) => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.error(`Bookmark ${operation} error:`, err.message);
      setError(err.message || `Failed to ${operation}`);
      return true;
    }
    setError(null);
    return false;
  }, []);

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

  const moveBookmark = useCallback((
    sourceId: string,
    destinationId: string,
    position: 'before' | 'after' | 'into' | 'intoFirst'
  ) => {
    if (position === 'into') {
      // Move into folder at the end
      chrome.bookmarks.getChildren(destinationId, (children) => {
        if (handleError('get children')) return;
        const index = children ? children.length : 0;
        chrome.bookmarks.move(sourceId, { parentId: destinationId, index }, () => {
          handleError('move');
        });
      });
    } else if (position === 'intoFirst') {
      // Move into folder at the beginning (for expanded folders, bottom 25% zone)
      chrome.bookmarks.move(sourceId, { parentId: destinationId, index: 0 }, () => {
        handleError('move');
      });
    } else {
      // Move before/after destination item
      chrome.bookmarks.get(destinationId, (results) => {
        if (handleError('get destination') || !results || results.length === 0) return;

        const dest = results[0];
        if (!dest.parentId || dest.index === undefined) return;

        let targetIndex = dest.index;

        if (position === 'after') {
          targetIndex += 1;
        }

        // Chrome's move API handles same-parent index adjustment internally
        chrome.bookmarks.move(sourceId, { parentId: dest.parentId, index: targetIndex }, () => {
          handleError('move');
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
  const createBookmark = useCallback((
    parentId: string,
    title: string,
    url: string,
    index?: number
  ): Promise<chrome.bookmarks.BookmarkTreeNode | null> =>
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
        if (handleError('create bookmark'))
        {
          resolve(null);
          return;
        }
        resolve(node || null);
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
    const node = await getBookmark(bookmarkId);
    if (!node || !node.url || !node.parentId || node.index === undefined) return;

    await createBookmark(node.parentId, node.title, node.url, node.index + 1);
  }, [getBookmark, createBookmark]);

  // Find a folder by its path (e.g., "Bookmarks Bar/Home")
  // Returns the folder node if found, null otherwise
  const findFolderByPath = useCallback((path: string): chrome.bookmarks.BookmarkTreeNode | null =>
  {
    if (!path) return null;

    const pathParts = path.split('/');
    let currentNodes = bookmarks;

    for (const part of pathParts)
    {
      const found = currentNodes.find(node => node.title === part && !node.url);
      if (!found) return null;
      currentNodes = found.children || [];
      if (pathParts.indexOf(part) === pathParts.length - 1)
      {
        return found;
      }
    }

    return null;
  }, [bookmarks]);

  return {
    bookmarks,
    removeBookmark,
    createFolder,
    updateBookmark,
    sortBookmarks,
    moveBookmark,
    findFolderInParent,
    findFolderByPath,
    createBookmark,
    createBookmarksBatch,
    getBookmark,
    getChildren,
    clearFolder,
    getBookmarkPath,
    duplicateBookmark,
    error
  };
};
