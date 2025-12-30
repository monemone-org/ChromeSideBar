import { useState, useEffect, useCallback } from 'react';

export interface PinnedSite {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  order: number;
  tabId?: number;  // Remembered tab ID (may be stale if tab was closed)
  customIconName?: string;  // Lucide icon name when using custom icon
  iconColor?: string;       // Custom icon color (hex, e.g., "#ef4444")
}

const STORAGE_KEY = 'pinnedSites';

const generateId = (): string => {
  return `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Get favicon URL using Chrome's internal favicon cache
const getFaviconUrl = (pageUrl: string): string => {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
};

// Fetch favicon and convert to base64 for storage
const fetchFaviconAsBase64 = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
};

export const usePinnedSites = () => {
  const [pinnedSites, setPinnedSites] = useState<PinnedSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((operation: string) => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.error(`PinnedSites ${operation} error:`, err.message);
      setError(err.message || `Failed to ${operation}`);
      return true;
    }
    setError(null);
    return false;
  }, []);

  const loadPinnedSites = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (!handleError('load')) {
          const sites = result[STORAGE_KEY] || [];
          setPinnedSites(sites.sort((a: PinnedSite, b: PinnedSite) => a.order - b.order));
        }
      });
    }
  }, [handleError]);

  const savePinnedSites = useCallback((sites: PinnedSite[]) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ [STORAGE_KEY]: sites }, () => {
        handleError('save');
      });
    }
  }, [handleError]);

  useEffect(() => {
    loadPinnedSites();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEY]) {
        const sites = changes[STORAGE_KEY].newValue || [];
        setPinnedSites(sites.sort((a: PinnedSite, b: PinnedSite) => a.order - b.order));
      }
    };

    chrome.storage?.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage?.onChanged.removeListener(handleStorageChange);
    };
  }, [loadPinnedSites]);

  const compactOrders = (sites: PinnedSite[]): PinnedSite[] => {
    // Just assign order based on current array position, don't sort
    return sites.map((site, index) => ({ ...site, order: index }));
  };

  const addPin = useCallback(async (
    url: string,
    title: string,
    faviconUrl?: string
  ) => {
    // Prefer Chrome's _favicon API (most reliable), fallback to provided faviconUrl
    const chromeFaviconUrl = getFaviconUrl(url);
    let favicon = await fetchFaviconAsBase64(chromeFaviconUrl);

    // If Chrome's cache failed and we have an alternative URL, try that
    if (!favicon && faviconUrl) {
      favicon = await fetchFaviconAsBase64(faviconUrl);
    }

    const newPin: PinnedSite = {
      id: generateId(),
      url,
      title,
      favicon,
      order: pinnedSites.length,
    };

    const updatedSites = [...pinnedSites, newPin];
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  const removePin = useCallback((id: string) => {
    const updatedSites = compactOrders(pinnedSites.filter(s => s.id !== id));
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  const updatePin = useCallback((
    id: string,
    title: string,
    url: string,
    favicon?: string,
    customIconName?: string,
    iconColor?: string
  ) => {
    const updatedSites = pinnedSites.map(site =>
      site.id === id ? {
        ...site,
        title,
        url,
        ...(favicon !== undefined && { favicon }),
        customIconName,
        iconColor: customIconName ? iconColor : undefined,
      } : site
    );
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  // Reset favicon to the original site icon
  const resetFavicon = useCallback(async (id: string) => {
    const site = pinnedSites.find(s => s.id === id);
    if (!site) return;

    const chromeFaviconUrl = getFaviconUrl(site.url);
    const favicon = await fetchFaviconAsBase64(chromeFaviconUrl);

    const updatedSites = pinnedSites.map(s =>
      s.id === id ? {
        ...s,
        favicon,
        customIconName: undefined,
        iconColor: undefined,
      } : s
    );
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  // Update stored tabId when a new tab is created for a pinned site
  const updateTabId = useCallback((id: string, newTabId: number) => {
    const updatedSites = pinnedSites.map(site =>
      site.id === id ? { ...site, tabId: newTabId } : site
    );
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  // Open pinned site: activate existing tab if it exists, otherwise create new pinned tab
  const openAsPinnedTab = useCallback((site: PinnedSite) => {
    if (site.tabId) {
      // Check if the tab still exists
      chrome.tabs.get(site.tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          // Tab doesn't exist - create new pinned tab and remember tabId
          chrome.tabs.create({ url: site.url, pinned: true }, (newTab) => {
            if (newTab?.id) {
              updateTabId(site.id, newTab.id);
            }
          });
        } else {
          // Tab exists - activate it
          chrome.tabs.update(site.tabId!, { active: true });
        }
      });
    } else {
      // No tabId stored - create new pinned tab and remember tabId
      chrome.tabs.create({ url: site.url, pinned: true }, (newTab) => {
        if (newTab?.id) {
          updateTabId(site.id, newTab.id);
        }
      });
    }
  }, [updateTabId]);

  const movePin = useCallback((activeId: string, overId: string) => {
    const oldIndex = pinnedSites.findIndex(s => s.id === activeId);
    const newIndex = pinnedSites.findIndex(s => s.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const updatedSites = [...pinnedSites];
    const [removed] = updatedSites.splice(oldIndex, 1);
    updatedSites.splice(newIndex, 0, removed);

    const compacted = compactOrders(updatedSites);
    setPinnedSites(compacted);
    savePinnedSites(compacted);
  }, [pinnedSites, savePinnedSites]);

  const exportPinnedSites = useCallback(() => {
    const data = JSON.stringify(pinnedSites, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pinned-sites.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [pinnedSites]);

  const importPinnedSites = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as PinnedSite[];
        // Regenerate IDs and reorder
        const sites = imported.map((site, index) => ({
          ...site,
          id: generateId(),
          order: index,
        }));
        setPinnedSites(sites);
        savePinnedSites(sites);
      } catch {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }, [savePinnedSites]);

  // Replace all pinned sites (for full backup import)
  const replacePinnedSites = useCallback((sites: PinnedSite[]) => {
    const reordered = sites.map((site, index) => ({
      ...site,
      id: generateId(),
      order: index,
    }));
    setPinnedSites(reordered);
    savePinnedSites(reordered);
  }, [savePinnedSites]);

  return {
    pinnedSites,
    addPin,
    removePin,
    updatePin,
    resetFavicon,
    openAsPinnedTab,
    movePin,
    exportPinnedSites,
    importPinnedSites,
    replacePinnedSites,
    refresh: loadPinnedSites,
    error,
  };
};
