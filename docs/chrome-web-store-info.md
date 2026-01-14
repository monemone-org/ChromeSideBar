
## Summary from package
Arc Browser like Pinned Sites, Bookmarks and Active Tabs in Side Panel

## Description
I missed Arc's sidebar after switching to Chrome in how Arc puts favorites, bookmarks, and tabs all in one vertical list and its pinned tab support. So I built this extension to bring that experience to Chrome.

## Key Features

**Arc-Style Persistent Tabs**
In Arc, bookmarks aren't just static links—they're live pages that stick around in your sidebar even after you close them. Click to open, click again to jump back. Your bookmarks stay organized in folders while you can see what's actually loaded. No more drowning in 50 open tabs.

**IDE-Style Tab History Navigation**
Jump between recently used tabs the way you do in VS Code—by usage order, not position. Keyboard shortcuts (Cmd+Shift+< / >) or toolbar buttons let you navigate your actual workflow instead of hunting through the tab bar. Super useful when you're researching something across a bunch of tabs.

**Arc-Style Unified Sidebar**
Everything in one vertical panel, just like Arc—pinned favorites at the top, bookmarks organized in folders, and all your active tabs. No more digging through bookmark menus or scanning a crowded tab bar.

**Tab Groups Support**
Works with Chrome's tab groups. Drag tabs into groups, save groups as bookmark folders, rename and change colors—all from the sidebar.

**Full Drag & Drop Support**
Drag and drop to reorganize pretty much everything—pinned sites, bookmarks, folders, tabs, groups. You can even drop tabs into bookmark folders to save them instantly, or drag entire tab groups to create bookmark folders.

**Full Control**
Search and filter by text, live tabs, or tabs playing audio. Save your frequently used searches. Export and import everything as JSON.

## Detailed Features

### Arc-Style Persistent Tabs (Optional)
- Bookmarks and pinned sites act as live pages
- Click to load, click again to switch
- Close tabs freely—bookmarks stay in the sidebar
- Enable/disable in Settings (On by default)

### Pinned Sites
- Quick-access icon bar at the top
- Pin favorite sites from bookmarks or tabs
- Customize with icons and colors
- Drag to reorder
- Cmd/Ctrl+Click to open in new tab
- Shift+Click to open in new window

### Bookmarks
- Tree view with bookmark folders
- Drag-and-drop to organize bookmarks and folders
- Sort by name or date
- Drag tabs into folders to create bookmarks
- Cmd/Ctrl+Click to open in new tab
- Shift+Click to open in new window

### Active Tabs
- All tabs from current window
- Drag to reorder tabs
- Drag to add tabs to tab groups
- Sort by domain in ascending or descending order
- Audio indicator for tabs playing sound

### Tab Groups
- Works with Chrome's native tab groups
- Add tabs to existing groups or create new groups
- Drag tabs between groups or ungroup
- Drag to reorder groups
- Rename groups and change group color
- Save a group as a bookmark folder
- Drag group to bookmarks to save as a folder

### Tab Search & Filter
- Search by title or URL
- Filter to show only live tabs (bookmarks/pins with open tabs)
- Filter to show only tabs playing audio
- Save frequently used searches for quick access

### Tab History Navigation
- Keyboard shortcuts: Cmd+Shift+< / Cmd+Shift+> to go back/forward
- Toolbar buttons with history dropdown
- Inspired by IDE navigation (like VS Code)—great for jumping between tabs while researching

### Import/Export
- Back up pinned sites, bookmarks, and tab groups as JSON
- Import with append or replace options

### Settings
- Font size and icon size
- Choose how bookmarks open:
  - Arc style: Persistent tabs (like Arc browser)
  - In new tab: Opens in a new background tab
  - In active tab: Replaces the current tab
- Toggle sidebar: Cmd+Shift+E (Mac) / Ctrl+Shift+E (Windows)
- Dark mode follows system

### Permissions
- sidePanel, bookmarks, tabs, tabGroups: Core features
- storage: Save your settings locally
- favicon: Show website icons

Open source on GitHub: https://github.com/monemone-org/ChromeSideBar

## Changelog

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


