import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useSpaces, Space, ALL_SPACE } from '../hooks/useSpaces';
import { useSpaceWindowState } from '../hooks/useSpaceWindowState';

interface SpacesContextValue
{
  // Space definitions
  spaces: Space[];
  allSpaces: Space[];  // Includes "All" space at the beginning
  activeSpace: Space;
  isInitialized: boolean;

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
  setActiveSpaceId: (spaceId: string) => void;
  getTabGroupForSpace: (spaceId: string) => number | undefined;
  setTabGroupForSpace: (spaceId: string, tabGroupId: number) => void;
  clearTabGroupForSpace: (spaceId: string) => void;

  // Tab group helpers
  findTabGroupForSpace: (spaceId: string) => Promise<number | null>;
  createTabGroupForSpace: (spaceId: string, firstTabId: number) => Promise<number | null>;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

export const SpacesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
{
  const {
    spaces,
    createSpace,
    updateSpace,
    deleteSpace,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
  } = useSpaces();

  const {
    activeSpaceId,
    isInitialized,
    setActiveSpaceId,
    getTabGroupForSpace,
    setTabGroupForSpace,
    clearTabGroupForSpace,
  } = useSpaceWindowState();

  // All spaces including the "All" space at the beginning
  const allSpaces = useMemo(() =>
  {
    return [ALL_SPACE, ...spaces];
  }, [spaces]);

  // Currently active space
  const activeSpace = useMemo(() =>
  {
    return getSpaceById(activeSpaceId) || ALL_SPACE;
  }, [activeSpaceId, getSpaceById]);

  // Find existing tab group for a space (by stored mapping or by name match)
  const findTabGroupForSpace = useCallback(async (spaceId: string): Promise<number | null> =>
  {
    if (spaceId === 'all') return null;

    const space = getSpaceById(spaceId);
    if (!space) return null;

    // Check stored mapping first
    const existingGroupId = getTabGroupForSpace(spaceId);
    if (existingGroupId !== undefined)
    {
      try
      {
        await chrome.tabGroups.get(existingGroupId);
        return existingGroupId;
      }
      catch
      {
        // Tab group no longer exists, clear the mapping
        clearTabGroupForSpace(spaceId);
      }
    }

    // Search for tab group with matching name
    try
    {
      const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
      const matchingGroup = groups.find(g => g.title === space.name);
      if (matchingGroup)
      {
        // Store the mapping for future use
        setTabGroupForSpace(spaceId, matchingGroup.id);
        return matchingGroup.id;
      }
    }
    catch (error)
    {
      console.error('Failed to search tab groups:', error);
    }

    // No existing group found
    return null;
  }, [getSpaceById, getTabGroupForSpace, clearTabGroupForSpace, setTabGroupForSpace]);

  // Create a new Chrome tab group for a space using an existing tab
  const createTabGroupForSpace = useCallback(async (
    spaceId: string,
    firstTabId: number
  ): Promise<number | null> =>
  {
    const space = getSpaceById(spaceId);
    if (!space || spaceId === 'all') return null;

    try
    {
      // Create the tab group with the provided tab
      const groupId = await chrome.tabs.group({ tabIds: [firstTabId] });

      // Update the tab group with space properties
      await chrome.tabGroups.update(groupId, {
        title: space.name,
        color: space.color,
      });

      // Store the mapping
      setTabGroupForSpace(spaceId, groupId);

      return groupId;
    }
    catch (error)
    {
      console.error('Failed to create tab group for space:', error);
      return null;
    }
  }, [getSpaceById, setTabGroupForSpace]);

  const value: SpacesContextValue = {
    spaces,
    allSpaces,
    activeSpace,
    isInitialized,
    createSpace,
    updateSpace,
    deleteSpace,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
    activeSpaceId,
    setActiveSpaceId,
    getTabGroupForSpace,
    setTabGroupForSpace,
    clearTabGroupForSpace,
    findTabGroupForSpace,
    createTabGroupForSpace,
  };

  return (
    <SpacesContext.Provider value={value}>
      {children}
    </SpacesContext.Provider>
  );
};

export const useSpacesContext = (): SpacesContextValue =>
{
  const context = useContext(SpacesContext);
  if (!context)
  {
    throw new Error('useSpacesContext must be used within a SpacesProvider');
  }
  return context;
};

export { ALL_SPACE };
export type { Space };
