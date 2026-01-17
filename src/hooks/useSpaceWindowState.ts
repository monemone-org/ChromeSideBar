import { useState, useEffect, useCallback, useRef } from 'react';

export interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabs: Record<string, number[]>;  // space ID → array of tab IDs
  // Note: spaceLastActiveTabMap is now managed by background.ts in separate storage
}

const getStorageKey = (windowId: number): string =>
{
  return `spaceWindowState_${windowId}`;
};

const DEFAULT_STATE: SpaceWindowState = {
  activeSpaceId: 'all',
  spaceTabs: {},
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
          if (import.meta.env.DEV)
          {
            console.log(`[Sidebar] storage change: activeSpaceId=${newState.activeSpaceId}`);
          }
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

  // Update active space and notify background (no tab activation)
  // Use for: history navigation, spaces disabled, create/delete space
  const setActiveSpaceId = useCallback((spaceId: string) =>
  {
    if (import.meta.env.DEV)
    {
      console.log(`[Sidebar] setActiveSpaceId: ${spaceId}`);
    }
    setState(prev =>
    {
      if (import.meta.env.DEV)
      {
        console.log(`[Sidebar] setState: ${prev.activeSpaceId} -> ${spaceId}`);
      }
      const newState = { ...prev, activeSpaceId: spaceId };
      saveState(newState);
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
  }, [saveState, windowId]);

  // Switch to space and activate its last active tab
  // Use for: user clicks space bar, swipe gestures, space navigator
  const switchToSpace = useCallback((spaceId: string) =>
  {
    setState(prev =>
    {
      const newState = { ...prev, activeSpaceId: spaceId };
      saveState(newState);
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
  }, [saveState, windowId]);

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

  // Clear all state for a space (used when deleting a space)
  // Note: spaceLastActiveTabMap is managed by background.ts
  const clearStateForSpace = useCallback((spaceId: string) =>
  {
    setState(prev =>
    {
      const { [spaceId]: _tabs, ...restSpaceTabs } = prev.spaceTabs;
      const newState = {
        ...prev,
        spaceTabs: restSpaceTabs,
      };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

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
    switchToSpace,
    addTabToSpace,
    removeTabFromSpace,
    getSpaceForTab,
    getTabsForSpace,
    clearStateForSpace,
  };
};
