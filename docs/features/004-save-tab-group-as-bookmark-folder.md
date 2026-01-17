---
created: 2025-12-30
after-version: 1.0.132
status: completed
---

## Overview

Export a tab group as a bookmark folder under "Other Bookmarks", allowing users to preserve grouped tabs for later access.

## User Workflow

1. Right-click on a tab group header
2. Select "Save to Other Bookmarks" from context menu
3. A new folder is created in "Other Bookmarks" with:
   - Folder name = group title (or "Unnamed Group" if untitled)
   - Bookmarks for each tab in the group, preserving tab order
4. If a folder with the same name exists, prompt user to choose:
   - **Overwrite**: Remove all existing bookmarks in folder, then add new bookmarks
   - **Merge**: Skip tabs matching existing bookmarks (same URL + title); append non-matching tabs at end of folder, preserving their relative order from the group
   - **Cancel**: Abort the operation
5. Show toast notification on success

## Edge Cases

- **Empty group title**: Use "Unnamed Group" as folder name
- **Empty new tabs**: Skip `chrome://newtab/` tabs
- **Duplicate tabs in group**: Include all (duplicates allowed in bookmarks)

## UI Elements

### Context Menu Item
```
┌─────────────────────────────────┐
│ New Tab                         │
├─────────────────────────────────┤
│ Sort by Domain (A-Z)            │
│ Sort by Domain (Z-A)            │
├─────────────────────────────────┤
│ Save to Other Bookmark  s       │  ← NEW (FolderPlus icon)
├─────────────────────────────────┤
│ Rename Group                    │
│ Change Color                    │
├─────────────────────────────────┤
│ Close All Tabs in Group         │
└─────────────────────────────────┘
```

### Conflict Dialog
```
┌─────────────────────────────────────────┐
│ Folder Already Exists                   │
├─────────────────────────────────────────┤
│ A bookmark folder named "Work" already  │
│ exists. What would you like to do?      │
│                                         │
│   ○ Overwrite (replace all bookmarks)   │
│   ○ Merge (add missing bookmarks only)  │
│                                         │
│             [Cancel]  [OK]              │
└─────────────────────────────────────────┘
```
