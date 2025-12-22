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
- Custom icons: choose from 14 preset icons or use site favicon //TODO
- Right-click menu: Edit (title, URL, icon), Unpin
- Click: Open in current tab (Cmd/Ctrl+Click: Open in new background tab, Shift+Click: Open in new window)

### Bookmarks

- Display bookmarks and folders in a tree structure
- Context menu (...):
  - New Folder
  - Sort by Name/Date
  - Edit
  - Delete
- Drag-and-drop organzie bookmarks
- Click: Open in current tab (Cmd/Ctrl+Click: Open in new background tab, Shift+Click: Open in new window)

### Active Tabs

- Display all tabs in the current window
- Audio indicator (speaker icon) for tabs playing audio
- Reorder tabs via drag-and-drop
- Click to switch to tab
- Close tab

### General

- Customizable font size (Settings)
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
- **Chrome API**: Manifest V3 (`sidePanel`, `bookmarks`, `tabs`, `storage`, `favicon`)

## Project Structure

```
/
├── docs/                       # Feature documentation
├── public/
│   ├── manifest.json           # Chrome Extension Manifest V3
│   └── background.js           # Service worker for toolbar icon behavior
├── src/
│   ├── components/
│   ├── hooks/                  # Hook wrapping chrome API
│   ├── utils/
│   ├── App.tsx                 # Main layout with settings modal
│   ├── main.tsx                # React entry point
│   └── index.css               # Tailwind directives and global styles
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind configuration
└── package.json                # Dependencies and scripts
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


## Installation

1. Download or build the extension
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked**
5. Select the `dist/` folder
6. Click the extension icon or use keyboard shortcut to open


