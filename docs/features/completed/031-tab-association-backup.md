---
created: 2026-03-10
after-version: 1.0.287
status: completed
---

# 031 - Tab Association Backup & Restore

## Purpose

Tab associations (which bookmark/pinned-site each tab belongs to) are stored in `chrome.storage.session`, which is lost on browser restart or extension reload. This feature backs up associations to `chrome.storage.local` so they can be restored when the extension starts up again.

**Major use cases:**

- Browser crashes or restarts — tabs are restored by Chrome but the sidebar loses track of which tab belongs to which bookmark
- Extension reloads during development — session storage is cleared but tabs remain
- Service worker goes idle and restarts — session storage may be lost

## Storage Layout

### Session storage (existing, ephemeral)

Key: `tabAssociations_{windowId}`
Value: `Record<tabId, itemKey>` — maps each managed tab to its bookmark/pinned-site item

### Local storage backup (new, persistent)

Two types of entries:

1. **Per-window backup** — `tabAssociationsBackup_{windowId}`
   - Value: `Record<itemKey, { tabId, url, tabIndex }>` — keyed by item, stores enough info to re-identify the tab after restart
   - Inverted from session storage (keyed by itemKey instead of tabId) because after restart, tabIds change but itemKeys are stable

2. **Window ID index** — `tabAssociationsBackupWindowIds`
   - Value: `number[]` — list of window IDs that have backup entries
   - Allows enumeration without scanning all storage keys

## Keeping Backup in Sync

The backup is updated whenever the session association changes:

| Event                                  | Action                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tab created for a bookmark/pinned-site | `saveTabAssociationBackup` — store tabId, url, tabIndex                                   |
| Tab navigates (URL change)             | `saveTabAssociationBackup` — update url                                                   |
| Tab moved                              | `updateTabAssociationBackupIndices` — refresh tabIndex for all managed tabs in the window |
| Tab closed                             | `removeTabAssociationBackup` — remove the entry                                           |
| Window closed                          | `removeWindowAssociationBackup` — remove all entries for the window                       |

### Stale window cleanup

When removing a window's backup (`removeBackupWindowId`), we also call `pruneStaleBackupWindowIds` which queries `chrome.windows.getAll()` and removes backup data for any window IDs that no longer exist. This catches cases where `windows.onRemoved` was missed (e.g., service worker was inactive).

## Restore on Startup

`restoreTabAssociationBackup()` runs after the service worker's state managers finish loading. It:

1. Pre-fetches all backup data and current window/tab state in parallel
2. Matches backup windows to current windows (see below)
3. For each matched window, restores session associations (`tabId → itemKey`)
4. Updates backup storage to reflect new window/tab IDs
5. Removes backup data for unmatched windows

## Window Matching Algorithm

After a restart, window IDs (and tab IDs) may change. The matcher uses three passes, each progressively fuzzier. Each pass runs across all unmatched backup windows before moving to the next. Once a current window is claimed by a backup, it's excluded from later matches.

### Pass 1 — Direct (extension reload)

If the backup's window ID still exists in current windows, it's a direct match. Tab IDs should also be preserved, so each backup entry's stored `tabId` is checked against the window's current tab IDs.

**When it works:** Extension reload, service worker restart — window and tab IDs are preserved.

### Pass 2 — Index + Domain (browser restart, same tab positions)

For each backup entry, check if the current window has a tab at the same index whose URL domain matches. All entries must match for the window to be claimed.

**When it works:** Browser restart where Chrome restores tabs in the same positions but assigns new IDs.

### Pass 3 — Domain Overlap (tabs shifted)

Count how many of the backup's URL domains appear anywhere in the current window's tabs (ignoring position). The window with the highest overlap score wins. Individual tabs are then matched by domain (first unclaimed tab with the same domain).

**When it works:** Tabs have been reordered, or Chrome restored tabs in different positions.

## Key Files

- `src/utils/tabAssociations.ts` — all backup CRUD, matching, and restore logic
- `src/background.ts` — event listeners that keep backup in sync, calls `restoreTabAssociationBackup` on startup
- `src/contexts/BookmarkTabsContext.tsx` — `storeAssociation` writes to both session and local backup
