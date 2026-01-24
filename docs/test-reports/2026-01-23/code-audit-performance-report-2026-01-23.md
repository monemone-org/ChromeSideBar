# Code Audit: Performance

**Date:** 2026-01-23

## Purpose

Identifies performance issues including algorithmic complexity, unnecessary re-renders, missing memoization, and inefficient patterns in the ChromeSideBar extension.

## Summary Table

| Fix Status     | Issue # | Description                                     | Priority | Recommended | Dev Notes        |
| -------------- | ------- | ----------------------------------------------- | -------- | ----------- | ---------------- |
| Fixed          | 1       | O(n) array search inside loop - space tab query | High     | Maybe       |                  |
| Invalid        | 2       | Repeated array searches in visibleTabs          | High     | Maybe       | Already uses Set |
| Fixed          | 3       | Context value recreation - SpacesContext        | Medium   | Yes         |                  |
| Fixed          | 4       | Context value recreation - BookmarkTabsContext  | Medium   | Yes         |                  |
| Fixed          | 5       | Context value recreation - SelectionContext     | Medium   | Yes         |                  |
| Won't be fixed | 6       | New object creation in useCallback dependency   | Medium   | No          |                  |
| Won't be fixed | 7       | Multiple state updates in handleInputChange     | Medium   | No          |                  |
| Won't be fixed | 8       | Synchronous localStorage read in useState       | Medium   | No          |                  |
| Fixed          | 9       | Debug logging effects running in production     | Medium   | Maybe       |                  |
| Won't be fixed | 10      | Sequential await in loop for tab operations     | Medium   | No          |                  |
| Fixed          | 11      | Redundant useMemo for visibleTabGroups          | Low      | Yes         |                  |
| Won't be fixed | 12      | Large dependency array in displayItems useMemo  | Low      | No          |                  |
| Won't be fixed | 13      | Event listeners without cleanup check           | Low      | No          |                  |
| Won't be fixed | 14      | URL parsing in every filter call                | Low      | No          |                  |
| Won't be fixed | 15      | Large AST traversal for complex search queries  | Low      | No          |                  |

---

## Issue #1: O(n) Array Search Inside Loop - Space Tab Query

### Problem
When mapping tab IDs to tab objects, `tabs.find()` is called inside `.map()`, resulting in O(n*m) complexity. For large numbers of tabs, this could cause noticeable lag.

### Cause
**File:** `src/App.tsx` (lines 490-497)

```typescript
const playing = (response?.playingTabIds || [])
  .map((id: number) => tabs.find(t => t.id === id))
  .filter((t): t is chrome.tabs.Tab => t !== undefined);
```

Each ID triggers a full array scan of the tabs array.

### Suggested Fixes

#### Option A: Pre-build Map for O(1) lookups
```typescript
const tabMap = new Map(tabs.map(t => [t.id, t]));
const playing = (response?.playingTabIds || [])
  .map((id: number) => tabMap.get(id))
  .filter((t): t is chrome.tabs.Tab => t !== undefined);
```

**Why it works**: Map lookups are O(1) vs O(n) for array.find(), reducing overall complexity to O(n+m).

**Pros/Cons**:
- Pros: Significant speedup for large tab counts; minimal code change
- Cons: Extra memory for Map; overhead not worth it if playingTabIds is always small

#### Option B: Keep current implementation
Leave as-is since `playingTabIds` is typically very small (0-3 tabs).

**Why it works**: The actual performance impact is negligible for typical usage.

**Pros/Cons**:
- Pros: No code change; simpler
- Cons: Could become a problem if many tabs are playing audio

### Recommendation
**Maybe fix.** Option A if profiling shows this is a bottleneck; otherwise keep current implementation. The `playingTabIds` array is typically 0-3 items, so the O(n*m) complexity rarely matters in practice. Only invest in optimization if users report lag with many tabs playing audio simultaneously.

---

## Issue #2: Repeated Array Searches in visibleTabs Computation

**Status: Invalid**

### Problem (as reported)
The `visibleTabs` computation involves multiple `.find()` calls inside a `.filter()` loop when checking managed IDs and filter text.

### Analysis
This issue is **invalid**. The code already uses optimal O(1) lookups:

```typescript
// src/components/TabList.tsx (lines 774-775)
const managedTabIds = getManagedTabIds();  // Returns Set<number>
let filtered = tabs.filter(tab => !managedTabIds.has(tab.id!));  // Set.has() is O(1)
```

