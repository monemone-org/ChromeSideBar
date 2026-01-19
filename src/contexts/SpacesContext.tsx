import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useBookmarkTabsContext } from './BookmarkTabsContext';
import { useBookmarks } from '../hooks/useBookmarks';
import { SpaceMessageAction, SpaceWindowState, DEFAULT_WINDOW_STATE } from '../utils/spaceMessages';

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

// =============================================================================
// Helpers
// =============================================================================

const generateId = (): string =>
{
  return `space_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
  // Per-window state (read-only copy, synced from background.ts)
  // ---------------------------------------------------------------------------
  const [windowId, setWindowId] = useState<number | null>(null);
  const [windowState, setWindowState] = useState<SpaceWindowState>(DEFAULT_WINDOW_STATE);
  const [isInitialized, setIsInitialized] = useState(false);

  // Get current window ID and initial state on mount
  useEffect(() =>
  {
    chrome.windows.getCurrent((window) =>
    {
      if (window.id)
      {
        setWindowId(window.id);

        // Request initial state from background
        chrome.runtime.sendMessage(
          { action: SpaceMessageAction.GET_WINDOW_STATE, windowId: window.id },
          (response: SpaceWindowState) =>
          {
            if (chrome.runtime.lastError)
            {
              console.error('Failed to get window state:', chrome.runtime.lastError);
            }
            else if (response)
            {
              setWindowState(response);
            }
            setIsInitialized(true);
          }
        );
      }
    });
  }, []);

  // Listen for state changes from background
  useEffect(() =>
  {
    const handleMessage = (
      message: { action: string; windowId?: number; state?: SpaceWindowState; spaceId?: string },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ) =>
    {
      // Update local state when background sends STATE_CHANGED
      if (message.action === SpaceMessageAction.STATE_CHANGED &&
          message.windowId === windowId &&
          message.state)
      {
        setWindowState(message.state);
      }

      // Switch active space when history navigation activates a tab in different space
      if (message.action === SpaceMessageAction.HISTORY_TAB_ACTIVATED && message.spaceId && windowId)
      {
        chrome.runtime.sendMessage({
          action: SpaceMessageAction.SET_ACTIVE_SPACE,
          windowId,
          spaceId: message.spaceId
        });
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
  // Per-window state operations (send messages to background, state updates via STATE_CHANGED)
  // ---------------------------------------------------------------------------

  // Update active space (no tab activation)
  // Use for: history navigation, spaces disabled, create/delete space
  const setActiveSpaceId = useCallback((spaceId: string) =>
  {
    // Update local state immediately for responsive UI
    setWindowState(prev => ({ ...prev, activeSpaceId: spaceId }));

    // Notify background
    if (windowId)
    {
      chrome.runtime.sendMessage({
        action: SpaceMessageAction.SET_ACTIVE_SPACE,
        windowId,
        spaceId
      });
    }
  }, [windowId]);

  // Switch to space and activate its last active tab
  // Use for: user clicks space bar, swipe gestures, space navigator
  const switchToSpace = useCallback(async (spaceId: string) =>
  {
    // Update local state immediately for responsive UI
    setWindowState(prev => ({ ...prev, activeSpaceId: spaceId }));

    const lastActiveTabId = windowState.lastActiveTabs[spaceId];
    const spaceTabs = windowState.spaceTabs[spaceId] || [];
    let activated = false;

    // Try lastActiveTab first
    if (lastActiveTabId)
    {
      try
      {
        await chrome.tabs.get(lastActiveTabId);
        await chrome.tabs.update(lastActiveTabId, { active: true });
        activated = true;
      }
      catch
      {
        // Tab doesn't exist, fall through to spaceTabs
      }
    }

    // Fallback: try spaceTabs in order
    if (!activated)
    {
      for (const tabId of spaceTabs)
      {
        if (tabId === lastActiveTabId) continue;  // Already tried
        try
        {
          await chrome.tabs.get(tabId);
          await chrome.tabs.update(tabId, { active: true });
          break;
        }
        catch
        {
          // Tab doesn't exist, try next
        }
      }
    }

    // Notify background
    if (windowId)
    {
      chrome.runtime.sendMessage({
        action: SpaceMessageAction.SET_ACTIVE_SPACE,
        windowId,
        spaceId
      });
    }
  }, [windowState.lastActiveTabs, windowState.spaceTabs, windowId]);

  // Add/move a tab to a space (send to background)
  const addTabToSpace = useCallback((tabId: number, spaceId: string) =>
  {
    if (!windowId) return;

    chrome.runtime.sendMessage({
      action: SpaceMessageAction.MOVE_TAB_TO_SPACE,
      windowId,
      tabId,
      toSpaceId: spaceId
    });
  }, [windowId]);


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
    if (!windowId) return;

    chrome.runtime.sendMessage({
      action: SpaceMessageAction.CLEAR_SPACE_STATE,
      windowId,
      spaceId
    });
  }, [windowId]);

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
