---
created: 2026-01-01
after-version: 1.0.103
status: completed
---

# Arc-like Bookmark-Tab Behavior

## Purpose

Bring Arc browser's unified bookmark-tab experience to Chrome. In Arc, bookmarks act as "persistent tabs" that can be opened and closed without being deleted—combining the permanence of bookmarks with the convenience of tabs.

## Core Behavior

### Bookmark-Tab Association
- Each bookmark can have an associated tab (loaded) or not (unloaded)
- Clicking a bookmark:
  - If unloaded → opens the bookmarked URL in a new associated tab
  - If loaded → activates the existing associated tab
- Association persists even if user navigates away from the bookmarked URL
- Closing the tab does **not** delete the bookmark
- Re-clicking an unloaded bookmark reloads the original bookmarked URL

### Scope
- Applies to **all bookmarks**, including those in nested folders
- Also applies to **pinned sites**

## Settings

### Arc style bookmarks (optional)

This behavior is controlled by the **"Arc style bookmarks"** setting in Settings dialog.

| Setting | Default | Description |
|---------|---------|-------------|
| Arc style bookmarks | ON | When enabled, bookmarks act as persistent tabs that can be reopened similar to Arc browser |

**When ON (default):**
- Bookmarks and pinned sites open as managed tabs (tracked by tabId)
- Managed tabs are hidden from the Tabs section in sidebar
- Close button (X) visible on loaded bookmark rows
- Audio indicator visible when tab is playing sound
- Active bookmark highlighted with blue background
- Pinned sites show cyan background when loaded

**When OFF:**
- Bookmarks and pinned sites open as regular Chrome tabs (not tracked)
- No close button on bookmark rows
- No audio indicator on bookmark rows
- No active state highlighting
- No loaded indicator on pinned sites
- Behavior matches Chrome's native bookmark UI

**Modifier keys (unchanged by setting):**
- Cmd/Ctrl+Click: Opens as unmanaged new tab
- Shift+Click: Opens in new window

## Tab Visibility Management

Managed tabs (opened via bookmarks/pinned sites) are hidden from the sidebar's Tabs section:

| Aspect | Behavior |
|--------|----------|
| Managed tabs | Hidden from Tabs section, visible in Chrome's tab bar |
| Regular tabs | Visible in Tabs section |
| Filtering | Based on tabId tracking, not tab groups |

### Session Loss Behavior
When extension reloads or browser restarts:
- Session storage (`chrome.storage.session`) is cleared
- Associations between bookmarks and tabs are lost
- Previously managed tabs appear as regular tabs in the sidebar
- Clicking a bookmark creates a new association

## Per-Window Behavior

- Bookmark-tab associations are **per-window**
- Each browser window maintains its own state
- Clicking a bookmark only affects the current window

## User Workflows

### Opening a Bookmark
1. User clicks a bookmark row
2. If no associated tab exists → create new tab, store association, load URL
3. If associated tab exists → activate that tab
4. Bookmark row shows close button (X icon) - always visible when loaded

### Closing a Bookmark Tab

**Via sidebar close button:**
1. Close button (X icon) is always visible on loaded bookmark rows
2. User clicks close button
3. Tab is closed, bookmark remains (now unloaded)

**Via Chrome (manual close):**
1. User closes the tab directly in Chrome (click X on tab, Cmd+W, etc.)
2. Extension listens for `chrome.tabs.onRemoved` event
3. Updates bookmark-tab association (mark as unloaded)

### Pinned Sites
- Opened as regular tabs with tracked association (same as bookmarks)
- Same open/close behavior as bookmarks

## UI Changes

### Bookmark Row
```
Bookmark (depth=0, unloaded):
┌───────────────────────────────────────────────────────┐
│[🔊]       [favicon] Bookmark Title            [📌] [  ]│
└───────────────────────────────────────────────────────┘

Bookmark (depth=2, loaded, playing audio):
┌───────────────────────────────────────────────────────┐
│[🔊]       [favicon] Bookmark Title           [📌] [X] │
└───────────────────────────────────────────────────────┘
  ↑    indent
  fixed left

Folder (depth=2):
┌───────────────────────────────────────────────────────┐
│         [▶] [📁] Folder Name                          │
└───────────────────────────────────────────────────────┘
   indent
```
- **Speaker icon**: Fixed at far left (outside folder indentation), visible when playing audio
- **Close button (X)**: Always visible when tab is loaded
- **Pin button**: Appears on hover only
- **Spacer**: Maintains alignment when unloaded (same width as X button)
- **Folders**: No speaker icon, normal depth-based indentation

