## Overview

Open a bookmark folder as a Chrome tab group, creating tabs for all bookmarks (recursively) and grouping them together. This is the reverse of "Save to Bookmarks" (004).

## User Workflow

1. Right-click on a bookmark folder in the sidebar
2. Select "Open as Tab Group" from context menu
3. All bookmarks in the folder (including nested subfolders) open as new tabs
4. Tabs are grouped into a Chrome tab group with:
   - Group title = folder name
   - Randomly selected group color
5. Toast notification shows success with tab count
6. Bring the first tab in the tab group active

## Edge Cases

- **Empty folder**: Show toast "No bookmarks found in folder"
- **Nested subfolders**: Recursively include all bookmarks from subfolders
- **Special folders** (Bookmarks Bar, Other Bookmarks, Mobile): Works normally

## UI Elements

### Context Menu Item

```
┌─────────────────────────┐
│ + New Folder            │
│   Expand All            │
│ A Sort by Name          │
│   Sort by Date          │
│   Open as Tab Group     │  <- NEW
├─────────────────────────┤
│   Edit                  │
│   Delete                │
└─────────────────────────┘
```
