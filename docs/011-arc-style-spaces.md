
## Goal

Support Arc-style Spaces - isolated workspaces that link bookmark folders to Chrome tab groups.

**Target personas:**
- Users who want to organize browsing by context (Work, Personal, Projects)
- Users who want a cleaner sidebar showing only relevant bookmarks and tabs


## Feature Overview

A **Space** is:
- A bookmark folder (shows as the space's bookmarks)
- A Chrome tab group (manages the space's tabs)
- Visual properties: name, icon, color

When a space is active, the sidebar shows only:
- Bookmarks from that space's folder
- Tabs from that space's tab group


## Chrome Limitations

- Tab groups are per-window - each window has its own set of tabs and groups
- Tab groups can't exist without at least one tab
- Space **definitions** are global (like bookmarks)
- Space **state** (which tab group) is per-window


## Data Model

```typescript
interface Space {
  id: string;                         // "space_{timestamp}_{random}"
  name: string;
  icon: string;                       // Lucide icon name
  color: chrome.tabGroups.ColorEnum;  // grey, blue, red, yellow, green, pink, purple, cyan, orange
  bookmarkFolderPath: string;         // e.g. "Bookmarks Bar/Work" or "Other Bookmarks/Projects"
}
```

**Storage:** `spaces` in `chrome.storage.local` is a `Space[]` array. Array position = display order.

**Why path instead of ID:**
- Folder IDs can change if bookmarks are deleted/recreated
- Paths are human-readable and portable across browsers/profiles
- Import/export works even when IDs differ

**Per-window state** in `chrome.storage.session`:

```typescript
interface SpaceWindowState {
  activeSpaceId: string;
  spaceTabGroupMap: Record<string, number>;  // space ID → Chrome tab group ID
}
```


### Example

User has 3 spaces and 2 browser windows open.

**Global space definitions** (`chrome.storage.local["spaces"]`):
```json
[
  { "id": "space_001", "name": "Work", "icon": "Briefcase", "color": "blue", "bookmarkFolderPath": "Bookmarks Bar/Work" },
  { "id": "space_002", "name": "Personal", "icon": "Home", "color": "green", "bookmarkFolderPath": "Bookmarks Bar/Personal" },
  { "id": "space_003", "name": "Projects", "icon": "Rocket", "color": "red", "bookmarkFolderPath": "Other Bookmarks/Projects" }
]
```

**Window A state** (`chrome.storage.session["spaceWindowState_100"]`):
```json
{
  "activeSpaceId": "space_001",
  "spaceTabGroupMap": {
    "space_001": 5,
    "space_002": 8
  }
}
```
- User is viewing "Work" space
- "Work" tabs are in Chrome tab group #5
- "Personal" tabs are in Chrome tab group #8
- "Projects" has no tab group yet (user hasn't opened any tabs in that space)

**Window B state** (`chrome.storage.session["spaceWindowState_200"]`):
```json
{
  "activeSpaceId": "space_003",
  "spaceTabGroupMap": {
    "space_003": 12
  }
}
```
- User is viewing "Projects" space
- "Projects" tabs are in Chrome tab group #12 (different from Window A's groups)
- "Work" and "Personal" have no tab groups in this window yet


## Special "All" Space

- Always present, cannot be deleted or edited
- Shows all bookmarks (Bookmarks Bar + Other Bookmarks)
- Shows all tabs regardless of tab group
- First icon in the SpaceBar


## User Workflows

### Creating a Space
1. Click "+" button in SpaceBar
2. Dialog: enter name, pick icon, pick color, select bookmark folder
3. Space appears in SpaceBar

### Opening Bookmarks in a Space
Follows existing bookmark open mode settings:
- **Arc mode (live bookmark)** - tab associated with bookmark, stays **ungrouped** (shown in Bookmarks section)
- **Replace active tab** - replaces current tab
- **New tab** - opens new tab, stays **ungrouped**

**Design decision:** Live bookmark/pinned tabs stay ungrouped. They're already shown in the Bookmarks/Pinned section with loaded indicators, so grouping them provides no additional benefit and adds complexity.

**Tab group creation (lazy):**
1. Check `spaceTabGroupMap` for existing mapping
2. If no mapping, search for existing tab group with matching name
3. If found, use that group and store mapping
4. If not found, create new tab group when first **new tab** is opened (via Cmd+T or "+ New Tab" button)

### Switching Spaces
**Triggers:**
- Click space icon in SpaceBar
- 2-finger swipe left/right on side panel (Phase 7)

**Behavior:**
1. Filter sidebar to show only that space's bookmarks and tabs
2. Bookmarks section shows space's folder as collapsible item (auto-expanded)
3. Tabs section shows space's tabs **flat without group header**
4. If no tabs exist in the space, show empty tab section
5. Tab group mapping restored by name match if needed (handles extension reload)

**Tab operations in space:**
- "Close All Tabs" only closes visible tabs (space's tabs)
- Sort by Domain sorts only space's tabs (preserves group)
- Close Tabs Before/After/Others respect space filtering

### Managing Spaces (Context Menu)
Right-click space icon:
- Edit... (opens SpaceEditDialog - edit name, icon, color, bookmark folder)
- Delete (with confirmation)

**SpaceEditDialog** - single dialog for both creating and editing spaces:
- Name input (with validation)
- Icon picker (shared `IconColorPicker` component with searchable Lucide icons via Iconify CDN)
- Color picker (9 Chrome tab group colors as circles)
- Bookmark folder selection:
  - **Default (create mode):** Shows "Other Bookmarks/{name}" with message "This folder will be created when saved"
  - "Pick existing folder" button opens `FolderPickerDialog` to select existing folder
  - Folder created on save, not before

### Export/Import
- Spaces included in full backup export
- Import options: Replace all spaces or Add to existing


## SpaceBar UI

Located at bottom of side panel:

```
┌──────────────────────────────────────────────────────────────────┐
│ S │                                                          │   │
│ P │ [≡All] [🔵Work] [🟢Personal] [🔴Projects] ...scroll...   │[+]│
│ A │        ↑ active has ring                                 │   │
│ C │                                                          │   │
│ E │          ← horizontal scrollable →                       │   │
└──────────────────────────────────────────────────────────────────┘
  ↑ fixed                                                        ↑ fixed
```

**Layout:**
- Left: Vertical "SPACE" label (fixed)
- Middle: Horizontal scrollable list of space icons
- Right: "+" button (fixed)

**Space Icon:**
- Shows icon only (no label)
- Uses same colors as tab group headers in TabList:
  - **Active:** solid badge color background, white/black text (like group badge)
  - **Inactive:** light background, colored text
- Tooltip shows space name on hover
- Drag-drop to reorder (Phase 7)


## Edge Cases

| Case | Handling |
|------|----------|
| Space's bookmark folder deleted | Show inline message: "Folder 'X' not found. Pick new folder" (same font as extension) |
| Tab group closed manually | Clear mapping from `spaceTabGroupMap`; recreate on next tab open |
| Tab moved to another window | Treat as if tab was closed in original window |
| Extension reloaded | Session storage lost; `findTabGroupForSpace` restores mapping by name match on space switch |
| No tab group exists yet | Show empty tab section; create group on first Cmd+T or "+ New Tab" |
| Live bookmark/pinned tab opened | Tab stays ungrouped (tracked separately in Bookmarks section) |


## Tab History

Tab history (back/forward navigation) is **global across all spaces** for simplicity.

When switching spaces, the space handles activating the correct tab independently of history.


## Future Enhancements

- **Per-space tab history** - Each space tracks its own back/forward history, navigation stays within space context


## Implementation Phases

1. **Core Infrastructure** - Space interface, useSpaces hook, useSpaceWindowState hook, SpacesContext
2. **SpaceBar UI** - SpaceIcon, SpaceBar components, integrate into App
3. **Filtering** - BookmarkTree and TabList filter by active space
4. **Tab Group Integration** - Lazy tab group creation, add tabs to space's group
5. **Space Management** - SpaceEditDialog (create/edit name, icon, color, folder), context menu
6. **Export/Import** - Include spaces in backup, Replace/Add options
7. **Polish** - Drag-drop reorder, swipe gestures, edge case handling



## TODO

3. ~~Close all tabs in tabList should only close tabs on the tablist, but not the live tabs for bookmarks and pinned sites.~~ ✅ DONE - `handleCloseAllTabs` now uses `visibleTabs` which excludes managed tabs.

5. ~~Write a test plan to test all major functionalities.~~ ✅ DONE - See `docs/011-arc-style-spaces-test-plan.md`

6. ~~Pick new folder - should launch "Pick existing folder..." dialog, as in "Space edit dialog"~~ ✅ DONE - BookmarkTree uses FolderPickerDialog

7. ~~remove "..." from "Pick existing folder..." button label~~ ✅ DONE - Button now says "Pick existing folder"

