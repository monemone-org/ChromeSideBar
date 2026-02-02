import { useState, useEffect, useCallback } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';
import { getFaviconUrl, fetchFaviconAsBase64 } from '../utils/favicon';

// Re-export so existing importers (e.g. PinnedIcon) don't break
export { getFaviconUrl, fetchFaviconAsBase64 } from '../utils/favicon';

export interface PinnedSite {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  customIconName?: string;  // Lucide icon name when using custom icon
  iconColor?: string;       // Custom icon color (hex, e.g., "#ef4444")
}

const STORAGE_KEY = 'pinnedSites';

const generateId = (): string => {
  return `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const usePinnedSites = () => {
  const [pinnedSites, setPinnedSites] = useState<PinnedSite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    createChromeErrorHandler('PinnedSites', setError),
    []
  );

  const loadPinnedSites = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (!handleError('load')) {
          setPinnedSites(result[STORAGE_KEY] || []);
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

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEY]) {
        setPinnedSites(changes[STORAGE_KEY].newValue || []);
      }
    };

    chrome.storage?.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage?.onChanged.removeListener(handleStorageChange);
    };
  }, [loadPinnedSites]);

  const addPin = useCallback(async (
    url: string,
    title: string,
    faviconUrl?: string,
    atIndex?: number
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
    };

    // Use functional update to avoid stale closure when called multiple times
    setPinnedSites(current => {
      let updatedSites: PinnedSite[];
      if (atIndex !== undefined && atIndex >= 0 && atIndex < current.length) {
        // Insert at specific position
        updatedSites = [
          ...current.slice(0, atIndex),
          newPin,
          ...current.slice(atIndex),
        ];
      } else {
        // Append to end
        updatedSites = [...current, newPin];
      }
      savePinnedSites(updatedSites);
      return updatedSites;
    });
  }, [savePinnedSites]);

  // Add multiple pins at once (handles favicon fetching for each)
  const addPins = useCallback(async (
    pins: Array<{ url: string; title: string; faviconUrl?: string }>
  ) => {
    // Fetch all favicons in parallel
    const newPins: PinnedSite[] = await Promise.all(
      pins.map(async ({ url, title, faviconUrl }) => {
        const chromeFaviconUrl = getFaviconUrl(url);
        let favicon = await fetchFaviconAsBase64(chromeFaviconUrl);

        if (!favicon && faviconUrl)
        {
          favicon = await fetchFaviconAsBase64(faviconUrl);
        }

        return {
          id: generateId(),
          url,
          title,
          favicon,
        };
      })
    );

    setPinnedSites(current => {
      const combined = [...current, ...newPins];
      savePinnedSites(combined);
      return combined;
    });
  }, [savePinnedSites]);

  const removePin = useCallback((id: string) => {
    const updatedSites = pinnedSites.filter(s => s.id !== id);
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

  const movePin = useCallback((
    activeId: string,
    overId: string,
    position: 'before' | 'after' = 'before'
  ) => {
    const oldIndex = pinnedSites.findIndex(s => s.id === activeId);
    const overIndex = pinnedSites.findIndex(s => s.id === overId);

    if (oldIndex === -1 || overIndex === -1 || oldIndex === overIndex) return;

    // Calculate target position in original array
    let targetIndex = position === 'after' ? overIndex + 1 : overIndex;

    // Adjust for the removal: if we're moving from before the target,
    // the target shifts down by 1 after removal
    if (oldIndex < targetIndex) {
      targetIndex -= 1;
    }

    if (oldIndex === targetIndex) return;

    const updatedSites = [...pinnedSites];
    const [removed] = updatedSites.splice(oldIndex, 1);
    updatedSites.splice(targetIndex, 0, removed);

    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  const duplicatePin = useCallback((id: string) => {
    const index = pinnedSites.findIndex(s => s.id === id);
    if (index === -1) return;

    const original = pinnedSites[index];
    const duplicate: PinnedSite = {
      ...original,
      id: generateId(),
    };

    const updatedSites = [...pinnedSites];
    updatedSites.splice(index + 1, 0, duplicate);

    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  // Replace all pinned sites (for full backup import)
  const replacePinnedSites = useCallback((sites: PinnedSite[]) => {
    const newSites = sites.map(site => ({
      ...site,
      id: generateId(),
    }));
    setPinnedSites(newSites);
    savePinnedSites(newSites);
  }, [savePinnedSites]);

  // Append pinned sites to existing ones (for full backup import)
  const appendPinnedSites = useCallback((sites: PinnedSite[]) => {
    setPinnedSites(current => {
      const newSites = sites.map(site => ({
        ...site,
        id: generateId(),
      }));
      const combined = [...current, ...newSites];
      savePinnedSites(combined);
      return combined;
    });
  }, [savePinnedSites]);

  return {
    pinnedSites,
    addPin,
    addPins,
    removePin,
    updatePin,
    resetFavicon,
    movePin,
    duplicatePin,
    replacePinnedSites,
    appendPinnedSites,
    refresh: loadPinnedSites,
    error,
  };
};
