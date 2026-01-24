# Code Audit: Memory & Resources

**Date:** 2026-01-23

## Purpose

Identifies memory leaks, unbounded collections, missing cleanup, and resource management issues in the ChromeSideBar extension.

## Summary Table

| Fix Status     | Issue # | Description                                                  | Priority | Recommended | Dev Notes                                                                                      |
| -------------- | ------- | ------------------------------------------------------------ | -------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Not Applicable | 1       | Module-level pendingManagedTabs Set never cleaned            | Low      | No          | pendingManagedTabs is removed now. We changed to use `queueTabForGrouping` in background.ts    |
| Won't be fixed | 2       | Module-level refreshCallbacks Set                            | Low      | No          |                                                                                                |
| Not Applicable | 3       | Module-level isBatchOperation flag                           | Medium   | Yes         | not a real issue                                                                               |
| Won't be fixed | 4       | Module-level IntersectionObserver without cleanup            | Low      | No          |                                                                                                |
| Not Applicable | 5       | Background script state managers not cleaned on window close | Low      | No          | MV3 service worker restarts clear in-memory Maps; session storage auto-clears on browser close |
| Won't be fixed | 6       | Tab history entries for closed tabs                          | Low      | No          |                                                                                                |
| Won't be fixed | 7       | Grouping queue could grow unbounded                          | Low      | No          |                                                                                                |
| Won't be fixed | 8       | Chrome storage session keys accumulate                       | Low      | No          |                                                                                                |
| Won't be fixed | 9       | Bookmark expanded state session storage keys                 | Low      | No          |                                                                                                |
| Won't be fixed | 10      | swipeNavigation global cooldown variable                     | Low      | No          | Intentional                                                                                    |

---

## Issue #1: Module-level pendingManagedTabs Set Never Cleaned

### Problem
Module-level Set holds tab IDs temporarily (200ms timeout) but could leak if tabs are closed before timeout fires or if multiple sidepanel instances exist.

### Cause
**File:** `src/contexts/BookmarkTabsContext.tsx` (line 14)

```typescript
const pendingManagedTabs = new Set<number>();
```

### Suggested Fixes

#### Option A: Add periodic cleanup
Periodically remove stale entries older than a threshold.

**Why it works**: Bounds memory growth over time.

**Pros/Cons**:
- Pros: Prevents unbounded growth
- Cons: Additional complexity; cleanup logic

#### Option B: Add size limit with eviction
Limit Set size; evict oldest entries when full.

**Why it works**: Hard cap on memory usage.

**Pros/Cons**:
- Pros: Guaranteed bound
- Cons: May evict still-needed entries

#### Option C: Keep current implementation
200ms timeout is short; cleanup is nearly immediate.

**Why it works**: Window for leakage is very small.

**Pros/Cons**:
- Pros: Simple; works in practice
- Cons: Theoretical leak possible

### Recommendation
**No fix needed.** Option C - the 200ms timeout ensures entries are removed almost immediately. The window for leakage is so small (200ms) that even if a tab closes during this window, the entry is cleaned up by the timeout. This is acceptable for the use case.

---

## Issue #2: Module-level refreshCallbacks Set

### Problem
Module-level Set stores callback functions. Properly cleaned up via useEffect, but semantics are fragile.

### Cause
**File:** `src/hooks/useBookmarks.ts` (lines 10-15)

```typescript
const refreshCallbacks = new Set<() => void>();
```

### Suggested Fixes

#### Option A: Keep current implementation
Callbacks are properly added in useEffect and removed in cleanup.

**Why it works**: React's cleanup mechanism ensures proper removal.

**Pros/Cons**:
- Pros: Already works; simple
- Cons: Set semantics could be confusing

#### Option B: Use Map with component ID
```typescript
const refreshCallbacks = new Map<string, () => void>();
```

**Why it works**: More explicit tracking of which component owns which callback.

**Pros/Cons**:
- Pros: Clearer semantics
- Cons: Need to generate/track IDs

### Recommendation
**No fix needed.** Option A - callbacks are properly added in useEffect and removed in the cleanup function. React's cleanup mechanism ensures removal when components unmount. The Set semantics work correctly for this use case.

---

## Issue #3: Module-level isBatchOperation Flag

