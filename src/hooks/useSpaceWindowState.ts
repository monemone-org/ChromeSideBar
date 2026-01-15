import { useState, useEffect, useCallback, useRef } from 'react';

export interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabGroupMap: Record<string, number>;  // space ID → Chrome tab group ID
}

const getStorageKey = (windowId: number): string =>
{
  return `spaceWindowState_${windowId}`;
};

const DEFAULT_STATE: SpaceWindowState = {
  activeSpaceId: 'all',
  spaceTabGroupMap: {},
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

  const setTabGroupForSpace = useCallback((spaceId: string, tabGroupId: number) =>
  {
    setState(prev =>
    {
      const newState = {
        ...prev,
        spaceTabGroupMap: {
          ...prev.spaceTabGroupMap,
          [spaceId]: tabGroupId,
        },
      };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  const clearTabGroupForSpace = useCallback((spaceId: string) =>
  {
    setState(prev =>
    {
      const { [spaceId]: _, ...rest } = prev.spaceTabGroupMap;
      const newState = {
        ...prev,
        spaceTabGroupMap: rest,
      };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  const getTabGroupForSpace = useCallback((spaceId: string): number | undefined =>
  {
    return state.spaceTabGroupMap[spaceId];
  }, [state.spaceTabGroupMap]);

  // Clear mapping when tab group is removed
  const handleTabGroupRemoved = useCallback((tabGroupId: number) =>
  {
    const spaceId = Object.entries(state.spaceTabGroupMap).find(
      ([_, groupId]) => groupId === tabGroupId
    )?.[0];

    if (spaceId)
    {
      clearTabGroupForSpace(spaceId);
    }
  }, [state.spaceTabGroupMap, clearTabGroupForSpace]);

  // Listen for tab group removal
  useEffect(() =>
  {
    if (!isInitialized) return;

    const handleRemoved = (group: chrome.tabGroups.TabGroup) =>
    {
      handleTabGroupRemoved(group.id);
    };

    chrome.tabGroups?.onRemoved?.addListener(handleRemoved);

    return () =>
    {
      chrome.tabGroups?.onRemoved?.removeListener(handleRemoved);
    };
  }, [isInitialized, handleTabGroupRemoved]);

  // Send active space to background whenever it changes
  useEffect(() =>
  {
    if (!windowId || !isInitialized) return;

    chrome.runtime.sendMessage({
      action: 'set-active-space',
      windowId,
      spaceId: state.activeSpaceId
    });
  }, [windowId, isInitialized, state.activeSpaceId]);

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
    spaceTabGroupMap: state.spaceTabGroupMap,
    isInitialized,
    setActiveSpaceId,
    setTabGroupForSpace,
    clearTabGroupForSpace,
    getTabGroupForSpace,
  };
};
