# Chrome Restart State Restoration - Implementation Plan

## Overview

Implement session restoration so space-tab assignments and bookmark associations survive Chrome restarts.

Feature spec: `docs/features/018-chrome-restart-state-restore.md`

## Implementation Steps

### Phase 1: Add Window UUID Infrastructure

**Files:** `src/background.ts`

1. Add UUID generation utility (use `crypto.randomUUID()`)
2. Add `windowId ↔ UUID` mapping in BackgroundState
3. Listen to `chrome.windows.onCreated` → generate UUID for new windows
4. Listen to `chrome.windows.onRemoved` → cleanup UUID mapping, clean up all windows state based on its UUID stored in chrome local storage.
5. Store UUID mapping in session storage (for quick lookup during session)
6. Store UUID list in local storage (to enumerate stored states)

### Phase 2: Add Fingerprint + WindowRestoreData

**Files:** `src/background.ts`

1. Add fingerprint computation function:
   - Get all tabs for window
   - Strip query params from URLs
   - Join with `|`
2. Add `WindowRestoreData` interface
3. Save to `chrome.storage.local` key `window_restore_data`
4. Update on tab create/close/move events

### Phase 3: Migrate Storage Keys

**Files:**
- `src/hooks/useSpaceWindowState.ts`
- `src/contexts/BookmarkTabsContext.tsx`
- `src/background.ts`

1. Change storage key format from `{name}_{windowId}` to `{name}_{uuid}`
2. Move from `chrome.storage.session` to `chrome.storage.local`
3. Add way for sidebar to get its window's UUID from background
4. Consolidate `bg_windowActiveGroups`, `bg_windowActiveSpaces`, `bg_spaceLastActiveTabs` into `bg_windowState_{uuid}`

### Phase 4: Add Restoration Logic

**Files:** `src/background.ts`

1. Add `chrome.runtime.onStartup` listener
2. Implement debounce detection (2 second quiet period)
3. Implement `runSpaceRestoration()`:
   - For each window, compute fingerprint
   - Match against stored `WindowRestoreData`
   - If match: assign UUID, remap tab IDs, load states
   - If no match: generate new UUID
4. Cleanup unmatched `WindowRestoreData` entries

### Phase 5: Update Message Handlers

**Files:** `src/background.ts`, sidebar components

Sidebar will send `windowUuid` instead of `windowId` in all messages.

1. Add `get-window-uuid` message handler in background.ts:
   ```typescript
   // Sidebar requests its UUID on startup
   { action: 'get-window-uuid', windowId: number }
   // Returns: { uuid: string }
   ```

2. Update sidebar to fetch UUID on mount, store in context/state

3. Update all existing messages to use `windowUuid`:
   - `set-active-space`
   - `switch-to-space`
   - `prev-used-tab` / `next-used-tab`
   - `get-tab-history`
   - `navigate-to-history-index`

4. Update background.ts message handlers to expect `windowUuid`


## Critical Files

| File | Changes |
|------|---------|
| `src/background.ts` | UUID management, fingerprint, restoration logic |
| `src/hooks/useSpaceWindowState.ts` | Storage key + storage type change |
| `src/contexts/BookmarkTabsContext.tsx` | Storage key + storage type change |
| `docs/state-reference.md` | Update documentation |


## Verification

1. **Basic test:** Open sidebar, add tabs to a space, restart Chrome, verify tabs still in space
2. **Multi-window:** Open 2 windows with different spaces, restart, verify each window restores correctly
3. **New window after restart:** Open new window after restart, verify it gets fresh state
4. **Cleanup test:** Close a window, restart, verify old data cleaned up