### Problem
Module-level mutable state shared across all hook instances. Could cause race conditions if multiple windows or async operations interleave.

### Cause
**Files:**
- `src/hooks/useTabs.ts` (line 28)
- `src/hooks/useBookmarks.ts` (line 7)

```typescript
let isBatchOperation = false;
```

### Suggested Fixes

#### Option A: Per-window batch tracking
```typescript
const batchOperationWindows = new Set<number>();

export function startBatch(windowId: number) {
  batchOperationWindows.add(windowId);
}
export function endBatch(windowId: number) {
  batchOperationWindows.delete(windowId);
}
export function isBatching(windowId: number) {
  return batchOperationWindows.has(windowId);
}
```

**Why it works**: Each window tracks its own batch state.

**Pros/Cons**:
- Pros: Correct multi-window behavior
- Cons: More complex; need windowId everywhere

#### Option B: Use try/finally for atomic operations
```typescript
isBatchOperation = true;
try {
  await performBatchOperation();
} finally {
  isBatchOperation = false;
}
```

**Why it works**: Ensures flag is reset even on error.

**Pros/Cons**:
- Pros: Safer cleanup
- Cons: Doesn't fix multi-window issue

#### Option C: Pass batch state as parameter/context
Thread batch state through component tree.

**Why it works**: Explicit state flow.

**Pros/Cons**:
- Pros: No global state
- Cons: Prop drilling

### Recommendation
Option A for multi-window correctness.

### Further investigation Result:

```
 Report Errors

  1. useTabs.ts claim is incorrect

  The report states (line 118-119):
  - `src/hooks/useTabs.ts` (line 28)
  let isBatchOperation = false;

  But the actual code at line 28 is:
  const batchOperationWindows = new Set<number>();

  useTabs.ts already implements per-window batch tracking (Option A from the recommended
  fixes). The report has stale/incorrect information.

  2. Multi-window concern is invalid

  The report's main concern is that "batch in one window suppresses events in other windows."
   However, each Chrome extension sidepanel runs in its own isolated JavaScript context.
  Module-level variables are NOT shared across sidepanel instances in different windows.

  When you open a sidepanel in Window A and Window B, they each have their own:
  - JavaScript runtime
  - Module-level isBatchOperation variable
  - React component tree

  So window isolation makes the multi-window race condition impossible.

  useBookmarks.ts Analysis

  The isBatchOperation flag in useBookmarks.ts is used for three operations:
  - sortBookmarks - with try/finally ✓
  - clearFolder - with try/finally ✓
  - createBookmarksBatch - with try/finally ✓

  Within a single sidepanel, concurrent batch operations are:
  1. Very unlikely (user would need to sort while importing simultaneously)
  2. Self-healing (all operations call refreshAll() at the end)
  3. Already using try/finally for safe cleanup

  Conclusion

  The issue as described is not real because:
  4. The useTabs.ts claim is factually wrong
  5. The multi-window concern misunderstands Chrome extension architecture

  No code changes needed. I recommend updating the report to mark this as "Not Applicable"
  with a note explaining the Chrome extension sidepanel isolation.
```

---

## Issue #4: Module-level IntersectionObserver Without Cleanup

### Problem
Shared IntersectionObserver singleton is never disconnected even when all listeners are removed.

### Cause
**File:** `src/hooks/useInView.ts` (lines 4-26)

```typescript
let observer: IntersectionObserver | null = null;
const listeners = new Map<Element, (entry: IntersectionObserverEntry) => void>();
```

### Suggested Fixes

#### Option A: Disconnect when no listeners remain
```typescript
if (prevElementRef.current) {
  observer.unobserve(prevElementRef.current);
  listeners.delete(prevElementRef.current);

  if (listeners.size === 0 && observer) {
    observer.disconnect();
    observer = null;
  }
}
```

**Why it works**: Releases resources when not needed.

**Pros/Cons**:
- Pros: Proper cleanup; allows garbage collection
- Cons: Slight overhead to recreate observer

#### Option B: Keep singleton alive
Observer is lightweight; keeping it alive is fine.

**Why it works**: IntersectionObserver with no observed elements uses minimal resources.

**Pros/Cons**:
- Pros: Faster reuse; simpler code
- Cons: Minor memory retention

