---
created: 2026-01-16
after-version: 1.0.149
status: aborted
---

# Chrome Restart State Restoration

## Status: Aborted

Too complicated for the value it provides. Key issues:

1. **No reliable session restore detection** - Chrome doesn't fire a "restore complete" event. Debounce-based detection is hacky and unreliable.

2. **Fragile fingerprinting** - Window identification via URL concatenation breaks easily:
   - Tab order can change
   - Tabs may fail to restore
   - Multiple windows could have identical fingerprints
   - Any mismatch = treated as new window, losing all associations

3. **UUID management overhead** - Maintaining our own window ID system adds complexity and potential sync issues with Chrome's native IDs.

4. **Race conditions** - Timing between Chrome's restore, our detection, and sidebar loading is hard to coordinate.

5. **Low ROI** - All this complexity just to preserve which bookmark opened which tab. Users can re-click bookmarks after restart.

**Alternative**: Accept that tab associations are session-only. Spaces already persist via Chrome tab groups. Live bookmark tabs can be re-opened from bookmarks.

---

## Original Spec (for reference)

### Goal

Restore live bookmark tabs and pinned site associations after Chrome restarts.

**Problem:** Chrome assigns new tab IDs on restart. Tab associations stored with old IDs become orphaned.

**What's already handled:**
- Space-tab membership: Spaces use Chrome tab groups (see 021-recouple-group-space.md), which persist across restarts. Spaces reconnect to groups by name matching.
- Active space: Derived from active tab's Chrome group.


## Scope

Only need to restore:
- **Live bookmark tabs**: tab ↔ bookmark ID associations
- **Pinned sites**: tab ↔ pinned site ID associations

These are stored in `tabAssociations_{windowId}` and need tab ID remapping after restart.


## Approach

### 1. Debounce Session Restoration

Chrome doesn't fire a "session restore complete" event. Detect completion by waiting for activity to settle:

```typescript
// In background.ts
let restoreTimeout: number | null = null;

chrome.runtime.onStartup.addListener(() => {
  startListeningForRestoration();
});

function startListeningForRestoration() {
  const onActivity = () => {
    if (restoreTimeout) clearTimeout(restoreTimeout);
    restoreTimeout = setTimeout(() => {
      // No new tabs/windows for 2 seconds = probably done
      runTabAssociationRestoration();
    }, 2000);
  };

  chrome.tabs.onCreated.addListener(onActivity);
  chrome.windows.onCreated.addListener(onActivity);

  // Kick off the timer
  onActivity();
}
```

### 2. Re-identify Window Using URL Fingerprint

Fingerprint = concatenation of all tab URLs (excluding query parameters), joined by `|`

Example:
```
https://github.com/anthropics|https://google.com|https://docs.google.com/doc/abc
```

### 3. Use Our Own UUID for Window ID

Window ID will be a UUID (`window_uuid`) that we generate.
- When a new Chrome window is created, generate a new `window_uuid`
- `window_uuid` stored in session storage (for current session lookup)
- Array of all `window_uuid`s stored in `chrome.storage.local` (to find stored window states)

### 4. Store State in chrome.storage.local

Store tab associations in `chrome.storage.local` (see State Changes section).

### 5. Update WindowRestoreData on Tab Changes

When a tab is loaded/closed/reordered, recompute the fingerprint and store in `chrome.storage.local`:

```typescript
interface WindowRestoreData
{
  fingerprint: string;       // Concat of tab URLs (no query params)
  windowUuid: string;
  tabIds: number[];          // Tab IDs in index order (array index = tab index)
}

// Storage key: 'window_restore_data'
// Storage value: Array<WindowRestoreData>
```

### 6. Restoration Process

When reconstructing tab associations after Chrome restarts:

1. Wait for debounce timer to fire
2. For each window:
   - Read `window_restore_data` from storage
   - Compute fingerprint from current window's tabs
   - Find matching entry by fingerprint
   - If match found:
     - Assign the stored `window_uuid` to this window
     - Load `tabAssociations_{uuid}` from storage
     - Remap old tab IDs to new tab IDs using array index
       - `oldTabIds[i]` → `newTabs[i].id`
     - Save remapped associations
   - If no match found:
     - Treat as new window
     - Generate new `window_uuid`
3. Cleanup: Delete `WindowRestoreData` entries that weren't matched


## `window_uuid`

Window ID will be a UUID (`window_uuid`) that we generate.
- When a new Chrome window is created, we create a new `window_uuid`
- `window_uuid` stored in session storage (per-window, for quick lookup)
- Array of all `window_uuid`s stored in `chrome.storage.local` (to enumerate stored states)


## State Changes

Read `docs/state-reference.md` for how data is currently stored.

### tabAssociations_{uuid}

Formerly `tabAssociations_{windowId}`. Move from session to local storage.

```typescript
// Storage format: Record<number, string>
// Key: tabId
// Value: itemKey (bookmark ID or pinned site ID)
```

### What's NOT restored

- **SpaceWindowState**: No longer needed. Spaces use Chrome tab groups which persist natively.
- **Tab navigation history**: Not supported (acceptable UX trade-off).


## Edge Cases

| Case | Handling |
|------|----------|
| No fingerprint match | Treat as new window, generate new UUID |
| Multiple windows with same fingerprint | First match wins (rare edge case) |
| Window closed, never restored | Delete data during next restoration cleanup |
| New window opened after restart | Gets new UUID, no restoration needed |
| Some tabs failed to restore | Fingerprint won't match, treated as new window |


## Sidebar Loading State

During the restoration debounce window, sidebar shows "Restoring session..." message:
- Prevents user confusion if they open sidebar immediately after Chrome restart
- Blocks interaction until restoration completes
- Background notifies sidebar when restoration is done


## Logging (Nice to Have)

Add debug logging for restoration process:
- Log fingerprint matching attempts and results
- Helps troubleshoot when restoration fails


## Future Considerations

**Fuzzy fingerprint matching**: Consider partial URL matching (e.g., 80% threshold) if exact matching proves too fragile in practice. Deferred until we evaluate how well exact matching works.
