import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { SIDEBAR_TAB_GROUP_NAME } from '../constants';

const TAB_GROUP_NAME = SIDEBAR_TAB_GROUP_NAME;
const STORAGE_KEY = 'tabAssociations';

// Helper to create item keys
const makeBookmarkKey = (bookmarkId: string) => `bookmark-${bookmarkId}`;
const makePinnedKey = (pinnedId: string) => `pinned-${pinnedId}`;

interface BookmarkTabsContextValue
{
  // Bookmark functions
  openBookmarkTab: (bookmarkId: string, url: string) => Promise<void>;
  closeBookmarkTab: (bookmarkId: string) => void;
  isBookmarkLoaded: (bookmarkId: string) => boolean;
  isBookmarkAudible: (bookmarkId: string) => boolean;
  isBookmarkActive: (bookmarkId: string) => boolean;
  getTabIdForBookmark: (bookmarkId: string) => number | undefined;
  associateExistingTab: (tabId: number, bookmarkId: string) => Promise<void>;
  // Pinned site functions
  openPinnedTab: (pinnedId: string, url: string) => Promise<void>;
  closePinnedTab: (pinnedId: string) => void;
  isPinnedLoaded: (pinnedId: string) => boolean;
  isPinnedAudible: (pinnedId: string) => boolean;
  isPinnedActive: (pinnedId: string) => boolean;
  getTabIdForPinned: (pinnedId: string) => number | undefined;
  // Active item tracking
  getActiveItemKey: () => string | null;
  // Common
  groupId: number | null;
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
  // In-memory mappings for fast lookup (key is "bookmark-{id}" or "pinned-{id}")
  const [itemToTab, setItemToTab] = useState<Map<string, number>>(new Map());
  const [tabToItem, setTabToItem] = useState<Map<number, string>>(new Map());
  const [audibleTabs, setAudibleTabs] = useState<Set<number>>(new Set());
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const isRebuilding = useRef(false);

  const handleError = useCallback((operation: string) =>
  {
    const err = chrome.runtime.lastError;
    if (err)
    {
      console.error(`BookmarkTabs ${operation} error:`, err.message);
      setError(err.message || `Failed to ${operation}`);
      return true;
    }
    setError(null);
    return false;
  }, []);

  // Find existing SideBarForArc group in current window
  const findExistingGroup = useCallback(async (): Promise<number | null> =>
  {
    return new Promise((resolve) =>
    {
      chrome.windows.getCurrent((window) =>
      {
        if (chrome.runtime.lastError)
        {
          resolve(null);
          return;
        }

        chrome.tabGroups.query({ windowId: window.id, title: TAB_GROUP_NAME }, (groups) =>
        {
          if (chrome.runtime.lastError || groups.length === 0)
          {
            resolve(null);
          }
          else
          {
            resolve(groups[0].id);
          }
        });
      });
    });
  }, []);

