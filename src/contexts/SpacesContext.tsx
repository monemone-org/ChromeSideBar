import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useBookmarkTabsContext } from './BookmarkTabsContext';
import { useBookmarks } from '../hooks/useBookmarks';

// =============================================================================
// Types
// =============================================================================

export interface Space
{
  id: string;
  name: string;
  icon: string;                         // Lucide icon name or emoji
  color: chrome.tabGroups.ColorEnum;    // grey, blue, red, yellow, green, pink, purple, cyan, orange
  bookmarkFolderPath: string;           // e.g. "Bookmarks Bar/Work"
}

interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabs: Record<string, number[]>;  // space ID → array of tab IDs
}

// Special "All" space - not stored, always present
export const ALL_SPACE: Space = {
  id: 'all',
  name: 'All',
  icon: 'LayoutGrid',
  color: 'grey',
  bookmarkFolderPath: '',
};

// =============================================================================
// Constants
// =============================================================================

const SPACES_STORAGE_KEY = 'spaces';

const DEFAULT_WINDOW_STATE: SpaceWindowState = {
  activeSpaceId: 'all',
  spaceTabs: {},
};

// =============================================================================
// Helpers
// =============================================================================

const generateId = (): string =>
{
  return `space_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

const getWindowStateStorageKey = (windowId: number): string =>
{
  return `spaceWindowState_${windowId}`;
};

// Debug spaces for development - only included in dev builds
const getDebugSpaces = (): Space[] =>
{
  // if (import.meta.env.DEV)
  // {
  //   return [
  //     {
  //       id: 'debug_home',
  //       name: 'Home',
  //       icon: 'Home',
  //       color: 'blue',
  //       bookmarkFolderPath: 'Bookmarks Bar/Home',
  //     },
  //     {
  //       id: 'debug_video',
  //       name: 'Video',
  //       icon: 'Camera',
  //       color: 'red',
  //       bookmarkFolderPath: 'Other Bookmarks/Video',
  //     },
  //   ];
  // }
  return [];
};

// =============================================================================
// Context Interface
// =============================================================================

interface SpacesContextValue
{
  // Space definitions
  spaces: Space[];
  allSpaces: Space[];  // Includes "All" space at the beginning
  activeSpace: Space;
  isInitialized: boolean;
  windowId: number | null;

  // Space CRUD
  createSpace: (
    name: string,
    icon: string,
    color: chrome.tabGroups.ColorEnum,
    bookmarkFolderPath: string
  ) => Space;
  updateSpace: (id: string, updates: Partial<Omit<Space, 'id'>>) => void;
  deleteSpace: (id: string) => void;
  moveSpace: (activeId: string, overId: string) => void;
  getSpaceById: (id: string) => Space | undefined;

  // Import/Export
  replaceSpaces: (spaces: Space[]) => void;
  appendSpaces: (spaces: Space[]) => void;

  // Per-window state
  activeSpaceId: string;
  setActiveSpaceId: (spaceId: string) => void;  // No tab activation (for code-initiated switches)
  switchToSpace: (spaceId: string) => void;     // With tab activation (for user-initiated switches)
  spaceTabs: Record<string, number[]>;

  // Tab tracking (internal, not Chrome groups)
  addTabToSpace: (tabId: number, spaceId: string) => void;
  removeTabFromSpace: (tabId: number) => void;
  getSpaceForTab: (tabId: number) => string | null;
  getTabsForSpace: (spaceId: string) => number[];

  // Space state cleanup
  clearStateForSpace: (spaceId: string) => void;

  // Actions
  closeAllTabsInSpace: (space: Space) => Promise<void>;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export const SpacesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
{
  // ---------------------------------------------------------------------------
  // Dependencies for closeAllTabsInSpace
  // ---------------------------------------------------------------------------
  const { getTabIdForBookmark } = useBookmarkTabsContext();
  const { findFolderByPath, getAllBookmarksInFolder } = useBookmarks();

  // ---------------------------------------------------------------------------
  // Space definitions state (chrome.storage.local)
  // ---------------------------------------------------------------------------
  const [spaces, setSpaces] = useState<Space[]>([]);

  const handleSpacesError = useCallback((operation: string) =>
  {
    const err = chrome.runtime.lastError;
    if (err)
    {
      console.error(`Spaces ${operation} error:`, err.message);
      return true;
    }
    return false;
  }, []);

  const loadSpaces = useCallback(() =>
  {
    if (typeof chrome !== 'undefined' && chrome.storage)
    {
      chrome.storage.local.get([SPACES_STORAGE_KEY], (result) =>
      {
        if (!handleSpacesError('load'))
        {
          let loadedSpaces = result[SPACES_STORAGE_KEY] || [];

          // Initialize with debug spaces if empty (dev mode only)
          if (loadedSpaces.length === 0)
          {
            const debugSpaces = getDebugSpaces();
            if (debugSpaces.length > 0)
            {
              loadedSpaces = debugSpaces;
              chrome.storage.local.set({ [SPACES_STORAGE_KEY]: loadedSpaces });
            }
          }

          setSpaces(loadedSpaces);
        }
      });
    }
  }, [handleSpacesError]);

  const saveSpaces = useCallback((newSpaces: Space[]) =>
  {
    if (typeof chrome !== 'undefined' && chrome.storage)
    {
      chrome.storage.local.set({ [SPACES_STORAGE_KEY]: newSpaces }, () =>
      {
        handleSpacesError('save');
      });
    }
  }, [handleSpacesError]);

  // Load spaces on mount and listen for changes
  useEffect(() =>
  {
    loadSpaces();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) =>
    {
      if (changes[SPACES_STORAGE_KEY])
      {
        const newSpaces = changes[SPACES_STORAGE_KEY].newValue || [];
        setSpaces(newSpaces);
      }
    };

    chrome.storage?.onChanged.addListener(handleStorageChange);

    return () =>
    {
      chrome.storage?.onChanged.removeListener(handleStorageChange);
    };
  }, [loadSpaces]);

  // ---------------------------------------------------------------------------
  // Per-window state (chrome.storage.session)
  // ---------------------------------------------------------------------------
  const [windowId, setWindowId] = useState<number | null>(null);
  const [windowState, setWindowState] = useState<SpaceWindowState>(DEFAULT_WINDOW_STATE);
  const [isInitialized, setIsInitialized] = useState(false);
  const storageKeyRef = useRef<string | null>(null);

  // Get current window ID on mount
  useEffect(() =>
  {
    chrome.windows.getCurrent((window) =>
    {
      if (window.id)
      {
        setWindowId(window.id);
        storageKeyRef.current = getWindowStateStorageKey(window.id);
      }
    });
  }, []);

  // Load window state from session storage once we have window ID
  useEffect(() =>
  {
    if (!windowId || !storageKeyRef.current) return;

    const storageKey = storageKeyRef.current;

    chrome.storage.session.get([storageKey], (result) =>
    {
      if (chrome.runtime.lastError)
      {
        console.error('Failed to load space window state:', chrome.runtime.lastError);
        setIsInitialized(true);
        return;
      }

      const loadedState = result[storageKey] as SpaceWindowState | undefined;
      if (loadedState)
      {
        setWindowState(loadedState);
      }
      setIsInitialized(true);
    });

    // Listen for storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) =>
    {
      if (areaName === 'session' && changes[storageKey])
      {
        const newState = changes[storageKey].newValue as SpaceWindowState | undefined;
        if (newState)
        {
          if (import.meta.env.DEV)
          {
            console.log(`[Sidebar] storage change: activeSpaceId=${newState.activeSpaceId}`);
          }
          setWindowState(newState);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () =>
    {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [windowId]);

  const saveWindowState = useCallback((newState: SpaceWindowState) =>
  {
    if (!storageKeyRef.current) return;

    chrome.storage.session.set({ [storageKeyRef.current]: newState }, () =>
    {
      if (chrome.runtime.lastError)
      {
        console.error('Failed to save space window state:', chrome.runtime.lastError);
      }
    });
  }, []);

  // Listen for history tab activation to switch spaces
  useEffect(() =>
  {
    const handleMessage = (
      message: { action: string; spaceId?: string },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ) =>
    {
      if (message.action === 'history-tab-activated' && message.spaceId)
      {
        if (import.meta.env.DEV)
        {
          console.log(`[Sidebar] history-tab-activated received: spaceId=${message.spaceId}`);
        }
        // Inline setActiveSpaceId logic to avoid dependency issues
        setWindowState(prev =>
        {
          const newState = { ...prev, activeSpaceId: message.spaceId! };
          if (storageKeyRef.current)
          {
            chrome.storage.session.set({ [storageKeyRef.current]: newState });
          }
          return newState;
        });

        if (windowId)
        {
          chrome.runtime.sendMessage({
            action: 'set-active-space',
            windowId,
            spaceId: message.spaceId
          });
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [windowId]);

  // ---------------------------------------------------------------------------
  // Space CRUD operations
  // ---------------------------------------------------------------------------

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

  const deleteSpaceBase = useCallback((id: string) =>
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

  // ---------------------------------------------------------------------------
  // Per-window state operations
  // ---------------------------------------------------------------------------

  // Update active space and notify background (no tab activation)
  // Use for: history navigation, spaces disabled, create/delete space
  const setActiveSpaceId = useCallback((spaceId: string) =>
  {
    if (import.meta.env.DEV)
    {
      console.log(`[Sidebar] setActiveSpaceId: ${spaceId}`);
    }
    setWindowState(prev =>
    {
      if (import.meta.env.DEV)
      {
        console.log(`[Sidebar] setState: ${prev.activeSpaceId} -> ${spaceId}`);
      }
      const newState = { ...prev, activeSpaceId: spaceId };
      saveWindowState(newState);
      return newState;
    });

    // Notify background of space change (tracking only, no tab activation)
    if (windowId)
    {
      chrome.runtime.sendMessage({
        action: 'set-active-space',
        windowId,
        spaceId
      });
    }
  }, [saveWindowState, windowId]);

  // Switch to space and activate its last active tab
  // Use for: user clicks space bar, swipe gestures, space navigator
  const switchToSpace = useCallback((spaceId: string) =>
  {
    setWindowState(prev =>
    {
      const newState = { ...prev, activeSpaceId: spaceId };
      saveWindowState(newState);
      return newState;
    });

    // Notify background to switch space AND activate last tab
    // Background will look up lastActiveTabId from its own storage
    if (windowId)
    {
      chrome.runtime.sendMessage({
        action: 'switch-to-space',
        windowId,
        spaceId
      });
    }
  }, [saveWindowState, windowId]);

  // Add a tab to a space (not used for "all" space - "all" shows all tabs)
  const addTabToSpace = useCallback((tabId: number, spaceId: string) =>
  {
    if (spaceId === 'all') return;

    setWindowState(prev =>
    {
      // Remove from any existing space first
      const newSpaceTabs = { ...prev.spaceTabs };
      for (const [sid, tabs] of Object.entries(newSpaceTabs))
      {
        if (tabs.includes(tabId))
        {
          newSpaceTabs[sid] = tabs.filter(id => id !== tabId);
        }
      }

      // Add to the new space
      newSpaceTabs[spaceId] = [...(newSpaceTabs[spaceId] || []), tabId];

      const newState = { ...prev, spaceTabs: newSpaceTabs };
      saveWindowState(newState);
      return newState;
    });
  }, [saveWindowState]);

  // Remove a tab from all spaces
  const removeTabFromSpace = useCallback((tabId: number) =>
  {
    setWindowState(prev =>
    {
      const newSpaceTabs = { ...prev.spaceTabs };
      let changed = false;

      for (const [spaceId, tabs] of Object.entries(newSpaceTabs))
      {
        if (tabs.includes(tabId))
        {
          newSpaceTabs[spaceId] = tabs.filter(id => id !== tabId);
          changed = true;
        }
      }

      if (!changed) return prev;

      const newState = { ...prev, spaceTabs: newSpaceTabs };
      saveWindowState(newState);
      return newState;
    });
  }, [saveWindowState]);

  // Get the space ID for a given tab
  const getSpaceForTab = useCallback((tabId: number): string | null =>
  {
    for (const [spaceId, tabs] of Object.entries(windowState.spaceTabs))
    {
      if (tabs.includes(tabId))
      {
        return spaceId;
      }
    }
    return null;
  }, [windowState.spaceTabs]);

  // Get all tabs for a space
  const getTabsForSpace = useCallback((spaceId: string): number[] =>
  {
    return windowState.spaceTabs[spaceId] || [];
  }, [windowState.spaceTabs]);

  // Clear all state for a space (used when deleting a space)
  const clearStateForSpace = useCallback((spaceId: string) =>
  {
    setWindowState(prev =>
    {
      const { [spaceId]: _tabs, ...restSpaceTabs } = prev.spaceTabs;
      const newState = {
        ...prev,
        spaceTabs: restSpaceTabs,
      };
      saveWindowState(newState);
      return newState;
    });
  }, [saveWindowState]);

  // Wrap deleteSpace to also clean up spaceTabs
  const deleteSpace = useCallback((id: string) =>
  {
    clearStateForSpace(id);
    deleteSpaceBase(id);
  }, [clearStateForSpace, deleteSpaceBase]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // Close all tabs in a space (Chrome API, no local state)
  const closeAllTabsInSpace = useCallback(async (space: Space) =>
  {
    if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] Called with space:', space);

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

    // 1. Get tabs tracked in spaceTabs for this space
    const spaceTabs = getTabsForSpace(space.id);
    if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] Tabs in space:', spaceTabs);
    const tabIdsToClose: number[] = [...spaceTabs];

    // 2. Find live bookmark tabs for bookmarks in the space's folder
    const spaceFolder = findFolderByPath(space.bookmarkFolderPath);
    if (spaceFolder)
    {
      const bookmarksInFolder = await getAllBookmarksInFolder(spaceFolder.id);
      // Use Set for O(1) lookup instead of Array.includes() which is O(n)
      const tabIdsSet = new Set(tabIdsToClose);
      bookmarksInFolder.forEach((bookmark: { id: string; title: string; url: string }) =>
      {
        const tabId = getTabIdForBookmark(bookmark.id);
        if (tabId !== undefined && !tabIdsSet.has(tabId))
        {
          tabIdsSet.add(tabId);
          tabIdsToClose.push(tabId);
        }
      });
    }

    // 3. Close all collected tabs
    if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] Final tabIdsToClose:', tabIdsToClose);
    if (tabIdsToClose.length > 0)
    {
      try
      {
        await chrome.tabs.remove(tabIdsToClose);
        if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] Closed tabs successfully');
      }
      catch (error)
      {
        console.error('Failed to close tabs:', error);
      }
    }
    else
    {
      if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] No tabs to close');
    }
  }, [getTabsForSpace, findFolderByPath, getAllBookmarksInFolder, getTabIdForBookmark]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  // All spaces including the "All" space at the beginning
  const allSpaces = useMemo(() =>
  {
    return [ALL_SPACE, ...spaces];
  }, [spaces]);

  // Currently active space
  const activeSpace = useMemo(() =>
  {
    return getSpaceById(windowState.activeSpaceId) || ALL_SPACE;
  }, [windowState.activeSpaceId, getSpaceById]);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value: SpacesContextValue = {
    spaces,
    allSpaces,
    activeSpace,
    isInitialized,
    windowId,
    createSpace,
    updateSpace,
    deleteSpace,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
    activeSpaceId: windowState.activeSpaceId,
    setActiveSpaceId,
    switchToSpace,
    spaceTabs: windowState.spaceTabs,
    addTabToSpace,
    removeTabFromSpace,
    getSpaceForTab,
    getTabsForSpace,
    clearStateForSpace,
    closeAllTabsInSpace,
  };

  return (
    <SpacesContext.Provider value={value}>
      {children}
    </SpacesContext.Provider>
  );
};

// =============================================================================
// Hook
// =============================================================================

export const useSpacesContext = (): SpacesContextValue =>
{
  const context = useContext(SpacesContext);
  if (!context)
  {
    throw new Error('useSpacesContext must be used within a SpacesProvider');
  }
  return context;
};