`getManagedTabIds()` already returns a `Set<number>` (defined in `BookmarkTabsContext.tsx:552`), and the filter uses `Set.has()` which is O(1). No fix needed.

---

## Issue #3: Context Value Object Recreation - SpacesContext

### Problem
The `value` object for `SpacesContext.Provider` is recreated on every render, potentially causing unnecessary re-renders of all context consumers.

### Cause
**File:** `src/contexts/SpacesContext.tsx` (lines 584-602)

```typescript
const value: SpacesContextValue = {
  spaces, allSpaces, activeSpace, // ... many more properties
};
```

A new object reference is created each render.

### Suggested Fixes

#### Option A: Wrap in useMemo
```typescript
const value = useMemo<SpacesContextValue>(() => ({
  spaces, allSpaces, activeSpace, // ...
}), [spaces, allSpaces, activeSpace, /* all dependencies */]);
```

**Why it works**: useMemo returns the same object reference if dependencies haven't changed.

**Pros/Cons**:
- Pros: Prevents unnecessary consumer re-renders
- Cons: Must maintain accurate dependency array

#### Option B: Split into multiple contexts
Separate frequently-changing values from stable callbacks.

**Why it works**: Consumers only re-render when their specific context changes.

**Pros/Cons**:
- Pros: More granular control over re-renders
- Cons: More complex provider structure; breaking change for consumers

### Recommendation
**Yes fix.** Option A - wrapping the context value in `useMemo` is a straightforward change that prevents unnecessary re-renders of all consumers. The dependency array is already well-defined.

---

## Issue #4: Context Value Object Recreation - BookmarkTabsContext

### Problem
Same as Issue #3 - context value object recreated on every render.

### Cause
**File:** `src/contexts/BookmarkTabsContext.tsx` (end of provider component)

### Suggested Fixes

#### Option A: Wrap in useMemo
Same approach as Issue #3.

**Why it works**: Memoization prevents object reference changes when values haven't changed.

**Pros/Cons**:
- Pros: Consistent with other context providers
- Cons: Dependency array maintenance

### Recommendation
**Yes fix.** Option A - apply same `useMemo` pattern as SpacesContext for consistency across all context providers.

---

## Issue #5: Context Value Object Recreation - SelectionContext

### Problem
Same as Issues #3 and #4.

### Cause
**File:** `src/contexts/SelectionContext.tsx` (lines 182-199)

### Suggested Fixes

#### Option A: Wrap in useMemo
```typescript
const value = useMemo<SelectionContextValue>(() => ({
  tabSelection, setTabSelection, // ...
}), [tabSelection, setTabSelection, /* ... */]);
```

**Why it works**: Same as previous issues.

**Pros/Cons**:
- Pros: Prevents re-renders; consistent pattern
- Cons: Dependency tracking

### Recommendation
**Yes fix.** Option A - maintain consistency by wrapping all context values in `useMemo`. This is a low-risk improvement that prevents unnecessary re-renders.

---

## Issue #6: New Object Creation in useCallback Dependency Array

### Problem
`resolveTabDropTarget` callback depends on `expandedGroups` which may be a new object reference on each render.

### Cause
**File:** `src/hooks/useExternalUrlDropForTabs.ts` (lines 77-151)

### Suggested Fixes

#### Option A: Use useRef for stable reference
Track expandedGroups in a ref if the callback doesn't need to re-render.

**Why it works**: Refs don't trigger re-renders when updated.

**Pros/Cons**:
- Pros: Stable callback reference
- Cons: Won't update callback when expandedGroups changes (may be required behavior)

#### Option B: Keep current implementation
The current behavior may be intentional - callback should update when expandedGroups changes.

**Why it works**: Ensures callback has access to current expanded state.

**Pros/Cons**:
- Pros: Correct behavior; simple
- Cons: More frequent callback recreation

### Recommendation
**No fix needed.** Option B - the callback intentionally needs to update when `expandedGroups` changes to have access to current expanded state. Using a ref would break this required behavior.

---

## Issue #7: Multiple State Updates in handleInputChange

### Problem
`handleInputChange` may trigger multiple state updates which could cause multiple re-renders.

### Cause
**File:** `src/components/Toolbar.tsx` (lines 205-246)

Multiple setState calls: `setInputValue`, `onUpdateRecent`, `setSessionRecentEntry`, `onFilterTextChange`.

### Suggested Fixes