### Pinned Site Icon (loaded state)
```
┌─────────┐     ┌─────────┐
│  icon   │     │ ▓▓▓▓▓▓▓ │
│ (idle)  │     │ ▓ icon ▓│ ← cyan background
│         │     │ ▓▓▓▓▓▓▓ │
└─────────┘     └─────────┘
  unloaded         loaded
```
- Subtle cyan background (`bg-cyan-500/20`) when pinned site has an open tab

### Tabs Section
- Filter out tabs that have bookmark/pinned associations (by tabId)
- These tabs are managed via their bookmark/pinned-site rows instead

## Implementation

### Architecture

Uses React Context (`BookmarkTabsContext`) to share state across all sidebar components.

**File:** `src/contexts/BookmarkTabsContext.tsx`

### Tracking Bookmark-Tab Associations

Use `chrome.storage.session` API to store tabId → itemKey mappings:

```typescript
// Storage key
const STORAGE_KEY = 'tabAssociations';

// Store association
chrome.storage.session.get(STORAGE_KEY, (result) => {
  const associations = result[STORAGE_KEY] || {};
  associations[tabId] = itemKey;  // e.g., "bookmark-123" or "pinned-456"
  chrome.storage.session.set({ [STORAGE_KEY]: associations });
});
```

**Persistence behavior:**
| Event | Associations |
|-------|--------------|
| Sidebar close/open | Preserved |
| Extension reload | Cleared (tabs still exist, but associations lost) |
| Browser restart | Cleared |

### Runtime State

Each sidebar instance maintains in-memory mappings for fast lookup:

```typescript
// Per-window state (React Context)
Map<itemKey, tabId>   // bookmark/pinned → tab
Map<tabId, itemKey>   // tab → bookmark/pinned (for event handling)
Set<tabId>            // tabs currently playing audio
```

### Event Listeners

| Event | Action |
|-------|--------|
| `chrome.tabs.onRemoved` | Clear association, remove from storage |
| `chrome.tabs.onUpdated` (audible) | Update audible tabs set |
| Sidebar open | Rebuild associations from storage |

### Restoration Flow (on sidebar open)

1. Get stored associations from `chrome.storage.session`
2. For each stored tabId, verify tab still exists
3. Remove stale associations (tabs that no longer exist)
4. Rebuild in-memory maps

### Key Functions

```
┌─────────────────────────────────────────────────────────┐
│ openBookmarkTab(bookmarkId, url)                        │
├─────────────────────────────────────────────────────────┤
│ 1. Check if bookmarkId has associated tabId             │
│ 2. If yes → chrome.tabs.update(tabId, {active: true})   │
│ 3. If no  → create tab, store association               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ closeBookmarkTab(bookmarkId)                            │
├─────────────────────────────────────────────────────────┤
│ 1. Get tabId from bookmarkId                            │
│ 2. chrome.tabs.remove(tabId)                            │
│ 3. onRemoved listener clears association                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ getManagedTabIds()                                      │
├─────────────────────────────────────────────────────────┤
│ Returns Set of all tabIds with bookmark/pinned          │
│ associations (used for filtering in TabList)            │
└─────────────────────────────────────────────────────────┘
```

### Chrome APIs Required

- `chrome.tabs` - create, update, remove, query tabs
- `chrome.storage.session` - persist associations within session

### Drag-Drop Fix

**Problem:** Current drag-drop uses array position as Chrome index. Filtering hidden tabs breaks this.

**Solution:** Use `tab.index` (Chrome's real index) instead of array position:

```typescript
// Instead of:
const targetIndex = tabs.findIndex(t => t.id === targetTabId);

// Use:
const targetTab = tabs.find(t => t.id === targetTabId);
const targetIndex = targetTab.index;  // Chrome's real index
```

### Permissions

Verify `manifest.json` includes:
```json
"permissions": ["tabs", "storage"]
```
Note: `tabGroups` permission is used by other features but not required for Arc-style bookmark-tab associations.

