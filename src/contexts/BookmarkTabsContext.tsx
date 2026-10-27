import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';
import { tabSpaceRegistryProxy } from '../managers/proxies/tabSpaceRegistryProxy';
import { SpaceMessageAction } from '../utils/spaceMessages';
import {
  getTabAssociations,
  storeTabAssociation,
  removeTabAssociation as removeStoredAssociation,
  setTabAssociations,
  saveTabAssociationBackup,
  removeTabAssociationBackup,
} from '../utils/tabAssociations';
import { isUrlDrifted, isDomainDrifted } from '../utils/urlCompare';
import { LiveTabInfoMap } from './liveTabInfo';

// Helper to create item keys
const makeBookmarkKey = (bookmarkId: string) => `bookmark-${bookmarkId}`;
const makePinnedKey = (pinnedId: string) => `pinned-${pinnedId}`;

interface BookmarkTabsContextValue
{
  // Bookmark functions
  openBookmarkTab: (bookmarkId: string, url: string, spaceId?: string) => Promise<number | undefined>;
  closeBookmarkTab: (bookmarkId: string) => void;
  isBookmarkLoaded: (bookmarkId: string) => boolean;
  isBookmarkAudible: (bookmarkId: string) => boolean;
  isBookmarkActive: (bookmarkId: string) => boolean;
  getTabIdForBookmark: (bookmarkId: string) => number | undefined;
  getBookmarkLiveTitle: (bookmarkId: string) => string | undefined;
  getBookmarkLiveUrl: (bookmarkId: string) => string | undefined;
  isBookmarkDrifted: (bookmarkId: string, savedUrl: string) => boolean;
  resetBookmarkTab: (bookmarkId: string, savedUrl: string) => Promise<void>;
  associateExistingTab: (tabId: number, bookmarkId: string, spaceId?: string) => Promise<void>;
  restoreItemAssociation: (tabId: number, itemKey: string) => Promise<void>;
  deassociateBookmarkTab: (bookmarkId: string) => void;
  // Pinned site functions
  openPinnedTab: (pinnedId: string, url: string) => Promise<number | undefined>;
  closePinnedTab: (pinnedId: string) => void;
  isPinnedLoaded: (pinnedId: string) => boolean;
  isPinnedAudible: (pinnedId: string) => boolean;
  isPinnedActive: (pinnedId: string) => boolean;
  getTabIdForPinned: (pinnedId: string) => number | undefined;
  getPinnedLiveTitle: (pinnedId: string) => string | undefined;
  getPinnedLiveUrl: (pinnedId: string) => string | undefined;
  getPinnedLiveFavIconUrl: (pinnedId: string) => string | undefined;
  isPinnedDrifted: (pinnedId: string, savedUrl: string) => boolean;
  isPinnedDomainDrifted: (pinnedId: string, savedUrl: string) => boolean;
  resetPinnedTab: (pinnedId: string, savedUrl: string) => Promise<void>;
  deassociatePinnedTab: (pinnedId: string) => Promise<void>;
  // Active item tracking
  getActiveItemKey: () => string | null;
  // Tab filtering for sidebar
  getManagedTabIds: () => Set<number>;
  // Get item key (bookmark-{id} or pinned-{id}) for a tab
  getItemKeyForTab: (tabId: number) => string | null;
  // Common
  isInitialized: boolean;
  error: string | null;
}

const BookmarkTabsContext = createContext<BookmarkTabsContextValue | null>(null);

export const useBookmarkTabsContext = (): BookmarkTabsContextValue =>
{
  const context = useContext(BookmarkTabsContext);
  if (!context)
  {
    throw new Error('useBookmarkTabsContext must be used within BookmarkTabsProvider');
  }
  return context;
};

interface BookmarkTabsProviderProps
{
  children: ReactNode;
}

