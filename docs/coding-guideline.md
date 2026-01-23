# Coding Guidelines

Project-specific coding tips and patterns learned from development.

## Chrome Extension APIs

### Always Pass `windowId` to Tab APIs

When calling `chrome.tabs.create()`, `chrome.tabs.update()`, or similar tab APIs from the sidebar UI, **always pass `windowId`**.

**Why:** Without `windowId`, Chrome creates/operates on tabs in the *currently focused window*, not the sidebar's window. This causes issues when multiple browser windows are open.

**Error you might see:**
```
Tabs can only be moved to and from normal windows.
```

**Pattern:**

```typescript
// Get windowId from SpacesContext
const { windowId } = useSpacesContext();

// Always include windowId in tab creation
chrome.tabs.create({
  url: 'https://example.com',
  active: true,
  windowId: windowId ?? undefined
});
```

**For hooks:** Pass `windowId` as a parameter:

```typescript
// Hook accepts windowId
export const useTabs = (windowId?: number) => {
  const createTab = useCallback(() => {
    chrome.tabs.create({ active: true, windowId }, () => {
      // ...
    });
  }, [windowId]);
};

// Caller passes windowId from context
const { windowId } = useSpacesContext();
const { createTab } = useTabs(windowId ?? undefined);
```

**Affected APIs:**
- `chrome.tabs.create()` - specify which window to create tab in
- `chrome.tabs.group()` - groups are window-specific
- `chrome.tabGroups.query()` - query groups in specific window

**Safe without windowId:**
- `chrome.tabs.remove(tabId)` - operates on specific tab
- `chrome.tabs.update(tabId, ...)` - operates on specific tab
- `chrome.tabs.get(tabId)` - reads specific tab

---

### Use `createProperties.windowId` for `chrome.tabs.group()`

When creating a new tab group with `chrome.tabs.group()`, **always pass `createProperties.windowId`**.

**Why:** Without `createProperties.windowId`, Chrome creates the group in the *currently focused window*, not the window where the tabs are. This causes tabs to move to the wrong window when multiple windows are open.

**Symptom:** Creating a new tab (Cmd+T) in Window 2 while a Space is active moves the tab to Window 1.

**Pattern:**

```typescript
// BAD: Group created in focused window, tab may move unexpectedly
const groupId = await chrome.tabs.group({ tabIds: [tabId] });

// GOOD: Group created in the correct window
const groupId = await chrome.tabs.group({
  tabIds: [tabId],
  createProperties: { windowId }
});

// If windowId not available, get it from the tab
const tab = await chrome.tabs.get(tabId);
const groupId = await chrome.tabs.group({
  tabIds: [tabId],
  createProperties: { windowId: tab.windowId }
});
```

**Note:** This only applies when creating a *new* group. When adding to an existing group via `groupId`, the window is already determined by that group.

---

### Service Worker State Persistence

Chrome suspends background service workers after ~30 seconds of idle, **losing all in-memory state**.

**Why:** Any variables or state stored in memory in `background.ts` will be gone when the service worker wakes up again. This causes features to "forget" their state randomly.

**Pattern:** Use `chrome.storage.session` for state that needs to survive restarts:

```typescript
// BAD: State lost when service worker suspends
let pinnedTabs: number[] = [];

// GOOD: State persists across service worker restarts
async function getPinnedTabs(): Promise<number[]> {
  const result = await chrome.storage.session.get('pinnedTabs');
  return result.pinnedTabs ?? [];
}

async function setPinnedTabs(tabs: number[]): Promise<void> {
  await chrome.storage.session.set({ pinnedTabs: tabs });
}
```

**When to apply:** Any background script state that:
- Needs to persist longer than a few seconds
- Is referenced by event listeners that fire after idle periods
- Tracks ongoing operations or user preferences

---

### Race Conditions with Chrome API Calls

Concurrent Chrome tab/group operations can fail or produce unexpected results.

**Why:** Chrome's tab and group APIs don't handle concurrent modifications well. Two simultaneous `chrome.tabs.group()` calls might both succeed but produce wrong group assignments.

**Pattern:** Use queue-based batching for operations that might run concurrently:

```typescript
// BAD: Multiple rapid calls can race
tabs.forEach(tab => {
  chrome.tabs.group({ tabIds: [tab.id], groupId });
});

// GOOD: Batch operations into single call
chrome.tabs.group({
  tabIds: tabs.map(t => t.id),
  groupId
});

// GOOD: For complex operations, use a queue
const operationQueue: Array<() => Promise<void>> = [];
let isProcessing = false;

async function enqueueOperation(op: () => Promise<void>) {
  operationQueue.push(op);
  if (!isProcessing) {
    isProcessing = true;
    while (operationQueue.length > 0) {
      const nextOp = operationQueue.shift()!;
      await nextOp();
    }
    isProcessing = false;
  }
}
```

