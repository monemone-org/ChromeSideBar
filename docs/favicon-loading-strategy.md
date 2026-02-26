# Favicon Loading Strategy for Pinned Sites

`PinnedSite.favicon` stores a base64 data URL (e.g. `data:image/png;base64,...`).
It is fetched once and persisted — rendering is always local, no repeated network fetches.

Chrome's `_favicon` API only returns a real icon if Chrome has already visited and cached
that page. Before the page is loaded, it returns a default grey globe which we detect and
discard (see `favicon.ts`).

## Scenarios

### Scenario 1 — Pin a tab (addPin / addPins)

The tab is currently open so Chrome has the favicon cached.

- `fetchFaviconAsBase64(getFaviconUrl(url))` succeeds immediately
- Falls back to caller-provided `faviconUrl` if Chrome cache misses

### Scenario 2 — Import from our own JSON backup (replacePinnedSites / appendPinnedSites)

The backup already contains `favicon` as base64 — no fetch needed.

- Sites missing `favicon` (old backups) are handled by the lazy-resolve effect (Scenario 4)

### Scenario 3 — Import from Arc JSON (importArcData in arcImport.ts)

Sites are stored with only metadata (`url`, `title`, `emoji`, `customIconName`) — no favicon.

- The lazy-resolve effect (Scenario 4) handles fetching after import

### Scenario 4 — Lazy resolve on render (useEffect in usePinnedSites.ts)

Runs whenever `pinnedSites` changes. Handles two cases:

**a) `customIconName` set, no `favicon`:**
- `iconToDataUrl()` fetches from Iconify CDN
- Always succeeds since Lucide icons are publicly available

**b) No icon/emoji/favicon:**
- `getFaviconUrl()` + `fetchFaviconAsBase64()` via Chrome's `_favicon` API
- Before Chrome has cached the page → returns default globe → discarded → site stays
  unresolved → effect retries on next render cycle
- After Chrome has cached the page → returns real favicon → stored

Once resolved, `favicon` is saved back to storage so this only runs once per site.

### Scenario 5 — Tab loads a favicon (tabs.onUpdated in background.ts)

When any tab reports a new `favIconUrl`, background.ts:

1. Matches pinned sites by hostname
2. Skips sites that already have `favicon`, `customIconName`, or `emoji`
3. Fetches the favicon via `fetchAsBase64(changeInfo.favIconUrl)`
4. Saves directly to storage — side panel picks up via `storage.onChanged`

This handles the case where the user opens a pinned site for the first time. Chrome loads
the page, fires `favIconUrl`, and the pin gets updated automatically — no reload needed.

The listener lives in the background service worker because `chrome.tabs.onUpdated` does
not reliably fire in extension pages like the side panel.

### Scenario 6 — User resets favicon (resetFavicon)

User explicitly resets via "Reset to site icon" in the Edit Pin dialog.

- Re-fetches via Chrome's `_favicon` API
- Only succeeds if Chrome has the page cached (site visited at least once)
