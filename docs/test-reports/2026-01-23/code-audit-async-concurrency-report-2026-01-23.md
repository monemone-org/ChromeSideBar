# Code Audit: Async & Concurrency

**Date:** 2026-01-23

## Purpose

Identifies race conditions, stale closures, async operation ordering issues, and concurrency problems in the ChromeSideBar extension.

## Summary Table

| Fix Status     | Issue # | Description                                   | Priority | Recommended | Dev Notes                                                                                             |
| -------------- | ------- | --------------------------------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Fixed          | 1       | Fire-and-forget Chrome API calls in tab moves | High     | Yes         |                                                                                                       |
| Fixed          | 2       | Module-level batch flag shared across windows | High     | Yes         |                                                                                                       |
| Fixed          | 3       | Stale closure in navigation flag              | Medium   | Yes         |                                                                                                       |
| Won't be fixed | 4       | Race between local/remote state updates       | Medium   | Maybe       | Flickering issue is unlikely.                                                                         |
| Fixed          | 5       | Missing error handling on storage ops         | Medium   | Yes         |                                                                                                       |
| Fixed          | 6       | Timeout-based cleanup race condition          | Medium   | Maybe       |                                                                                                       |
| Won't be fixed | 7       | Stale tab references during sort              | Medium   | Maybe       | Unlikely                                                                                              |
| Fixed          | 8       | Missing storage area filter                   | Medium   | Yes         |                                                                                                       |
|                | 9       | Fixed timeout for DOM updates                 | Low      | No          |                                                                                                       |
| Won't be fixed | 10      | Potential IntersectionObserver leak           | Low      | No          | Not an issue                                                                                          |
|                | 11      | Missing AbortController                       | Low      | No          |                                                                                                       |
|                | 12      | Global cooldown (intentional)                 | Low      | No          |                                                                                                       |
| Won't be fixed | 13      | One-by-one tab queries during rebuild         | Low      | No          | Don't think there will be that many live bookmark tabs. Querying all tabs can be a larger collection. |

---

## Issue #1: Fire-and-Forget Chrome API Calls in Tab Moves

### Problem
`moveSingleTab` performs multiple Chrome API calls (`ungroupTab`, `groupTab`, `moveTab`) without awaiting each operation. Could execute in unpredictable order.

### Cause
**File:** `src/utils/tabMove.ts` (lines 36-57, 106-148)

```typescript
if (targetGroupId !== sourceGroupId) {
  if (targetGroupId === -1) {
    ungroupTab(tabId);  // Fire-and-forget
  } else {
    groupTab(tabId, targetGroupId);  // Fire-and-forget
  }
}
moveTab(tabId, targetIndex);  // Executes immediately, may race
```

### Suggested Fixes

#### Option A: Convert to Promises and await sequentially
```typescript
async function moveSingleTab(tabId: number, targetGroupId: number, targetIndex: number) {
  if (targetGroupId !== sourceGroupId) {
    if (targetGroupId === -1) {
      await ungroupTabAsync(tabId);
    } else {
      await groupTabAsync(tabId, targetGroupId);
    }
  }
  await moveTabAsync(tabId, targetIndex);
}
```

**Why it works**: Ensures operations complete in correct order.

**Pros/Cons**:
- Pros: Correct ordering guaranteed
- Cons: Need async wrappers for Chrome APIs; slower (sequential)

#### Option B: Add delay between operations
```typescript
ungroupTab(tabId);
await new Promise(resolve => setTimeout(resolve, 50));
moveTab(tabId, targetIndex);
```

**Why it works**: Gives Chrome time to process each operation.

**Pros/Cons**:
- Pros: Simple workaround
- Cons: Arbitrary delay; fragile

#### Option C: Use chrome.tabs.move with groupId option
If Chrome API supports moving and grouping in single call.

**Why it works**: Atomic operation.

**Pros/Cons**:
- Pros: Most reliable if available
- Cons: May not be supported

### Recommendation
**Yes fix.** Option A - proper async handling is most reliable. Fire-and-forget Chrome API calls can lead to unpredictable tab state when operations interleave. This was marked Fixed.

---

## Issue #2: Module-Level Batch Flag Shared Across Windows