#### Option A: Keep current (React 18+ batching)
React 18+ automatically batches state updates within event handlers.

**Why it works**: Modern React batches these updates into a single re-render.

**Pros/Cons**:
- Pros: No code change needed
- Cons: May not batch in some edge cases (async callbacks)

#### Option B: Use useReducer
Combine related state into a reducer for atomic updates.

**Why it works**: Single dispatch updates all related state at once.

**Pros/Cons**:
- Pros: Explicit atomic updates
- Cons: More complex; may be overkill

### Recommendation
**No fix needed.** Option A - React 18+ automatically batches all state updates within event handlers into a single re-render. The multiple setState calls are already optimized by the framework.

---

## Issue #8: Synchronous localStorage Read in useState Initializer

### Problem
localStorage.getItem() is synchronous and could block the main thread during component initialization.

### Cause
**File:** `src/hooks/useLocalStorage.ts` (lines 18-30)

```typescript
const [value, setValue] = useState<T>(() => {
  const saved = localStorage.getItem(key);  // Synchronous read
  // ...
});
```

### Suggested Fixes

#### Option A: Keep current implementation
For small data (settings), synchronous read is acceptable and prevents flash of default content.

**Why it works**: localStorage is fast for small values; sync read ensures correct initial render.

**Pros/Cons**:
- Pros: No flash of default content; simple
- Cons: Could block if many hooks read simultaneously

#### Option B: Async load in useEffect
Load in useEffect and show default initially.

**Why it works**: Non-blocking initialization.

**Pros/Cons**:
- Pros: Non-blocking
- Cons: Flash of default content; more complex

### Recommendation
**No fix needed.** Option A - localStorage is fast for small values (settings data). Synchronous read ensures correct initial render without flash of default content. The overhead is negligible for the small amount of settings data being read.

---

## Issue #9: Debug Logging Effects Running in Production

### Problem
useEffect hooks for debug logging still execute in production, checking the DEV flag each time.

### Cause
**File:** `src/contexts/SelectionContext.tsx` (lines 128-166)

```typescript
useEffect(() => {
  if (import.meta.env.DEV) {
    console.log('[Selection] tabSelection changed:', ...);
  }
}, [tabSelection]);
```

### Suggested Fixes

#### Option A: Wrap entire useEffect conditionally
```typescript
if (import.meta.env.DEV) {
  useEffect(() => {
    console.log('[Selection] tabSelection changed:', ...);
  }, [tabSelection]);
}
```

**Why it works**: The hook itself is removed in production builds by dead code elimination.

**Pros/Cons**:
- Pros: Zero overhead in production
- Cons: Technically violates hooks rules (conditional hook), but safe with build-time constants

#### Option B: Create debug-only module
Move all debug logging to a separate module that's tree-shaken in production.

**Why it works**: Build process removes unused code.

**Pros/Cons**:
- Pros: Clean separation; proper hooks usage
- Cons: More files to maintain

### Recommendation
**Maybe fix.** Option A is safe because `import.meta.env.DEV` is a build-time constant - the conditional hook is tree-shaken in production. However, the overhead of checking the DEV flag inside useEffect is negligible. Lower priority.

---

## Issue #10: Sequential await in Loop for Tab Operations

### Problem
Tab move operations use sequential await inside loops, which is slower than potential parallel execution.

### Cause
**File:** `src/hooks/useTabs.ts` (lines 135-166, 255-314)

```typescript
for (let i = 0; i < sortedTabs.length; i++) {
  await new Promise<void>((resolve) => {
    chrome.tabs.move(tab.id!, { index: targetIndex + i }, () => resolve());
  });
}
```

### Suggested Fixes

#### Option A: Keep current implementation
Chrome's tab API requires sequential moves to maintain correct order.

**Why it works**: Parallel moves would result in unpredictable final order.

**Pros/Cons**:
- Pros: Correct behavior guaranteed
- Cons: Slower for many tabs

#### Option B: Batch with single API call (if available)
Use chrome.tabs.move with array of tab IDs if Chrome API supports it.

**Why it works**: Single API call is optimized internally.

**Pros/Cons**:
- Pros: Faster
- Cons: May not maintain exact order; API limitations

### Recommendation
**No fix needed.** Option A - sequential execution is required for correctness. Chrome's tab API needs sequential moves to maintain predictable final tab order. Parallel moves would result in race conditions and unpredictable ordering.

---

## Issue #11: Redundant useMemo for visibleTabGroups

### Problem
useMemo wraps a simple identity return.

