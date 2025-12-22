# ChromeSideBar

A Google Chrome extension that displays bookmarks and active tabs in a side panel.

## Overview

ChromeSideBar displays pinned sites, bookmarks and active tabs in a side panel, similar to the Arc browser's sidebar experience. This brings Arc-style navigation to Google Chrome, letting you access your bookmarks and manage tabs from a convenient side panel.

## Features

### Pinned Sites

- Quick-access icon bar at top of panel
- Pin bookmarks or tabs for one-click navigation
- Drag-and-drop to reorder
- Custom icons: choose from 14 preset icons or use site favicon
- Click behavior:
  - Click: Open in current tab
  - Cmd/Ctrl+Click: Open in new background tab
  - Shift+Click: Open in new window
- Right-click menu: Edit (title, URL, icon), Unpin

### Bookmarks

- Display bookmarks and folders in a tree structure
- Context menu (...) on hover with actions:
  - New Folder (folders only)
  - Sort by Name (folders only)
  - Sort by Date (folders only)
  - Edit
  - Delete
- Drag-and-drop to:
  - Move items into folders
  - Reorder items within the same folder
- Click behavior:
  - Click: Open in current tab
  - Cmd/Ctrl+Click: Open in new background tab
  - Shift+Click: Open in new window

### Active Tabs

- Collapsible section with tab count
- Display all tabs in the current window
- Active tab highlighted with background color
- Audio indicator (speaker icon) for tabs playing audio
- Reorder tabs via drag-and-drop
- Click to switch to tab
- Close button on hover

### General

- Customizable font size (Settings)
- Dark mode support (follows system preference)
- Toggle via:
  - Extension toolbar icon (single click)
  - Keyboard shortcut: `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Windows/Linux)

## Installation

1. Download or build the extension
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked**
5. Select the `dist/` folder
6. Click the extension icon or use keyboard shortcut to open


## Tech Stack

- **Core**: [React](https://react.dev/) (v18) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Drag & Drop**: [@dnd-kit/core](https://dndkit.com/)
- **Chrome API**: Manifest V3 (`sidePanel`, `bookmarks`, `tabs`, `storage`)

## Project Structure

```
/
├── public/
│   ├── manifest.json       # Chrome Extension Manifest V3
│   └── background.js       # Service worker for toolbar icon behavior
├── src/
│   ├── components/
│   │   ├── BookmarkTree.tsx # Recursive tree with drag-drop, context menu
│   │   ├── TabList.tsx      # Collapsible tab list with audio indicator
│   │   ├── PinnedBar.tsx    # Pinned sites grid with drag-drop
│   │   └── PinnedIcon.tsx   # Individual pin with click/context/edit
│   ├── hooks/
│   │   ├── useBookmarks.ts  # Hook wrapping chrome.bookmarks API
│   │   ├── useTabs.ts       # Hook wrapping chrome.tabs API
│   │   └── usePinnedSites.ts # Hook for pinned sites CRUD + storage
│   ├── utils/
│   │   └── indent.ts        # Unified indentation utility
│   ├── App.tsx              # Main layout with settings modal
│   ├── main.tsx             # React entry point
│   └── index.css            # Tailwind directives and global styles
├── vite.config.ts           # Vite build configuration
├── tailwind.config.js       # Tailwind configuration
└── package.json             # Dependencies and scripts
```

## Architecture

### State Management
Custom hooks interface directly with Chrome APIs (no Redux/global state):
- **`useBookmarks`**: Manages bookmark CRUD operations with event listeners for real-time sync
- **`useTabs`**: Manages tab operations with listeners including `onActivated` for active tab changes
- **`usePinnedSites`**: Manages pinned sites with `chrome.storage.local` for persistence; fetches favicons via Chrome's `_favicon` API and stores as base64

### Error Handling
Both hooks implement error handling via `chrome.runtime.lastError` for all Chrome API calls.

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