### Problem
`isBatchOperation` is module-level, shared across all hook instances. Batch in one window suppresses events in other windows.

### Cause
**File:** `src/hooks/useTabs.ts` (line 28)

```typescript
let isBatchOperation = false;  // Shared across all instances
```

### Suggested Fixes

#### Option A: Per-window batch tracking
```typescript
const batchOperationWindows = new Set<number>();

export function setBatchOperation(windowId: number, isBatch: boolean) {
  if (isBatch) {
    batchOperationWindows.add(windowId);
  } else {
    batchOperationWindows.delete(windowId);
  }
}

export function isBatching(windowId: number) {
  return batchOperationWindows.has(windowId);
}
```

**Why it works**: Each window tracks independently.

**Pros/Cons**:
- Pros: Correct multi-window behavior
- Cons: Need windowId everywhere

#### Option B: Use ref within hook
```typescript
const isBatchRef = useRef(false);
```

**Why it works**: Per-component-instance state.

**Pros/Cons**:
- Pros: Simple
- Cons: Doesn't coordinate between components in same window

#### Option C: Context-based tracking
Store batch state in context.

**Why it works**: Shared within window's component tree.

**Pros/Cons**:
- Pros: React-idiomatic
- Cons: Need context provider

### Recommendation
**Yes fix.** Option A - per-window batch tracking is now implemented using `batchOperationWindows = new Set<number>()`. This was marked Fixed.

---

## Issue #3: Stale Closure in Navigation Flag

### Problem
`isNavigating` flag set then `chrome.tabs.update` called with callback. Overlapping navigations could clear flag incorrectly.

### Cause
**File:** `src/background.ts` (lines 240-255, 269-283)

```typescript
this.#isNavigating = true;
chrome.tabs.update(entry.tabId, { active: true }, () => {
  this.#isNavigating = false;  // May clear for wrong navigation
});
```

### Suggested Fixes

#### Option A: Use navigation counter
```typescript
#navigationCount = 0;

navigate() {
  const navId = ++this.#navigationCount;
  chrome.tabs.update(..., () => {
    if (navId === this.#navigationCount) {
      // Only process if this is still the current navigation
    }
  });
}
```

**Why it works**: Only latest navigation's callback takes effect.

**Pros/Cons**:
- Pros: Handles overlapping navigations correctly
- Cons: Slightly more complex

#### Option B: Queue navigation requests
Process one at a time.

**Why it works**: No overlap possible.

**Pros/Cons**:
- Pros: Simple mental model
- Cons: Slower; may feel laggy

#### Option C: Cancel pending navigation
Abort previous before starting new.

**Why it works**: Only one navigation active at a time.

**Pros/Cons**:
- Pros: Clean state
- Cons: Chrome API may not support cancellation

### Recommendation
**Yes fix.** Option A - using a navigation counter ensures only the latest navigation's callback takes effect. This was marked Fixed.

---

## Issue #4: Race Between Local/Remote State Updates

### Problem
`setActiveSpaceId` updates local state immediately, then sends message to background. Background may send `STATE_CHANGED` back before local render completes.

### Cause
**File:** `src/contexts/SpacesContext.tsx` (lines 389-401, 406-420)

```typescript
setWindowState(prev => ({ ...prev, activeSpaceId: spaceId }));  // Local update
chrome.runtime.sendMessage({ action: SET_ACTIVE_SPACE, ... });  // Background update
// Background may respond before next render
```

### Suggested Fixes

#### Option A: Add pending state to ignore echoes
```typescript
const [pendingSpaceId, setPendingSpaceId] = useState<string | null>(null);

// When switching
setPendingSpaceId(spaceId);
setWindowState(...);
sendMessage(...);

// When receiving STATE_CHANGED
if (message.spaceId !== pendingSpaceId) {
  // Only update if not our own echo
  setWindowState(...);
}
setPendingSpaceId(null);
```

**Why it works**: Ignores echo of own update.

**Pros/Cons**:
- Pros: Prevents flicker
- Cons: More state to track

#### Option B: Optimistic update with rollback
Apply optimistically; rollback on error response.

**Why it works**: Immediate UI; error handling.

**Pros/Cons**:
- Pros: Fast UI
- Cons: Rollback may be jarring

#### Option C: Wait for background acknowledgment
Don't update local until background confirms.

