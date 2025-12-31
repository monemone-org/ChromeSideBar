import { useState, useEffect, useCallback } from 'react';

export type SortOption = 'none' | 'name' | 'dateAdded';

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

    const listeners = [
      chrome.bookmarks?.onCreated,
      chrome.bookmarks?.onRemoved,
      chrome.bookmarks?.onChanged,
      chrome.bookmarks?.onMoved,
      chrome.bookmarks?.onChildrenReordered,
    ];

    const handleUpdate = () => fetchBookmarks();

    listeners.forEach(listener => listener?.addListener(handleUpdate));

    return () => {
      listeners.forEach(listener => listener?.removeListener(handleUpdate));
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

    chrome.bookmarks.getChildren(folderId, (children) => {
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

      // Move each item to its new position
      sorted.forEach((item, index) => {
        chrome.bookmarks.move(item.id, { parentId: folderId, index }, () => {
          handleError('sort move');
        });
      });
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

  // Create a single bookmark (with URL)
  const createBookmark = useCallback((
    parentId: string,
    title: string,
    url: string
  ): Promise<chrome.bookmarks.BookmarkTreeNode | null> =>
  {
    return new Promise((resolve) =>
    {
      chrome.bookmarks.create({ parentId, title, url }, (node) =>
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
  }, [getChildren, handleError]);

  return {
    bookmarks,
    removeBookmark,
    createFolder,
    updateBookmark,
    sortBookmarks,
    moveBookmark,
    findFolderInParent,
    createBookmark,
    getChildren,
    clearFolder,
    refresh: fetchBookmarks,
    error
  };
};
