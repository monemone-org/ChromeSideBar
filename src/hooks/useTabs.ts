import { useState, useEffect, useCallback } from 'react';

// Helper: compare tabs by domain, then title
const compareDomainTitle = (a: chrome.tabs.Tab, b: chrome.tabs.Tab): number =>
{
  const domainA = new URL(a.url || '').hostname.replace(/^www\./, '');
  const domainB = new URL(b.url || '').hostname.replace(/^www\./, '');
  if (domainA !== domainB) return domainA.localeCompare(domainB);
  return (a.title || '').localeCompare(b.title || '');
};

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

  const sortTabs = useCallback((direction: 'asc' | 'desc' = 'asc',
                               tabGroups: chrome.tabGroups.TabGroup[] = [],
                               groupsFirst: boolean = true) =>
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
      else if (groupsFirst && (aGrouped || bGrouped))
      {
        // Grouped tabs come first
        cmp = aGrouped ? -1 : 1;
      }
      else
      {
        // Both ungrouped (or mixed when groupsFirst is off): sort by domain, then title
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

    if (allGroupedTabIds.length > 0)
    {
      // Step 1: Ungroup all grouped tabs first
      chrome.tabs.ungroup(allGroupedTabIds, () =>
      {
        if (handleError('ungroup for sort')) return;

        // Step 2: Move tabs to sorted positions
        sorted.forEach((tab, index) =>
        {
          chrome.tabs.move(tab.id!, { index }, () => handleError('sort'));
        });

        // Step 3: Recreate groups and re-group tabs (in encounter order)
        groupOrder.forEach((origGroupId) =>
        {
          const tabIds = tabsByGroup.get(origGroupId)!;
          const info = groupInfoMap.get(origGroupId);
          chrome.tabs.group({ tabIds }, (newGroupId) =>
          {
            if (handleError('regroup')) return;
            if (info)
            {
              chrome.tabGroups.update(newGroupId, { title: info.title, color: info.color }, () =>
              {
                handleError('update group');
              });
            }
          });
        });
      });
    }
    else
    {
      // No grouped tabs, just move
      sorted.forEach((tab, index) =>
      {
        chrome.tabs.move(tab.id!, { index }, () => handleError('sort'));
      });
    }
  }, [tabs, handleError]);

  const closeAllTabs = useCallback(() => {
    const tabIds = tabs.map(t => t.id!);
    // Create a new blank tab first, then close others
    chrome.tabs.create({ active: true }, () => {
      chrome.tabs.remove(tabIds, () => {
        handleError('close all');
      });
    });
  }, [tabs, handleError]);

  const groupTab = useCallback((tabId: number, groupId: number) => {
    chrome.tabs.group({ tabIds: [tabId], groupId }, () => {
      handleError('group');
    });
  }, [handleError]);

  const ungroupTab = useCallback((tabId: number) => {
    chrome.tabs.ungroup([tabId], () => {
      handleError('ungroup');
    });
  }, [handleError]);

  const createGroupWithTab = useCallback((tabId: number,
                                          title: string,
                                          color?: chrome.tabGroups.ColorEnum) =>
  {
    chrome.tabs.group({ tabIds: [tabId] }, (groupId) =>
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
    chrome.tabs.create({ active: true }, (tab) =>
    {
      if (!handleError('create tab'))
      {
        chrome.tabs.group({ tabIds: [tab.id!], groupId }, () =>
        {
          handleError('add to group');
        });
      }
    });
  }, [handleError]);

  const sortGroupTabs = useCallback((groupId: number, direction: 'asc' | 'desc' = 'asc') =>
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

    // Move each tab to its new position within the group
    sorted.forEach((tab, i) =>
    {
      chrome.tabs.move(tab.id!, { index: startIndex + i }, () => handleError('sort group'));
    });
  }, [tabs, handleError]);

  return {
    tabs,
    closeTab,
    activateTab,
    moveTab,
    groupTab,
    ungroupTab,
    createGroupWithTab,
    createTabInGroup,
    sortTabs,
    sortGroupTabs,
    closeAllTabs,
    error
  };
};
