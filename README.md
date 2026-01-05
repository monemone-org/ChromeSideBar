# ChromeSideBar

A Chrome extension that puts pinned sites, bookmarks, and tabs in a side panel, similar to the Arc browser's experience.

**Link to Chrome Web Store:**
https://chromewebstore.google.com/detail/jmmgjadgeeicdbagekohgmaipoekgcbn?utm_source=item-share-cb


**What it does:**
- **Unified sidebar:** Pinned bookmarks, regular bookmarks, and active tabs all in one vertical panel
- **"Live" bookmarks:** Bookmarks behave like tabs—open and close them on the fly
- **Backup/Restore:** Export and import everything to JSON
- **Tab groups:** Create and organize tabs within groups (a native Chrome feature)
- **Drag & drop:** Reorganize bookmarks, folders, tabs, and groups easily

## Background

I've been using Arc Browser for a while. When Arc paused development, I started looking at Chrome and other Chromium-based browsers. The one thing I really missed was Arc's sidebar—how it puts favorite sites, pinned pages, and tabs all in one vertical list.

So I vibe-coded this extension to bring that to Chrome.

## Features

### Pinned Sites

- Quick-access icon bar at top of panel
- Pin bookmarks or tabs for one-click navigation
- Drag-and-drop to reorder
- Custom icons and colors
- Configurable icon size (12-48px)
- Right-click menu: Edit (title, URL, icon, color), Duplicate, Reset favicon, Unpin
- Click: Open as Arc-style tab
- Cmd/Ctrl+Click: Open in new background tab, Shift+Click: Open in new window
- Open indicator: Circular dot for opened state, triangle for playing audio

### Bookmarks

- Display bookmarks and folders in a tree structure
- Context menu (...):
  - New Folder
  - Sort by Name/Date
  - Edit
  - Duplicate
  - Delete
  - Pin to pinned bar
- Drag-and-drop to organize bookmarks
- Drag tabs from Tabs section to create bookmarks
- Click: Open as Arc-style tab
- Cmd/Ctrl+Click: Open in new background tab, Shift+Click: Open in new window
- Audio indicator (speaker icon) for playing audio
- Close tab via X button on hover

### Active Tabs

- Display all tabs in the current window
- Audio indicator (speaker icon) for tabs playing audio
- Auto-scroll to active tab when switching
- Reorder tabs via drag-and-drop
- Click to switch to tab
- Close tab via X button on hover
- "New Tab" row at the bottom for quick tab creation
- Tab context menu (right-click):
  - Pin to Sidebar
  - Add to Group
  - Add to Bookmark (or "Move to Bookmark" in Arc style mode)
  - Duplicate
  - Close
- Sort options (via header menu):
  - Sort by domain then title (A-Z or Z-A)
  - Close all tabs
- Tab Group support:
  - Display Chrome tab groups with their color and title
  - Collapse/expand groups by clicking the group header
  - Group context menu:
    - New Tab (in group)
    - Sort by Domain (A-Z or Z-A)
    - Save to Bookmarks (creates a bookmark folder with all tabs)
    - Rename Group
    - Change Color
    - Close All Tabs in Group
  - Drag-and-drop support:
    - Reorder tabs within a group
    - Move tabs between groups
    - Move tabs in/out of groups
    - Reorder tab groups
    - Drag tab groups to Bookmarks section to save as folder

### Import & Export

- Full backup and restore capability via JSON files
- Export options:
  - Select specific data to export: Pinned sites, Bookmarks, and/or Tabs & Groups
- Import options:
  - **Pinned Sites**: Replace existing or append to list
  - **Bookmarks**: Replace all or import as a subfolder
  - **Tabs & Groups**: Replace current session or append to current window

### Settings

Gear icon in the bottom-left corner:

- **Font size**: 6-36px (default: 14px)
- **Pinned icon size**: 12-48px (default: 22px)
- **Open bookmark**: Choose how bookmarks open
  - Arc style: Bookmarks act as persistent tabs (hidden from Tabs section)
  - In new tab: Opens bookmark in a new background tab
  - In active tab: Replaces the current tab with the bookmark
- **Sort tab groups first**: When sorting tabs, keep tab groups at the top

### General

- Dark/light mode (follows your system preference)
- Open the sidebar with:
  - Click the extension icon in the toolbar
  - Keyboard shortcut: `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Windows/Linux)


## Tech Stack

Built with the usual modern web stack:

- [React](https://react.dev/) (v18) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) for builds
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Lucide React](https://lucide.dev/) for icons
- [@dnd-kit/core](https://dndkit.com/) for drag & drop
- Chrome Manifest V3 APIs (`sidePanel`, `bookmarks`, `tabs`, `tabGroups`, `storage`, `favicon`)

## Project Structure

```
/
├── docs/           # Feature documentation
├── public/         # Chrome extension manifest, service worker, icons
├── src/
│   ├── components/ # React UI components (tabs, bookmarks, pinned bar, dialogs)
│   ├── hooks/      # Custom hooks wrapping Chrome APIs and shared state
│   ├── contexts/   # React contexts for global state (font size, bookmark-tab associations)
│   └── utils/      # Helper functions (drag-drop)
```


## Setup & Build

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Build
```bash
npm run build
```
Outputs production build to `dist/` folder.

## Load in Chrome

1. Go to `chrome://extensions/`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` folder
4. Click the extension icon or hit `Cmd+Shift+E` to open the sidebar

Or Install via Chrome Extension Store

https://chromewebstore.google.com/detail/jmmgjadgeeicdbagekohgmaipoekgcbn?utm_source=item-share-cb

