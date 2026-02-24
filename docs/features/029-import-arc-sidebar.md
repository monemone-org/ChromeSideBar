---
created: 2026-02-23
after-version: 1.0.277
status: in-progress
---

# Import Arc Browser Sidebar

## Purpose

Let users migrating from Arc Browser import their sidebar data into the extension. Arc stores its sidebar state in `StorableSidebar.json`, which contains spaces, pinned tabs, folders, and browsing tabs. This feature parses that file and maps compatible data to our extension's pinned sites, bookmarks, and spaces.

### Target persona

Arc Browser users switching to Chrome who want to preserve their curated sidebar organization.

## Arc Sidebar Data Model

Arc's `StorableSidebar.json` has **two parallel data stores**. The importer must use the correct one:

| Section | Purpose | Notes |
|---|---|---|
| `sidebarSyncState` | CloudKit/iCloud sync state | **Stale** - may be missing spaces, have old names, contain deleted items |
| `sidebar` | **Local sidebar state** | **Current** - reflects what the user actually sees in Arc |

**The importer must read from `sidebar`, not `sidebarSyncState`.**

### `sidebar` structure

```
sidebar
├── containers[0]      → { global: ... } (global config, skip)
└── containers[1]      → current sidebar data
    ├── topAppsContainerIDs  → identifies the top apps (favorites) container
    ├── spaces[]             → [id, {space}, id, {space}, ...] pairs
    │   └── each space has: title, id, customInfo (emoji/theme), containerIDs
    └── items[]              → [id, {item}, id, {item}, ...] pairs
        └── all sidebar items: tabs, folders, containers
```

Array format: both `spaces[]` and `items[]` are flat arrays of alternating `[id_string, object, id_string, object, ...]` pairs.

### Item types

| Arc `data` type | Description |
|---|---|
| `tab` | A web page: `savedURL`, `savedTitle`, `savedMuteStatus`, `timeLastActiveAt` |
| `list` | A folder/group containing child items. May have `automaticLiveFolderData` (dynamic, e.g. GitHub PRs) |
| `itemContainer` | Structural node linking a space to its pinned/unpinned sections |

### Arc sidebar hierarchy

```
Top Apps (global favorites bar)
├── Tab (url + title)
├── Tab ...
│
Space: 🎮 Hobby
├── Pinned container
│   ├── Tab
│   ├── Folder (list)
│   │   ├── Tab
│   │   ├── Subfolder (list)
│   │   │   └── Tab
│   │   └── Tab
│   └── Tab
└── Unpinned container (transient "today" tabs)
    ├── Tab
    └── Tab
```

### JSON format quirks

- The `sidebar` section stores items as raw objects (no `{"value": ...}` wrapper), while `sidebarSyncState` uses value-wrapped objects. Since we read from `sidebar`, items are always raw.
- `childrenIds` on a parent may be stale/incomplete. Use `parentID` on children as the source of truth, with `childrenIds` for ordering.
- Folders with `automaticLiveFolderData` are dynamic (e.g. GitHub PRs) - they have no static children in the JSON.
- Space `containerIDs` format can be either `["pinned", "<id>", "unpinned", "<id>"]` or `["unpinned", "<id>", "pinned", "<id>"]` - don't assume order.

## Import Mapping

### Compatible - can migrate

| Arc data                      | Extension target           | Mapping                                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Top Apps**                  | **Pinned Sites**           | `savedURL` -> `url`, `savedTitle` -> `title`. Generate new `id`. Fetch favicon after import.                                                                                                                                                             |
| **Spaces**                    | **Spaces**                 | `title` -> `name`, `emoji_v2` -> `icon`. No direct color mapping (see below). If a space with the same name already exists, reuse it (add bookmarks/tabs to it). Otherwise create new. `bookmarkFolderPath` set to the created/existing bookmark folder. |
| **Pinned tabs** (per space)   | **Bookmarks**              | Create a bookmark folder per space under Other Bookmarks (id=2). Each `tab` becomes a bookmark (`savedURL` + `savedTitle`).                                                                                                                              |
| **Folders** (`list`)          | **Bookmark folders**       | `title` -> folder name. Children become bookmarks inside. Nested folders preserved.                                                                                                                                                                      |
| **Unpinned tabs** (per space) | **Chrome tabs** (optional) | If user opts in, open each unpinned tab as a new Chrome tab. Tabs are grouped into a Chrome tab group named after the space.                                                                                                                             |

### Not compatible - skip

| Arc data                                   | Reason                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| ~~Window themes / color palettes~~         | Now importable - see feature 030. Arc's gradient midTone → hex color stored on Space, mapped to Chrome color for tab groups. |
| `automaticLiveFolderData` (live folders)   | Dynamic content fetched at runtime (e.g. GitHub PRs). No static URLs to import.                           |
| `encodedCKRecordFields`                    | CloudKit sync metadata (binary blobs).                                                                    |
| `originatingDevice`                        | Device tracking ID.                                                                                       |
| `timeLastActiveAt`                         | Tab activity timestamp. No bookmark equivalent.                                                           |
| `referrerID` / `activeTabBeforeCreationID` | Tab navigation history.                                                                                   |
| `savedMuteStatus`                          | Audio mute state.                                                                                         |
| `isUnread`                                 | Arc's unread marker.                                                                                      |
| `customInfo` on tabs                       | Rare tab-level metadata.                                                                                  |
| `profile`                                  | Arc browser profiles. Extension has no profile concept.                                                   |

### Space color mapping

