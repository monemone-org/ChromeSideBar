---
created: 2026-01-13
after-version: 1.0.149
status: completed
---

# Arc-Style Spaces - Implementation Plan

Detailed breakdown of implementation phases for the Spaces feature.


## Phase 1: Core Infrastructure ✅ DONE

**Goal:** Create data layer for spaces.

**Files Created:**
- `src/hooks/useSpaces.ts` - Space CRUD operations
- `src/hooks/useSpaceWindowState.ts` - Per-window state management
- `src/contexts/SpacesContext.tsx` - Combined context provider
- `src/utils/groupColors.ts` - Shared tab group color definitions

**Details:**

### useSpaces.ts
- `Space` interface: `{ id, name, icon, color, bookmarkFolderPath }`
- `ALL_SPACE` constant for the special "All" space
- Storage: `chrome.storage.local["spaces"]` as `Space[]`
- Functions: `createSpace`, `updateSpace`, `deleteSpace`, `moveSpace`, `getSpaceById`
- Import/Export: `replaceSpaces`, `appendSpaces`
- Listens to `chrome.storage.onChanged` for cross-window sync

### useSpaceWindowState.ts
- Storage: `chrome.storage.session["spaceWindowState_{windowId}"]`
- State: `{ activeSpaceId, spaceTabGroupMap }`
- Functions: `setActiveSpaceId`, `setTabGroupForSpace`, `clearTabGroupForSpace`, `getTabGroupForSpace`
- Listens to `chrome.tabGroups.onRemoved` to clear stale mappings

### SpacesContext.tsx
- Combines both hooks into single context
- Adds `ensureTabGroupForSpace` - lazy tab group creation
- Provides `allSpaces` (includes "All" at start) and `activeSpace`


## Phase 2: SpaceBar UI ✅ DONE

**Goal:** Create the space bar at bottom of side panel.

**Files Created:**
- `src/components/SpaceIcon.tsx` - Individual space icon
- `src/components/SpaceBar.tsx` - Bottom bar component

**Files Modified:**
- `src/App.tsx` - Integrate SpacesProvider and SpaceBar

**Details:**

### SpaceIcon.tsx
- Renders icon using Lucide icons via Iconify CDN
- Color background/ring from `GROUP_COLORS`
- Active state: stronger background + ring highlight
- Context menu (right-click): Edit, Delete
- "All" space has no context menu

### SpaceBar.tsx
- Layout: vertical "SPACE" label | scrollable icons | fixed "+" button
- Horizontal scroll with `overflow-x-auto`
- Calls `ensureTabGroupForSpace` when switching to non-All space
- Props: `onCreateSpace`, `onEditSpace`, `onDeleteSpace`

### App.tsx Changes
- Wrap with `<SpacesProvider>` inside `<BookmarkTabsProvider>`
- Add `<SpaceBar>` before `<Toast>`
- Add state: `spaceToEdit`, `showSpaceEditDialog`, `spaceToDelete`
- Add handlers: `handleCreateSpace`, `handleEditSpace`, `handleDeleteSpace`


## Phase 3: Filtering ✅ DONE

**Goal:** Filter BookmarkTree and TabList by active space.

**Files Modified:**
- `src/components/BookmarkTree.tsx`
- `src/components/TabList.tsx`

**Details:**

### BookmarkTree.tsx
- Add prop: `activeSpace: Space | null` (passed from App.tsx via SidebarContent)
- When `activeSpace.id !== 'all'`:
  - Use `findFolderByPath` from useBookmarks to resolve path to folder
  - Show the folder itself as a collapsible item (not just contents)
  - Auto-expand the space folder when switching to space
  - If folder not found, show: "Folder '{path}' not found. Pick new folder" (inline, same font as extension)
- When `activeSpace.id === 'all'`: current behavior (show all)

### TabList.tsx
- Get `activeSpaceTabGroupId` from SpacesContext via `getTabGroupForSpace`
- When in a space (`activeSpace.id !== 'all'`):
  - Filter `visibleTabs` to only show tabs where `tab.groupId === activeSpaceTabGroupId`
  - Filter `visibleTabGroups` to only show the space's group
  - If no tab group exists yet, show empty list
  - Display tabs **flat without group header** (no indentation, no group row)
- When in "All" space: current behavior (show all tabs with group headers)


## Phase 4: Tab Group Integration ✅ DONE

**Goal:** Ensure tabs opened in a space go to that space's tab group.

**Files Modified:**
- `src/contexts/BookmarkTabsContext.tsx`
- `src/contexts/SpacesContext.tsx`
- `src/components/TabList.tsx`

**Details:**

