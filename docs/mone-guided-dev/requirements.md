# Requirements: Svelte Cross-Browser Sidebar Extension

## Purpose

Port the existing Chrome sidebar extension to a cross-browser version (Chrome + Firefox) using Svelte instead of React. The new version lives in `./svelte-ver/` and leaves the original untouched.

Goals:
- Feature parity with the current Chrome extension
- Run on both Chromium-based browsers and Firefox
- Use Svelte as the UI framework (learning/comparison goal)
- Share logic where possible (copy + adapt, not symlink)

## Target Personas

- Same as current extension: users who want an Arc-style sidebar for tab/bookmark management
- Now includes Firefox users in addition to Chrome/Chromium users

## Scope

### In Scope

- All features from the current Chrome extension (listed below)
- Browser abstraction layer for Chrome vs Firefox API differences
- Two manifest files (or build-time manifest generation) for Chrome and Firefox
- Svelte + Vite + TypeScript + Tailwind CSS stack
- Dark/light mode (system preference)

### Out of Scope

- Safari support (APIs too limited)
- New features not in the current extension
- Publishing to extension stores (that's a separate task)
- Shared monorepo between React and Svelte versions (they're independent)

## Features (parity with current extension)

### F1: Sidebar Panel
- Persistent sidebar panel with pinned sites, bookmarks, and tabs sections
- Chrome: `sidePanel` API + `side_panel` manifest key
- Firefox: `sidebarAction` API + `sidebar_action` manifest key

### F2: Pinned Sites Bar
- Quick-access icon bar at top of panel
- Pin bookmarks or tabs, drag-and-drop reorder
- Custom icons and colors, configurable icon size (12-48px)
- Right-click menu: Edit, Duplicate, Reset favicon, Unpin, Move to New Window
- Click behaviors: open as Arc-style tab, Cmd/Ctrl+Click for new tab, Shift+Click for new window
- Open indicator (dot), audio indicator (triangle)

### F3: Bookmarks Tree
- Tree structure with folders, expand/collapse
- Context menu: New Folder, Sort, Edit, Duplicate, Delete, Pin, Move to New Window, Expand All
- Drag-and-drop to organize
- Drag tabs into bookmarks section to create bookmarks
- Click behaviors same as pinned sites
- Audio indicator, close tab via X on hover

### F4: Active Tabs List
- All tabs in current window
- Audio indicator, auto-scroll to active tab
- Reorder via drag-and-drop
- Close tab via X on hover, "New Tab" row at bottom
- Tab context menu: Pin to Sidebar, Add to Group, Add to Bookmark, Move to New Window, Duplicate, Close, Close Before/After/Other
- Sort options: by domain (A-Z, Z-A), close all tabs

### F5: Tab Groups
- Display tab groups with color and title
- Collapse/expand groups
- Group context menu: New Tab, Sort, Save to Bookmarks, Rename, Change Color, Close All
- Drag-and-drop: reorder tabs within/between groups, move in/out, reorder groups, drag groups to bookmarks
- Chrome: `chrome.tabGroups` API
- Firefox: `browser.tabGroups` API (similar, feature-detect)

### F6: Spaces
- Arc-style workspaces linking a bookmark folder + tab group
- "All" space shows everything
- SpaceBar at bottom with click/swipe switching
- Create/edit/delete spaces
- Filtering: active space shows only its folder and tab group
- New tabs auto-join active space's group
- Multi-window: independent space-group mappings per window

### F7: Tab History Navigation
- Back/forward through recently used tabs (per window)
- Keyboard shortcuts: Cmd/Ctrl+Shift+< and >
- Closed tabs removed from history

### F8: Filter & Search
- Text search across pinned sites, bookmarks, tabs
- Saved and recent filters (last 5)
- Toggle search bar, live tabs filter, audible filter, reset

### F9: Import & Export
- Full backup/restore via JSON
- Export: select pinned sites, bookmarks, tabs & groups
- Import: replace/append options for each section

### F10: Settings
- Font size (6-36px), pinned icon size (12-48px)
- Bookmark open behavior (Arc style, new tab, active tab)
- Sort tab groups first option

### F11: Keyboard Shortcuts
- Open sidebar, tab history navigation, jump to audio tab
- Toggle saved filters dropdown
- Chrome: `commands` manifest key
- Firefox: `commands` manifest key (similar)

### F12: Background Service Worker
- Tab history tracking
- Keyboard shortcut command handling
- Chrome: `background.service_worker` in manifest
- Firefox: `background.scripts` in manifest (service workers supported in MV3 but `scripts` also works)

## Browser Abstraction Points

Key areas where Chrome and Firefox differ and need an adapter/service layer:

| Area | Chrome | Firefox | Abstraction |
|---|---|---|---|
| Sidebar | `chrome.sidePanel` | `browser.sidebarAction` | SidebarService |
| Namespace | `chrome.*` | `browser.*` | Use `browser.*` everywhere + polyfill for Chrome, OR thin wrapper |
| Favicon | `chrome://favicon/url` protocol | `tab.favIconUrl` property | FaviconService |
| Manifest | `side_panel` key | `sidebar_action` key + `browser_specific_settings` | Build-time manifest generation |
| Tab Groups | `chrome.tabGroups` | `browser.tabGroups` | Mostly same API, feature-detect minor diffs |
| Background | `service_worker` only | `scripts` array or `service_worker` | Manifest difference, same JS |
| Storage serialization | JSON algorithm | Structured clone | Use JSON-safe data only |

## Use Cases

### UC1: First-time setup
1. User installs extension from Chrome Web Store or Firefox Add-ons
2. Sidebar opens with empty pinned bar, default bookmark tree, current tabs
3. Welcome dialog shown

### UC2: Daily browsing with sidebar
1. User opens sidebar via shortcut or toolbar button
2. Sees pinned sites, bookmarks, and active tabs
3. Clicks items to switch tabs, uses drag-and-drop to organize
4. Closes tabs from sidebar

### UC3: Organizing with Spaces
1. User creates spaces for different contexts (Work, Personal, etc.)
2. Switches between spaces via SpaceBar
3. Each space filters to its bookmark folder and tab group

### UC4: Tab history navigation
1. User switches between tabs via the sidebar or browser
2. Uses Cmd+Shift+< to go back to previous tab
3. Uses Cmd+Shift+> to go forward

### UC5: Backup and restore
1. User exports settings/bookmarks/tabs to JSON
2. On a new browser or after reinstall, imports the JSON to restore

### UC6: Cross-browser usage
1. User has both Chrome and Firefox installed
2. Installs extension on both browsers
3. Same UI and features on both, just uses native browser APIs under the hood

## Edge Cases

- Tab group API not available on older Firefox versions -> feature-detect, degrade gracefully (show tabs ungrouped)
- Firefox sidebar can be toggled by user independently of extension -> handle visibility changes
- `favicon` permission doesn't exist in Firefox -> use `tab.favIconUrl` instead
- Bookmark root node restrictions in Firefox (can't modify root)
- Storage data must be JSON-serializable for cross-browser compat
- Firefox fires `windows.onFocusChanged` multiple times per focus change -> debounce

## Key Library Decisions

- **Namespace polyfill:** Mozilla `webextension-polyfill` — write `browser.*` everywhere, polyfills to `chrome.*` on Chrome
- **Drag-and-drop:** `svelte-dnd-action` — Svelte-idiomatic action-based DnD library (replaces `@dnd-kit`)
- **Icons:** `lucide-svelte` (direct equivalent of current `lucide-react`)
- **Manifest:** Build-time generation — one base manifest, browser-specific builds via `npm run build:chrome` / `npm run build:firefox`

## Non-functional Requirements

- TypeScript strict mode
- Tailwind CSS for styling (match current extension's look)
- Vite for building
- No heavy dependencies — same philosophy as current extension
- Debug logging gated behind `import.meta.env.DEV`