Arc uses gradient themes per space, stored in `customInfo.windowTheme`. Not all spaces have theme data (some use Arc's default). With feature 030, our spaces accept hex color strings.

**Strategy**: Extract `primaryColorPalette.midTone`, convert to hex, store directly on the Space. The extension displays the hex color in the space bar and maps to the nearest Chrome color only when creating tab groups (handled by feature 030's `hexToNearestChromeColor()`).

**Where to find it in JSON**:

```
sidebar.containers[1].spaces[] -> {space}.customInfo.windowTheme.primaryColorPalette.midTone
  -> { red: 0.51, green: 0.54, blue: 1.01, alpha: 1, colorSpace: "extendedSRGB" }
  -> clamp to [0,1], multiply by 255, convert to hex string (e.g. "#828AFF")
```

**Fallback**: If `windowTheme` or `primaryColorPalette` is absent, assign Chrome color names round-robin:

```
blue -> red -> yellow -> green -> pink -> purple -> cyan -> orange -> grey
```

Note: Arc uses extendedSRGB which can have values outside 0-1. Clamp to [0, 1] before converting.

## User Workflows

### Import flow

1. User opens hamburger menu, selects "Import from Arc Browser..." (separate menu item from the existing "Import...")
2. File picker opens, user selects `StorableSidebar.json`
   - File location: `~/Library/Application Support/Arc/StorableSidebar.json`
   - 10MB file size limit
3. Extension parses the file and shows a preview/summary:
   - Number of Top Apps found
   - Number of Spaces found
   - Total pinned tabs/folders across all spaces
   - Total unpinned tabs across all spaces
   - Count of skipped items (live folders, etc.)
4. User selects what to import:
   - [x] Top Apps as Pinned Sites (append / replace)
   - [x] Spaces + Bookmarks (append / replace) — single combined toggle
   - [ ] Open unpinned tabs in Chrome (optional, off by default)
5. User clicks "Import"
6. Extension creates the data and shows result summary

### Where imported data goes

```
Pinned Sites bar:
  [existing pins...] [Arc Top App 1] [Arc Top App 2] ...

Other Bookmarks (id=2):
  📁 Hobby/                <- space bookmark folder
  │  📁 Rog Ally/
  │  │  📄 Remote Access - Chrome Remote Desktop
  │  │  📄 EmuDeck ...
  │  📁 Keyboards/
  │  │  📁 Ploopy/
  │  │  📄 Keyboard Tester
  │  📄 standalone-tab...
  📁 HomeServers/
  │  📁 LLM/
  │  📁 Docker/Portainer/
  │  ...
  📁 StoreKit/
  📁 Tommy/
  ...

Spaces bar:
  [All] [existing...] [🎮 Hobby] [HomeServers] [StoreKit] [Tommy] ...

Chrome tabs (if unpinned tabs opted in):
  ┌─────────────────────────────────────────────────────────┐
  │ [Movies ▾] tab1 | tab2 | tab3  [Hobby ▾] tab4 | tab5  │
  └─────────────────────────────────────────────────────────┘
  Each space's unpinned tabs become a Chrome tab group
  named after the space, using the space's assigned color.
```

### Arc file location hint

Show a helper text in the import dialog:

> Arc's sidebar data is at:
> `~/Library/Application Support/Arc/StorableSidebar.json`

## Parsing Algorithm

1. Read `sidebar.containers[1]` (the container with `items`, `spaces`, and `topAppsContainerIDs`)
2. Parse `items[]` array as `[id, {item}, id, {item}, ...]` pairs, building an `id -> item` map
3. Build parent-child relationships using `parentID` field (primary) + `childrenIds` for ordering
4. Parse `spaces[]` array as `[id, {space}, id, {space}, ...]` pairs
5. Identify top apps container ID from `topAppsContainerIDs` (find the string entry, skip `{default: true}`)
6. For each space, resolve pinned/unpinned container IDs from `containerIDs` array (scan for `"pinned"`/`"unpinned"` markers, the next element is the container ID)
7. Recursively resolve children for each container, building the bookmark tree
8. Skip items where `data.list` contains `automaticLiveFolderData`
9. For `tab` items: extract `savedURL` and `savedTitle`
10. For `list` items: create folder, recurse into children

## Dependencies

- **Feature 030** (Emoji Icons & Custom Space Colors) must be implemented first. The Arc importer needs:
  - `PinnedSite.emoji` field for Arc top app emoji icons
  - `Space.color` accepting hex strings for Arc theme colors
  - `Space.icon` emoji rendering working end-to-end

## Space matching behavior

### Append mode
- For each Arc space, check if an existing extension space has the same name (case-insensitive)
- **Match found**: Reuse the existing space. Resolve its bookmark folder via `bookmarkFolderPath`, add Arc's bookmarks there. No new space created.
- **No match**: Create a new space + new bookmark folder under Other Bookmarks

### Replace mode
- Replace all spaces with Arc spaces. Create new bookmark folders under Other Bookmarks for each.
- Existing bookmarks are NOT touched — only spaces are replaced.

### Bookmark folder resolution (for matched spaces)
- Parse the existing space's `bookmarkFolderPath` (e.g. "Other Bookmarks/Movies")
- Walk Chrome's bookmark tree to find the folder by path
- If found, use its ID as parent for new bookmarks
- If not found (folder was deleted), create a new folder under Other Bookmarks

## Constraints

- One-time import, not ongoing sync
- No duplicate detection (e.g. same URL already pinned) — may be added later
- Pinned tabs become bookmarks (not live tabs). Unpinned tabs, if opted in, open as actual Chrome tabs grouped by space.
- 10MB file size limit on the JSON file
- Depends on feature 030 (Emoji Icons & Custom Space Colors) for emoji icons on spaces and hex color support
