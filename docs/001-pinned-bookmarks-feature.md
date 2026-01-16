---
created: 2025-12-21
after-version: 1.0.75
status: completed
---

# Pinned Bookmarks Feature Overview

## Purpose

Provide quick, one-click access to frequently used websites via a fixed row of icon shortcuts at the top of the side panel. Unlike regular bookmarks that require navigating folder hierarchies, pinned bookmarks are always visible and accessible.

## Use Cases

1. Quick access to frequently visited sites (email, calendar, project tools)
2. One-click navigation without expanding bookmark folders
3. Visual recognition via favicon icons rather than text labels

## Feature Behaviours

### Pinned Area
- Fixed position at top of panel (above scrollable bookmarks/tabs content)
- Does not scroll with bookmarks/tabs content
- Displays pinned sites as square favicon icons in a horizontal row
- Wraps to multiple rows if needed
- Hidden when no pins exist

### Pin Storage
- Persisted to `chrome.storage.local`
- Stores: URL, title, favicon as base64 data URL
- Favicons fetched from Chrome's internal favicon cache (`_favicon` API)
- Supports custom preset icons (stored as SVG data URLs)
- Duplicates allowed (same URL can be pinned multiple times)
- No maximum limit

### Pin Display
- Square icon buttons arranged in a grid/row
- Shows favicon (or fallback globe icon)
- Tooltip on hover shows site title
- Visual feedback on hover

### Pin Interactions
- **Click**: Navigate to URL in current tab
- **Cmd/Ctrl+Click**: Open in new background tab
- **Shift+Click**: Open in new window
- **Right-click or long-press**: Show context menu (unpin, edit title/URL)

## User Workflows

### Pin a Bookmark
1. Hover over any bookmark in the tree
2. Click the "Pin" button (pin icon appears in hover actions)
3. Bookmark appears as icon in pinned area

### Pin Current Tab
1. Hover over any tab in the Active Tabs list
2. Click the "Pin" button
3. Tab's URL/favicon appears in pinned area

### Edit a Pin
1. Right-click on pinned icon
2. Select "Edit" from context menu
3. Modify title, URL, or icon
4. Click "Save"

### Customize Icon
1. Open Edit dialog for a pin
2. Choose from preset icons (Home, Star, Heart, Folder, etc.)
3. Or click "Reset to site icon" to restore original favicon
4. Click "Save"

### Unpin a Site
1. Right-click (or long-press) on pinned icon
2. Select "Unpin" from context menu
3. Icon is removed from pinned area

### Reorder Pins
1. Drag a pinned icon
2. Drop at desired position
3. Order is persisted

## UI Layout

```
┌─────────────────────────────────┐
│ [📌][📌][📌][📌][📌]  [⚙️][↗️]    │  <- Pinned icons + toolbar
├─────────────────────────────────┤
│ ▼ 📁 Bookmarks                  │  <- Scrollable content
│   ▶ 📁 Work                     │
│   ▶ 📁 Personal                 │
│     📄 Site A                   │
│     📄 Site B                   │
│ ▼ 📑 Active Tabs (5)            │
│     🌐 Tab 1                    │
│     🌐 Tab 2                    │
└─────────────────────────────────┘
```

### Pinned Icon Grid (when many pins)
```
┌─────────────────────────────────┐
│ [📌][📌][📌][📌][📌][📌][📌]   │
│ [📌][📌][📌]              [⚙️] │
├─────────────────────────────────┤
```

## Data Model

```typescript
interface PinnedSite {
  id: string;           // Unique ID (generated)
  url: string;          // Site URL
  title: string;        // Display title (tooltip)
  favicon?: string;     // Favicon as base64 data URL (optional)
  order: number;        // Sort order (compacted, left-to-right, top-to-bottom)
}
```

## Components

| Component | Responsibility |
|-----------|----------------|
| `usePinnedSites` | Hook for CRUD operations + chrome.storage sync |
| `PinnedBar` | Renders pinned icons grid with drag-drop |
| `PinnedIcon` | Individual icon with click/context menu handling |

## Preset Icons

14 icons available for customization:
- Home, Star, Heart, Folder
- Mail, Calendar, Music, Video
- Image, File, Shopping Cart, Briefcase
- Book, Coffee

## Edge Cases

- **Favicon unavailable**: Show globe fallback icon
- **Long titles**: Truncate in tooltip after ~100 chars
- **LAN sites**: Works with local network sites via Chrome's internal favicon cache