**Why it works**: Single source of truth.

**Pros/Cons**:
- Pros: No race possible
- Cons: Slower perceived response

### Recommendation
**Maybe fix.** Option A would add complexity for a theoretical flicker that's unlikely to be noticeable in practice. The local state update happens within a React render cycle, and even if the echo arrives quickly, it sets the same value. Won't be fixed - low impact.

---

## Issue #5: Missing Error Handling on Storage Ops

### Problem
`chrome.storage.local.get()` promise not error-handled. Storage failures cause silent data loss.

### Cause
**File:** `src/hooks/useChromeLocalStorage.ts` (lines 32-73, 105-109)

```typescript
chrome.storage.local.get(key).then(result => {
  // No catch handler
});

chrome.storage.local.set({ [key]: value });  // No error handling
```

### Suggested Fixes

#### Option A: Add catch handlers
```typescript
chrome.storage.local.get(key)
  .then(result => { ... })
  .catch(err => {
    console.error('Storage read failed:', err);
    setError('Failed to load settings');
  });
```

**Why it works**: Explicit error handling.

**Pros/Cons**:
- Pros: User aware of issues
- Cons: Need error UI

#### Option B: Add retry logic
Retry on failure with exponential backoff.

**Why it works**: Handles transient failures.

**Pros/Cons**:
- Pros: More robust
- Cons: More complex

#### Option C: Expose error state from hook
```typescript
const [error, setError] = useState<string | null>(null);
return { value, setValue, error };
```

**Why it works**: Consumers can handle errors.

**Pros/Cons**:
- Pros: Flexible handling
- Cons: All consumers need to check error

### Recommendation
**Yes fix.** Option A with Option C - catch errors and expose state for consumers to handle. This was marked Fixed.

---

## Issue #6: Timeout-Based Cleanup Race Condition

### Problem
`pendingManagedTabs` cleaned up after 200ms timeout. If grouping takes longer, cleanup happens before check.

### Cause
**File:** `src/contexts/BookmarkTabsContext.tsx` (lines 427-438)

```typescript
pendingManagedTabs.add(tabId);
setTimeout(async () => {
  pendingManagedTabs.delete(tabId);  // May race with background check
  await addTabToLiveBookmarksGroup(tabId);
}, 200);
```

### Suggested Fixes

#### Option A: Use Promise-based completion tracking
```typescript
const pendingGrouping = new Map<number, Promise<void>>();

async function groupTab(tabId: number) {
  const promise = addTabToLiveBookmarksGroup(tabId);
  pendingGrouping.set(tabId, promise);
  try {
    await promise;
  } finally {
    pendingGrouping.delete(tabId);
  }
}
```

**Why it works**: Tracks actual completion, not arbitrary timeout.

**Pros/Cons**:
- Pros: Correct timing
- Cons: More complex

#### Option B: Increase timeout
Use larger timeout as safety margin.

**Why it works**: Reduces race window.

**Pros/Cons**:
- Pros: Simple
- Cons: Still arbitrary; may still race

#### Option C: Keep current with documentation
Document the 200ms assumption.

**Why it works**: Explicit about tradeoff.

**Pros/Cons**:
- Pros: No change needed
- Cons: Still has race potential

### Recommendation
**Maybe fix.** This was marked Fixed - the pending tab tracking mechanism was improved. The 200ms timeout is sufficient for typical tab grouping operations.

---

## Issue #7: Stale Tab References During Sort

### Problem
Sort iterates over tabs calling `chrome.tabs.move()` sequentially. If tab closed mid-sort, references become stale.

### Cause
**File:** `src/hooks/useTabs.ts` (lines 175-321, 439-477)

```typescript
for (const [index, tab] of sorted.entries()) {
  await new Promise<void>((resolve) => {
    chrome.tabs.move(tab.id!, { index }, () => {
      // tab.id could be stale if tab closed
      resolve();
    });
  });
}
```

### Suggested Fixes

#### Option A: Validate tab exists before each move
```typescript
for (const tab of sorted) {
  try {
    await chrome.tabs.get(tab.id!);  // Throws if closed
    await moveTabAsync(tab.id!, index);
  } catch {
    // Tab no longer exists, skip
  }
}
```

