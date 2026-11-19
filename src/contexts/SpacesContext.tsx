import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBookmarkTabsContext } from './BookmarkTabsContext';
import { useBookmarks } from '../hooks/useBookmarks';
import { Space, ALL_SPACE } from '../utils/spaceMessages';
import { toChromeColor } from '../utils/groupColors';
import { spaceWindowStateProxy } from '../managers/proxies/spaceWindowStateProxy';
import { useSpaceWindowState } from '../hooks/useSpaceWindowState';
import { spaceManagerProxy } from '../managers/proxies/spaceManagerProxy';
import { useSpaces } from '../hooks/useSpaces';

// Re-export Space and ALL_SPACE so all existing imports from SpacesContext continue to work
export type { Space } from '../utils/spaceMessages';
export { ALL_SPACE } from '../utils/spaceMessages';

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

/**
 * Who caused the active space to change. 'user' is a direct gesture (space bar
 * click, swipe, navigator); 'navigation' is everything code-initiated. App.tsx
 * reads it to decide whether to also activate a tab.
 */
export type SpaceSwitchSource = 'user' | 'navigation';

interface SpacesContextValue
{
  // Space definitions
  // readonly: this is the live array behind spaceManagerProxy's mirror, not
  // a copy. Sorting or pushing it in place would change what every consumer
  // sees without notifying any of them, since only the store's set() fires
  // listeners - and the next optimistic write would build on that accident.
  // Go through the context's own mutators instead.
  spaces: readonly Space[];
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
  replaceSpaces: (spaces: Space[]) => Promise<void>;
  appendSpaces: (spaces: Space[]) => Promise<void>;

  // Per-window state
  activeSpaceId: string;
  setActiveSpaceId: (spaceId: string) => void;  // No tab activation (for code-initiated switches)
  switchToSpace: (spaceId: string) => void;     // Switch space without tab activation

  // Tab query (uses Chrome tab groups)
  getTabsForSpace: (spaceId: string) => Promise<chrome.tabs.Tab[]>;

  // Space switch source (read-once: returns value and resets to 'navigation')
  getSpaceSwitchSource: () => SpaceSwitchSource;

  // Actions
  getTabIdsInSpace: (space: Space) => Promise<number[]>;
  closeAllTabsInSpace: (space: Space) => Promise<void>;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

/**
 * Takes one spaceManagerProxy mutation's promise and deliberately drops the
 * rejection - a failed write doesn't surface as an unhandled promise
 * rejection, since the proxy has already logged the failure and resynced its
 * mirror from background by the time this settles.
 *
 * Returns the (always-resolving) promise so replaceSpaces/appendSpaces can
 * await it - import needs SpaceManager's segment self-heal (see the
 * shared-storage decision doc) to have actually landed before the import
 * dialog reports itself done. Every other caller below still doesn't await,
 * because none of them do anything afterwards that depends on the write
 * having landed.
 *
 * DeleteSpaceAction is the exception and calls the proxy directly, since an
 * undo right after a delete does have to know the delete arrived.
 */
const ignoreWriteFailure = (write: Promise<Space[]>): Promise<void> =>
{
  return write.then(() => {}, () => {});
};

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
  // Space definitions - read-only mirror of spaceManagerProxy's store, kept
  // current by background.ts's broadcasts (cross-window sync is the
  // SPACES_CHANGED broadcast now, not a chrome.storage.onChanged listener)
  // ---------------------------------------------------------------------------
  const spaces = useSpaces();

  // ---------------------------------------------------------------------------
  // Per-window state (read-only mirror of spaceWindowStateProxy's store,
  // kept current by background.ts's broadcasts - see useSpaceWindowState)
  // ---------------------------------------------------------------------------
  const [windowId, setWindowId] = useState<number | null>(null);
  const windowState = useSpaceWindowState();
  const [isInitialized, setIsInitialized] = useState(false);

  // Get current window ID, then load both mirrors (spaces and this window's
  // SpaceWindowState) before considering the context initialized
  useEffect(() =>
  {
    chrome.windows.getCurrent((window) =>
    {
      if (window.id)
      {
        setWindowId(window.id);

        Promise.all([
          spaceManagerProxy.load(),
          spaceWindowStateProxy.mirrorWindow(window.id),
        ]).then(([loadedSpaces]) =>
        {
          // Initialize with debug spaces if empty (dev mode only)
          if (loadedSpaces.length === 0)
          {
            const debugSpaces = getDebugSpaces();
            if (debugSpaces.length > 0)
            {
              ignoreWriteFailure(spaceManagerProxy.replaceAll(debugSpaces));
            }
          }

          setIsInitialized(true);
        }).catch((error) =>
        {
          console.error('Failed to load spaces/window state:', error);
          setIsInitialized(true);
        });
      }
    });
  }, []);

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