export const BookmarkTabsProvider = ({ children }: BookmarkTabsProviderProps) =>
{
  // Current window ID for window-scoped storage
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);

  // In-memory mappings for fast lookup (key is "bookmark-{id}" or "pinned-{id}")
  const [itemToTab, setItemToTab] = useState<Map<string, number>>(new Map());
  const [tabToItem, setTabToItem] = useState<Map<number, string>>(new Map());
  const [audibleTabs, setAudibleTabs] = useState<Set<number>>(new Set());
  // Live title/url/favicon of managed tabs
  const [liveTabs, setLiveTabs] = useState<LiveTabInfoMap>(() => new LiveTabInfoMap());
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const isRebuilding = useRef(false);

  // Get current window ID on mount
  useEffect(() =>
  {
    chrome.windows.getCurrent((win) =>
    {
      if (win.id)
      {
        setCurrentWindowId(win.id);
      }
    });
  }, []);

  const handleError = useCallback(
    createChromeErrorHandler('BookmarkTabs', setError),
    []
  );

  // Rebuild associations from storage on init
  // Just validates that stored tabIds still exist - no URL matching
  const rebuildAssociations = useCallback(async (windowId: number) =>
  {
    if (isRebuilding.current) return;
    isRebuilding.current = true;

    try
    {
      // Get stored associations from session storage
      const associations = await getTabAssociations(windowId);

      const newItemToTab = new Map<string, number>();
      const newTabToItem = new Map<number, string>();
      // Seed live tab info/audible from existing tabs so drift detection and
      // tooltips work immediately on sidebar reopen — chrome.tabs.onUpdated only
      // fires on future changes, so without this the maps stay empty until navigation.
      let newLiveTabs = new LiveTabInfoMap();
      const newAudibleTabs = new Set<number>();

      // Validate each stored tabId still exists
      const tabIds = Object.keys(associations).map(id => parseInt(id, 10));

      for (const tabId of tabIds)
      {
        try
        {
          const tab = await new Promise<chrome.tabs.Tab | null>((resolve) =>
          {
            chrome.tabs.get(tabId, (t) =>
            {
              if (chrome.runtime.lastError)
              {
                resolve(null);
              }
              else
              {
                resolve(t);
              }
            });
          });

          if (tab)
          {
            const itemKey = associations[tabId];
            newItemToTab.set(itemKey, tabId);
            newTabToItem.set(tabId, itemKey);
            newLiveTabs = newLiveTabs.withTab(tabId, tab);
            if (tab.audible)
            {
              newAudibleTabs.add(tabId);
            }
          }
          else
          {
            // Tab no longer exists - remove from storage
            delete associations[tabId];
          }
        }
        catch
        {
          // Tab doesn't exist
          delete associations[tabId];
        }
      }

      // Update storage with cleaned associations
      await setTabAssociations(windowId, associations);

      setItemToTab(newItemToTab);
      setTabToItem(newTabToItem);
      setLiveTabs(newLiveTabs);
      setAudibleTabs(newAudibleTabs);
      setIsInitialized(true);
    }
    catch (err)
    {
      console.error('Failed to rebuild associations:', err);
      setIsInitialized(true);
    }
    finally
    {
      isRebuilding.current = false;
    }
  }, []);

  // Initialize when windowId is available
  useEffect(() =>
  {
    if (currentWindowId !== null)
    {
      rebuildAssociations(currentWindowId);
    }
  }, [currentWindowId, rebuildAssociations]);

  // Helper to remove association for a tab
  const removeLocalTabAssociation = useCallback((tabId: number, windowId: number) =>
  {
    setTabToItem((prev) =>
    {
      const itemKey = prev.get(tabId);
      if (itemKey)
      {
        setItemToTab((prevIT) =>
        {
          const newMap = new Map(prevIT);
          newMap.delete(itemKey);
          return newMap;
        });

        // Clean up live tab info
        setLiveTabs((prev) => prev.withoutTab(tabId));

        // Clean up audible state
        if (import.meta.env.DEV)
        {
          console.log(`[removeLocalTabAssociation] cleaned up audibleTabs for tab=${tabId}`);
        }
        setAudibleTabs((prev) =>
        {
          const newSet = new Set(prev);
          newSet.delete(tabId);
          return newSet;
        });

        // Clean up from session storage and local backup
        removeStoredAssociation(windowId, tabId);
        removeTabAssociationBackup(windowId, itemKey);

        const newMap = new Map(prev);
        newMap.delete(tabId);
        return newMap;
      }
      return prev;
    });
  }, []);

  // Listen for tab removal
  useEffect(() =>
  {
    if (currentWindowId === null) return;

    const handleTabRemoved = (tabId: number) =>
    {
      removeLocalTabAssociation(tabId, currentWindowId);
    };

    chrome.tabs?.onRemoved?.addListener(handleTabRemoved);

    return () =>
    {
      chrome.tabs?.onRemoved?.removeListener(handleTabRemoved);
    };
  }, [currentWindowId, removeLocalTabAssociation]);

  // Listen for tab detached (moved to another window)
  // When a tab is detached from this window, treat it as closed in this window
  useEffect(() =>
  {
    if (currentWindowId === null) return;

    const handleTabDetached = (tabId: number, detachInfo: chrome.tabs.TabDetachInfo) =>
    {
      // Only remove if detached from our window
      if (detachInfo.oldWindowId === currentWindowId)
      {
        removeLocalTabAssociation(tabId, currentWindowId);
      }
    };

    chrome.tabs?.onDetached?.addListener(handleTabDetached);

    return () =>
    {
      chrome.tabs?.onDetached?.removeListener(handleTabDetached);
    };
  }, [currentWindowId, removeLocalTabAssociation]);

  // Listen for background telling us a tracked tab was dragged into a
  // different space's Chrome group - break the association, same as the user
  // manually choosing "Move to Tabs" (see DEASSOCIATE_TAB in spaceMessages.ts)
  useEffect(() =>
  {
    if (currentWindowId === null) return;

    const handleMessage = (message: { action?: string; windowId?: number; tabId?: number }) =>
    {
      if (message.action !== SpaceMessageAction.DEASSOCIATE_TAB) return;
      if (message.windowId !== currentWindowId || message.tabId === undefined) return;

      removeLocalTabAssociation(message.tabId, currentWindowId);
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () =>
    {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentWindowId, removeLocalTabAssociation]);

  // Listen for tab audible, title, URL, and favicon changes
  useEffect(() =>
  {
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) =>
    {
      // Track audible state
      if (changeInfo.audible !== undefined)
      {
        setAudibleTabs((prev) =>
        {
          const newSet = new Set(prev);
          if (changeInfo.audible)
          {
            newSet.add(tabId);
          }
          else
          {
            newSet.delete(tabId);
          }
          return newSet;
        });
      }

      // Track title/url/favicon changes for managed tabs only
      if (changeInfo.title !== undefined || changeInfo.url !== undefined || changeInfo.favIconUrl !== undefined)
      {
        setTabToItem((prev) =>
        {
          if (!prev.has(tabId))
          {
            return prev;
          }
          setLiveTabs((prevLiveTabs) => prevLiveTabs.withChanges(tabId, changeInfo));
          return prev;
        });
      }
    };

    chrome.tabs?.onUpdated?.addListener(handleTabUpdated);

    return () =>
    {
      chrome.tabs?.onUpdated?.removeListener(handleTabUpdated);
    };
  }, []);

  // Listen for active tab changes
  useEffect(() =>
  {
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) =>
    {
      setActiveTabId(activeInfo.tabId);
    };

    // Initialize with current active tab
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) =>
    {
      if (tabs.length > 0 && tabs[0].id)
      {
        setActiveTabId(tabs[0].id);
      }
    });

    chrome.tabs?.onActivated?.addListener(handleTabActivated);

    return () =>
    {
      chrome.tabs?.onActivated?.removeListener(handleTabActivated);
    };
  }, []);

  // Store association in session storage and local backup
  // tabUrl and tabIndex can be passed directly (e.g. from tab creation callback) to avoid
  // an extra chrome.tabs.get call and its async yield point
  const storeAssociation = useCallback(async (
    tabId: number,
    itemKey: string,
    tabUrl?: string,
    tabIndex?: number
  ): Promise<void> =>
  {
    if (currentWindowId === null) return;

    await storeTabAssociation(currentWindowId, tabId, itemKey);

    let url = tabUrl;
    let index = tabIndex;

    if (url === undefined || index === undefined)
    {
      const tab = await new Promise<chrome.tabs.Tab | null>((resolve) =>
      {
        chrome.tabs.get(tabId, (t) =>
        {
          resolve(chrome.runtime.lastError ? null : t);
        });
      });
      url = tab?.url ?? '';
      index = tab?.index;
    }

    if (url !== undefined && index !== undefined)
    {
      saveTabAssociationBackup(currentWindowId, itemKey, { tabId, url, tabIndex: index });
    }
  }, [currentWindowId]);

  // Create a new tab for an item (no grouping)
  // Returns the created tab ID, or undefined if creation failed
  const createItemTab = useCallback(async (
    itemKey: string,
    url: string,
    spaceId?: string
  ): Promise<number | undefined> =>
  {
    return new Promise((resolve) =>
    {
      chrome.tabs.create({ url, active: true, windowId: currentWindowId ?? undefined }, async (tab) =>
      {
        if (handleError('create') || !tab.id)
        {
          resolve(undefined);
          return;
        }

        const tabId = tab.id;
        const windowId = currentWindowId ?? tab.windowId;

        // Store association (pass url+index to avoid extra chrome.tabs.get call)
        const createdUrl = tab.url ?? url;
        await storeAssociation(tabId, itemKey, createdUrl, tab.index);

        setItemToTab((prev) =>
        {
          const newMap = new Map(prev);
          newMap.set(itemKey, tabId);
          return newMap;
        });
        setTabToItem((prev) =>
        {
          const newMap = new Map(prev);
          newMap.set(tabId, itemKey);
          return newMap;
        });
        setLiveTabs((prev) => prev.withTab(tabId, { ...tab, url: createdUrl }));

        // Register space with background for bookmark tabs
        if (spaceId && windowId)
        {
          tabSpaceRegistryProxy.register(windowId, tabId, spaceId);
        }

        // Tell background to re-check this tab (will group into space if active)
        if (windowId)
        {
          chrome.runtime.sendMessage({
            action: 'queue-tab-for-grouping',
            tabId,
            windowId
          });
        }

        resolve(tabId);
      });
    });
  }, [handleError, storeAssociation, currentWindowId]);

  // Open a tab for an item (bookmark or pinned site)
  // Returns the tab ID (existing or newly created), or undefined if failed
  const openItemTab = useCallback(async (
    itemKey: string,
    url: string,
    spaceId?: string
  ): Promise<number | undefined> =>
  {
    const existingTabId = itemToTab.get(itemKey);

    if (existingTabId)
    {
      return new Promise((resolve) =>
      {
        chrome.tabs.get(existingTabId, (tab) =>
        {
          if (chrome.runtime.lastError || !tab)
          {
            createItemTab(itemKey, url, spaceId).then(resolve);
          }
          else
          {
            chrome.tabs.update(existingTabId, { active: true }, () =>
            {
              handleError('activate');
              resolve(existingTabId);
            });
          }
        });
      });
    }
    else
    {
      return createItemTab(itemKey, url, spaceId);
    }
  }, [itemToTab, createItemTab, handleError]);

  // Close an item's associated tab
  const closeItemTab = useCallback((itemKey: string): void =>
  {
    const tabId = itemToTab.get(itemKey);
    if (tabId)
    {
      chrome.tabs.remove(tabId, () =>
      {
        handleError('close');
      });
    }
  }, [itemToTab, handleError]);

  // Check if an item has a loaded tab
  const isItemLoaded = useCallback((itemKey: string): boolean =>
  {
    return itemToTab.has(itemKey);
  }, [itemToTab]);

  // --- Bookmark-specific wrappers ---
  const openBookmarkTab = useCallback(async (
    bookmarkId: string,
    url: string,
    spaceId?: string
  ): Promise<number | undefined> =>
  {
    return openItemTab(makeBookmarkKey(bookmarkId), url, spaceId);
  }, [openItemTab]);

  const closeBookmarkTab = useCallback((bookmarkId: string): void =>
  {
    closeItemTab(makeBookmarkKey(bookmarkId));
  }, [closeItemTab]);

  const isBookmarkLoaded = useCallback((bookmarkId: string): boolean =>
  {
    return isItemLoaded(makeBookmarkKey(bookmarkId));
  }, [isItemLoaded]);

  const isBookmarkAudible = useCallback((bookmarkId: string): boolean =>
  {
    const tabId = itemToTab.get(makeBookmarkKey(bookmarkId));
    return tabId !== undefined && audibleTabs.has(tabId);
  }, [itemToTab, audibleTabs]);

  const getTabIdForBookmark = useCallback((bookmarkId: string): number | undefined =>
  {
    return itemToTab.get(makeBookmarkKey(bookmarkId));
  }, [itemToTab]);

  const getBookmarkLiveTitle = useCallback((bookmarkId: string): string | undefined =>
  {
    const tabId = itemToTab.get(makeBookmarkKey(bookmarkId));
    return tabId !== undefined ? liveTabs.get(tabId)?.title : undefined;
  }, [itemToTab, liveTabs]);

  const getBookmarkLiveUrl = useCallback((bookmarkId: string): string | undefined =>
  {
    const tabId = itemToTab.get(makeBookmarkKey(bookmarkId));
    return tabId !== undefined ? liveTabs.get(tabId)?.url : undefined;
  }, [itemToTab, liveTabs]);

  const isBookmarkDrifted = useCallback((bookmarkId: string, savedUrl: string): boolean =>
  {
    return isUrlDrifted(savedUrl, getBookmarkLiveUrl(bookmarkId));
  }, [getBookmarkLiveUrl]);

  const resetItemTab = useCallback(async (itemKey: string, savedUrl: string): Promise<void> =>
  {
    const tabId = itemToTab.get(itemKey);
    if (tabId === undefined) return;

    await new Promise<void>((resolve) =>
    {
      chrome.tabs.update(tabId, { url: savedUrl, active: true }, () =>
      {
        handleError('reset');
        // Optimistically mark as back on the saved URL; onUpdated will confirm.
        setLiveTabs((prev) => prev.withUrl(tabId, savedUrl));
        resolve();
      });
    });
  }, [itemToTab, handleError]);

  const resetBookmarkTab = useCallback(async (bookmarkId: string, savedUrl: string): Promise<void> =>
  {
    await resetItemTab(makeBookmarkKey(bookmarkId), savedUrl);
  }, [resetItemTab]);

  // Associate an existing tab with a bookmark (for drag-drop from tabs to bookmarks,
  // or "Add to Bookmark"). spaceId is the Space that owns the bookmark's folder -
  // resolved by the caller, since a folder belongs to at most one Space (see
  // CLAUDE.md "Design Assumptions"). Mirrors createItemTab's registration +
  // grouping so a bookmarked tab always matches its bookmark's Space, regardless
  // of which space the tab happened to be in before it was bookmarked.
  const associateExistingTab = useCallback(async (
    tabId: number,
    bookmarkId: string,
    spaceId?: string
  ): Promise<void> =>
  {
    const itemKey = makeBookmarkKey(bookmarkId);

    // Store association
    await storeAssociation(tabId, itemKey);

    if (spaceId && currentWindowId !== null)
    {
      tabSpaceRegistryProxy.register(currentWindowId, tabId, spaceId);

      chrome.runtime.sendMessage({
        action: 'queue-tab-for-grouping',
        tabId,
        windowId: currentWindowId,
        spaceId
      });
    }

    setItemToTab((prev) =>
    {
      const newMap = new Map(prev);
      newMap.set(itemKey, tabId);
      return newMap;
    });
    setTabToItem((prev) =>
    {
      const newMap = new Map(prev);
      newMap.set(tabId, itemKey);
      return newMap;
    });

    chrome.tabs.get(tabId, (tab) =>
    {
      if (chrome.runtime.lastError || !tab) return;
      setLiveTabs((prev) => prev.withTab(tabId, tab));
    });
  }, [storeAssociation, currentWindowId]);

  // Restore an item association by raw itemKey (for undo — works for both bookmark and pinned)
  const restoreItemAssociation = useCallback(async (tabId: number, itemKey: string): Promise<void> =>
  {
    await storeAssociation(tabId, itemKey);

    setItemToTab((prev) =>
    {
      const newMap = new Map(prev);
      newMap.set(itemKey, tabId);
      return newMap;
    });
    setTabToItem((prev) =>
    {
      const newMap = new Map(prev);
      newMap.set(tabId, itemKey);
      return newMap;
    });

    chrome.tabs.get(tabId, (tab) =>
    {
      if (chrome.runtime.lastError || !tab) return;
      setLiveTabs((prev) => prev.withTab(tabId, tab));
    });
  }, [storeAssociation]);

  // Deassociate a bookmark from its tab (tab stays alive, bookmark becomes unloaded)
  const deassociateBookmarkTab = useCallback((bookmarkId: string): void =>
  {
    if (currentWindowId === null) return;
    const itemKey = makeBookmarkKey(bookmarkId);
    const tabId = itemToTab.get(itemKey);
    if (tabId !== undefined)
    {
      removeLocalTabAssociation(tabId, currentWindowId);
    }
  }, [itemToTab, currentWindowId, removeLocalTabAssociation]);

  // --- Pinned site-specific wrappers ---
  const openPinnedTab = useCallback(async (pinnedId: string, url: string): Promise<number | undefined> =>
  {
    return openItemTab(makePinnedKey(pinnedId), url);
  }, [openItemTab]);

  const closePinnedTab = useCallback((pinnedId: string): void =>
  {
    closeItemTab(makePinnedKey(pinnedId));
  }, [closeItemTab]);

  const isPinnedLoaded = useCallback((pinnedId: string): boolean =>
  {
    return isItemLoaded(makePinnedKey(pinnedId));
  }, [isItemLoaded]);

  const isPinnedAudible = useCallback((pinnedId: string): boolean =>
  {
    const tabId = itemToTab.get(makePinnedKey(pinnedId));
    return tabId !== undefined && audibleTabs.has(tabId);
  }, [itemToTab, audibleTabs]);

  const getTabIdForPinned = useCallback((pinnedId: string): number | undefined =>
  {
    return itemToTab.get(makePinnedKey(pinnedId));
  }, [itemToTab]);

  const getPinnedLiveTitle = useCallback((pinnedId: string): string | undefined =>
  {
    const tabId = itemToTab.get(makePinnedKey(pinnedId));
    return tabId !== undefined ? liveTabs.get(tabId)?.title : undefined;
  }, [itemToTab, liveTabs]);

  const getPinnedLiveUrl = useCallback((pinnedId: string): string | undefined =>
  {
    const tabId = itemToTab.get(makePinnedKey(pinnedId));
    return tabId !== undefined ? liveTabs.get(tabId)?.url : undefined;
  }, [itemToTab, liveTabs]);

  const getPinnedLiveFavIconUrl = useCallback((pinnedId: string): string | undefined =>
  {
    const tabId = itemToTab.get(makePinnedKey(pinnedId));
    return tabId !== undefined ? liveTabs.get(tabId)?.favIconUrl : undefined;
  }, [itemToTab, liveTabs]);

  const isPinnedDrifted = useCallback((pinnedId: string, savedUrl: string): boolean =>
  {
    return isUrlDrifted(savedUrl, getPinnedLiveUrl(pinnedId));
  }, [getPinnedLiveUrl]);

  const isPinnedDomainDrifted = useCallback((pinnedId: string, savedUrl: string): boolean =>
  {
    return isDomainDrifted(savedUrl, getPinnedLiveUrl(pinnedId));
  }, [getPinnedLiveUrl]);

  const resetPinnedTab = useCallback(async (pinnedId: string, savedUrl: string): Promise<void> =>
  {
    await resetItemTab(makePinnedKey(pinnedId), savedUrl);
  }, [resetItemTab]);

  // Deassociate a pinned site from its tab (tab stays alive, becomes unmanaged).
  // Awaits the storage removal before queueing grouping, so the background's
  // isPinnedManagedTab check (which reads that same storage) no longer sees this
  // tab as pin-managed and will group it into the active space instead of leaving
  // it ungrouped.
  const deassociatePinnedTab = useCallback(async (pinnedId: string): Promise<void> =>
  {
    if (currentWindowId === null) return;
    const itemKey = makePinnedKey(pinnedId);
    const tabId = itemToTab.get(itemKey);
    if (tabId !== undefined)
    {
      await removeStoredAssociation(currentWindowId, tabId);
      removeLocalTabAssociation(tabId, currentWindowId);
      chrome.runtime.sendMessage({ action: 'queue-tab-for-grouping', tabId, windowId: currentWindowId });
    }
  }, [itemToTab, currentWindowId, removeLocalTabAssociation]);

  // --- Active state functions ---
  const isBookmarkActive = useCallback((bookmarkId: string): boolean =>
  {
    if (activeTabId === null) return false;
    const tabId = itemToTab.get(makeBookmarkKey(bookmarkId));
    return tabId === activeTabId;
  }, [itemToTab, activeTabId]);

  const isPinnedActive = useCallback((pinnedId: string): boolean =>
  {
    if (activeTabId === null) return false;
    const tabId = itemToTab.get(makePinnedKey(pinnedId));
    return tabId === activeTabId;
  }, [itemToTab, activeTabId]);

  const getActiveItemKey = useCallback((): string | null =>
  {
    if (activeTabId === null) return null;
    return tabToItem.get(activeTabId) ?? null;
  }, [tabToItem, activeTabId]);

  // Get all managed tab IDs (for filtering in TabList)
  const getManagedTabIds = useCallback((): Set<number> =>
  {
    return new Set(tabToItem.keys());
  }, [tabToItem]);

  // Get item key for a tab (used to find bookmark element for scrolling)
  const getItemKeyForTab = useCallback((tabId: number): string | null =>
  {
    return tabToItem.get(tabId) ?? null;
  }, [tabToItem]);


  const value = useMemo<BookmarkTabsContextValue>(() => ({
    openBookmarkTab,
    closeBookmarkTab,
    isBookmarkLoaded,
    isBookmarkAudible,
    isBookmarkActive,
    getTabIdForBookmark,
    getBookmarkLiveTitle,
    getBookmarkLiveUrl,
    isBookmarkDrifted,
    resetBookmarkTab,
    associateExistingTab,
    restoreItemAssociation,
    deassociateBookmarkTab,
    openPinnedTab,
    closePinnedTab,
    isPinnedLoaded,
    isPinnedAudible,
    isPinnedActive,
    getTabIdForPinned,
    getPinnedLiveTitle,
    getPinnedLiveUrl,
    getPinnedLiveFavIconUrl,
    isPinnedDrifted,
    isPinnedDomainDrifted,
    resetPinnedTab,
    deassociatePinnedTab,
    getActiveItemKey,
    getManagedTabIds,
    getItemKeyForTab,
    isInitialized,
    error,
  }), [
    openBookmarkTab,
    closeBookmarkTab,
    isBookmarkLoaded,
    isBookmarkAudible,
    isBookmarkActive,
    getTabIdForBookmark,
    getBookmarkLiveTitle,
    getBookmarkLiveUrl,
    isBookmarkDrifted,
    resetBookmarkTab,
    associateExistingTab,
    restoreItemAssociation,
    deassociateBookmarkTab,
    openPinnedTab,
    closePinnedTab,
    isPinnedLoaded,
    isPinnedAudible,
    isPinnedActive,
    getTabIdForPinned,
    getPinnedLiveTitle,
    getPinnedLiveUrl,
    getPinnedLiveFavIconUrl,
    isPinnedDrifted,
    isPinnedDomainDrifted,
    resetPinnedTab,
    deassociatePinnedTab,
    getActiveItemKey,
    getManagedTabIds,
    getItemKeyForTab,
    isInitialized,
    error,
  ]);

  return (
    <BookmarkTabsContext.Provider value={value}>
      {children}
    </BookmarkTabsContext.Provider>
  );
};
