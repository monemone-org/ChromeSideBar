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
    position: 'before' | 'after' | 'into',
    isExpandedFolder?: boolean
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
    } else if (position === 'after' && isExpandedFolder) {
      // For expanded folders, 'after' means insert at the beginning of children
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

  return {
    bookmarks,
    removeBookmark,
    createFolder,
    updateBookmark,
    sortBookmarks,
    moveBookmark,
    findFolderInParent,
    createBookmark,
    createBookmarksBatch,
    getBookmark,
    getChildren,
    clearFolder,
    error
  };
};
