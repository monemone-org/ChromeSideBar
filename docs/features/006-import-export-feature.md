---
created: 2026-01-01
after-version: 1.0.103
status: completed
---

## Overview

Import and export sidebar data (pinned sites, bookmarks, and tabs/groups) via JSON backup files. Allows users to backup their data or transfer it between browsers/profiles.

## Export Behaviour

User can choose to export pinned sites, bookmarks, and tabs/groups individually or together to a JSON file.

## Import Behaviour

### Pinned sites
User will be prompted to 
- replace the existing pins
- append the imported sites to the existing pins

### Bookmarks
user will be prompted to 
- replace all bookmarks
- import bookmarks as a subfolder under "Other Bookmarks"

### Tabs/groups
User will be prompted to 
- replace the existing tabs/groups
- append the imported tabs/group to the existing tabs/groups


## User Workflow

### Export

1. Click settings button (gear icon) in bottom-left corner
2. Select "Export..." from popup menu
3. Export dialog appears with checkboxes:
   - Pinned sites (shows count)
   - Bookmarks
   - Tabs and groups
4. Select desired data types to export
5. Click "Export" to download JSON file

### Import

1. Click settings button (gear icon) in bottom-left corner
2. Select "Import..." from popup menu
3. File picker opens to select JSON backup file
4. Import dialog shows preview of file contents:
   - For single data type: Shows what will be imported and ask to replace, or append(for pinned site, tab/groups) or create (for bookmarks)
   - For multiple data types: Shows checkboxes to select which to import
5. Click "Import" to execute
6. Success dialog confirms what was imported

## Data Types

### Pinned Sites
- Exports/imports all pinned sites with their icons and settings

### Bookmarks
- Exports entire bookmark tree (Bookmarks Bar + Other Bookmarks)

### Tabs and Groups
- Exports current window's tab groups with their tabs

## UI Elements

### Popup Menu
```
┌────────────────┐
│ ⚙ Settings     │
├────────────────┤
│ ↑ Export...    │
│ ↓ Import...    │
├────────────────┤
│ ⓘ About        │
└────────────────┘
```

### Export Dialog
```
┌────────────────────────┐
│ Export              ✕  │
├────────────────────────┤
│ ☑ Pinned sites (5)     │
│ ☑ Bookmarks            │
│ ☑ Tabs and groups      │
│                        │
│        [Cancel][Export]│
└────────────────────────┘
```

### Import Dialog - Multiple Data Types
```
┌─────────────────────────────┐
│ Import Backup            ✕  │
├─────────────────────────────┤
│ Exported: 12/31/2025        │
│ Select data to import:      │
│                             │
│ ☑ Pinned sites (5)          │
│   ○ Replace all pinned sites   │
│   ○ Append                  │
│ ☑ Bookmarks                 │
│   ○ Replace all bookmarks   │
│   ○ Import to Other Bookmarks│
│     Creates a subfolder...  │
│ ☑ Tabs and groups (3)       │
│   ○ Replace all tabs and groups   │
│   ○ Append                  │
│                             │
│           [Cancel] [Import] │
└─────────────────────────────┘
```

### Import Dialog - single type Only

similar to `Multiple Data Types`, just without the checkbox

### Import Success Dialog
```
┌─────────────────────────────┐
│ Import Complete          ✕  │
├─────────────────────────────┤
│ ✓ Successfully imported:    │
│   • 5 pinned sites          │
│   • 10 Bookmarks            │
│   • 3 tabs and groups       │
│                             │
│                      [Done] │
└─────────────────────────────┘
```

## JSON Format

### Full Backup
```json
{
  "version": 1,
  "exportedAt": "2025-12-31T12:00:00.000Z",
  "pinnedSites": [...],
  "bookmarks": [...],
  "tabGroups": [...]
}
```

### Partial Backup (any combination)
```json
{
  "version": 1,
  "exportedAt": "2025-12-31T12:00:00.000Z",
  "pinnedSites": [...]
}
```

### Legacy Pinned Sites Array
```json
[
  { "id": "...", "url": "...", "title": "...", ... }
]
```

## Edge Cases

- **Empty backup**: Shows error "Backup file contains no data"
- **Invalid JSON**: Shows error "Failed to parse backup file"
- **Legacy format**: Pinned sites array format is auto-detected and converted
- **Partial exports**: Only selected data types are included in export
- **User cancels file picker**: Dialog closes without action
