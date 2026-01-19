# Extension State Reference

Quick reference for all states managed by the extension.

## Overview

| Storage | Lifespan | Instances |
|---------|----------|-----------|
| Chrome Local Storage (`chrome.storage.local`) | Persistent | 1 per extension |
| Chrome Session Storage (`chrome.storage.session`) | Per browser session | 1 per window |
| Browser localStorage | Persistent | 1 per extension |
| In-Memory | Per page load | 1 per context |

---

## Choosing a Storage

### Decision Tree

```
Need to persist across browser restart?
├─ Yes → Need service worker access?
│        ├─ Yes → chrome.storage.local
│        └─ No  → Need real-time cross-window sync?
│                 ├─ Yes → chrome.storage.local
│                 └─ No  → browser localStorage (simpler API)
└─ No  → Need to survive service worker restart?
         ├─ Yes → chrome.storage.session
         └─ No  → In-memory state
```

### Comparison

| Criteria | chrome.storage.local | chrome.storage.session | browser localStorage |
|----------|---------------------|------------------------|---------------------|
| **Lifespan** | Persistent | Browser session | Persistent |
| **Service worker access** | Yes | Yes | No |
| **Cross-window sync** | Yes (onChanged fires in all contexts) | Yes | Partial (event fires in OTHER windows only) |
| **Sidebar-only data** | Yes | Yes | Yes |
| **API complexity** | Async | Async | Sync |
| **Size limit** | ~5MB | ~1MB | ~5MB |

### When to Use Each

**chrome.storage.local** - Use for:
- User data that must persist (spaces, pinned sites)
- Settings that need real-time sync across all windows
- Data the service worker needs to access

**chrome.storage.session** - Use for:
- Per-window state (active space, tab history)
- Data that should reset on browser restart
- State shared between service worker and sidebar

