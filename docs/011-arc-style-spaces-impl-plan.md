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
- Renders icon using Lucide icons or emoji fallback
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


## Phase 3: Filtering

**Goal:** Filter BookmarkTree and TabList by active space.

**Files to Modify:**
- `src/components/BookmarkTree.tsx`
- `src/components/TabList.tsx`

**Details:**

### BookmarkTree.tsx
- Add prop: `activeSpace: Space | null` (from context)
- When `activeSpace.id !== 'all'`:
  - Resolve `bookmarkFolderPath` to folder ID using `getBookmarkPath` helper
  - Only render contents of that folder (not the folder itself)
  - If folder not found, show: "Folder '{path}' not found. [Pick new folder]"
- When `activeSpace.id === 'all'`: current behavior (show all)

**New helper function:**
```typescript
// Find bookmark folder ID by path like "Bookmarks Bar/Work"
async function findFolderByPath(path: string): Promise<string | null>
```

### TabList.tsx
- Add prop: `activeSpaceTabGroupId: number | null` (from context)
- When `activeSpaceTabGroupId !== null`:
  - Filter `visibleTabs` to only show tabs where `tab.groupId === activeSpaceTabGroupId`
  - Hide other tab groups from display
- When `activeSpaceTabGroupId === null` (All space): current behavior


## Phase 4: Tab Group Integration

**Goal:** Ensure tabs opened in a space go to that space's tab group.

**Files to Modify:**
- `src/contexts/BookmarkTabsContext.tsx`
- `src/contexts/SpacesContext.tsx`
- `src/hooks/useTabGroups.ts`
- `src/components/TabList.tsx`

**Details:**

### SpacesContext.tsx
- Update `ensureTabGroupForSpace` to:
  1. Check `spaceTabGroupMap` for existing mapping
  2. If no mapping, search for existing tab group with matching name
  3. If found by name, store mapping and return group ID
  4. If not found, return null (don't create group yet)
- Add `createTabGroupForSpace(spaceId, firstTabId)` - creates group with provided tab

### BookmarkTabsContext.tsx
- Modify `createItemTab` to accept optional `spaceId` parameter
- When `spaceId` provided and not 'all':
  - Get existing tab group via `ensureTabGroupForSpace`
  - If no group exists, create tab first, then create group with that tab
  - If group exists, add tab to group after creation
- Pass active space context to bookmark click handlers

### useTabGroups.ts
- Add `findTabGroupByName(name)` - searches current window for group with matching title
- Add `addTabToGroup(tabId, groupId)` - adds existing tab to group

### TabList.tsx
- When creating new tab in a space:
  - Call `chrome.tabs.group()` to add to space's tab group
- Update "New Tab" button behavior when space is active

**Key change:** Tab groups are NOT created on space switch. They are only created when first tab/bookmark is opened in that space.


## Phase 5: SpaceEditDialog

**Goal:** Create dialog for creating/editing spaces.

**Files to Create:**
- `src/components/SpaceEditDialog.tsx`
- `src/components/IconPicker.tsx` (optional - can be inline)

**Details:**

### SpaceEditDialog.tsx
- Props: `isOpen`, `onClose`, `space` (null for create mode), `onSave`
- Form fields:
  - **Name**: text input
  - **Icon**: icon picker (grid of common Lucide icons)
  - **Color**: 9 color circles (reuse `GROUP_COLOR_OPTIONS`)
  - **Bookmark Folder**:
    - Create mode default: "Will create: Other Bookmarks/{name}"
    - Button to open `FolderPickerDialog` to select existing folder
- On Save:
  - If creating with new folder: create folder first via `chrome.bookmarks.create`
  - Then call `createSpace` or `updateSpace`
- Validation: name required, folder path required

### Delete Confirmation
- Simple confirm dialog or inline in context menu
- On confirm: call `deleteSpace(id)`
- Does NOT delete bookmark folder or close tabs


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

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `src/App.tsx` | 2 | Add SpacesProvider, SpaceBar |
| `src/components/BookmarkTree.tsx` | 3 | Filter by space folder |
| `src/components/TabList.tsx` | 3, 4 | Filter by space tab group |
| `src/contexts/BookmarkTabsContext.tsx` | 4 | Add tabs to space group |
| `src/components/ExportDialog.tsx` | 6 | Export spaces |
| `src/components/ImportDialog.tsx` | 6 | Import spaces |


## Current Progress

- [x] Phase 1: Core Infrastructure
- [x] Phase 2: SpaceBar UI
- [ ] Phase 3: Filtering
- [ ] Phase 4: Tab Group Integration
- [ ] Phase 5: SpaceEditDialog
- [ ] Phase 6: Export/Import
- [ ] Phase 7: Polish