**When to apply:**
- Tab grouping/ungrouping operations
- Multiple tabs being created/moved simultaneously
- Any operation triggered by rapid user actions (drag-drop, multi-select)

---

### Handle Tab Detachment for Multi-Window

When tracking tabs, listen for `chrome.tabs.onDetached` to clean up when tabs move to another window.

**Why:** A tab moving to another window fires `onDetached` (not `onRemoved`). If you only listen for `onRemoved`, your state will have stale references to tabs that are now in a different window.

**Pattern:**

```typescript
// Track tabs being removed OR detached from this window
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (removeInfo.windowId === currentWindowId) {
    removeTabFromState(tabId);
  }
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  if (detachInfo.oldWindowId === currentWindowId) {
    removeTabFromState(tabId);
  }
});
```

**When to apply:**
- Any feature that tracks tab state per-window (pinned tabs, tab order, etc.)
- Features that assume tabs stay in the same window

---

### Return Errors from Chrome API Wrappers

Return `{ result, error }` instead of just `result` so callers can display errors to users.

**Why:** Chrome APIs can fail for many reasons (invalid URLs, permission denied, tab closed). Callers need errors to show meaningful feedback instead of silent failures.

**Pattern:**

```typescript
// BAD: Caller can't tell why it failed
async function createBookmark(url: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  try {
    return await chrome.bookmarks.create({ url, title });
  } catch {
    return null;
  }
}

// GOOD: Caller can display specific error
interface BookmarkResult {
  bookmark: chrome.bookmarks.BookmarkTreeNode | null;
  error: string | null;
}

async function createBookmark(url: string): Promise<BookmarkResult> {
  try {
    const bookmark = await chrome.bookmarks.create({ url, title });
    return { bookmark, error: null };
  } catch (e) {
    return { bookmark: null, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Usage
const { bookmark, error } = await createBookmark(url);
if (error) {
  showToast(`Failed to create bookmark: ${error}`);
}
```

**When to apply:**
- Any Chrome API wrapper used by UI components
- Operations where user should know if something failed

---


### Scope State by Window/Space

Include `windowId` or `spaceId` in storage keys when state should be scoped per-window or per-space.

**Why:** Without scoping, all windows share the same state. Expanding a folder in one window would expand it in all windows.

**Pattern:**

```typescript
// BAD: All windows share the same expanded state
const EXPANDED_KEY = 'expandedFolders';

// GOOD: Each window has its own expanded state
function getExpandedKey(windowId: number): string {
  return `expandedFolders_${windowId}`;
}

// For space-scoped state
function getSpaceKey(spaceId: string, suffix: string): string {
  return `space_${spaceId}_${suffix}`;
}
```

**When to apply:**
- UI state like expanded/collapsed folders
- Selection state
- Any state where different windows/spaces should have independent values

---

## UI Patterns

### Dropdown Dismiss Click Handling

Use transparent overlay pattern to prevent dropdown dismiss clicks from triggering underlying UI elements.

**Why:** When user clicks outside a dropdown to close it, that click can trigger whatever is underneath (opening a tab, selecting an item, etc.). This is unexpected and frustrating.

**Pattern:**

```tsx
// Overlay captures the dismiss click
{isDropdownOpen && (
  <>
    {/* Invisible overlay to catch clicks */}
    <div
      className="fixed inset-0 z-40"
      onClick={() => setIsDropdownOpen(false)}
    />
    {/* Dropdown content */}
    <div className="absolute z-50 ...">
      {/* dropdown items */}
    </div>
  </>
)}
```

**When to apply:**
- Context menus
- Dropdown menus
- Any popup that dismisses on outside click

---

### Drag-Drop Auto-Expand Behavior

During drag-drop, hovering over collapsible items should **expand-only, never collapse**.

**Why:** Toggle behavior during drag is confusing - user hovers over folder, it expands, cursor moves slightly, it collapses, etc. Expand-only gives predictable behavior.

**Pattern:**

```typescript
const handleDragEnter = (folderId: string) => {
  // Only expand, never collapse
  if (!expandedFolders.has(folderId)) {
    setExpandedFolders(prev => new Set([...prev, folderId]));
  }
};

// Don't trigger collapse on drag leave - user might still be
// trying to drop inside the expanded content
const handleDragLeave = () => {
  // Do nothing - folder stays expanded
};
```

**When to apply:**
- Dragging tabs/bookmarks over folders
- Dragging over collapsible tree nodes
- Any drag-drop over expandable containers