    // Per-operation, so SpaceManager appends to its own list - nothing here
    // reads the current list, so back-to-back calls can't overwrite each other
    ignoreWriteFailure(spaceManagerProxy.addSpace(newSpace));
    return newSpace;
  }, []);

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

    // Update Space in storage - per-operation, so only this Space's fields
    // change and a write another call made after this callback was created
    // is left alone
    ignoreWriteFailure(spaceManagerProxy.updateSpace(id, updates));

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
  }, [getSpaceById, windowId]);

  // Batch-update folder path + segments for multiple spaces at once (e.g. after a folder rename)
  const updateSpaceFolderPaths = useCallback((updates: { id: string; bookmarkFolderPath: string; bookmarkFolderSegments: string[] }[]) =>
  {
    if (updates.length === 0) return;
    ignoreWriteFailure(spaceManagerProxy.updateSpaceFolderPaths(updates));
  }, []);

  const deleteSpaceBase = useCallback((id: string) =>
  {
    if (id === 'all') return; // Cannot delete "All" space
    ignoreWriteFailure(spaceManagerProxy.removeSpace(id));
  }, []);

  // Unknown ids and no-op moves are handled by the shared transform, which
  // leaves the list unchanged for them
  const moveSpace = useCallback((activeId: string, overId: string) =>
  {
    ignoreWriteFailure(spaceManagerProxy.moveSpace(activeId, overId));
  }, []);

  // Replace all spaces (for import with "Replace" option). Awaits the write
  // so the caller (import) only reports success once SpaceManager's segment
  // self-heal has actually landed - see ignoreWriteFailure's doc comment.
  const replaceSpaces = useCallback(async (newSpaces: Space[]): Promise<void> =>
  {
    const spacesWithNewIds = newSpaces.map(space => ({
      ...space,
      id: generateId(),
    }));
    await ignoreWriteFailure(spaceManagerProxy.replaceAll(spacesWithNewIds));
  }, []);

  // Append spaces to existing (for import with "Add" option). Awaits for the
  // same reason as replaceSpaces above.
  const appendSpaces = useCallback(async (newSpaces: Space[]): Promise<void> =>
  {
    const spacesWithNewIds = newSpaces.map(space => ({
      ...space,
      id: generateId(),
    }));
    await ignoreWriteFailure(spaceManagerProxy.addSpaces(spacesWithNewIds));
  }, []);

  // ---------------------------------------------------------------------------
  // Space switch source tracking
  // ---------------------------------------------------------------------------
  const spaceSwitchSourceRef = useRef<SpaceSwitchSource>('navigation');

  const getSpaceSwitchSource = useCallback((): SpaceSwitchSource =>
  {
    const source = spaceSwitchSourceRef.current;
    spaceSwitchSourceRef.current = 'navigation';
    return source;
  }, []);

  // ---------------------------------------------------------------------------
  // Per-window state operations (mutate via spaceWindowStateProxy, mirror
  // updates via its ack and its "changed" broadcast listener)
  // ---------------------------------------------------------------------------

  // The two space-switch entry points below differ only in the source they
  // record, so the actual switch lives here once. The proxy owns the
  // optimistic mirror write, so nothing here touches its store.
  const applyActiveSpace = useCallback((spaceId: string, source: SpaceSwitchSource) =>
  {
    spaceSwitchSourceRef.current = source;

    // Notify background
    if (windowId)
    {
      if (import.meta.env.DEV)
      {
        console.log('[SpaceContext] spaceWindowStateProxy.setActiveSpace', {
          windowId,
          spaceId,
          source
        });
      }

      spaceWindowStateProxy.setActiveSpace(windowId, spaceId);
    }
  }, [windowId]);

  // Update active space (no tab activation)
  // Use for: history navigation, spaces disabled, create/delete space
  const setActiveSpaceId = useCallback((spaceId: string) =>
  {
    applyActiveSpace(spaceId, 'navigation');
  }, [applyActiveSpace]);

  // Switch to space (just update active space, no tab activation)
  // Tab activation happens naturally when user clicks on a tab
  // Use for: user clicks space bar, swipe gestures, space navigator
  const switchToSpace = useCallback((spaceId: string) =>
  {
    applyActiveSpace(spaceId, 'user');
  }, [applyActiveSpace]);

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