**Why it works**: Catches closed tabs before operating.

**Pros/Cons**:
- Pros: Robust to tab changes
- Cons: Extra API calls

#### Option B: Snapshot and validate upfront
Query all tabs, validate list, then execute.

**Why it works**: Reduces window for race.

**Pros/Cons**:
- Pros: Single validation point
- Cons: Still possible to race after validation

#### Option C: Handle chrome.runtime.lastError
Check for error after each move.

**Why it works**: Chrome tells us if tab missing.

**Pros/Cons**:
- Pros: No extra API calls
- Cons: Already doing this via handleError

### Recommendation
**Maybe fix.** Won't be fixed - the scenario (tab closing during sort) is unlikely, and the existing error handling via `handleError` catches chrome.runtime.lastError when the tab is missing. The sort completes successfully for remaining tabs.

---

## Issue #8: Missing Storage Area Filter

### Problem
Storage change listener responds to changes from any storage area (local, sync, session).

### Cause
**File:** `src/hooks/usePinnedSites.ts` (lines 71-76)

```typescript
const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
  if (changes[STORAGE_KEY]) {
    setPinnedSites(changes[STORAGE_KEY].newValue || []);
  }
};
chrome.storage?.onChanged.addListener(handleStorageChange);
// Missing areaName filter
```

### Suggested Fixes

#### Option A: Add area filter
```typescript
const handleStorageChange = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string
) => {
  if (areaName !== 'local') return;
  if (changes[STORAGE_KEY]) {
    setPinnedSites(changes[STORAGE_KEY].newValue || []);
  }
};
```

**Why it works**: Only responds to correct storage area.

**Pros/Cons**:
- Pros: Correct behavior
- Cons: Minor code change

#### Option B: Use area-specific listener
```typescript
chrome.storage.local.onChanged.addListener(handleStorageChange);
```

**Why it works**: Only fires for local storage.

**Pros/Cons**:
- Pros: Cleaner; no filter needed
- Cons: Need to check API availability

### Recommendation
**Yes fix.** Option A - explicit `areaName` filter ensures listeners only respond to changes in the correct storage area. This was marked Fixed.

---

## Issue #9: Fixed Timeout for DOM Updates

### Problem
Auto-scroll uses 50ms setTimeout which may not be enough for complex DOM updates.

### Cause
**File:** `src/components/TabList.tsx` (lines 1372-1377)

```typescript
setTimeout(() => {
  const element = document.querySelector(`[data-tab-id="${activeTab.id}"]`);
  element?.scrollIntoView(...);
}, 50);
```

### Suggested Fixes

#### Option A: Use requestAnimationFrame
```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const element = document.querySelector(...);
    element?.scrollIntoView(...);
  });
});
```

**Why it works**: Waits for paint cycle.

**Pros/Cons**:
- Pros: More reliable timing
- Cons: Still may miss slow renders

#### Option B: Use MutationObserver
Watch for element to appear.

**Why it works**: Reacts to actual DOM change.

**Pros/Cons**:
- Pros: Most reliable
- Cons: More complex

#### Option C: Add retry if element not found
```typescript
const tryScroll = (attempts = 0) => {
  const element = document.querySelector(...);
  if (element) {
    element.scrollIntoView(...);
  } else if (attempts < 5) {
    setTimeout(() => tryScroll(attempts + 1), 50);
  }
};
```

**Why it works**: Multiple attempts handle slow renders.

**Pros/Cons**:
- Pros: Simple retry logic
- Cons: Still using setTimeout

### Recommendation
**No fix needed.** The 50ms timeout works reliably in practice. React's virtual DOM updates are fast, and the scroll-to-active-tab feature works correctly. rAF would be marginally better but the current implementation is fine.

---

## Issue #10: Potential IntersectionObserver Leak

### Problem
useInView creates observers that may accumulate if not properly cleaned.

### Cause
**File:** Referenced in `src/components/TabList.tsx` (line 406)

### Suggested Fixes

#### Option A: Verify cleanup in useInView
Ensure observer.unobserve and listener cleanup happen.

**Why it works**: Proper cleanup prevents leaks.

**Pros/Cons**:
- Pros: Correct behavior
- Cons: Need to verify implementation

#### Option B: Use single shared observer
One observer for all items.

