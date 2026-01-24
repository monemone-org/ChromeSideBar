import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';
import {
  getTabAssociations,
  storeTabAssociation,
  removeTabAssociation as removeStoredAssociation,
  setTabAssociations,
} from '../utils/tabAssociations';

// Helper to create item keys
const makeBookmarkKey = (bookmarkId: string) => `bookmark-${bookmarkId}`;
const makePinnedKey = (pinnedId: string) => `pinned-${pinnedId}`;

interface BookmarkTabsContextValue
{
  // Bookmark functions
  openBookmarkTab: (bookmarkId: string, url: string) => Promise<number | undefined>;
  closeBookmarkTab: (bookmarkId: string) => void;
  isBookmarkLoaded: (bookmarkId: string) => boolean;
  isBookmarkAudible: (bookmarkId: string) => boolean;
  isBookmarkActive: (bookmarkId: string) => boolean;
  getTabIdForBookmark: (bookmarkId: string) => number | undefined;
  getBookmarkLiveTitle: (bookmarkId: string) => string | undefined;
  associateExistingTab: (tabId: number, bookmarkId: string) => Promise<void>;
  // Pinned site functions
  openPinnedTab: (pinnedId: string, url: string) => Promise<number | undefined>;
  closePinnedTab: (pinnedId: string) => void;
  isPinnedLoaded: (pinnedId: string) => boolean;
  isPinnedAudible: (pinnedId: string) => boolean;
  isPinnedActive: (pinnedId: string) => boolean;
  getTabIdForPinned: (pinnedId: string) => number | undefined;
  getPinnedLiveTitle: (pinnedId: string) => string | undefined;
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
  const [tabTitles, setTabTitles] = useState<Map<number, string>>(new Map());
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
      setIsInitialized(true);
    }
    catch (err)
    {
      console.error('Failed to rebuild associations:', err);
      setError('Failed to rebuild associations');
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

        // Clean up title
        setTabTitles((prevTitles) =>
        {
          const newMap = new Map(prevTitles);
          newMap.delete(tabId);
          return newMap;
        });

        // Clean up from session storage
        removeStoredAssociation(windowId, tabId);

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

  // Listen for tab audible and title changes
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

      // Track title changes for managed tabs only
      if (changeInfo.title !== undefined)
      {
        setTabToItem((prev) =>
        {
          // Only track title if this is a managed tab
          if (prev.has(tabId))
          {
            setTabTitles((prevTitles) =>
            {
              const newMap = new Map(prevTitles);
              newMap.set(tabId, changeInfo.title!);
              return newMap;
            });
          }
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

  // Store association in session storage (wrapper around shared utility)
  const storeAssociation = useCallback(async (tabId: number, itemKey: string): Promise<void> =>
  {
    if (currentWindowId === null)
    {
      return;
    }
    await storeTabAssociation(currentWindowId, tabId, itemKey);
  }, [currentWindowId]);

  // Create a new tab for an item (no grouping)
  // Returns the created tab ID, or undefined if creation failed
  const createItemTab = useCallback(async (itemKey: string, url: string): Promise<number | undefined> =>
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

        // Store association
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

        // Tell background to re-check this tab (will ungroup if it was grouped)
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
  const openItemTab = useCallback(async (itemKey: string, url: string): Promise<number | undefined> =>
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
            createItemTab(itemKey, url).then(resolve);
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
      return createItemTab(itemKey, url);
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
  const openBookmarkTab = useCallback(async (bookmarkId: string, url: string): Promise<number | undefined> =>
  {
    return openItemTab(makeBookmarkKey(bookmarkId), url);
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
    return tabId !== undefined ? tabTitles.get(tabId) : undefined;
  }, [itemToTab, tabTitles]);

  // Associate an existing tab with a bookmark (for drag-drop from tabs to bookmarks)
  const associateExistingTab = useCallback(async (tabId: number, bookmarkId: string): Promise<void> =>
  {
    const itemKey = makeBookmarkKey(bookmarkId);

    // Store association
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
  }, [storeAssociation]);

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
    return tabId !== undefined ? tabTitles.get(tabId) : undefined;
  }, [itemToTab, tabTitles]);

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
    associateExistingTab,
    openPinnedTab,
    closePinnedTab,
    isPinnedLoaded,
    isPinnedAudible,
    isPinnedActive,
    getTabIdForPinned,
    getPinnedLiveTitle,
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
    associateExistingTab,
    openPinnedTab,
    closePinnedTab,
    isPinnedLoaded,
    isPinnedAudible,
    isPinnedActive,
    getTabIdForPinned,
    getPinnedLiveTitle,
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
