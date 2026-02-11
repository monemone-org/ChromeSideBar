import { useState, useEffect, useCallback } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';
import type { TabGroupDisplayOrder } from '../components/SettingsDialog';

// Helper: safely extract hostname from URL
const getHostname = (url: string | undefined): string =>
{
  if (!url) return '';
  try
  {
    return new URL(url).hostname.replace(/^www\./, '');
  }
  catch
  {
    return '';
  }
};

// Helper: compare tabs by domain, then title
const compareDomainTitle = (a: chrome.tabs.Tab, b: chrome.tabs.Tab): number =>
{
  const domainA = getHostname(a.url);
  const domainB = getHostname(b.url);
  if (domainA !== domainB) return domainA.localeCompare(domainB);
  return (a.title || '').localeCompare(b.title || '');
};

// Module-level Set tracking windowIds with active batch operations
const batchOperationWindows = new Set<number>();

export const useTabs = (windowId?: number) => {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    createChromeErrorHandler('Tab', setError),
    []
  );

  const fetchTabs = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ currentWindow: true }, (result) => {
        if (!handleError('fetch')) {
          setTabs(result);
        }
      });
    }
    else {
      setError('Unable to access browser tabs');
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

    // Debounce to coalesce rapid events (e.g., tab creation fires multiple events)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleUpdate = () => {
      if (windowId && batchOperationWindows.has(windowId)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchTabs();
      }, 50);
    };

    listeners.forEach((listener: any) => listener?.addListener(handleUpdate));

    return () => {
      listeners.forEach((listener: any) => listener?.removeListener(handleUpdate));
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [fetchTabs]);

  // Close multiple tabs with batch mode to suppress individual onRemoved events
  const closeTabs = useCallback((tabIds: number[]) => {
    if (tabIds.length === 0) return;
    if (windowId) batchOperationWindows.add(windowId);
    chrome.tabs.remove(tabIds, () => {
      handleError('close tabs');
      if (windowId) batchOperationWindows.delete(windowId);
      fetchTabs();
    });
  }, [handleError, fetchTabs, windowId]);

  const activateTab = useCallback((tabId: number) => {
    chrome.tabs.update(tabId, { active: true }, () => {
      handleError('activate');
    });
  }, [handleError]);

  const moveTab = useCallback((tabId: number, index: number): Promise<void> => {
    return new Promise((resolve) => {
      chrome.tabs.move(tabId, { index }, () => {
        handleError('move');
        resolve();
      });
    });
  }, [handleError]);

  const sortTabs = useCallback(async (direction: 'asc' | 'desc' = 'asc',
                                      tabGroups: chrome.tabGroups.TabGroup[] = [],
                                      displayOrder: TabGroupDisplayOrder = 'groupsFirst') =>
  {
    // Build group info map (id -> {title, color})
    const groupInfoMap = new Map<number, { title: string; color: chrome.tabGroups.ColorEnum }>();
    tabGroups.forEach(g => groupInfoMap.set(g.id, { title: g.title || '', color: g.color }));

    const sorted = [...tabs].sort((a, b) =>
    {
      const aGrouped = a.groupId && a.groupId !== -1;
      const bGrouped = b.groupId && b.groupId !== -1;
      let cmp: number;

      if (aGrouped && bGrouped)
      {
        if (a.groupId === b.groupId)
        {
          // Same group: sort by domain, then title
          cmp = compareDomainTitle(a, b);
        }
        else
        {
          // Different groups: sort by group title, then groupId as tiebreaker
          const titleA = groupInfoMap.get(a.groupId!)?.title || '';
          const titleB = groupInfoMap.get(b.groupId!)?.title || '';
          cmp = titleA.localeCompare(titleB);
          if (cmp === 0) cmp = a.groupId! - b.groupId!;
        }
      }
      else if (displayOrder === 'groupsFirst' && (aGrouped || bGrouped))
      {
        // Grouped tabs come first
        cmp = aGrouped ? -1 : 1;
      }
      else if (displayOrder === 'groupsLast' && (aGrouped || bGrouped))
      {
        // Ungrouped tabs come first
        cmp = aGrouped ? 1 : -1;
      }
      else
      {
        // Both ungrouped, or chromeOrder: sort by domain, then title
        cmp = compareDomainTitle(a, b);
      }

      return direction === 'asc' ? cmp : -cmp;
    });

    // Collect tabs by original groupId - use array to preserve encounter order
    const groupOrder: number[] = [];
    const tabsByGroup = new Map<number, number[]>();
    sorted.forEach((tab) =>
    {
      if (tab.groupId && tab.groupId !== -1)
      {
        if (!tabsByGroup.has(tab.groupId))
        {
          groupOrder.push(tab.groupId);
          tabsByGroup.set(tab.groupId, []);
        }
        tabsByGroup.get(tab.groupId)!.push(tab.id!);
      }
    });

    // Get all grouped tab IDs
    const allGroupedTabIds = groupOrder.flatMap(gid => tabsByGroup.get(gid)!);

    // Batch mode: suppress listener-triggered refetches during sort operations
    if (windowId) batchOperationWindows.add(windowId);
    try
    {
      if (allGroupedTabIds.length > 0)
      {
        // Step 1: Ungroup all grouped tabs first
        await new Promise<void>((resolve) =>
        {
          chrome.tabs.ungroup(allGroupedTabIds, () =>
          {
            handleError('ungroup for sort');
            resolve();
          });
        });

        // Step 2: Move tabs to sorted positions
        for (const [index, tab] of sorted.entries())
        {
          await new Promise<void>((resolve) =>
          {
            chrome.tabs.move(tab.id!, { index }, () =>
            {
              handleError('sort');
              resolve();
            });
          });
        }

        // Step 3: Recreate groups and re-group tabs (in encounter order)
        for (const origGroupId of groupOrder)
        {
          const tabIds = tabsByGroup.get(origGroupId)!;
          const info = groupInfoMap.get(origGroupId);
          await new Promise<void>((resolve) =>
          {
            chrome.tabs.group({
              tabIds,
              createProperties: windowId ? { windowId } : undefined
            }, (newGroupId) =>
            {
              if (handleError('regroup'))
              {
                resolve();
                return;
              }
              if (info)
              {
                chrome.tabGroups.update(newGroupId, { title: info.title, color: info.color }, () =>
                {
                  handleError('update group');
                  resolve();
                });
              }
              else
              {
                resolve();
              }
            });
          });
        }
      }
      else
      {
        // No grouped tabs, just move
        for (const [index, tab] of sorted.entries())
        {
          await new Promise<void>((resolve) =>
          {
            chrome.tabs.move(tab.id!, { index }, () =>
            {
              handleError('sort');
              resolve();
            });
          });
        }
      }
    }
    finally
    {
      if (windowId) batchOperationWindows.delete(windowId);
      fetchTabs();
    }
  }, [tabs, handleError, fetchTabs, windowId]);

  // const closeAllTabs = useCallback(() => {
  //   const tabIds = tabs.map(t => t.id!);
  //   // Create a new blank tab first, then close others
  //   chrome.tabs.create({ active: true, windowId }, () => {
  //     chrome.tabs.remove(tabIds, () => {
  //       handleError('close all');
  //     });
  //   });
  // }, [tabs, handleError, windowId]);

  const createTab = useCallback(() =>
  {
    chrome.tabs.create({ active: true, windowId }, () =>
    {
      handleError('create tab');
    });
  }, [handleError, windowId]);

  const groupTab = useCallback((tabId: number, groupId: number): Promise<void> => {
    return new Promise((resolve) => {
      chrome.tabs.group({ tabIds: [tabId], groupId }, () => {
        handleError('group');
        resolve();
      });
    });
  }, [handleError]);

  const ungroupTab = useCallback((tabId: number): Promise<void> => {
    return new Promise((resolve) => {
      chrome.tabs.ungroup([tabId], () => {
        handleError('ungroup');
        resolve();
      });
    });
  }, [handleError]);

  const createGroupWithTab = useCallback(async (tabId: number,
                                                title: string,
                                                color?: chrome.tabGroups.ColorEnum) =>
  {
    const tab = await chrome.tabs.get(tabId);
    chrome.tabs.group({
      tabIds: [tabId],
      createProperties: { windowId: tab.windowId }
    }, (groupId) =>
    {
      if (!handleError('create group'))
      {
        chrome.tabGroups.update(groupId, { title, color }, () =>
        {
          handleError('update group');
        });
      }
    });
  }, [handleError]);

  const createTabInGroup = useCallback((groupId: number) =>
  {
    chrome.tabs.create({ active: true, windowId }, (tab) =>
    {
      if (!handleError('create tab'))
      {
        chrome.tabs.group({ tabIds: [tab.id!], groupId }, () =>
        {
          handleError('add to group');
        });
      }
    });
  }, [handleError, windowId]);

  const duplicateTab = useCallback((tabId: number) =>
  {
    chrome.tabs.get(tabId, (tab) =>
    {
      if (handleError('get tab') || !tab.url) return;

      chrome.tabs.create({ url: tab.url, active: true, windowId }, (newTab) =>
      {
        if (handleError('create tab') || !newTab.id) return;

        if (tab.groupId && tab.groupId !== -1)
        {
          // Add to group first, then move to position after original
          chrome.tabs.group({ tabIds: [newTab.id], groupId: tab.groupId }, () =>
          {
            if (!handleError('add to group'))
            {
              chrome.tabs.move(newTab.id!, { index: tab.index + 1 }, () =>
              {
                handleError('move tab');
              });
            }
          });
        }
        else
        {
          // Not in a group, just move to position after original
          chrome.tabs.move(newTab.id, { index: tab.index + 1 }, () =>
          {
            handleError('move tab');
          });
        }
      });
    });
  }, [handleError, windowId]);

  const sortGroupTabs = useCallback(async (groupId: number, direction: 'asc' | 'desc' = 'asc') =>
  {
    // Get tabs in this group
    const groupTabs = tabs.filter(t => t.groupId === groupId);
    if (groupTabs.length === 0) return;

    // Find the starting index of this group
    const startIndex = tabs.findIndex(t => t.groupId === groupId);

    // Sort by domain, then title
    const sorted = [...groupTabs].sort((a, b) =>
    {
      const cmp = compareDomainTitle(a, b);
      return direction === 'asc' ? cmp : -cmp;
    });

    // Batch mode: suppress listener-triggered refetches during moves
    if (windowId) batchOperationWindows.add(windowId);
    try
    {
      // Move each tab to its new position within the group
      for (const [i, tab] of sorted.entries())
      {
        await new Promise<void>((resolve) =>
        {
          chrome.tabs.move(tab.id!, { index: startIndex + i }, () =>
          {
            handleError('sort group');
            resolve();
          });
        });
      }
    }
    finally
    {
      if (windowId) batchOperationWindows.delete(windowId);
      fetchTabs();
    }
  }, [tabs, handleError, fetchTabs, windowId]);

  return {
    tabs,
    closeTabs,
    activateTab,
    moveTab,
    groupTab,
    ungroupTab,
    createGroupWithTab,
    createTabInGroup,
    createTab,
    duplicateTab,
    sortTabs,
    sortGroupTabs,
    // closeAllTabs,
    refreshTabs: fetchTabs,
    error
  };
};