### SpacesContext.tsx
- `findTabGroupForSpace(spaceId)` - searches for existing tab group by name, stores mapping if found
- `createTabGroupForSpace(spaceId, firstTabId)` - creates group with provided tab, sets name/color from space

### BookmarkTabsContext.tsx
- Live bookmark/pinned tabs **stay ungrouped** (simpler design)
- Added `pendingManagedTabs` Set to track tabs being created for bookmarks/pinned
- Added `isPendingManagedTab(tabId)` export for TabList to check
- `createItemTab` marks tab as pending, then ungroups after 200ms as fallback

### TabList.tsx
- `handleNewTab` - space-aware new tab creation:
  - In space: creates tab in space's group (or creates group if none exists)
  - In "All": creates ungrouped tab
- `chrome.tabs.onCreated` listener auto-groups Cmd+T tabs when in a space
  - Skips tabs marked as `isPendingManagedTab` (bookmark/pinned tabs)
- `handleCloseAllTabs` - closes only `visibleTabs` (respects space filtering)
- Sort menu uses `sortGroupTabs` when in space to preserve group
- `findTabGroupForSpace` called on space switch to restore mapping after reload

**Key decisions:**
- Tab groups are NOT created on space switch, only when first tab is opened
- Live bookmark/pinned tabs stay ungrouped (shown in Bookmarks section anyway)
- Tab group mapping restored by name match after extension reload


## Phase 5: SpaceEditDialog ✅ DONE

**Goal:** Create dialog for creating/editing spaces.

**Files Created:**
- `src/components/SpaceEditDialog.tsx` - Create/edit space dialog
- `src/components/SpaceDeleteDialog.tsx` - Delete confirmation dialog
- `src/components/SpaceDialogs.tsx` - Container component for dialogs
- `src/components/IconColorPicker.tsx` - Shared icon/color picker component
- `src/utils/iconify.ts` - Iconify API utilities for dynamic icon loading

**Files Modified:**
- `src/App.tsx` - Added SpaceDialogs, wired up handlers
- `src/components/SpaceIcon.tsx` - Uses Iconify CDN for dynamic icons
- `src/components/PinnedIcon.tsx` - Refactored to use shared IconColorPicker
- `src/components/Dialog.tsx` - Made scrollable for small windows
- `src/components/SettingsDialog.tsx` - Made scrollable
- `src/components/ImportDialog.tsx` - Made scrollable

**Details:**

### IconColorPicker.tsx (Shared Component)
- Shared between SpaceEditDialog and PinnedIcon edit modal
- **Icon section:**
  - Current icon preview with icon name
  - Search input to filter icons
  - Virtualized icon grid (7 columns) with configurable height via `iconGridHeight` prop
  - Icons loaded dynamically from Iconify CDN (Lucide icon set)
- **Color section:**
  - Color circles with selection ring
  - Optional custom hex input (`showCustomHex` prop)
  - Configurable circle size via `colorCircleSize` prop
- **Props:** `selectedIcon`, `selectedColor`, `onIconSelect`, `onColorSelect`, `colorOptions`, `iconGridHeight`, `colorCircleSize`, `showCustomHex`, etc.

### iconify.ts
- `getIconUrl(name)` - Returns Iconify CDN URL for Lucide icons
- `iconToDataUrl(name, color)` - Fetches SVG and converts to data URL with custom color
- `getIconNames()` - Fetches and caches list of all Lucide icon names
- `toKebabCase(name)` - Converts PascalCase to kebab-case for API

### SpaceEditDialog.tsx
- Uses shared `Dialog` component for consistent styling
- Uses `IconColorPicker` with `iconGridHeight={90}` (2.5 rows)
- Form fields:
  - **Name**: text input with validation
  - **Icon**: IconColorPicker grid
  - **Color**: 9 color circles using `GROUP_COLOR_OPTIONS`
  - **Bookmark Folder**:
    - Create mode default: shows "Other Bookmarks/{name}" with italic styling
    - Message: "This folder will be created when saved"
    - "Pick existing folder" button opens `FolderPickerDialog`
- On Save:
  - If creating with new folder: creates folder first via `chrome.bookmarks.create`
  - Calls `createSpace` or `updateSpace` via SpacesContext
  - Switches to newly created space automatically

### SpaceDeleteDialog.tsx
- Confirmation dialog with warning icon
- Shows space name being deleted
- Clarifies that bookmarks and tabs are not deleted
- On confirm: calls `deleteSpace(id)` and switches to "All" space

### SpaceDialogs.tsx
- Container component that lives inside SpacesProvider
- Uses useSpacesContext to access createSpace, updateSpace, deleteSpace
- Handles the save/delete logic that requires context access

