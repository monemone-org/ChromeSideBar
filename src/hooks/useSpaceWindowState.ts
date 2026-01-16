import { useState, useEffect, useCallback, useRef } from 'react';

export interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabs: Record<string, number[]>;  // space ID → array of tab IDs
  spaceLastActiveTabMap: Record<string, number>;  // space ID → last active tab ID
}

const getStorageKey = (windowId: number): string =>
{
  return `spaceWindowState_${windowId}`;
};

const DEFAULT_STATE: SpaceWindowState = {
  activeSpaceId: 'all',
  spaceTabs: {},
  spaceLastActiveTabMap: {},
};

export const useSpaceWindowState = () =>
{
  const [windowId, setWindowId] = useState<number | null>(null);
  const [state, setState] = useState<SpaceWindowState>(DEFAULT_STATE);
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
        storageKeyRef.current = getStorageKey(window.id);
      }
    });
  }, []);

  // Load state from session storage once we have window ID
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
        setState(loadedState);
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
          setState(newState);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () =>
    {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [windowId]);

  const saveState = useCallback((newState: SpaceWindowState) =>
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

  const setActiveSpaceId = useCallback((spaceId: string) =>
  {
    setState(prev =>
    {
      const newState = { ...prev, activeSpaceId: spaceId };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  // Add a tab to a space (not used for "all" space - "all" shows all tabs)
  const addTabToSpace = useCallback((tabId: number, spaceId: string) =>
  {
    if (spaceId === 'all') return;

    setState(prev =>
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
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  // Remove a tab from all spaces
  const removeTabFromSpace = useCallback((tabId: number) =>
  {
    setState(prev =>
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
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  // Get the space ID for a given tab
  const getSpaceForTab = useCallback((tabId: number): string | null =>
  {
    for (const [spaceId, tabs] of Object.entries(state.spaceTabs))
    {
      if (tabs.includes(tabId))
      {
        return spaceId;
      }
    }
    return null;
  }, [state.spaceTabs]);

  // Get all tabs for a space
  const getTabsForSpace = useCallback((spaceId: string): number[] =>
  {
    return state.spaceTabs[spaceId] || [];
  }, [state.spaceTabs]);

  const getLastActiveTabForSpace = useCallback((spaceId: string): number | undefined =>
  {
    return state.spaceLastActiveTabMap[spaceId];
  }, [state.spaceLastActiveTabMap]);

  const setLastActiveTabForSpace = useCallback((spaceId: string, tabId: number) =>
  {
    setState(prev =>
    {
      const newState = {
        ...prev,
        spaceLastActiveTabMap: {
          ...prev.spaceLastActiveTabMap,
          [spaceId]: tabId,
        },
      };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  // Clear all state for a space (used when deleting a space)
  const clearStateForSpace = useCallback((spaceId: string) =>
  {
    setState(prev =>
    {
      const { [spaceId]: _tabs, ...restSpaceTabs } = prev.spaceTabs;
      const { [spaceId]: _lastTab, ...restLastActiveMap } = prev.spaceLastActiveTabMap;
      const newState = {
        ...prev,
        spaceTabs: restSpaceTabs,
        spaceLastActiveTabMap: restLastActiveMap,
      };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  // Extract values to avoid depending on entire map objects (prevents race conditions)
  const activeSpaceLastTabId = state.spaceLastActiveTabMap[state.activeSpaceId];

  // Send active space to background whenever it changes
  useEffect(() =>
  {
    if (!windowId || !isInitialized) return;

    chrome.runtime.sendMessage({
      action: 'set-active-space',
      windowId,
      spaceId: state.activeSpaceId,
      lastActiveTabId: activeSpaceLastTabId
    });
  }, [windowId, isInitialized, state.activeSpaceId, activeSpaceLastTabId]);

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
        setActiveSpaceId(message.spaceId);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [setActiveSpaceId]);

  return {
    windowId,
    activeSpaceId: state.activeSpaceId,
    spaceTabs: state.spaceTabs,
    isInitialized,
    setActiveSpaceId,
    addTabToSpace,
    removeTabFromSpace,
    getSpaceForTab,
    getTabsForSpace,
    getLastActiveTabForSpace,
    setLastActiveTabForSpace,
    clearStateForSpace,
  };
};