### Recommendation
**No fix needed.** Option B is acceptable - an IntersectionObserver with no observed elements uses minimal resources (just the callback reference). Disconnecting and recreating adds churn without meaningful benefit. The observer is shared singleton that's reused when new elements are observed.

---

## Issue #5: Background Script State Managers Not Cleaned on Window Close

### Problem
Maps keyed by windowId accumulate entries during browser session as windows are opened/closed.

### Cause
**File:** `src/background.ts` (lines 14-440)

```typescript
#states = new Map<number, SpaceWindowState>();  // line 19
#history = new Map<number, TabHistory>();       // line 110
#activeGroups = new Map<number, number>();      // line 414
```

### Suggested Fixes

#### Option A: Listen to window close events
```typescript
chrome.windows.onRemoved.addListener((windowId) => {
  spaceStateManager.removeWindow(windowId);
  historyManager.removeWindow(windowId);
  groupTracker.removeWindow(windowId);
  // Clean session storage keys too
  chrome.storage.session.remove(`spaceState_${windowId}`);
});
```

**Why it works**: Explicit cleanup when window closes.

**Pros/Cons**:
- Pros: Prevents unbounded Map growth
- Cons: Need to track all managers that store window-keyed data

#### Option B: Periodic cleanup
Periodically query existing windows and remove orphaned entries.

**Why it works**: Catches any missed cleanups.

**Pros/Cons**:
- Pros: Defensive; catches edge cases
- Cons: Async complexity; potential races

### Recommendation
**No fix needed.** While there's no explicit cleanup on window close, this is not a practical concern:

1. **MV3 service worker lifecycle** - The background script is terminated when idle and restarted on demand. In-memory Maps are cleared on each restart.
2. **Session storage auto-clears** - The persisted data in `chrome.storage.session` is automatically cleared when the browser closes.
3. **Minimal data** - Each window entry is just a handful of bytes (a spaceId string, a small history stack, a groupId number).
4. **Typical usage** - Users don't open hundreds of windows per session. Even 20 windows would be negligible memory.
5. **Window ID reuse** - Chrome may reuse window IDs, so new windows can overwrite old entries.

The automatic cleanup mechanisms make explicit cleanup unnecessary.

---

## Issue #6: Tab History Entries for Closed Tabs

### Problem
Stale entries remain in history stack until naturally evicted by MAX_SIZE limit.

### Cause
**File:** `src/background.ts` (lines 105-404)

`TabHistoryManager.remove()` is called on tab close, but `getHistoryDetails()` gracefully handles missing tabs.

### Suggested Fixes

#### Option A: Keep current implementation
Dead entries are caught and filtered during `getHistoryDetails()`. MAX_SIZE (25) bounds growth.

**Why it works**: Graceful handling; bounded size.

**Pros/Cons**:
- Pros: Already works; no change needed
- Cons: Slightly wasteful storage

#### Option B: Actively clean history on tab close
Remove tabId from history entries when tab closes.

**Why it works**: Proactive cleanup.

**Pros/Cons**:
- Pros: Cleaner data
- Cons: More complex; may break back/forward semantics

### Recommendation
**No fix needed.** Option A - stale entries in history are handled gracefully by `getHistoryDetails()` which filters out missing tabs. The MAX_SIZE (25) limit bounds growth. Active cleanup on tab close would complicate back/forward navigation semantics without clear benefit.

---

## Issue #7: Grouping Queue Could Grow Unbounded

### Problem
Tab grouping queue has no size limit.

### Cause
**File:** `src/background.ts` (lines 688-767)

```typescript
const groupingQueue: TabGroupingRequest[] = [];
```

### Suggested Fixes

#### Option A: Add maximum queue size
```typescript
const MAX_QUEUE_SIZE = 100;
if (groupingQueue.length < MAX_QUEUE_SIZE) {
  groupingQueue.push(request);
}
```

**Why it works**: Hard cap prevents memory issues.

**Pros/Cons**:
- Pros: Guaranteed bound
- Cons: May drop requests under extreme load

#### Option B: Keep current implementation
Queue processes sequentially; naturally drains.

**Why it works**: Sequential processing prevents backlog.

**Pros/Cons**:
- Pros: Simple; works in practice
- Cons: Theoretical unbounded growth

