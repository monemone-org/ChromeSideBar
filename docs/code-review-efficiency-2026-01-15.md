# Code Review: O(n²) and Inefficient Patterns

**Date:** 2026-01-15
**Updated:** 2026-01-15 (fixes applied)

Found **15 issues** ranging from true O(n²) to O(2n) patterns. **4 fixed.**

---

## High Priority

### 1. ~~`useCloseAllTabsInSpace.ts:66-70` - True O(n²)~~ ✓ FIXED

**Problem:** `Array.includes()` is O(n) for each iteration, making the loop O(n²).

**Fix:** Used a Set for O(1) lookups.

---

## Medium Priority

### 2. ~~`BookmarkTree.tsx:746-780` - O(3n) tree traversals~~ ✓ FIXED

**Problem:** Multiple sequential `filterBookmarksRecursive` calls, each traversing the entire tree.

**Fix:** Combined all predicates into a single `filterBookmarksRecursive` pass.

---

## Low Priority

### 3. `BookmarkTree.tsx:225-251` - `isDescendant` function

```typescript
const isDescendant = (
  nodeId: string,
  targetId: string,
  bookmarks: chrome.bookmarks.BookmarkTreeNode[]
): boolean => {
  const findNode = (nodes: chrome.bookmarks.BookmarkTreeNode[], id: string): chrome.bookmarks.BookmarkTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const checkDescendants = (node: chrome.bookmarks.BookmarkTreeNode): boolean => {
    if (node.id === targetId) return true;
    if (node.children) {
      return node.children.some(child => checkDescendants(child));
    }
    return false;
  };

  const sourceNode = findNode(bookmarks, nodeId);
  return sourceNode ? checkDescendants(sourceNode) : false;
};
```

**Problems:**
- Defined inline, recreated every render
- Double traversal: `findNode` O(n) + `checkDescendants` O(m)

**Fix:** Memoize with `useCallback` or move outside component. Consider building an index Map if called frequently.

---

### 4. `useTabs.ts:180-190` - Sequential tab moves

```typescript
for (const [index, tab] of sorted.entries())
{
  await new Promise<void>((resolve) =>
  {
    chrome.tabs.move(tab.id!, { index }, () =>
    {
      handleError('sort');
      resolve();
    });
  });
}
```

**Problem:** Sequential `await` for each tab move - O(n) API calls in series.

**Fix:** Chrome's `tabs.move` can batch multiple tabs:
```typescript
const tabIds = sorted.map(tab => tab.id!);
await chrome.tabs.move(tabIds, { index: 0 });
```

---

### 5. `useBookmarks.ts:130-145` - Sequential bookmark moves

```typescript
for (const [index, item] of sorted.entries()) {
  await new Promise<void>((resolve) => {
    chrome.bookmarks.move(item.id, { parentId: folderId, index }, () => {
      handleError('sort move');
      resolve();
    });
  });
}
```

**Problem:** Sequential `await` for each bookmark - O(n) API calls in series.

**Note:** Chrome's bookmark API doesn't support batch moves, so this is inherently limited. Could potentially parallelize non-conflicting moves.

---

### 6. `TabList.tsx:1433-1477` - O(2n) for display items

```typescript
const displayItems = useMemo<DisplayItem[]>(() =>
{
  // First pass: build tabsByGroup
  visibleTabs.forEach((tab) => { ... });

  // Second pass: build items
  visibleTabs.forEach((tab, index) => { ... });

  return items;
}, [visibleTabs, visibleTabGroups]);
```

**Problem:** Two iterations over `visibleTabs`.

**Fix:** Combine into a single pass by building `tabsByGroup` and `items` simultaneously.

---

### 7. `useSpaces.ts:171-184` / `usePinnedSites.ts:172-185` - O(2n)

```typescript
const oldIndex = spaces.findIndex(s => s.id === activeId);
const newIndex = spaces.findIndex(s => s.id === overId);
```

**Problem:** Two separate `findIndex` calls, each O(n).

**Note:** Minor issue since spaces/pinned arrays are typically small.

**Fix:**
```typescript
let oldIndex = -1, newIndex = -1;
for (let i = 0; i < spaces.length; i++) {
  if (spaces[i].id === activeId) oldIndex = i;
  if (spaces[i].id === overId) newIndex = i;
  if (oldIndex !== -1 && newIndex !== -1) break;
}
```

---

### 8. `useSpaceWindowState.ts:146-156` - O(n) with allocation

```typescript
const spaceId = Object.entries(state.spaceTabGroupMap).find(
  ([_, groupId]) => groupId === tabGroupId
)?.[0];
```