**Why it works**: No per-item observer to leak.

**Pros/Cons**:
- Pros: Memory efficient
- Cons: May need refactoring

### Recommendation
**No fix needed.** Won't be fixed - useInView uses a single shared IntersectionObserver singleton with proper listener cleanup. The observer properly unobserves elements and removes listeners when effects clean up. No leak occurs.

---

## Issue #11: Missing AbortController

### Problem
Async drop handler doesn't have cancellation support. Bookmark may be created after unmount.

### Cause
**File:** `src/hooks/useExternalLinkDrop.ts` (lines 191-272)

```typescript
const handleDrop = async (e: DragEvent) => {
  await createBookmarkAtTarget(url, title, target);  // No cancellation
};
```

### Suggested Fixes

#### Option A: Add AbortController
```typescript
const abortControllerRef = useRef<AbortController>();

useEffect(() => {
  abortControllerRef.current = new AbortController();
  return () => abortControllerRef.current?.abort();
}, []);

const handleDrop = async () => {
  if (abortControllerRef.current?.signal.aborted) return;
  await createBookmarkAtTarget(...);
};
```

**Why it works**: Cancels on unmount.

**Pros/Cons**:
- Pros: Clean cancellation
- Cons: More boilerplate

#### Option B: Keep current behavior
Bookmark creation after unmount is harmless and possibly desired.

**Why it works**: User initiated action should complete.

**Pros/Cons**:
- Pros: Simple; user intent respected
- Cons: State update warnings possible

### Recommendation
**No fix needed.** Option B - bookmark creation completing after unmount is harmless and actually desired. The user initiated the drop action and expects the bookmark to be created. Adding AbortController would be unnecessary complexity.

---

## Issue #12: Global Cooldown (Intentional)

### Problem
`globalCooldownUntil` is module-level shared state. This is intentional to prevent double-fires.

### Cause
**File:** `src/hooks/useSwipeNavigation.ts` (lines 11, 61, 66)

```typescript
let globalCooldownUntil = 0;  // Intentionally global
```

### Suggested Fixes

#### Option A: Keep current implementation
Design is intentional for coordinating multiple swipe handlers.

**Why it works**: Prevents duplicate swipe actions.

**Pros/Cons**:
- Pros: Correct behavior
- Cons: None

#### Option B: Add documentation
Comment explaining intentional global state.

**Why it works**: Future developers understand design.

**Pros/Cons**:
- Pros: Better maintainability
- Cons: None

### Recommendation
**No fix needed.** Option A - this is intentional design. The global cooldown coordinates swipe handling across multiple hook instances to prevent duplicate navigation actions when swiping. The code works as designed.

---

## Issue #13: One-by-One Tab Queries During Rebuild

### Problem
`rebuildAssociations` queries tabs individually. Tab changes during rebuild cause inconsistency.

### Cause
**File:** `src/contexts/BookmarkTabsContext.tsx` (lines 132-206)

```typescript
for (const tabId of tabIds) {
  const tab = await chrome.tabs.get(tabId);  // One at a time
}
```

### Suggested Fixes

#### Option A: Use chrome.tabs.query() for all tabs
```typescript
const tabs = await chrome.tabs.query({ windowId });
const tabMap = new Map(tabs.map(t => [t.id, t]));
for (const tabId of tabIds) {
  const tab = tabMap.get(tabId);
}
```

**Why it works**: Single atomic query; consistent snapshot.

**Pros/Cons**:
- Pros: Consistent data; faster
- Cons: May include tabs we don't need

#### Option B: Add debounce before rebuild
Wait for rapid changes to settle.

**Why it works**: Reduces mid-rebuild changes.

**Pros/Cons**:
- Pros: Fewer partial states
- Cons: Delayed initialization

#### Option C: Keep current with error handling
Current try/catch handles closed tabs.

**Why it works**: Graceful handling of missing tabs.

**Pros/Cons**:
- Pros: Already works
- Cons: More API calls; potential inconsistency

### Recommendation
**No fix needed.** Won't be fixed - Live Bookmark tabs are typically few in number (usually <10), so individual queries aren't a performance concern. Using chrome.tabs.query() for all tabs would fetch a potentially much larger collection. The current approach with error handling for closed tabs is appropriate.
