import { useState, useEffect, useCallback } from 'react';

export const useTabGroups = () =>
{
  const [tabGroups, setTabGroups] = useState<chrome.tabGroups.TabGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((operation: string) =>
  {
    const err = chrome.runtime.lastError;
    if (err)
    {
      console.error(`TabGroup ${operation} error:`, err.message);
      setError(err.message || `Failed to ${operation}`);
      return true;
    }
    setError(null);
    return false;
  }, []);

  const fetchTabGroups = useCallback(() =>
  {
    if (typeof chrome !== 'undefined' && chrome.tabGroups)
    {
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, (result) =>
      {
        if (!handleError('fetch'))
        {
          setTabGroups(result);
        }
      });
    }
  }, [handleError]);

  useEffect(() =>
  {
    fetchTabGroups();

    const listeners = [
      chrome.tabGroups?.onCreated,
      chrome.tabGroups?.onUpdated,
      chrome.tabGroups?.onRemoved,
      chrome.tabGroups?.onMoved,
    ];

    const handleUpdate = () => fetchTabGroups();

    listeners.forEach((listener: any) => listener?.addListener(handleUpdate));

    return () =>
    {
      listeners.forEach((listener: any) => listener?.removeListener(handleUpdate));
    };
  }, [fetchTabGroups]);

  return { tabGroups, error };
};
