import { useState, useEffect, useCallback, useRef } from 'react';
import { createChromeErrorHandler } from '../utils/chromeError';
import { getFaviconUrl, fetchFaviconAsBase64 } from '../utils/favicon';
import { iconToDataUrl } from '../utils/iconify';

// Re-export so existing importers (e.g. PinnedIcon) don't break
export { getFaviconUrl, fetchFaviconAsBase64 } from '../utils/favicon';

export interface PinnedSite {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  customIconName?: string;  // Lucide icon name when using custom icon
  iconColor?: string;       // Custom icon color (hex, e.g., "#ef4444")
  emoji?: string;           // Emoji character (e.g., "😀")
}

const STORAGE_KEY = 'pinnedSites';

const generateId = (): string => {
  return `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Favicon loading strategy: see docs/favicon-loading-strategy.md

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

  // Lazy-resolve missing favicons (Scenario 3, 4 above).
  // Runs after import (Arc or our own JSON with missing favicons) and on extension load.
  // - customIconName with no favicon → resolves via Iconify CDN (always works)
  // - no icon/emoji/favicon → tries Chrome's _favicon cache (only works after page visited)
  // Saves back to storage on success so it only runs once per site.
  const isResolvingRef = useRef(false);
  useEffect(() => {
    if (isResolvingRef.current) return;

    const needsCustomIcon = pinnedSites.filter(
      site => site.customIconName && !site.favicon && !site.emoji
    );
    const needsSiteFavicon = pinnedSites.filter(
      site => !site.customIconName && !site.emoji && !site.favicon && site.url
    );

    if (needsCustomIcon.length === 0 && needsSiteFavicon.length === 0)
    {
      // if (import.meta.env.DEV)
      // {
      //   console.log('[PinnedSites] render — no unresolved icons');
      // }
      return;
    }

    // if (import.meta.env.DEV)
    // {
    //   if (needsCustomIcon.length > 0)
    //   {
    //     console.log(`[PinnedSites] resolving ${needsCustomIcon.length} custom icon(s):`,
    //       needsCustomIcon.map(s => `"${s.title}" (${s.customIconName})`));
    //   }
    //   if (needsSiteFavicon.length > 0)
    //   {
    //     console.log(`[PinnedSites] resolving ${needsSiteFavicon.length} site favicon(s):`,
    //       needsSiteFavicon.map(s => `"${s.title}" (${s.url})`));
    //   }
    // }

    isResolvingRef.current = true;

    (async () => {
      try
      {
        const resolvedMap = new Map<string, string>();

        // Resolve custom icons
        await Promise.all(
          needsCustomIcon.map(async (site) => {
            const dataUrl = await iconToDataUrl(site.customIconName!, site.iconColor);
            if (dataUrl) resolvedMap.set(site.id, dataUrl);
          })
        );

        // Resolve site favicons
        await Promise.all(
          needsSiteFavicon.map(async (site) => {
            const chromeFaviconUrl = getFaviconUrl(site.url);
            let favicon = await fetchFaviconAsBase64(chromeFaviconUrl);
            // if (!favicon)
            // {
            //   try
            //   {
            //     const origin = new URL(site.url).origin;
            //     favicon = await fetchFaviconAsBase64(`${origin}/favicon.ico`);
            //   }
            //   catch { /* ignore invalid URLs */ }
            // }
            // // Fallback: Google's favicon service (works for public sites without visiting)
            // if (!favicon)
            // {
            //   try
            //   {
            //     const domain = new URL(site.url).hostname;
            //     favicon = await fetchFaviconAsBase64(
            //       `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
            //     );
            //   }
            //   catch { /* ignore invalid URLs */ }
            // }
            if (favicon)
            {
              resolvedMap.set(site.id, favicon);
            }
          })
        );

        if (resolvedMap.size === 0)
        {
          // if (import.meta.env.DEV)
          // {
          //   console.log('[PinnedSites] no icons could be resolved');
          // }
          return;
        }

        // if (import.meta.env.DEV)
        // {
        //   console.log(`[PinnedSites] resolved ${resolvedMap.size} icon(s), saving back`);
        // }

        // Re-read fresh state before writing back to avoid overwriting concurrent changes
        // (e.g. user adds/removes a pin, or background.ts updates a favicon while we were fetching)
        const fresh = await new Promise<PinnedSite[]>(resolve =>
          chrome.storage.local.get([STORAGE_KEY], result =>
            resolve(result[STORAGE_KEY] || [])
          )
        );
        const patchedSites = fresh.map(site =>
          resolvedMap.has(site.id) ? { ...site, favicon: resolvedMap.get(site.id) } : site
        );
        setPinnedSites(patchedSites);
        savePinnedSites(patchedSites);
      }
      finally
      {
        isResolvingRef.current = false;
      }
    })();
  }, [pinnedSites, savePinnedSites]);

  // Scenario 1a: pin a single tab. Tab is open so Chrome's favicon cache is hot.
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

  // Scenario 1b: pin multiple tabs at once (e.g. drag a URL group). Same as addPin.
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
    iconColor?: string,
    emoji?: string
  ) => {
    const updatedSites = pinnedSites.map(site =>
      site.id === id ? {
        ...site,
        title,
        url,
        ...(favicon !== undefined && { favicon }),
        // emoji and customIconName are mutually exclusive
        customIconName: emoji ? undefined : customIconName,
        iconColor: emoji ? undefined : (customIconName ? iconColor : undefined),
        emoji: customIconName ? undefined : emoji,
      } : site
    );
    setPinnedSites(updatedSites);
    savePinnedSites(updatedSites);
  }, [pinnedSites, savePinnedSites]);

  // Scenario 6: user explicitly resets to site favicon via "Reset to site icon".
  // Only works if Chrome has the page cached (site visited at least once).
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
        emoji: undefined,
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

  // Scenario 2a: replace all pins from our own JSON backup.
  // favicon is already embedded as base64 in the backup — no fetch needed.
  // Sites with missing favicon (old backups) are handled by the lazy-resolve effect.
  const replacePinnedSites = useCallback((sites: PinnedSite[]) => {
    const newSites = sites.map(site => ({
      ...site,
      id: generateId(),
    }));
    setPinnedSites(newSites);
    savePinnedSites(newSites);
  }, [savePinnedSites]);

  // Scenario 2b / 3: append pins from our own JSON backup or Arc import.
  // Same as replacePinnedSites — favicon already in backup, or lazy-resolve handles it.
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
