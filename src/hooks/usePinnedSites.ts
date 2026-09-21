import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { getFaviconUrl, fetchFaviconAsBase64 } from '../utils/favicon';
import { iconToDataUrl } from '../utils/iconify';
import { pinnedSitesManagerProxy } from '../managers/proxies/pinnedSitesManagerProxy';
import { PinnedSite, PinnedSiteFaviconPatch } from '../managers/shared/pinnedSitesApi';

// Re-export so existing importers (e.g. PinnedIcon) don't break
export { getFaviconUrl, fetchFaviconAsBase64 } from '../utils/favicon';

// The pin type and its storage key now live with the manager contract, since
// background.ts owns the list and must not import this React module. Re-exported
// here because most of the UI imports them from the hook.
export type { PinnedSite } from '../managers/shared/pinnedSitesApi';
export { PINNED_SITES_STORAGE_KEY } from '../managers/shared/pinnedSitesApi';

const generateId = (): string => {
  return `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Favicon loading strategy: see docs/favicon-loading-strategy.md

export const usePinnedSites = () => {
  // The list is mirrored by pinnedSitesManagerProxy, outside React state, so a
  // mutation is visible to the next line that reads it rather than only after
  // a re-render. See docs/decisions/2026-07-30-shared-storage-multiple-writers.md,
  // section 5.
  const pinnedSites = useSyncExternalStore(
    pinnedSitesManagerProxy.store.subscribe,
    pinnedSitesManagerProxy.store.getSnapshot
  );
  const [error, setError] = useState<string | null>(null);

  // Mutations go to background and can fail if the service worker is gone.
  // One place to turn that into the error state this hook has always exposed.
  const reportFailure = useCallback((context: string, err: unknown) =>
  {
    console.error(`[PinnedSites] ${context} failed:`, err);
    setError(String(err));
  }, []);

  const loadPinnedSites = useCallback(() => {
    pinnedSitesManagerProxy.load().catch(err => reportFailure('load', err));
  }, [reportFailure]);

  useEffect(() => {
    loadPinnedSites();
  }, [loadPinnedSites]);

  // Lazy-resolve missing favicons (Scenario 3, 4 above).
  // Runs after import (Arc or our own JSON with missing favicons) and on extension load.
  // - customIconName with no favicon → resolves via Iconify CDN (always works)
  // - no icon/emoji/favicon → tries Chrome's _favicon cache (only works after page visited)
  // Saves back through the manager on success so it only runs once per site.
  // True while a pass is fetching. Without it, every list change would start a
  // second pass on top of the first and re-fetch the same icons.
  const isResolvingRef = useRef(false);

  // Set when a list change arrives while a pass is in flight, so the pass can
  // run once more on the way out instead of that change being dropped.
  //
  // Dropping it is not harmless: a pass whose fetches all come back empty (a
  // pin on a site Chrome has never cached, which is every pin until it is
  // visited) writes nothing, so no re-render follows to pick the work back
  // up, and the icon stays unresolved until something else happens to change
  // the list. See "2026-07-30-shared-storage-multiple-writers progress/
  // step-5-usePinnedSites-icon-resolver-skip.md".
  const resolveRequestedRef = useRef(false);

  // Explicitly typed because the body refers to itself for the retry below,
  // which TypeScript cannot infer a type for on its own.
  const runResolvePass: (sites: readonly PinnedSite[]) => Promise<void> = useCallback(async (sites: readonly PinnedSite[]): Promise<void> =>
  {
    const needsCustomIcon = sites.filter(
      site => site.customIconName && !site.favicon && !site.emoji
    );
    const needsSiteFavicon = sites.filter(
      site => !site.customIconName && !site.emoji && !site.favicon && site.url
    );

    // These traces are what identified the dropped-request bug above, and are
    // the first thing to look at if an icon fails to appear again: they
    // separate "no pass ran", "a pass ran but found nothing to do" and "a pass
    // resolved an icon but the write was dropped".
    if (import.meta.env.DEV)
    {
      console.log(`[PinnedSites] resolve pass: ${sites.length} pins, `
        + `${needsCustomIcon.length} need a custom icon [${needsCustomIcon.map(s => `${s.title}/${s.customIconName}`).join(', ')}], `
        + `${needsSiteFavicon.length} need a site favicon`);
    }

    if (needsCustomIcon.length === 0 && needsSiteFavicon.length === 0)
    {
      return;
    }

    isResolvingRef.current = true;

    try
    {
      // Each patch records what it was resolved FOR, so the manager can drop
      // it if the pin changed while these fetches were in flight - see
      // PinnedSiteFaviconPatch.
      const patches: PinnedSiteFaviconPatch[] = [];

      // One batch, not two: the custom icons come from the Iconify CDN and the
      // favicons from Chrome's local cache, so neither group has any reason to
      // wait on the other. Pushing into a shared array from both is safe -
      // these callbacks only ever run one at a time on the same thread.
      await Promise.all([
        ...needsCustomIcon.map(async (site) => {
          const dataUrl = await iconToDataUrl(site.customIconName!, site.iconColor);
          if (dataUrl)
          {
            patches.push({ id: site.id, favicon: dataUrl, forCustomIconName: site.customIconName });
          }
        }),
        ...needsSiteFavicon.map(async (site) => {
          const chromeFaviconUrl = getFaviconUrl(site.url);
          const favicon = await fetchFaviconAsBase64(chromeFaviconUrl);
          if (favicon)
          {
            patches.push({ id: site.id, favicon });
          }
        }),
      ]);

      if (patches.length === 0)
      {
        if (import.meta.env.DEV)
        {
          console.log('[PinnedSites] resolve pass produced NO patches - every fetch came back empty');
        }
        return;
      }

      if (import.meta.env.DEV)
      {
        console.log('[PinnedSites] resolve pass writing patches:',
          patches.map(patch => `${patch.id}${patch.forCustomIconName ? ` (icon ${patch.forCustomIconName})` : ' (site favicon)'}`));
      }

      // No need to re-read the list first: setFavicons patches only the pins
      // it names, on whatever the manager currently holds, so a pin added or
      // removed while we were fetching is unaffected.
      const stored = await pinnedSitesManagerProxy.setFavicons(patches);

      if (import.meta.env.DEV)
      {
        // What the manager actually kept. A patch listed above but missing
        // here was dropped by applySetFavicons as stale.
        const landed = patches.filter(patch => stored.find(site => site.id === patch.id)?.favicon === patch.favicon);
        console.log(`[PinnedSites] resolve pass: ${landed.length} of ${patches.length} patches landed`);
      }
    }
    catch (err)
    {
      reportFailure('resolve icons', err);
    }
    finally
    {
      isResolvingRef.current = false;

      // Run the change that arrived mid-pass, against the list as it stands
      // now rather than whatever it was when that change was skipped. Cannot
      // loop: the flag is only ever set by a skipped pass, and this retry
      // returns immediately once nothing is left to resolve.
      if (resolveRequestedRef.current)
      {
        resolveRequestedRef.current = false;
        void runResolvePass(pinnedSitesManagerProxy.snapshot);
      }
    }
  }, [reportFailure]);

  useEffect(() => {
    if (isResolvingRef.current)
    {
      resolveRequestedRef.current = true;
      if (import.meta.env.DEV)
      {
        console.log('[PinnedSites] resolve pass DEFERRED - a resolve is still in flight, will re-run when it finishes');
      }
      return;
    }

    void runResolvePass(pinnedSites);
  }, [pinnedSites, runResolvePass]);

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

    try { await pinnedSitesManagerProxy.addPins([newPin], atIndex); }
    catch (err) { reportFailure('addPin', err); }
  }, [reportFailure]);

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

    try { await pinnedSitesManagerProxy.addPins(newPins); }
    catch (err) { reportFailure('addPins', err); }
  }, [reportFailure]);

  const removePin = useCallback((id: string) => {
    pinnedSitesManagerProxy.removePins([id]).catch(err => reportFailure('removePin', err));
  }, [reportFailure]);

  const updatePin = useCallback((
    id: string,
    title: string,
    url: string,
    favicon?: string,
    customIconName?: string,
    iconColor?: string,
    emoji?: string
  ) => {
    // The icon fields travel as a set - see PinnedSiteEdit for why absent means
    // cleared for those three but "keep" for favicon.
    pinnedSitesManagerProxy
      .updatePin(id, { title, url, favicon, customIconName, iconColor, emoji })
      .catch(err => reportFailure('updatePin', err));
  }, [reportFailure]);

  // Scenario 6: user explicitly resets to site favicon via "Reset to site icon".
  // Only works if Chrome has the page cached (site visited at least once).
  const resetFavicon = useCallback(async (id: string) => {
    const site = pinnedSitesManagerProxy.snapshot.find(s => s.id === id);
    if (!site) return;

    const chromeFaviconUrl = getFaviconUrl(site.url);
    const favicon = await fetchFaviconAsBase64(chromeFaviconUrl);

    try { await pinnedSitesManagerProxy.resetFavicon(id, favicon); }
    catch (err) { reportFailure('resetFavicon', err); }
  }, [reportFailure]);

  const movePin = useCallback((
    activeId: string,
    overId: string,
    position: 'before' | 'after' = 'before'
  ) => {
    pinnedSitesManagerProxy
      .movePin(activeId, overId, position)
      .catch(err => reportFailure('movePin', err));
  }, [reportFailure]);

  const duplicatePin = useCallback((id: string, liveUrl?: string, liveTitle?: string, liveFavicon?: string) => {
    // The id is generated here rather than in the manager so this context's
    // optimistic copy and the stored one are the same pin.
    pinnedSitesManagerProxy
      .duplicatePin(id, generateId(), { url: liveUrl, title: liveTitle, favicon: liveFavicon })
      .catch(err => reportFailure('duplicatePin', err));
  }, [reportFailure]);

  // Scenario 2a: replace all pins from our own JSON backup.
  // favicon is already embedded as base64 in the backup — no fetch needed.
  // Sites with missing favicon (old backups) are handled by the lazy-resolve effect.
  const replacePinnedSites = useCallback((sites: PinnedSite[]) => {
    const newSites = sites.map(site => ({
      ...site,
      id: generateId(),
    }));
    pinnedSitesManagerProxy
      .replaceAll(newSites)
      .catch(err => reportFailure('replacePinnedSites', err));
  }, [reportFailure]);

  // Scenario 2b / 3: append pins from our own JSON backup or Arc import.
  // Same as replacePinnedSites — favicon already in backup, or lazy-resolve handles it.
  const appendPinnedSites = useCallback((sites: PinnedSite[]) => {
    const newSites = sites.map(site => ({
      ...site,
      id: generateId(),
    }));
    pinnedSitesManagerProxy
      .addPins(newSites)
      .catch(err => reportFailure('appendPinnedSites', err));
  }, [reportFailure]);

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
