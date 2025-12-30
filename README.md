# ChromeSideBar

ChromeSideBar is a Google Chrome extension that displays pinned sites, bookmarks and active tabs in a side panel, similar to the Arc browser's sidebar experience.

## Background

I've been using Arc Browser for a while. Since Arc paused development, I started looking at Chrome and other Chromium-based browsers. The one thing I really missed was Arc's sidebar, especially how it displays favorite sites, pinned pages, and active tabs in one vertical list.

So I vibe coded this extension to bring that feature to Chrome.

## Features

### Pinned Sites

- Quick-access icon bar at top of panel
- Pin bookmarks or tabs for one-click navigation
- Drag-and-drop to reorder
- Custom icons: Choose from Lucide icon library with search functionality
- Custom colors: 9 preset colors + custom hex color support
- Configurable icon size (12-48px)
- Export/Import: Backup and restore pinned sites as JSON
- Right-click menu: Edit (title, URL, icon, color), Reset favicon, Unpin
- Click: Open as Chrome pinned tab (activates existing tab or creates new one)
- Shift+Click: Open in new window

### Bookmarks

- Display bookmarks and folders in a tree structure
- Context menu (...):
  - New Folder
  - Sort by Name/Date
  - Edit
  - Delete
  - Pin to pinned bar
- Drag-and-drop to organize bookmarks
- Click: Open in current tab (Cmd/Ctrl+Click: Open in new background tab, Shift+Click: Open in new window)

### Active Tabs

- Display all tabs in the current window
- Audio indicator (speaker icon) for tabs playing audio
- Auto-scroll to active tab when switching
- Reorder tabs via drag-and-drop
- Click to switch to tab
- Close tab via X button on hover
- Sort options (via right-click menu):
  - Sort by domain then title (A-Z or Z-A)
  - Close all tabs
- YouTube chapters: Click the list icon on YouTube video tabs to jump to chapters
- Tab Group support:
  - Display Chrome tab groups with their color and title
  - Collapse/expand groups by clicking the group header
  - Drag-and-drop support:
    - Reorder tabs within a group
    - Move tabs between groups
    - Move tabs in/out of groups
    - Reorder tab groups
  - Close all tabs in a group via the X button on group header

### Settings

Access settings via the gear icon in the bottom-left corner:

- **Font size**: 6-36px (default: 14px)
- **Pinned icon size**: 12-48px (default: 22px)
- **Hide "Other Bookmarks"**: Hide the Other Bookmarks folder from the sidebar
- **Open bookmarks in new tab**: Toggle Cmd/Ctrl+click behavior for bookmarks
- **Sort tab groups first**: When sorting tabs, keep tab groups at the top

### General

- Dark/light mode support (follows system preference)
- Toggle via:
  - Extension toolbar icon (single click)
  - Keyboard shortcut: `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Windows/Linux)


## Tech Stack

- **Core**: [React](https://react.dev/) (v18) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Drag & Drop**: [@dnd-kit/core](https://dndkit.com/)
- **Context Menus**: [Radix UI](https://www.radix-ui.com/)
- **Chrome API**: Manifest V3 (`sidePanel`, `bookmarks`, `tabs`, `tabGroups`, `storage`, `favicon`, `scripting`)

## Project Structure

```
/
├── docs/           # Feature documentation
├── public/         # Chrome extension manifest, service worker, icons
├── src/
│   ├── components/ # React UI components (tabs, bookmarks, pinned bar, dialogs)
│   ├── hooks/      # Custom hooks wrapping Chrome APIs and shared state
│   ├── contexts/   # React contexts for global state (font size)
│   └── utils/      # Helper functions (drag-drop, YouTube chapters)
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

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. Click the extension icon or use keyboard shortcut to open