**Problem:** `Object.entries` creates an intermediate array.

**Fix:** Iterate directly or maintain a reverse lookup map:
```typescript
for (const [spaceId, groupId] of Object.entries(state.spaceTabGroupMap))
{
  if (groupId === tabGroupId)
  {
    clearTabGroupForSpace(spaceId);
    break;
  }
}
```

---

## Additional Findings (Second Review Pass)

### 9. ~~`PinnedBar.tsx:66-80` - Chained `.filter()` calls~~ ✓ FIXED

**Problem:** Three separate `.filter()` iterations when all filters are active.

**Fix:** Combined into a single `.filter()` with all predicates.

---

### 10. `BookmarkTree.tsx:991` - Expensive `isDescendant` check during drag

```typescript
// Called on every drag move event
if (isDescendant(sourceId, target.bookmarkId, bookmarks))
{
  setDropTargetId(null);
  setDropPosition(null);
  clearAutoExpandTimer();
  return;
}
```

The `isDescendant` function (lines 225-251) does **two** tree traversals:
1. `findNode(bookmarks, nodeId)` - O(n) to find the source node
2. `checkDescendants(sourceNode)` - O(m) to check all descendants

**Problem:** O(n + m) on every mouse move during drag. With large bookmark trees, this causes jank.

**Fix:** Walk UP from target using `parentId` instead of searching DOWN from source. Chrome bookmark nodes have `parentId`:

```typescript
const isDescendantOf = (
  targetId: string,
  sourceId: string,
  nodeMap: Map<string, chrome.bookmarks.BookmarkTreeNode>
): boolean => {
  let currentId: string | undefined = targetId;
  while (currentId)
  {
    if (currentId === sourceId) return true;
    const node = nodeMap.get(currentId);
    currentId = node?.parentId;
  }
  return false;
};
```

This changes O(n + m) to O(depth), typically 5-10 levels max.

**Prerequisite:** Build a memoized `nodeMap` for O(1) lookups:
```typescript
const nodeMap = useMemo(() => {
  const map = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
  const build = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
    for (const node of nodes) {
      map.set(node.id, node);
      if (node.children) build(node.children);
    }
  };
  build(bookmarks);
  return map;
}, [bookmarks]);
```

---

### 11. ~~`BookmarkTree.tsx:1000-1001` - Unnecessary `findNode` call during drag~~ ✓ FIXED

**Problem:** Code traversed the entire bookmark tree O(n) just to check if the dragged item is a special folder, but `sourceId` already IS the bookmark ID.

**Fix:** Removed the `findNode` call, now checks `SPECIAL_FOLDER_IDS.includes(sourceId)` directly. O(n) → O(1).

---

### 12. `TabList.tsx:1692-2030` - Multiple linear searches in `handleDragEnd`

```typescript
const handleDragEnd = useCallback(async (_event: DragEndEvent) => {
  const tab = visibleTabs.find(t => t.id === activeId);  // Line 1699
  const groupTabs = visibleTabs.filter(t => t.groupId === group.id);  // Line 1764
  const targetGroupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === targetGroupId);  // Line 1883
  const targetTab = visibleTabs.find(t => t.id === targetTabId);  // Line 1904
  const sourceGroupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === draggedGroupId);  // Line 1920
  const sourceTab = visibleTabs.find(t => t.id === activeId);  // Line 1935
  // ... more find/filter calls
}, [...]);
```

**Problem:** Multiple O(n) scans of the tabs array. While not as frequent as drag move, this creates unnecessary overhead.

**Fix:** Create lookup Maps using `useMemo`:
```typescript
const tabsById = useMemo(() => {
  const map = new Map<number, chrome.tabs.Tab>();
  visibleTabs.forEach(t => map.set(t.id!, t));
  return map;
}, [visibleTabs]);

const tabsByGroupId = useMemo(() => {
  const map = new Map<number, chrome.tabs.Tab[]>();
  visibleTabs.forEach(t => {
    const groupId = t.groupId ?? -1;
    if (!map.has(groupId)) map.set(groupId, []);
    map.get(groupId)!.push(t);
  });
  return map;
}, [visibleTabs]);
```

Then replace:
- `.find(t => t.id === id)` → `tabsById.get(id)`
- `.filter(t => t.groupId === gid)` → `tabsByGroupId.get(gid) || []`

---

### 13. `TabList.tsx:1611-1617` - DOM queries in drag move

