import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore, ReactNode } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';
import { tabSpaceRegistryProxy } from '../managers/proxies/tabSpaceRegistryProxy';
import { spaceTabManagerProxy } from '../managers/proxies/spaceTabManagerProxy';
import { tabAssociationsProxy } from '../managers/proxies/tabAssociationsProxy';
import { TabAssociations } from '../managers/shared/tabAssociationsApi';
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

  // Sidebar-only state. None of it belongs to background: it is what this
  // panel has noticed about the tabs it is showing, keyed by tab id.
  const [audibleTabs, setAudibleTabs] = useState<Set<number>>(new Set());
  // Live title/url/favicon of managed tabs
  const [liveTabs, setLiveTabs] = useState<LiveTabInfoMap>(() => new LiveTabInfoMap());
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // The associations themselves are background's, mirrored here read-only -
  // TabAssociationManager is their single writer. This context asks for
  // changes through the proxy and finds out what happened by re-reading the
  // mirror, rather than keeping its own copy in useState and hand-patching it
  // from six different call sites.
  const associations = useSyncExternalStore(
    tabAssociationsProxy.store.subscribe,
    tabAssociationsProxy.store.getSnapshot
  );

  // The two lookup directions every consumer below wants, derived from the one
  // mirrored map so they cannot disagree with it or with each other.
  const { itemToTab, tabToItem } = useMemo(() =>
  {
    const itemToTab = new Map<string, number>();
    const tabToItem = new Map<number, string>();

    // Tab ids come back as strings once the map has been through JSON
    for (const [id, itemKey] of Object.entries(associations))
    {
      const tabId = Number(id);
      itemToTab.set(itemKey, tabId);
      tabToItem.set(tabId, itemKey);
    }

    return { itemToTab, tabToItem };
  }, [associations]);

  // Read by the onUpdated listener, which registers once and must not be torn
  // down and rebuilt every time the mirror changes.
  const tabToItemRef = useRef(tabToItem);
  useEffect(() =>
  {
    tabToItemRef.current = tabToItem;
  }, [tabToItem]);

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

  // Seed live tab info/audible state from the tabs that are already open, so
  // drift detection and tooltips work immediately on sidebar reopen -
  // chrome.tabs.onUpdated only fires on future changes, so without this the
  // maps stay empty until navigation.
  const seedLiveTabState = async (windowId: number, current: TabAssociations): Promise<void> =>
  {
    const tabs = await chrome.tabs.query({ windowId });

    let live = new LiveTabInfoMap();
    const audible = new Set<number>();

    // Only tracked tabs matter here - the rest are never looked up by tab id
    for (const tab of tabs)
    {
      if (tab.id === undefined || current[tab.id] === undefined) continue;
      live = live.withTab(tab.id, tab);
      if (tab.audible) audible.add(tab.id);
    }

    setLiveTabs(live);
    setAudibleTabs(audible);
  };

  // Bind the mirror to this window and fill it. mirrorWindow reconciles first,
  // so anything that went stale while the sidebar was closed (a tab closed, or
  // dragged into another window) is already gone from what comes back -
  // background validates against its own map rather than this context reading
  // a snapshot, walking a slow loop and writing it back over whatever changed
  // underneath.
  useEffect(() =>
  {
    if (currentWindowId === null) return;

    let cancelled = false;

    tabAssociationsProxy.mirrorWindow(currentWindowId)
      .then(async (current) =>
      {
        if (cancelled) return;
        await seedLiveTabState(currentWindowId, current);
        if (!cancelled) setIsInitialized(true);
      })
      .catch((err) =>
      {
        console.error('Failed to mirror tab associations:', err);
        if (!cancelled) setIsInitialized(true);
      });

    return () =>
    {
      cancelled = true;
    };
  }, [currentWindowId]);

  // Drop what this panel remembered about tabs that have left the mirror.
  // Background removes an association for all sorts of reasons now - the tab
  // closed, it was dragged to another window or another space's group, a
  // reconcile found it gone - and none of them come through a call site here
  // that could clean up after itself, so the cleanup watches the mirror
  // instead.
  useEffect(() =>
  {
    setLiveTabs((prev) => prev.withOnlyTabs(tabId => tabToItem.has(tabId)));

    setAudibleTabs((prev) =>
    {
      const stale = [...prev].filter(tabId => !tabToItem.has(tabId));
      if (stale.length === 0) return prev;

      const next = new Set(prev);
      for (const tabId of stale) next.delete(tabId);
      return next;
    });
  }, [tabToItem]);

  // Fill in live info and audible state for tabs that newly joined the
  // mirror. The cleanup above drops both as soon as a tab leaves the map, and
  // Chrome only reports changes, so a tab that comes back (a stale broadcast
  // followed by the real one, T.3) or one that was already playing when it
  // got its bookmark (T.1) would otherwise stay without them until the tab
  // navigates or its audio stops and starts. Call sites that seed a tab
  // themselves still do; this covers every way a tab can join, including
  // ones no call site here knows about.
  const seededTabIdsRef = useRef<Set<number>>(new Set());
  useEffect(() =>
  {
    const joined = [...tabToItem.keys()].filter(tabId => !seededTabIdsRef.current.has(tabId));
    seededTabIdsRef.current = new Set(tabToItem.keys());
    if (joined.length === 0) return;

    // Read each joined tab once and record what Chrome says about it now
    for (const tabId of joined)
    {
      chrome.tabs.get(tabId, (tab) =>
      {
        if (chrome.runtime.lastError || !tab) return;

        // The tab may have left the map again while this read was in flight
        if (!tabToItemRef.current.has(tabId)) return;

        // Keep whatever a call site or onUpdated already recorded, which is at
        // least as fresh as this read
        setLiveTabs((prev) => prev.get(tabId) ? prev : prev.withTab(tabId, tab));

        setAudibleTabs((prev) =>
        {
          if (prev.has(tabId) === !!tab.audible) return prev;

          const next = new Set(prev);
          if (tab.audible) next.add(tabId);
          else next.delete(tabId);
          return next;
        });
      });
    }
  }, [tabToItem]);

  // Break one tab's association. Background does the work and broadcasts the
  // result, so there is nothing to update here - the mirror already shows the
  // change by the time this returns.
  const deassociateTab = useCallback((tabId: number): void =>
  {
    if (currentWindowId === null) return;

    tabAssociationsProxy.deassociate(currentWindowId, tabId).catch((err) =>
    {
      console.error('Failed to deassociate tab:', err);
    });
  }, [currentWindowId]);

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
      if (tabToItemRef.current.has(tabId))
      {
        setLiveTabs((prev) => prev.withChanges(tabId, changeInfo));
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

  // Store association in session storage and local backup, as one call.
  // tabUrl and tabIndex can be passed directly (e.g. from tab creation callback) to avoid
  // the manager having to look the tab up for the backup entry; left out, it looks them
  // up itself rather than every caller remembering to.
  const storeAssociation = useCallback(async (
    tabId: number,
    itemKey: string,
    tabUrl?: string,
    tabIndex?: number
  ): Promise<void> =>
  {
    if (currentWindowId === null) return;

    await tabAssociationsProxy.associate(currentWindowId, tabId, itemKey, tabUrl, tabIndex);
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

        // Store association (pass url+index so the backup entry needs no extra lookup).
        // A rejection here would otherwise escape this callback and leave the
        // promise above unresolved forever (T.2). The tab is open either way,
        // so on failure it stays a regular tab and its id is still returned.
        const createdUrl = tab.url ?? url;
        let associated = true;
        try
        {
          await storeAssociation(tabId, itemKey, createdUrl, tab.index);
        }
        catch (err)
        {
          console.error('Failed to associate new tab:', err);
          associated = false;
        }

        // Only a tab that now stands in for its item gets live info and a space
        if (associated)
        {
          // Seed live info now - onUpdated events that fired before the mirror
          // knew this tab was managed were dropped
          setLiveTabs((prev) => prev.withTab(tabId, { ...tab, url: createdUrl }));

          // Register space with background for bookmark tabs
          if (spaceId && windowId)
          {
            tabSpaceRegistryProxy.register(windowId, tabId, spaceId);
          }
        }

        // Tell background to re-check this tab (will group into space if active)
        if (windowId)
        {
          spaceTabManagerProxy.requestGrouping(windowId, tabId).catch((err) =>
          {
            console.error('Failed to request grouping:', err);
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
  // AGENTS.md "Design Assumptions"). Mirrors createItemTab's registration +
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

      spaceTabManagerProxy.assignTabToSpace(currentWindowId, tabId, spaceId).catch((err) =>
      {
        console.error('Failed to assign tab to space:', err);
      });
    }

    // Seed live info for the newly managed tab
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

    // Seed live info for the newly managed tab
    chrome.tabs.get(tabId, (tab) =>
    {
      if (chrome.runtime.lastError || !tab) return;
      setLiveTabs((prev) => prev.withTab(tabId, tab));
    });
  }, [storeAssociation]);

  // Deassociate a bookmark from its tab (tab stays alive, bookmark becomes unloaded)
  const deassociateBookmarkTab = useCallback((bookmarkId: string): void =>
  {
    const tabId = itemToTab.get(makeBookmarkKey(bookmarkId));
    if (tabId !== undefined)
    {
      deassociateTab(tabId);
    }
  }, [itemToTab, deassociateTab]);

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
  // Awaits the deassociate before queueing grouping: the manager has removed the
  // entry from the in-memory map background's isPinnedManagedTab reads by the time
  // the call returns, so grouping no longer sees this tab as pin-managed and will
  // group it into the active space instead of leaving it ungrouped.
  const deassociatePinnedTab = useCallback(async (pinnedId: string): Promise<void> =>
  {
    if (currentWindowId === null) return;
    const tabId = itemToTab.get(makePinnedKey(pinnedId));
    if (tabId !== undefined)
    {
      await tabAssociationsProxy.deassociate(currentWindowId, tabId);
      spaceTabManagerProxy.requestGrouping(currentWindowId, tabId).catch((err) =>
      {
        console.error('Failed to request grouping:', err);
      });
    }
  }, [itemToTab, currentWindowId]);

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
