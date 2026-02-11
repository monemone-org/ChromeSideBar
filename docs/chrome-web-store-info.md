## Summary from package
Arc Browser like Pinned Sites, Bookmarks and Active Tabs in Side Panel

## Description
I missed Arc's sidebar after switching to Chrome in how Arc puts favorites, bookmarks, and tabs all in one vertical list and its pinned tab support. So I built this extension to bring that experience to Chrome.

## What's New: Arc-Style Spaces

Finally, Spaces are here! Create workspaces that link a bookmark folder to a Chrome tab group. Switch between Work, Personal, and whatever else you've got going on - each space shows only its stuff.

- Each space has its own focused bookmark tree
- Uses Chrome's native tab groups to organize tabs
- One click to switch contexts
- Give each space its own color and icon
- Swipe with two fingers to jump between spaces
- Included in import/export

## Key Features

- Arc-Style Persistent Tabs - Bookmarks act as live tabs. Click to open, click again to jump back. Close tabs freely—bookmarks stay in the sidebar.

- Arc-Style Spaces - Isolated workspaces linking bookmark folders to tab groups. Switch contexts with one click.

- Arc-Style Unified Sidebar - Pinned favorites, bookmarks, and tabs in one vertical panel.

- IDE-Style Tab History - Navigate by usage order like VS Code. Keyboard shortcuts: Cmd+Shift+< / >

- Tab Groups - Full support for Chrome's native tab groups. Drag, rename, recolor, save as bookmark folders.

- Drag & Drop Everything - Reorder pins, bookmarks, tabs, groups. Drop tabs into folders to save them.

- Search & Filter - Filter by text, live tabs, or audio. Save frequent searches. Export/import as JSON.

Open source on GitHub: https://github.com/monemone-org/ChromeSideBar

## Changelog

## 1.0.272

- Undo support: undo deleting bookmarks, closing tabs, and deleting pinned sites/spaces with a toast notification
- Jump-to-audio-tab keyboard shortcut (Cmd+Shift+A)
- Tab group display order setting with three options
- Fixed audio history tabs not sorted by recency

## 1.0.259

- Drop bookmarks onto the tab list to open them as new tabs
- Fixed shift-click multi-selection not working in some situations

## 1.0.255

- Rewrote drag and drop to support more scenarios: drag multiple items at once, drag tabs/bookmarks to spaces, drag tabs to pin bar, auto-expand folders on hover
- Fixed root folder matching in backup restore using folder IDs instead of names
- Fixed bookmark import/export to support mobile bookmarks

## 1.0.235

- Fixed bookmark folder matching failing on Windows due to case difference in "Other Bookmarks" vs "Other bookmarks"

## 1.0.234

- Arc-style Spaces:
  - Create isolated workspaces linking bookmark folders to Chrome tab groups
  - Switch spaces to show only relevant bookmarks and tabs
  - Customize with icons and colors
  - Drag to reorder spaces
  - Spaces included in import/export
- Audio tabs dropdown:
  - Click the audible filter to see tabs recently playing video/audio
- Multi-selection for tabs and bookmarks
- Space UI improvements:
  - Space color applied to sidebar title header
  - Space indicators shown on linked folders in folder picker
- Fixed used tab history being lost when Chrome suspends the background service worker
- Welcome dialog guides first-time users through key features

## 1.0.149

- Fixed duplicate entries in tab history navigation dropdown

## 1.0.146

- Advanced search syntax: support for `&&` (AND), `||` (OR), `!` (NOT), parentheses for grouping, and quoted strings for exact phrases
- Search bar toggle button in toolbar (search bar hidden by default)

## 1.0.140

- Tab history navigation:
  - Keyboard shortcuts: `Cmd+Shift+<` and `Cmd+Shift+>` to go back/forward
  - Toolbar buttons: Click to navigate, hold to show history dropdown with favicon and title
- Toolbar with filter options:
  - Live tabs filter: Show only bookmarks/pins with open tabs
  - Audible filter: Show only items playing audio
- Tab Search bar:
  - Search by title or URL with saved and recent filters
  - Toggle button in toolbar to show/hide the search bar (hidden by default)
- New context menu actions:
  - Move to New Window (tabs, pinned sites, bookmarks)
  - Close Tabs Before/After/Other Tabs (tabs only)
  - Expand All subfolders (bookmark folders)
- Tooltips on bookmark and tab rows showing title and URL

## 1.0.123

- Arc-style bookmarks now stay local to each window - opening a bookmark in one window won't affect another

## 1.0.116

- Improved Arc-style persistent tab handling: tabs are no longer placed in a special tab group. If session data is lost (e.g. extension reload), persistent tabs now appear as normal tabs instead of being hidden.
- Added "Add to Bookmarks" / "Move to Bookmarks" menu for tabs
- Dragging a tab to bookmarks now auto-associates it as a persistent tab (Arc style)
- Added delete button on bookmark rows
- Fixed context menu dismiss not blocking clicks on underlying elements

## 1.0.111

- Moved "+ New Tab" row to the bottom of the Tabs section
- Added duplicate option for bookmarks and pinned sites in context menu
- Tab groups can now be saved to any bookmark folder, not just "Other Bookmarks"


## 1.0.103

- Arc Style Bookmarks: Bookmarks act as persistent tabs, similar to Arc
- Tab Group Drag-Drop: Reorder groups, move tabs between groups
- Save Tab Group: Save a group as a bookmark folder
- Drag Tab Groups to Bookmarks: Drop a group onto bookmarks to save all tabs as a new folder
- Drag Tabs to Bookmarks: Drop tabs into bookmark folders to create bookmarks
- Full Import/Export: Backup everything as JSON
- Duplicate Tab: Right-click to duplicate tabs