### Cause
**File:** `src/components/TabList.tsx` (lines 804-807)

```typescript
const visibleTabGroups = useMemo(() => {
  return tabGroups;
}, [tabGroups]);
```

### Suggested Fixes

#### Option A: Remove unnecessary useMemo
```typescript
const visibleTabGroups = tabGroups;
```

**Why it works**: Direct assignment has same effect without useMemo overhead.

**Pros/Cons**:
- Pros: Cleaner code; no overhead
- Cons: None

### Recommendation
**Yes fix.** Option A - the `useMemo` wrapping an identity return adds overhead without benefit. Simply using `const visibleTabGroups = tabGroups;` is cleaner and correct.

---

## Issue #12: Large Dependency Array in displayItems useMemo

### Problem
displayItems useMemo has many dependencies, causing frequent recomputation.

### Cause
**File:** `src/components/TabList.tsx` (lines 1387+)

### Suggested Fixes

#### Option A: Keep current implementation
The dependencies are all necessary; computation must run when any changes.

**Why it works**: Correct behavior requires recomputation on these changes.

**Pros/Cons**:
- Pros: Correct; memoization still helps
- Cons: Frequent recomputation

#### Option B: Split into smaller memos
Break into smaller useMemo calls with fewer dependencies each.

**Why it works**: Only parts that changed need recomputation.

**Pros/Cons**:
- Pros: More granular caching
- Cons: More complex; may not help if dependencies overlap

### Recommendation
**No fix needed.** Option A - the dependencies are all necessary for correct behavior. Memoization still prevents recomputation when none of the dependencies change. Splitting would add complexity without clear benefit since dependencies often change together.

---

## Issue #13: Event Listeners Without Cleanup Check

### Problem
If containerRef.current is null at cleanup time, listener removal fails silently.

### Cause
**File:** `src/hooks/useExternalLinkDrop.ts` (lines 289-299)

### Suggested Fixes

#### Option A: Store container reference at setup
```typescript
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  // setup...
  return () => {
    container.removeEventListener('dragover', handleDragOver);
  };
}, [...]);
```

**Why it works**: Closure captures the container reference at setup time.

**Pros/Cons**:
- Pros: Guaranteed cleanup; defensive coding
- Cons: Minor code change

### Recommendation
**No fix needed.** In practice, containerRef.current being null at cleanup is an edge case that doesn't cause memory leaks - removeEventListener on null simply does nothing. The current code works correctly for normal usage patterns.

---

## Issue #14: URL Parsing in Every Filter Call

### Problem
`getHostname` creates a new URL object for every call during filtering.

### Cause
**File:** `src/hooks/useTabs.ts` (lines 5-16)

### Suggested Fixes

#### Option A: Keep current implementation
URL parsing is fast; overhead is minimal for typical tab counts.

**Why it works**: Modern JS engines optimize URL parsing well.

**Pros/Cons**:
- Pros: Simple; correct
- Cons: Could matter with 100+ tabs

#### Option B: Cache parsed hostnames
Memoize hostname by URL string.

**Why it works**: Avoids redundant parsing of same URLs.

**Pros/Cons**:
- Pros: Faster repeated lookups
- Cons: Cache invalidation; memory overhead

### Recommendation
**No fix needed.** Option A - URL parsing is highly optimized in modern JS engines. With typical tab counts (under 100), the overhead is negligible. Adding a cache would introduce memory overhead and cache invalidation complexity without measurable benefit.

---

## Issue #15: Large AST Traversal for Complex Search Queries

### Problem
Recursive AST evaluation for every filtered item could be slow with complex queries.

### Cause
**File:** `src/utils/searchParser.ts` (lines 315-338)

### Suggested Fixes

#### Option A: Keep current implementation
AST is already cached; traversal is efficient for typical queries.

**Why it works**: Most queries are simple; complex queries are rare.

**Pros/Cons**:
- Pros: Works well for typical usage
- Cons: Could slow with very complex boolean queries on large datasets

#### Option B: Convert to iterative evaluation
Remove recursion for potentially better performance.

**Why it works**: Reduces function call overhead.

**Pros/Cons**:
- Pros: Slightly faster
- Cons: More complex code; marginal benefit

### Recommendation
**No fix needed.** Option A - the AST is already cached, and most user queries are simple (1-2 terms). Complex boolean queries are rare, and recursive traversal is fast for typical AST depths. Converting to iterative would add complexity for marginal benefit.