**browser localStorage** - Use for:
- Visual-only preferences where delayed sync is OK
- Sidebar-only settings (service worker doesn't need)
- Simple key-value with sync API

**In-memory** - Use for:
- Temporary flags (e.g., `isNavigating`)
- Derived/computed state
- Data from Chrome APIs (tabs, bookmarks)

### Limitations

| Storage | Limitation |
|---------|------------|
| chrome.storage.* | Async only, requires callbacks/promises |
| chrome.storage.session | 1MB limit, cleared on browser close |
| browser localStorage | No service worker access, change event doesn't fire in current window |
| In-memory | Lost on page reload / SW restart |

---

## Chrome Session Storage

Stored via `chrome.storage.session`. Survives service worker restarts, cleared on browser close.

### `bg_windowActiveGroups`
Active tab group per window (Map: windowId → groupId)
- Owner: `src/background.ts` (BackgroundState class)
- Consumers: `src/background.ts`
- Instances: 1 per window

### `bg_windowTabHistory`
Back/forward navigation stack (Map: windowId → {stack, index})
- Owner: `src/background.ts` (BackgroundState class)
- Consumers: `src/background.ts` (navigateHistory, get-tab-history handler)
- Instances: 1 per window
- Max size: 25 entries per window

### `spaceWindowState_${windowId}`
Active space per window
```typescript
{
  activeSpaceId: string
}
```
- Owner: `src/background.ts` (SpaceWindowStateManager class)
- Consumers: `src/contexts/SpacesContext.tsx` (read-only copy synced via messages)
- Instances: 1 per window
- Note: Space-tab membership uses Chrome tab groups (Space.name matches group.title). See `021-recouple-group-space.md`.

### `tabAssociations_${windowId}`
Bookmark/pinned site → tab ID mapping (Record: itemKey → tabId)
- Owner: `src/contexts/BookmarkTabsContext.tsx`
- Consumers: `src/components/PinnedBar.tsx`, `src/components/TabList.tsx`
- Instances: 1 per window

### `bookmarkExpandedState_${windowId}`
Folder expand/collapse state (Record: folderId → boolean)
- Owner: `src/components/BookmarkTree.tsx`
- Consumers: `src/components/BookmarkTree.tsx`
- Instances: 1 per window

---

## Chrome Local Storage

Stored via `chrome.storage.local`. Persistent across browser sessions.

### `spaces`
Space definitions
```typescript
Array<{
  id: string,
  name: string,
  icon: string,
  color: string,
  bookmarkFolderPath: string
}>
```
- Owner: `src/hooks/useSpaces.ts`
- Consumers: `src/contexts/SpacesContext.tsx`, `src/background.ts` (debug)
- Instances: 1 per extension (shared across windows)

### `pinnedSites`
Pinned sites list
```typescript
Array<{
  id: string,
  url: string,
  title: string,
  favicon: string,
  customIconName?: string,
  iconColor?: string
}>
```
- Owner: `src/hooks/usePinnedSites.ts`
- Consumers: `src/components/PinnedBar.tsx`
- Instances: 1 per extension (shared across windows)

---

## Browser localStorage

Stored via browser `localStorage` using `useLocalStorage` hook.
All owned by `src/App.tsx`, hook implementation in `src/hooks/useLocalStorage.ts`.

| Key | Default | Type | Purpose |
|-----|---------|------|---------|
| `sidebar-font-size-px` | 14 | number | Font size |
| `sidebar-hide-other-bookmarks` | false | boolean | Hide "Other Bookmarks" folder |
| `sidebar-sort-groups-first` | true | boolean | Sort tab groups before regular tabs |
| `sidebar-pinned-icon-size-px` | 22 | number | Pinned icon size |
| `sidebar-bookmark-open-mode` | "arc" | string | How bookmarks open ("arc" or "newTab") |
| `sidebar-use-spaces` | true | boolean | Enable spaces feature |
| `sidebar-show-filter-area` | false | boolean | Show search/filter area |
| `sidebar-has-seen-welcome` | false | boolean | Welcome dialog dismissed |
| `sidebar-saved-filters` | [] | string[] | Saved search queries |
| `sidebar-recent-filters` | [] | string[] | Recent search queries |

---

## In-Memory State

Lost on page reload or service worker restart.

### Service Worker (`src/background.ts`)

| Variable | Type | Purpose |
|----------|------|---------|
| `isNavigating` | boolean | Prevents history duplicates during navigation |

### React Contexts

**FontSizeContext** (`src/contexts/FontSizeContext.tsx`)
- Provides font size value to components

**BookmarkTabsContext** (`src/contexts/BookmarkTabsContext.tsx`)
- `itemToTab`: Map<itemKey, tabId> - bookmark/pinned → tab mapping
- `tabToItem`: Map<tabId, itemKey> - reverse mapping
- `audibleTabs`: Set<tabId> - tabs playing audio
- `tabTitles`: Map<tabId, string> - live tab titles
- `activeTabId`: number | null - currently active tab

**SpacesContext** (`src/contexts/SpacesContext.tsx`)
- Wraps `useSpaces` + `useSpaceWindowState`
- Provides space CRUD and per-window state

### Custom Hooks (Chrome API sourced)

**useTabs** (`src/hooks/useTabs.ts`)
- `tabs`: chrome.tabs.Tab[] - current window's tabs
- Module flag: `isBatchOperation` - suppresses refetches during batch ops

**useBookmarks** (`src/hooks/useBookmarks.ts`)
- `bookmarks`: chrome.bookmarks.BookmarkTreeNode[] - browser bookmarks
- Module flag: `isBatchOperation` - suppresses refetches during batch ops

---

## State Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTENT STORAGE                           │
├─────────────────────────────────────────────────────────────────┤
│  chrome.storage.local (survives browser restart)                │
│  ├─ spaces                                                      │
│  └─ pinnedSites                                                 │
├─────────────────────────────────────────────────────────────────┤
│  browser localStorage (survives browser restart)                │
│  └─ sidebar-* settings (10 keys)                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SESSION STORAGE                              │
├─────────────────────────────────────────────────────────────────┤
│  chrome.storage.session (cleared on browser close)              │
│  ├─ bg_windowActiveGroups           (per window)                │
│  ├─ bg_windowTabHistory             (per window)                │
│  ├─ spaceWindowState_{winId}        (per window)                │
│  ├─ tabAssociations_{winId}         (per window)                │
│  └─ bookmarkExpandedState_{winId}   (per window)                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    IN-MEMORY STATE                              │
├─────────────────────────────────────────────────────────────────┤
│  Service Worker                                                 │
│  └─ isNavigating flag                                           │
├─────────────────────────────────────────────────────────────────┤
│  React Contexts (per sidebar instance)                          │
│  ├─ FontSizeContext                                             │
│  ├─ BookmarkTabsContext                                         │
│  └─ SpacesContext                                               │
├─────────────────────────────────────────────────────────────────┤
│  Hooks (per sidebar instance)                                   │
│  ├─ useTabs → Chrome tabs API                                   │
│  └─ useBookmarks → Chrome bookmarks API                         │
└─────────────────────────────────────────────────────────────────┘
```