```typescript
// Inside handleDragMove, called on every mouse move:
const groupHeader = document.querySelector(`[data-group-header-id="${tabGroupId}"]`) as HTMLElement | null;
const groupTabs = document.querySelectorAll(`[data-group-id="${tabGroupId}"]`);

if (groupHeader && groupTabs.length > 0) {
  const headerRect = groupHeader.getBoundingClientRect();
  const lastTabRect = (groupTabs[groupTabs.length - 1] as HTMLElement).getBoundingClientRect();
  // ...
}
```

**Problem:** DOM queries + `getBoundingClientRect()` (forces layout reflow) on every mouse move during group drag.

**Fix:** Cache element references and bounding rects when drag starts. Only recalculate on scroll or significant position changes.

---

### 14. `useBookmarks.ts:330-350` - `getBookmarkPath` sequential API calls

```typescript
const getBookmarkPath = useCallback(async (bookmarkId: string): Promise<string> =>
{
  const pathParts: string[] = [];
  let currentId: string | undefined = bookmarkId;

  while (currentId)
  {
    const node = await getBookmark(currentId);
    if (!node) break;

    if (node.id !== '0' && node.title)
    {
      pathParts.unshift(node.title);
    }

    currentId = node.parentId;
  }

  return pathParts.join('/');
}, [getBookmark]);
```

**Problem:** Each `getBookmark` call is an async Chrome API call. For deeply nested bookmarks, this results in O(depth) sequential API calls.

**Impact:** Low - only called when creating/updating spaces.

---

### 15. `backupRestore.ts:78-103` - Sequential bookmark creation

```typescript
async function importBookmarkNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentId: string
): Promise<number> {
  let count = 0;
  if (node.url) {
    await chrome.bookmarks.create({ ... });
    count = 1;
  } else if (node.children) {
    const folder = await chrome.bookmarks.create({ ... });
    for (const child of node.children) {
      count += await importBookmarkNode(child, folder.id);
    }
  }
  return count;
}
```

**Problem:** Sequential awaits for each bookmark creation.

**Impact:** Low - only runs during import operations.

---

## Summary

| Priority | Location | Issue | Complexity | Status |
|----------|----------|-------|------------|--------|
| **High** | `useCloseAllTabsInSpace.ts:66-70` | Array.includes() in loop | O(n²) | ✓ Fixed |
| **High** | `BookmarkTree.tsx:991` | isDescendant called per drag move | O(n+m) per event | |
| **High** | `BookmarkTree.tsx:1000-1001` | Unnecessary findNode (just remove it) | O(n) per event | ✓ Fixed |
| Medium | `BookmarkTree.tsx:746-780` | Multiple filter passes | O(3n) | ✓ Fixed |
| Medium | `PinnedBar.tsx:66-80` | Chained .filter() calls | O(3n) | ✓ Fixed |
| Medium | `TabList.tsx:1692-2030` | Multiple .find()/.filter() in handleDragEnd | O(kn) | |
| Medium | `TabList.tsx:1611-1617` | DOM queries + reflow per drag move | DOM thrash | |
| Low | `useTabs.ts:180-190` | Sequential await in loop | O(n) serial | |
| Low | `useBookmarks.ts:130-145` | Sequential await in loop | O(n) serial | |
| Low | `TabList.tsx:1433-1477` | Two iterations over tabs | O(2n) | |
| Low | `useSpaces.ts` / `usePinnedSites.ts` | Two findIndex calls | O(2n) | |
| Low | `useSpaceWindowState.ts:146-156` | Object.entries + find | O(n) | |
| Low | `useBookmarks.ts:330-350` | getBookmarkPath sequential API | O(depth) | |
| Low | `backupRestore.ts:78-103` | Sequential bookmark creation | Sequential | |

## Recommendations

1. ~~**Fix immediately:**~~ ✓ Done
   - ~~`useCloseAllTabsInSpace.ts` - true O(n²), easy fix with Set~~ ✓
   - ~~`BookmarkTree.tsx:1000-1001` - just remove the unnecessary `findNode` call~~ ✓

2. **Fix soon (drag performance):**
   - `BookmarkTree.tsx:991` - change `isDescendant` to walk up via parentId
   - `TabList.tsx:1611-1617` - cache DOM refs at drag start

3. **Nice to have:**
   - Build `nodeMap` in BookmarkTree for O(1) lookups
   - Build `tabsById` / `tabsByGroupId` Maps in TabList
   - ~~Combine filter passes in `BookmarkTree.tsx` and `PinnedBar.tsx`~~ ✓

4. **Acceptable:** The rest are minor or run infrequently
