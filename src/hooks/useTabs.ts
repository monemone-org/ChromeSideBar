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

// One block that sortTabs moves as a whole: a Chrome group with its tabs in
// sorted order, or a single ungrouped tab.
class SortUnit
{
  private constructor(readonly groupId: number | null, readonly tabs: chrome.tabs.Tab[])
  {
  }

  get firstTab(): chrome.tabs.Tab
  {
    return this.tabs[0];
  }

  /**
   * Splits tabs into units: one per Chrome group, with that group's tabs
   * sorted by domain in the given direction (1 ascending, -1 descending), and
   * one per ungrouped tab.
   */
  static fromTabs(tabs: chrome.tabs.Tab[], sign: number): SortUnit[]
  {
    const units: SortUnit[] = [];
    const groups = new Map<number, chrome.tabs.Tab[]>();

    // Gather grouped tabs by group, and make each ungrouped tab its own unit
    for (const tab of tabs)
    {
      const grouped = tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;
      if (!grouped)
      {
        units.push(new SortUnit(null, [tab]));
        continue;
      }
      const members = groups.get(tab.groupId);
      if (members) members.push(tab);
      else groups.set(tab.groupId, [tab]);
    }

    // Each group becomes one unit with its tabs in sorted order
    for (const [groupId, members] of groups)
    {
      members.sort((a, b) => sign * compareDomainTitle(a, b));
      units.push(new SortUnit(groupId, members));
    }
    return units;
  }
}

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

  // Sorts the window's tabs by domain and orders the groups, without ever
  // taking a tab out of its group. Whole groups move with chrome.tabGroups.move
  // and tabs move only within their own group's span. Ungrouping first and
  // regrouping afterwards would report every grouped tab as leaving its group,
  // and background unlinks a bookmark tab that leaves its space's group (G3).
  const sortTabs = useCallback(async (direction: 'asc' | 'desc' = 'asc',
                                      tabGroups: chrome.tabGroups.TabGroup[] = [],
                                      displayOrder: TabGroupDisplayOrder = 'groupsFirst') =>
  {
    const sign = direction === 'asc' ? 1 : -1;
    const groupTitles = new Map<number, string>();
    tabGroups.forEach(g => groupTitles.set(g.id, g.title || ''));

    // Chrome keeps its own pinned tabs first and never groups them, so they
    // are sorted among themselves and the rest starts after them
    const pinnedTabs = tabs.filter(t => t.pinned).sort((a, b) => sign * compareDomainTitle(a, b));
    const units = SortUnit.fromTabs(tabs.filter(t => !t.pinned), sign);

    // Order the units. Same rules as the Tabs list display: groups by title,
    // grouped vs ungrouped by the display order setting, and everything else
    // by domain, comparing a group by its first sorted tab
    units.sort((a, b) =>
    {
      let cmp: number;
      if (a.groupId !== null && b.groupId !== null)
      {
        cmp = (groupTitles.get(a.groupId) ?? '').localeCompare(groupTitles.get(b.groupId) ?? '');
        if (cmp === 0) cmp = a.groupId - b.groupId;
      }
      else if (displayOrder === 'groupsFirst' && (a.groupId !== null || b.groupId !== null))
      {
        cmp = a.groupId !== null ? -1 : 1;
      }
      else if (displayOrder === 'groupsLast' && (a.groupId !== null || b.groupId !== null))
      {
        cmp = a.groupId !== null ? 1 : -1;
      }
      else
      {
        cmp = compareDomainTitle(a.firstTab, b.firstTab);
      }
      return sign * cmp;
    });

    const moveGroup = (groupId: number, index: number): Promise<void> =>
    {
      return new Promise((resolve) =>
      {
        chrome.tabGroups.move(groupId, { index }, () =>
        {
          handleError('sort group');
          resolve();
        });
      });
    };

    // Batch mode: suppress listener-triggered refetches during sort operations
    if (windowId) batchOperationWindows.add(windowId);
    try
    {
      // Place the pinned tabs in their sorted order
      for (const [index, tab] of pinnedTabs.entries())
      {
        await moveTab(tab.id!, index);
      }

      // Place each unit left to right. Everything before `position` is final,
      // so the index a unit moves to is always the start of the unplaced
      // tabs. That is never in the middle of a group, so a group can move
      // there, and an ungrouped tab moved there cannot join a group.
      let position = pinnedTabs.length;
      for (const unit of units)
      {
        // A group moves as a whole, then its tabs are reordered inside it
        if (unit.groupId !== null)
        {
          await moveGroup(unit.groupId, position);
        }
        for (const [offset, tab] of unit.tabs.entries())
        {
          await moveTab(tab.id!, position + offset);
        }
        position += unit.tabs.length;
      }
    }
    finally
    {
      if (windowId) batchOperationWindows.delete(windowId);
      fetchTabs();
    }
  }, [tabs, handleError, fetchTabs, windowId, moveTab]);

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
