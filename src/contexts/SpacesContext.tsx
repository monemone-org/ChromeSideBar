import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBookmarkTabsContext } from './BookmarkTabsContext';
import { useBookmarks } from '../hooks/useBookmarks';
import { SpaceMessageAction, SpaceWindowState, DEFAULT_WINDOW_STATE, SPACES_STORAGE_KEY, Space } from '../utils/spaceMessages';
import { toChromeColor } from '../utils/groupColors';

// Re-export Space so all existing imports from SpacesContext continue to work
export type { Space } from '../utils/spaceMessages';

// Special "All" space - not stored, always present
export const ALL_SPACE: Space = {
  id: 'all',
  name: 'All',
  icon: 'LayoutGrid',
  color: 'grey',
  bookmarkFolderPath: '',
};

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
    color: string,
    bookmarkFolderPath: string,
    bookmarkFolderSegments: string[]
  ) => Space;
  updateSpace: (id: string, updates: Partial<Omit<Space, 'id'>>) => void;
  updateSpaceFolderPaths: (updates: { id: string; bookmarkFolderPath: string; bookmarkFolderSegments: string[] }[]) => void;
  deleteSpace: (id: string) => Promise<void>;
  moveSpace: (activeId: string, overId: string) => void;
  getSpaceById: (id: string) => Space | undefined;

  // Import/Export
  replaceSpaces: (spaces: Space[]) => void;
  appendSpaces: (spaces: Space[]) => void;

  // Per-window state
  activeSpaceId: string;
  setActiveSpaceId: (spaceId: string) => void;  // No tab activation (for code-initiated switches)
  switchToSpace: (spaceId: string) => void;     // Switch space without tab activation

  // Tab query (uses Chrome tab groups)
  getTabsForSpace: (spaceId: string) => Promise<chrome.tabs.Tab[]>;

  // Space switch source (read-once: returns value and resets to 'navigation')
  getSpaceSwitchSource: () => 'user' | 'navigation';

  // Actions
  getTabIdsInSpace: (space: Space) => Promise<number[]>;
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
  const { findFolderBySegments, getAllBookmarksInFolder } = useBookmarks();

  // ---------------------------------------------------------------------------
  // Space definitions state - loaded from background.ts (SpaceManager)
  // ---------------------------------------------------------------------------
  const [spaces, setSpaces] = useState<Space[]>([]);

  // Send updated spaces to background for persistence
  const sendSpacesUpdate = useCallback((newSpaces: Space[]) =>
  {
    chrome.runtime.sendMessage({ action: SpaceMessageAction.UPDATE_SPACES, spaces: newSpaces });
  }, []);

  // Load spaces on mount - request from background (which may have run migration)
  // Also listen for storage changes to stay in sync across windows
  useEffect(() =>
  {
    chrome.runtime.sendMessage({ action: SpaceMessageAction.GET_SPACES }, (response: { spaces: Space[] }) =>
    {
      if (chrome.runtime.lastError)
      {
        console.error('Failed to load spaces:', chrome.runtime.lastError.message);
        return;
      }
      let loadedSpaces: Space[] = response?.spaces || [];

      // Initialize with debug spaces if empty (dev mode only)
      if (loadedSpaces.length === 0)
      {
        const debugSpaces = getDebugSpaces();
        if (debugSpaces.length > 0)
        {
          loadedSpaces = debugSpaces;
          sendSpacesUpdate(loadedSpaces);
        }
      }

      setSpaces(loadedSpaces);
    });

    // Listen for storage changes so other windows stay in sync when background saves
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) =>
    {
      if (areaName !== 'local') return;
      if (changes[SPACES_STORAGE_KEY])
      {
        setSpaces(changes[SPACES_STORAGE_KEY].newValue || []);
      }
    };

    chrome.storage?.onChanged.addListener(handleStorageChange);
    return () => chrome.storage?.onChanged.removeListener(handleStorageChange);
  }, [sendSpacesUpdate]);

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
      message: { action: string; windowId?: number; state?: SpaceWindowState },
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
    color: string,
    bookmarkFolderPath: string,
    bookmarkFolderSegments: string[]
  ): Space =>
  {
    if (bookmarkFolderPath && bookmarkFolderSegments.length === 0)
    {
      console.error('[createSpace] bookmarkFolderSegments required when bookmarkFolderPath is set');
    }

    const newSpace: Space = {
      id: generateId(),
      name,
      icon,
      color,
      bookmarkFolderPath,
      bookmarkFolderSegments,
    };

    const updatedSpaces = [...spaces, newSpace];
    setSpaces(updatedSpaces);
    sendSpacesUpdate(updatedSpaces);
    return newSpace;
  }, [spaces, sendSpacesUpdate]);

  const getSpaceById = useCallback((id: string): Space | undefined =>
  {
    if (id === 'all') return ALL_SPACE;
    return spaces.find(s => s.id === id);
  }, [spaces]);

  const updateSpace = useCallback(async (
    id: string,
    updates: Partial<Omit<Space, 'id'>>
  ) =>
  {
    const space = getSpaceById(id);
    if (!space || id === 'all') return;

    // Fail fast if caller sets bookmarkFolderPath without segments
    if (updates.bookmarkFolderPath !== undefined &&
        updates.bookmarkFolderPath !== '' &&
        (!updates.bookmarkFolderSegments || updates.bookmarkFolderSegments.length === 0))
    {
      console.error('[updateSpace] bookmarkFolderSegments required when bookmarkFolderPath is set');
    }

    // Update Space in storage
    const updatedSpaces = spaces.map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    setSpaces(updatedSpaces);
    sendSpacesUpdate(updatedSpaces);

    // Sync name/color changes to Chrome group
    if (windowId && (updates.name || updates.color))
    {
      try
      {
        // Find Chrome group with the OLD name
        const groups = await chrome.tabGroups.query({ windowId, title: space.name });
        if (groups.length > 0)
        {
          await chrome.tabGroups.update(groups[0].id, {
            title: updates.name ?? space.name,
            color: toChromeColor(updates.color ?? space.color),
          });
        }
      }
      catch (error)
      {
        if (import.meta.env.DEV) console.error('[updateSpace] Failed to sync to Chrome group:', error);
      }
    }
  }, [spaces, sendSpacesUpdate, getSpaceById, windowId]);

  // Batch-update folder path + segments for multiple spaces at once (e.g. after a folder rename)
  const updateSpaceFolderPaths = useCallback((updates: { id: string; bookmarkFolderPath: string; bookmarkFolderSegments: string[] }[]) =>
  {
    if (updates.length === 0) return;
    const updatedSpaces = spaces.map(s =>
    {
      const update = updates.find(u => u.id === s.id);
      return update
        ? { ...s, bookmarkFolderPath: update.bookmarkFolderPath, bookmarkFolderSegments: update.bookmarkFolderSegments }
        : s;
    });
    setSpaces(updatedSpaces);
    sendSpacesUpdate(updatedSpaces);
  }, [spaces, sendSpacesUpdate]);

  const deleteSpaceBase = useCallback((id: string) =>
  {
    if (id === 'all') return; // Cannot delete "All" space
    const updatedSpaces = spaces.filter(s => s.id !== id);
    setSpaces(updatedSpaces);
    sendSpacesUpdate(updatedSpaces);
  }, [spaces, sendSpacesUpdate]);

  const moveSpace = useCallback((activeId: string, overId: string) =>
  {
    const oldIndex = spaces.findIndex(s => s.id === activeId);
    const newIndex = spaces.findIndex(s => s.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const updatedSpaces = [...spaces];
    const [removed] = updatedSpaces.splice(oldIndex, 1);
    updatedSpaces.splice(newIndex, 0, removed);

    setSpaces(updatedSpaces);
    sendSpacesUpdate(updatedSpaces);
  }, [spaces, sendSpacesUpdate]);

  // Replace all spaces (for import with "Replace" option)
  const replaceSpaces = useCallback((newSpaces: Space[]) =>
  {
    const spacesWithNewIds = newSpaces.map(space => ({
      ...space,
      id: generateId(),
    }));
    setSpaces(spacesWithNewIds);
    sendSpacesUpdate(spacesWithNewIds);
  }, [sendSpacesUpdate]);

  // Append spaces to existing (for import with "Add" option)
  const appendSpaces = useCallback((newSpaces: Space[]) =>
  {
    const spacesWithNewIds = newSpaces.map(space => ({
      ...space,
      id: generateId(),
    }));
    const combined = [...spaces, ...spacesWithNewIds];
    setSpaces(combined);
    sendSpacesUpdate(combined);
  }, [spaces, sendSpacesUpdate]);

  // ---------------------------------------------------------------------------
  // Space switch source tracking
  // ---------------------------------------------------------------------------
  const spaceSwitchSourceRef = useRef<'user' | 'navigation'>('navigation');

  const getSpaceSwitchSource = useCallback((): 'user' | 'navigation' =>
  {
    const source = spaceSwitchSourceRef.current;
    spaceSwitchSourceRef.current = 'navigation';
    return source;
  }, []);

  // ---------------------------------------------------------------------------
  // Per-window state operations (send messages to background, state updates via STATE_CHANGED)
  // ---------------------------------------------------------------------------

  // Update active space (no tab activation)
  // Use for: history navigation, spaces disabled, create/delete space
  const setActiveSpaceId = useCallback((spaceId: string) =>
  {
    spaceSwitchSourceRef.current = 'navigation';
    // Update local state immediately for responsive UI
    setWindowState(prev => ({ ...prev, activeSpaceId: spaceId }));

    // Notify background
    if (windowId)
    {
      if (import.meta.env.DEV)
      {
        console.log('[SpaceContext] chrome.runtime.sendMessage: SET_ACTIVE_SPACE', {
          windowId,
          spaceId
        });
      }

      chrome.runtime.sendMessage({
        action: SpaceMessageAction.SET_ACTIVE_SPACE,
        windowId,
        spaceId
      });
    }
  }, [windowId]);

  // Switch to space (just update active space, no tab activation)
  // Tab activation happens naturally when user clicks on a tab
  // Use for: user clicks space bar, swipe gestures, space navigator
  const switchToSpace = useCallback((spaceId: string) =>
  {
    spaceSwitchSourceRef.current = 'user';
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

  // Get all tabs for a space (queries Chrome groups by matching Space name to group title)
  const getTabsForSpace = useCallback(async (spaceId: string): Promise<chrome.tabs.Tab[]> =>
  {
    if (spaceId === 'all' || !windowId) return [];

    const space = getSpaceById(spaceId);
    if (!space) return [];

    try
    {
      // Find Chrome group with matching name
      const groups = await chrome.tabGroups.query({ windowId, title: space.name });
      if (groups.length === 0) return [];

      // Get tabs in that group
      return chrome.tabs.query({ groupId: groups[0].id });
    }
    catch
    {
      return [];
    }
  }, [windowId, getSpaceById]);

  // Delete space and close all tabs in its associated Chrome group
  const deleteSpace = useCallback(async (id: string) =>
  {
    if (id === 'all') return;

    const space = getSpaceById(id);
    if (space && windowId)
    {
      try
      {
        // Find Chrome group with matching name and close its tabs
        const groups = await chrome.tabGroups.query({ windowId, title: space.name });
        if (groups.length > 0)
        {
          const tabs = await chrome.tabs.query({ groupId: groups[0].id });
          const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
          if (tabIds.length > 0)
          {
            await chrome.tabs.remove(tabIds);
          }
        }
      }
      catch (error)
      {
        if (import.meta.env.DEV) console.error('[deleteSpace] Failed to close tabs:', error);
      }
    }

    // Delete space from storage
    deleteSpaceBase(id);
  }, [getSpaceById, windowId, deleteSpaceBase]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  // Collect all tab IDs that belong to a space (group tabs + live bookmark tabs)
  const getTabIdsInSpace = useCallback(async (space: Space): Promise<number[]> =>
  {
    // For "All" space, return all tabs in current window
    if (space.id === 'all')
    {
      try
      {
        const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        return tabs.map(t => t.id).filter((id): id is number => id !== undefined);
      }
      catch (error)
      {
        console.error('Failed to query tabs:', error);
        return [];
      }
    }

    if (!windowId) return [];

    const tabIdsToClose: number[] = [];

    // 1. Get tabs in Chrome group matching Space name
    try
    {
      const groups = await chrome.tabGroups.query({ windowId, title: space.name });
      if (groups.length > 0)
      {
        const groupTabs = await chrome.tabs.query({ groupId: groups[0].id });
        groupTabs.forEach(tab =>
        {
          if (tab.id !== undefined) tabIdsToClose.push(tab.id);
        });
      }
    }
    catch (error)
    {
      if (import.meta.env.DEV) console.error('[getTabIdsInSpace] Failed to get group tabs:', error);
    }

    // 2. Also find live bookmark tabs for bookmarks in the space's folder
    const spaceFolder = findFolderBySegments(space.bookmarkFolderSegments ?? []);
    if (spaceFolder)
    {
      const bookmarksInFolder = await getAllBookmarksInFolder(spaceFolder.id);
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

    return tabIdsToClose;
  }, [windowId, findFolderBySegments, getAllBookmarksInFolder, getTabIdForBookmark]);

  // Close all tabs in a space (non-undoable fallback)
  const closeAllTabsInSpace = useCallback(async (space: Space) =>
  {
    const tabIds = await getTabIdsInSpace(space);
    if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] tabIds:', tabIds);
    if (tabIds.length > 0)
    {
      try
      {
        await chrome.tabs.remove(tabIds);
        if (import.meta.env.DEV) console.log('[closeAllTabsInSpace] Closed tabs successfully');
      }
      catch (error)
      {
        console.error('Failed to close tabs:', error);
      }
    }
  }, [getTabIdsInSpace]);

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

  // If the restored activeSpaceId no longer exists (e.g. space was deleted), fall back to 'all'
  useEffect(() =>
  {
    if (windowState.activeSpaceId !== 'all' &&
        spaces.length > 0 &&
        !spaces.some(s => s.id === windowState.activeSpaceId))
    {
      setActiveSpaceId('all');
    }
  }, [windowState.activeSpaceId, spaces, setActiveSpaceId]);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value = useMemo<SpacesContextValue>(() => ({
    spaces,
    allSpaces,
    activeSpace,
    isInitialized,
    windowId,
    createSpace,
    updateSpace,
    updateSpaceFolderPaths,
    deleteSpace,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
    activeSpaceId: windowState.activeSpaceId,
    setActiveSpaceId,
    switchToSpace,
    getTabsForSpace,
    getSpaceSwitchSource,
    getTabIdsInSpace,
    closeAllTabsInSpace,
  }), [
    spaces,
    allSpaces,
    activeSpace,
    isInitialized,
    windowId,
    createSpace,
    updateSpace,
    updateSpaceFolderPaths,
    deleteSpace,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
    windowState.activeSpaceId,
    setActiveSpaceId,
    switchToSpace,
    getTabsForSpace,
    getSpaceSwitchSource,
    getTabIdsInSpace,
    closeAllTabsInSpace,
  ]);

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
