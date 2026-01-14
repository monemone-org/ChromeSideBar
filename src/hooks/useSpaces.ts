import { useState, useEffect, useCallback } from 'react';

export interface Space
{
  id: string;
  name: string;
  icon: string;                         // Lucide icon name or emoji
  color: chrome.tabGroups.ColorEnum;    // grey, blue, red, yellow, green, pink, purple, cyan, orange
  bookmarkFolderPath: string;           // e.g. "Bookmarks Bar/Work"
}

// Special "All" space - not stored, always present
export const ALL_SPACE: Space = {
  id: 'all',
  name: 'All',
  icon: 'LayoutGrid',
  color: 'grey',
  bookmarkFolderPath: '',
};

const STORAGE_KEY = 'spaces';

const generateId = (): string =>
{
  return `space_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Debug spaces for development - only included in dev builds
const getDebugSpaces = (): Space[] =>
{
  if (import.meta.env.DEV)
  {
    return [
      {
        id: 'debug_home',
        name: 'Home',
        icon: 'Home',
        color: 'blue',
        bookmarkFolderPath: 'Bookmarks Bar/Home',
      },
      {
        id: 'debug_video',
        name: 'Video',
        icon: 'Camera',
        color: 'red',
        bookmarkFolderPath: 'Other Bookmarks/Video',
      },
    ];
  }
  return [];
};

export const useSpaces = () =>
{
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((operation: string) =>
  {
    const err = chrome.runtime.lastError;
    if (err)
    {
      console.error(`Spaces ${operation} error:`, err.message);
      setError(err.message || `Failed to ${operation}`);
      return true;
    }
    setError(null);
    return false;
  }, []);

  const loadSpaces = useCallback(() =>
  {
    if (typeof chrome !== 'undefined' && chrome.storage)
    {
      chrome.storage.local.get([STORAGE_KEY], (result) =>
      {
        if (!handleError('load'))
        {
          let loadedSpaces = result[STORAGE_KEY] || [];

          // Initialize with debug spaces if empty (dev mode only)
          if (loadedSpaces.length === 0)
          {
            const debugSpaces = getDebugSpaces();
            if (debugSpaces.length > 0)
            {
              loadedSpaces = debugSpaces;
              chrome.storage.local.set({ [STORAGE_KEY]: loadedSpaces });
            }
          }

          setSpaces(loadedSpaces);
        }
      });
    }
  }, [handleError]);

  const saveSpaces = useCallback((newSpaces: Space[]) =>
  {
    if (typeof chrome !== 'undefined' && chrome.storage)
    {
      chrome.storage.local.set({ [STORAGE_KEY]: newSpaces }, () =>
      {
        handleError('save');
      });
    }
  }, [handleError]);

  useEffect(() =>
  {
    loadSpaces();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) =>
    {
      if (changes[STORAGE_KEY])
      {
        const newSpaces = changes[STORAGE_KEY].newValue || [];
        setSpaces(newSpaces);
      }
    };

    chrome.storage?.onChanged.addListener(handleStorageChange);

    return () =>
    {
      chrome.storage?.onChanged.removeListener(handleStorageChange);
    };
  }, [loadSpaces]);

  const createSpace = useCallback((
    name: string,
    icon: string,
    color: chrome.tabGroups.ColorEnum,
    bookmarkFolderPath: string
  ): Space =>
  {
    const newSpace: Space = {
      id: generateId(),
      name,
      icon,
      color,
      bookmarkFolderPath,
    };

    const updatedSpaces = [...spaces, newSpace];
    setSpaces(updatedSpaces);
    saveSpaces(updatedSpaces);
    return newSpace;
  }, [spaces, saveSpaces]);

  const updateSpace = useCallback((
    id: string,
    updates: Partial<Omit<Space, 'id'>>
  ) =>
  {
    const updatedSpaces = spaces.map(space =>
      space.id === id ? { ...space, ...updates } : space
    );
    setSpaces(updatedSpaces);
    saveSpaces(updatedSpaces);
  }, [spaces, saveSpaces]);

  const deleteSpace = useCallback((id: string) =>
  {
    if (id === 'all') return; // Cannot delete "All" space
    const updatedSpaces = spaces.filter(s => s.id !== id);
    setSpaces(updatedSpaces);
    saveSpaces(updatedSpaces);
  }, [spaces, saveSpaces]);

  const moveSpace = useCallback((activeId: string, overId: string) =>
  {
    const oldIndex = spaces.findIndex(s => s.id === activeId);
    const newIndex = spaces.findIndex(s => s.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const updatedSpaces = [...spaces];
    const [removed] = updatedSpaces.splice(oldIndex, 1);
    updatedSpaces.splice(newIndex, 0, removed);

    setSpaces(updatedSpaces);
    saveSpaces(updatedSpaces);
  }, [spaces, saveSpaces]);

  const getSpaceById = useCallback((id: string): Space | undefined =>
  {
    if (id === 'all') return ALL_SPACE;
    return spaces.find(s => s.id === id);
  }, [spaces]);

  // Replace all spaces (for import with "Replace" option)
  const replaceSpaces = useCallback((newSpaces: Space[]) =>
  {
    const spacesWithNewIds = newSpaces.map(space => ({
      ...space,
      id: generateId(),
    }));
    setSpaces(spacesWithNewIds);
    saveSpaces(spacesWithNewIds);
  }, [saveSpaces]);

  // Append spaces to existing (for import with "Add" option)
  const appendSpaces = useCallback((newSpaces: Space[]) =>
  {
    const spacesWithNewIds = newSpaces.map(space => ({
      ...space,
      id: generateId(),
    }));
    const combined = [...spaces, ...spacesWithNewIds];
    setSpaces(combined);
    saveSpaces(combined);
  }, [spaces, saveSpaces]);

  return {
    spaces,
    createSpace,
    updateSpace,
    deleteSpace,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
    refresh: loadSpaces,
    error,
  };
};
