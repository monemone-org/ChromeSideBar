import { useState, useEffect, useCallback } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';

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

// Get favicon URL using Chrome's internal favicon cache
export const getFaviconUrl = (pageUrl: string): string => {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
};

// Fetch favicon and convert to base64 for storage
export const fetchFaviconAsBase64 = async (url: string): Promise<string | undefined> => {
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

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
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
    };

    const updatedSites = [...pinnedSites, newPin];
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

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

  const movePin = useCallback((activeId: string, overId: string) => {
    const oldIndex = pinnedSites.findIndex(s => s.id === activeId);
    const newIndex = pinnedSites.findIndex(s => s.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const updatedSites = [...pinnedSites];
    const [removed] = updatedSites.splice(oldIndex, 1);
    updatedSites.splice(newIndex, 0, removed);

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