  // Rebuild associations from storage on init
  const rebuildAssociations = useCallback(async () =>
  {
    if (isRebuilding.current) return;
    isRebuilding.current = true;

    try
    {
      const window = await new Promise<chrome.windows.Window>((resolve, reject) =>
      {
        chrome.windows.getCurrent((w) =>
        {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(w);
        });
      });

      // Find the SideBarForArc group
      const groups = await new Promise<chrome.tabGroups.TabGroup[]>((resolve, reject) =>
      {
        chrome.tabGroups.query({ windowId: window.id, title: TAB_GROUP_NAME }, (g) =>
        {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(g);
        });
      });

      if (groups.length === 0)
      {
        setIsInitialized(true);
        isRebuilding.current = false;
        return;
      }

      const currentGroupId = groups[0].id;
      setGroupId(currentGroupId);

      // Get all tabs in the group
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) =>
      {
        chrome.tabs.query({ windowId: window.id, groupId: currentGroupId }, (t) =>
        {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(t);
        });
      });

      // Get stored associations from session storage
      const result = await chrome.storage.session.get(STORAGE_KEY);
      const associations: Record<number, string> = result[STORAGE_KEY] || {};

      const newItemToTab = new Map<string, number>();
      const newTabToItem = new Map<number, string>();

      for (const tab of tabs)
      {
        if (!tab.id) continue;

        const itemKey = associations[tab.id];
        if (itemKey)
        {
          newItemToTab.set(itemKey, tab.id);
          newTabToItem.set(tab.id, itemKey);
        }
      }

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

  // Initialize on mount
  useEffect(() =>
  {
    rebuildAssociations();
  }, [rebuildAssociations]);

  // Listen for tab removal
  useEffect(() =>
  {
    const handleTabRemoved = (tabId: number) =>
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

          // Clean up from session storage
          chrome.storage.session.get(STORAGE_KEY, (result) =>
          {
            const associations: Record<number, string> = result[STORAGE_KEY] || {};
            delete associations[tabId];
            chrome.storage.session.set({ [STORAGE_KEY]: associations });
          });

          const newMap = new Map(prev);
          newMap.delete(tabId);
          return newMap;
        }
        return prev;
      });
    };

    chrome.tabs?.onRemoved?.addListener(handleTabRemoved);

    return () =>
    {
      chrome.tabs?.onRemoved?.removeListener(handleTabRemoved);
    };
  }, []);

  // Listen for tab audible state changes
  useEffect(() =>
  {
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) =>
    {
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

  // Ungroup new tabs that Chrome auto-adds to SideBarForArc group (e.g., Cmd+T)
  useEffect(() =>
  {
    const handleGroupChange = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) =>
    {
      // Only care about groupId changes to our group
      if (changeInfo.groupId === undefined || changeInfo.groupId !== groupId)
      {
        return;
      }

      // Check if this tab has an association (created by us)
      chrome.storage.session.get(STORAGE_KEY, (result) =>
      {
        const associations: Record<number, string> = result[STORAGE_KEY] || {};
        if (!associations[tabId])
        {
          // Not created by us - ungroup it
          chrome.tabs.ungroup(tabId);
        }
      });
    };

    chrome.tabs?.onUpdated?.addListener(handleGroupChange);

    return () =>
    {
      chrome.tabs?.onUpdated?.removeListener(handleGroupChange);
    };
  }, [groupId]);

  // Store association in session storage
  const storeAssociation = useCallback((tabId: number, itemKey: string): Promise<void> =>
  {
    return new Promise((resolve) =>
    {
      chrome.storage.session.get(STORAGE_KEY, (result) =>
      {
        const associations: Record<number, string> = result[STORAGE_KEY] || {};
        associations[tabId] = itemKey;
        chrome.storage.session.set({ [STORAGE_KEY]: associations }, () =>
        {
          resolve();
        });
      });
    });
  }, []);

  // Create a new tab for an item - creates group if needed
  const createItemTab = useCallback(async (itemKey: string, url: string): Promise<void> =>
  {
    return new Promise(async (resolve) =>
    {
      try
      {
        // Check for existing group first
        let currentGroupId = groupId ?? await findExistingGroup();

        chrome.tabs.create({ url, active: true }, async (tab) =>
        {
          if (handleError('create') || !tab.id)
          {
            resolve();
            return;
          }

          const tabId = tab.id;

          // Store association immediately (before grouping) to prevent race condition
          // with onUpdated listener that ungroups tabs without associations
          await storeAssociation(tabId, itemKey);

          if (currentGroupId !== null)
          {
            // Add to existing group
            chrome.tabs.group({ tabIds: [tabId], groupId: currentGroupId }, async () =>
            {
              if (chrome.runtime.lastError)
              {
                // Group no longer exists - clear state and create new group
                setGroupId(null);

                chrome.tabs.group({ tabIds: [tabId] }, (newGroupId) =>
                {
                  if (handleError('create group after stale'))
                  {
                    resolve();
                    return;
                  }

                  chrome.tabGroups.update(newGroupId, {
                    title: TAB_GROUP_NAME,
                    color: 'cyan',
                    collapsed: false
                  }, async () =>
                  {
                    if (handleError('update group after stale'))
                    {
                      resolve();
                      return;
                    }

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
                    setGroupId(newGroupId);

                    resolve();
                  });
                });
                return;
              }

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
              setGroupId(currentGroupId!);

              resolve();
            });
          }
          else
          {
            // Create new group with this tab
            chrome.tabs.group({ tabIds: [tabId] }, (newGroupId) =>
            {
              if (handleError('create group'))
              {
                resolve();
                return;
              }

              // Update group properties
              chrome.tabGroups.update(newGroupId, {
                title: TAB_GROUP_NAME,
                color: 'cyan',
                collapsed: false
              }, async () =>
              {
                if (handleError('update group'))
                {
                  resolve();
                  return;
                }

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
                setGroupId(newGroupId);

                resolve();
              });
            });
          }
        });
      }
      catch (err)
      {
        console.error('Failed to create item tab:', err);
        resolve();
      }
    });
  }, [groupId, findExistingGroup, handleError, storeAssociation]);

  // Open a tab for an item (bookmark or pinned site)
  const openItemTab = useCallback(async (itemKey: string, url: string): Promise<void> =>
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
              resolve();
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
  const openBookmarkTab = useCallback(async (bookmarkId: string, url: string): Promise<void> =>
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

  // Associate an existing tab with a bookmark (for drag-drop from tabs to bookmarks)
  const associateExistingTab = useCallback(async (tabId: number, bookmarkId: string): Promise<void> =>
  {
    const itemKey = makeBookmarkKey(bookmarkId);

    return new Promise(async (resolve) =>
    {
      try
      {
        // Check for existing group first
        let currentGroupId = groupId ?? await findExistingGroup();

        // Store association first to prevent race condition with onUpdated listener
        await storeAssociation(tabId, itemKey);

        if (currentGroupId !== null)
        {
          // Add to existing group
          chrome.tabs.group({ tabIds: [tabId], groupId: currentGroupId }, async () =>
          {
            if (chrome.runtime.lastError)
            {
              // Group no longer exists - clear state and create new group
              setGroupId(null);

              chrome.tabs.group({ tabIds: [tabId] }, (newGroupId) =>
              {
                if (handleError('create group after stale'))
                {
                  resolve();
                  return;
                }

                chrome.tabGroups.update(newGroupId, {
                  title: TAB_GROUP_NAME,
                  color: 'cyan',
                  collapsed: false
                }, () =>
                {
                  if (handleError('update group after stale'))
                  {
                    resolve();
                    return;
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
                  setGroupId(newGroupId);

                  resolve();
                });
              });
              return;
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
            setGroupId(currentGroupId!);

            resolve();
          });
        }
        else
        {
          // Create new group with this tab
          chrome.tabs.group({ tabIds: [tabId] }, (newGroupId) =>
          {
            if (handleError('create group'))
            {
              resolve();
              return;
            }

            chrome.tabGroups.update(newGroupId, {
              title: TAB_GROUP_NAME,
              color: 'cyan',
              collapsed: false
            }, () =>
            {
              if (handleError('update group'))
              {
                resolve();
                return;
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
              setGroupId(newGroupId);

              resolve();
            });
          });
        }
      }
      catch (err)
      {
        console.error('Failed to associate existing tab:', err);
        resolve();
      }
    });
  }, [groupId, findExistingGroup, handleError, storeAssociation]);

  // --- Pinned site-specific wrappers ---
  const openPinnedTab = useCallback(async (pinnedId: string, url: string): Promise<void> =>
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

  const value: BookmarkTabsContextValue = {
    openBookmarkTab,
    closeBookmarkTab,
    isBookmarkLoaded,
    isBookmarkAudible,
    isBookmarkActive,
    getTabIdForBookmark,
    associateExistingTab,
    openPinnedTab,
    closePinnedTab,
    isPinnedLoaded,
    isPinnedAudible,
    isPinnedActive,
    getTabIdForPinned,
    getActiveItemKey,
    groupId,
    isInitialized,
    error,
  };

  return (
    <BookmarkTabsContext.Provider value={value}>
      {children}
    </BookmarkTabsContext.Provider>
  );
};
