---
created: 2026-01-16
after-version: 1.0.149
status: draft
---

# Chrome Restart State Restoration

## Goal

Restore space-tab assignments and bookmark/pinned-site associations after Chrome restarts.

**Problem:** Chrome assigns new window and tab IDs on restart. Current state stored with old IDs becomes orphaned.


## Approach

### 1. Debounce Session Restoration

Chrome doesn't fire a "session restore complete" event. We detect completion by waiting for activity to settle:

```typescript
// In background.ts
let restoreTimeout: number | null = null;

chrome.runtime.onStartup.addListener(() => {
  // Mark that we're in startup mode
  startListeningForRestoration();
});

function startListeningForRestoration() {
  const onActivity = () => {
    if (restoreTimeout) clearTimeout(restoreTimeout);
    restoreTimeout = setTimeout(() => {
      // No new tabs/windows for 2 seconds = probably done
      runSpaceRestoration();
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

Store all live tabs and space tabs state in `chrome.storage.local` (see State Changes section).

### 5. Update WindowRestoreData on Tab Changes

When a tab is loaded/closed/reordered, recompute the fingerprint and store in `chrome.storage.local` at key `window_restore_data`:

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

When reconstructing live tabs and space tabs after Chrome restarts:

1. Wait for debounce timer to fire
2. For each window:
   - Read `window_restore_data` from storage
   - Compute fingerprint from current window's tabs
   - Find matching entry by fingerprint
   - If match found:
     - Assign the stored `window_uuid` to this window
     - Load all window states (see State Changes section)
     - Remap old tab IDs to new tab IDs using array index
       - `oldTabIds[i]` → `newTabs[i].id`
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

Data stored in `chrome.storage.session` will be moved to `chrome.storage.local`:

### spaceWindowState_{uuid}

Formerly `spaceWindowState_{windowId}`

```typescript
export interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabs: Record<string, number[]>;  // space ID → array of tab IDs
}
```

### tabAssociations_{uuid}

Formerly `tabAssociations_{windowId}`

```typescript
// Storage format: Record<number, string>
// Key: tabId
// Value: itemKey (bookmark ID or pinned site ID)
```

### bg_windowState_{uuid}

Consolidates former `bg_windowActiveGroups`, `bg_windowActiveSpaces`, `bg_spaceLastActiveTabs` into one structure.

**Note:** `bg_windowTabHistory` will not be supported (tab navigation history won't be restored).

```typescript
export interface WindowState
{
  activeGroupId: number | null;
  activeSpaceId: string;
  spaceLastActiveTabs: Record<string, number>;  // spaceId → tabId
}
```


## Edge Cases

| Case | Handling |
|------|----------|
| No fingerprint match | Treat as new window, generate new UUID |
| Multiple windows with same fingerprint | First match wins (rare edge case) |
| Window closed, never restored | Delete data during next restoration cleanup |
| New window opened after restart | Gets new UUID, no restoration needed |
| Some tabs failed to restore | Fingerprint won't match, treated as new window |