### SpaceIcon.tsx Updates
- Uses Iconify CDN for dynamic icon loading instead of hardcoded icon map
- `getIcon()` function handles icon rendering with proper color inversion for active state
- CSS filter classes: `dark:invert` for normal, `invert dark:invert-0` for active

### Dialog Scrolling
- All dialogs made scrollable for small windows
- Structure: fixed header, scrollable content (`overflow-y-auto flex-1`), fixed footer
- `max-h-[calc(100vh-2rem)]` prevents dialog from exceeding viewport


## Phase 6: Export/Import Support

**Goal:** Include spaces in backup export/import.

**Files to Modify:**
- `src/components/ExportDialog.tsx`
- `src/components/ImportDialog.tsx`
- `src/hooks/useSpaces.ts` (already has `replaceSpaces`, `appendSpaces`)

**Details:**

### ExportDialog.tsx
- Add spaces to export JSON:
  ```json
  {
    "pinnedSites": [...],
    "spaces": [...],
    "version": "1.1"
  }
  ```
- Add checkbox: "Include Spaces" (default checked)

### ImportDialog.tsx
- Detect `spaces` array in imported JSON
- Show section for spaces if present:
  - Radio: "Replace existing spaces" / "Add to existing spaces"
- On import:
  - Validate `bookmarkFolderPath` exists for each space
  - Show warning for spaces with missing folders
  - Call `replaceSpaces` or `appendSpaces`


## Phase 7: Polish

**Goal:** Add drag-drop reorder, swipe gestures, edge case handling.

**Details:**

### Drag-Drop Reorder (SpaceBar)
- Add `@dnd-kit` support to SpaceBar
- `DndContext` wrapping space icons
- `SortableContext` for reorder
- On drag end: call `moveSpace(activeId, overId)`
- "All" space not draggable (always first)

### Swipe Gestures
- Add touch event handlers to main content area
- Detect 2-finger horizontal swipe
- On swipe left: switch to next space
- On swipe right: switch to previous space
- Use `allSpaces` array order for navigation

### Edge Case Handling

**Bookmark folder deleted:**
- In BookmarkTree, check if folder exists
- If not, show inline message with "Pick new folder" link
- Link opens FolderPickerDialog, on select calls `updateSpace`

**Tab group closed manually:**
- Already handled: `useSpaceWindowState` listens to `chrome.tabGroups.onRemoved`
- Clears mapping, next tab open will create new group

**Extension reloaded:**
- Space definitions persist (chrome.storage.local)
- Tab group mappings lost (chrome.storage.session)
- On first tab open in space, create new group OR:
- Optional: try to find existing group by matching name

**Tab moved to another window:**
- Tab loses group membership in original window
- Treat as closed - no special handling needed


## File Summary

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `src/hooks/useSpaces.ts` | 1 | Space CRUD |
| `src/hooks/useSpaceWindowState.ts` | 1 | Per-window state |
| `src/contexts/SpacesContext.tsx` | 1 | Combined context |
| `src/utils/groupColors.ts` | 1 | Shared colors |
| `src/components/SpaceIcon.tsx` | 2 | Space icon |
| `src/components/SpaceBar.tsx` | 2 | Bottom bar |
| `src/components/SpaceEditDialog.tsx` | 5 | Create/Edit dialog |
| `src/components/SpaceDeleteDialog.tsx` | 5 | Delete confirmation |
| `src/components/SpaceDialogs.tsx` | 5 | Dialog container |
| `src/components/IconColorPicker.tsx` | 5 | Shared icon/color picker |
| `src/utils/iconify.ts` | 5 | Iconify API utilities |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `src/App.tsx` | 2, 5 | Add SpacesProvider, SpaceBar, SpaceDialogs |
| `src/components/BookmarkTree.tsx` | 3 | Filter by space folder |
| `src/components/TabList.tsx` | 3, 4 | Filter by space tab group |
| `src/contexts/BookmarkTabsContext.tsx` | 4 | Add tabs to space group |
| `src/components/SpaceIcon.tsx` | 5 | Use Iconify CDN for icons |
| `src/components/PinnedIcon.tsx` | 5 | Use shared IconColorPicker |
| `src/components/Dialog.tsx` | 5 | Made scrollable |
| `src/components/SettingsDialog.tsx` | 5 | Made scrollable |
| `src/components/ImportDialog.tsx` | 5, 6 | Made scrollable, import spaces |
| `src/components/ExportDialog.tsx` | 6 | Export spaces |


## Current Progress

- [x] Phase 1: Core Infrastructure
- [x] Phase 2: SpaceBar UI
- [x] Phase 3: Filtering
- [x] Phase 4: Tab Group Integration
- [x] Phase 5: SpaceEditDialog
- [ ] Phase 6: Export/Import
- [ ] Phase 7: Polish
