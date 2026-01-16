import React, { createContext, useContext, useMemo } from 'react';
import { useSpaces, Space, ALL_SPACE } from '../hooks/useSpaces';
import { useSpaceWindowState } from '../hooks/useSpaceWindowState';

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
  setActiveSpaceId: (spaceId: string) => void;
  spaceTabs: Record<string, number[]>;

  // Tab tracking (internal, not Chrome groups)
  addTabToSpace: (tabId: number, spaceId: string) => void;
  removeTabFromSpace: (tabId: number) => void;
  getSpaceForTab: (tabId: number) => string | null;
  getTabsForSpace: (spaceId: string) => number[];

  // Last active tab tracking
  getLastActiveTabForSpace: (spaceId: string) => number | undefined;
  setLastActiveTabForSpace: (spaceId: string, tabId: number) => void;
  clearStateForSpace: (spaceId: string) => void;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

export const SpacesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
{
  const {
    spaces,
    createSpace,
    updateSpace,
    deleteSpace: deleteSpaceBase,
    moveSpace,
    getSpaceById,
    replaceSpaces,
    appendSpaces,
  } = useSpaces();

  const {
    windowId,
    activeSpaceId,
    spaceTabs,
    isInitialized,
    setActiveSpaceId,
    addTabToSpace,
    removeTabFromSpace,
    getSpaceForTab,
    getTabsForSpace,
    getLastActiveTabForSpace,
    setLastActiveTabForSpace,
    clearStateForSpace,
  } = useSpaceWindowState();

  // Wrap deleteSpace to also clean up spaceTabs
  const deleteSpace = (id: string) =>
  {
    clearStateForSpace(id);
    deleteSpaceBase(id);
  };

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
    activeSpaceId,
    setActiveSpaceId,
    spaceTabs,
    addTabToSpace,
    removeTabFromSpace,
    getSpaceForTab,
    getTabsForSpace,
    getLastActiveTabForSpace,
    setLastActiveTabForSpace,
    clearStateForSpace,
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
