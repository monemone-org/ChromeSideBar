## Description

Arc Browser like Pinned Sites, Bookmarks and Active Tabs in Side Panel

I missed Arc's sidebar after switching to Chrome in how Arc puts favorites, bookmarks, and tabs all in one vertical list and its pinned tab support. So I built this extension to bring that experience to Chrome.

**What it does:**
- **Unified sidebar:** Pinned bookmarks, regular bookmarks, and active tabs all in one vertical panel
- **Recent tab history:** Navigate back/forward through recently used tabs
- **"Live" bookmarks:** Bookmarks behave like tabs—open and close them on the fly
- **Backup/Restore:** Export and import everything to JSON
- **Tab groups:** Create and organize tabs within groups (a native Chrome feature)
- **Drag & drop:** Reorganize bookmarks, folders, tabs, and groups easily
- **Filter & search:** Find items by text, filter by live tabs or playing audio

## Feature

### Arc-Style Persistent/Pinned Tabs

In Arc, bookmarks aren't just links—they're live pages that stay in your sidebar even after you close them. Click to load, click again to jump back.

I finally got this working in Chrome. Now your bookmarks can be live pages while staying organized in folders, instead of drowning in a sea of tabs. You can see what's loaded right from the sidebar.


### FEATURES

Arc Style Persistent Tabs (Optional)
- Bookmarks and pinned sites as live pages
- Click to load, click again to switch
- Close tabs freely - bookmarks stay
- Enable in Settings (On by default)

Pinned Sites
- Quick-access icon bar at the top
- Pin your favorite sites from bookmarks or tabs
- Customize with icons and colors
- Drag to reorder
- Cmd/Ctrl+Click to open in new tab
- Shift+Click to open in new window

Bookmarks
- Tree view with bookmark folders
- Drag-and-drop to organize bookmarks and folders
- Sort by name or date
- Drag tabs into folders to create bookmarks
- Cmd/Ctrl+Click to open in new tab
- Shift+Click to open in new window

Active Tabs
- All tabs from current window
- Drag to reorder tabs
- Drag to add tabs to tab groups
- Sort by domain in ascending or descending order.
- Audio indicator for tabs playing sound

Tab Groups
- Works with Chrome's tab groups
- Drag tabs between groups or ungroup
- Drag to reorder groups
- Rename groups and change group color
- Save a group as a bookmark folder
- Drag group to bookmarks to save as a folder


Import/Export
- Back up pinned sites, bookmarks, and tab groups as JSON
- Import with append or replace options

Settings
- Font size and icon size
- Choose how bookmarks open:
  - Arc style: Persistent tabs in a group (like Arc browser)
  - In new tab: Opens in a new background tab
  - In active tab: Replaces the current tab

Others
- Toggle sidebar: Cmd+Shift+E (Mac) / Ctrl+Shift+E (Windows)
- Tab history: Cmd+Shift+< / Cmd+Shift+> to go back/forward
- Dark mode follows system

Permissions
- sidePanel, bookmarks, tabs, tabGroups: Core features
- storage: Save your settings locally
- favicon: Show website icons

Open source on GitHub: https://github.com/monemone-org/ChromeSideBar

## Changelog

## 1.0.140

- Used Tab history navigation:
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


