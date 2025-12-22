import { useState, useEffect, useCallback } from 'react';

export const useTabs = () => {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((operation: string) => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.error(`Tab ${operation} error:`, err.message);
      setError(err.message || `Failed to ${operation}`);
      return true;
    }
    setError(null);
    return false;
  }, []);

  const fetchTabs = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ currentWindow: true }, (result) => {
        if (!handleError('fetch')) {
          setTabs(result);
        }
      });
    }
  }, [handleError]);

  useEffect(() => {
    fetchTabs();

    const listeners = [
      chrome.tabs?.onCreated,
      chrome.tabs?.onUpdated,
      chrome.tabs?.onMoved,
      chrome.tabs?.onRemoved,
      chrome.tabs?.onDetached,
      chrome.tabs?.onAttached,
      chrome.tabs?.onActivated,
    ];

    const handleUpdate = () => fetchTabs();

    listeners.forEach((listener: any) => listener?.addListener(handleUpdate));

    return () => {
      listeners.forEach((listener: any) => listener?.removeListener(handleUpdate));
    };
  }, [fetchTabs]);

  const closeTab = useCallback((tabId: number) => {
    chrome.tabs.remove(tabId, () => {
      handleError('close');
    });
  }, [handleError]);

  const activateTab = useCallback((tabId: number) => {
    chrome.tabs.update(tabId, { active: true }, () => {
      handleError('activate');
    });
  }, [handleError]);

  const moveTab = useCallback((tabId: number, index: number) => {
    chrome.tabs.move(tabId, { index }, () => {
      handleError('move');
    });
  }, [handleError]);

  return { tabs, closeTab, activateTab, moveTab, error };
};