### Recommendation
**No fix needed.** Option B - the queue processes sequentially and drains naturally. Tab grouping requests come from user actions which are naturally rate-limited by human interaction speed. The queue never grows large in practice.

---

## Issue #8: Chrome Storage Session Keys Accumulate

### Problem
Session storage keys created per window not cleaned up on window close.

### Cause
**File:** `src/contexts/BookmarkTabsContext.tsx` (lines 6, 137-138)

```typescript
const getStorageKey = (windowId: number) => `tabAssociations_${windowId}`;
```

### Suggested Fixes

#### Option A: Clean up on window close
Add to window close handler (from Issue #5):
```typescript
chrome.storage.session.remove(`tabAssociations_${windowId}`);
```

**Why it works**: Explicit cleanup.

**Pros/Cons**:
- Pros: Clean storage
- Cons: Need to track all key patterns

#### Option B: Use single key with object structure
```typescript
const STORAGE_KEY = 'allTabAssociations';
// Value: { [windowId]: associations }
```

**Why it works**: Easier to manage; single cleanup.

**Pros/Cons**:
- Pros: Simpler cleanup
- Cons: Larger single value; needs migration

### Recommendation
**No fix needed.** This should be addressed by implementing Issue #5 fix (window close listener). Session storage keys are automatically cleared when the browser restarts, so the leak is bounded to a single browser session. Adding cleanup to the window.onRemoved handler from Issue #5 would clean these keys.

---

## Issue #9: Bookmark Expanded State Session Storage Keys

### Problem
Similar to Issue #8 - keys created per window per space.

### Cause
**File:** `src/components/BookmarkTree.tsx` (lines 75-76)

```typescript
const getExpandedStateKey = (windowId: number, spaceId: string) =>
  `bookmarkExpandedState_${windowId}_${spaceId}`;
```

### Suggested Fixes

#### Option A: Clean up on window/space delete
Add cleanup when windows close or spaces are deleted.

**Why it works**: Removes orphaned keys.

**Pros/Cons**:
- Pros: Clean storage
- Cons: Multiple cleanup triggers needed

#### Option B: Periodic orphan cleanup
Query existing windows/spaces and remove non-matching keys.

**Why it works**: Catches all orphans.

**Pros/Cons**:
- Pros: Thorough
- Cons: Complex; async operations

### Recommendation
**No fix needed.** Similar to Issue #8 - session storage auto-clears on browser restart. The keys are small (expanded state is just a Set of folder IDs). Cleanup can be added to window.onRemoved handler from Issue #5, but the impact is minimal.

---

## Issue #10: swipeNavigation Global Cooldown Variable

### Problem
Module-level variable shared across hook instances. This is intentional to prevent double-fires.

### Cause
**File:** `src/hooks/useSwipeNavigation.ts` (line 11)

```typescript
let globalCooldownUntil = 0;
```

### Suggested Fixes

#### Option A: Keep current implementation
Intentional design to coordinate across instances.

**Why it works**: Prevents multiple swipe handlers from firing simultaneously.

**Pros/Cons**:
- Pros: Correct behavior; works as intended
- Cons: Global state (but intentional)

#### Option B: Document the intentional design
Add comment explaining the shared state purpose.

**Why it works**: Makes intention clear to future developers.

**Pros/Cons**:
- Pros: Better documentation
- Cons: None

### Recommendation
**No fix needed.** Option A - this is intentional design. The global cooldown variable coordinates swipe handling across multiple hook instances to prevent double-firing. The comment "Intentional" in Dev Notes reflects this is working as designed.

---

## Positive Findings

The codebase demonstrates good resource management:

1. **Chrome API listeners properly cleaned up** in useTabs, useBookmarks, useTabGroups, usePinnedSites, SpacesContext, BookmarkTabsContext, SelectionContext
2. **Timers properly cleared** in useTabs, useBookmarks, useDragDrop, useExternalLinkDrop, useExternalUrlDropForTabs, BookmarkTree, App.tsx
3. **Event listeners properly removed** in useDragDrop, useSwipeNavigation, useExternalLinkDrop, useExternalUrlDropForTabs, App.tsx
4. **Debouncing used** to coalesce rapid events
5. **Consistent error handling** via `createChromeErrorHandler`
6. **Session storage** for per-session state (auto-clears on browser restart)
