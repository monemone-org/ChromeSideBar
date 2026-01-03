# Drag-Drop Feature Overview

This document covers drag-and-drop functionality for both bookmarks and tabs/groups.

---

# Part 1: Bookmark Drag-Drop

## Purpose

Enable intuitive reorganization of bookmarks within the sidebar via drag-and-drop. Users can reorder bookmarks, move them between folders, or drop them into folders - all with clear visual feedback.

## Use Cases

1. Reorder bookmarks within a folder
2. Move bookmarks between different folders
3. Move bookmarks into a folder
4. Reorganize folder hierarchy

## Feature Behaviours

### Drag Initiation
- Drag starts after moving 8px (activation constraint prevents accidental drags)
- Dragged item shows reduced opacity (50%)
- Drag overlay follows cursor showing item title and icon

### Drop Zones

Each bookmark/folder item has drop zones based on cursor position:

| Item Type | Top 25% | Middle 50% | Bottom 25% |
|-----------|---------|------------|------------|
| Folder    | Before  | Into       | After      |
| Bookmark  | Before  | —          | After      |

- **Before**: Insert dragged item above the target
- **After**: Insert dragged item below the target
- **Into**: Move dragged item inside the folder (first position)

### Visual Indicators

| Drop Position | Indicator |
|---------------|-----------|
| Before        | Blue horizontal line at top edge |
| After         | Blue horizontal line at bottom edge |
| Into (folder) | Blue ring highlight + light blue background |

### Auto-Expand on Hover
Hovering over a collapsed folder for ~1 second automatically toggles its expand/collapse state.

### Drop Behaviour
- Dropping into folder: Folder auto-expands to show new item
- Dropping before/after: Item inserted at correct index
- Same-parent reorder: Index adjusted to account for source removal
- Cross-folder move: Item removed from source, added to destination

### Restrictions
- Cannot drop item onto itself
- Cannot drop folder into its own descendants (would create cycle)
- Special folders (Bookmarks Bar, Other Bookmarks) can receive items but cannot be moved

## User Workflows

### Reorder Within Folder
1. Drag bookmark/folder
2. Move cursor to top/bottom edge of sibling item
3. Blue line appears indicating insert position
4. Drop to reorder

### Move Into Folder
1. Drag bookmark/folder
2. Move cursor to center of target folder
3. Folder shows blue ring highlight
4. Drop to move item into folder (inserted at top)

### Move Between Folders
1. Expand both source and destination folders
2. Drag item from source folder
3. Drop at edge of item in destination folder (before/after)
4. Or drop on center of destination folder (into)

## UI Layout

### Drop Indicators
```
┌─────────────────────────────────────┐
│ ══════════════════════════════════  │  <- Blue line (drop BEFORE)
│ 📁 Folder A                         │
│ ══════════════════════════════════  │  <- Blue line (drop AFTER)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ╔═════════════════════════════════╗ │
│ ║ 📁 Folder B                     ║ │  <- Ring highlight (drop INTO)
│ ╚═════════════════════════════════╝ │
└─────────────────────────────────────┘
```

### Drop Zone Regions (Folder)
```
┌─────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Top 25%: DROP BEFORE
│                                     │
│             DROP INTO               │  <- Middle 50%: DROP INTO
│                                     │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Bottom 25%: DROP AFTER
└─────────────────────────────────────┘
```

### Drop Zone Regions (Bookmark)
```
┌─────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Top 50%: DROP BEFORE
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Bottom 50%: DROP AFTER
└─────────────────────────────────────┘
```

## Components

| Component | Responsibility |
|-----------|----------------|
| `BookmarkTree` | DndContext, drag state, position calculation |
| `BookmarkRow` | Individual item rendered via TreeRow |
| `DraggableBookmarkRow` | Wrapper adding dnd-kit drag hooks |
| `useBookmarks` | `moveBookmark()` function wrapping Chrome API |
| `TreeRow` | Shared row component with consistent layout |

## Edge Cases

- **Expanded folder with "after" drop**: Line appears after folder row, not after last child
- **Collapsed folder**: "Into" drop still works, folder expands after drop
- **Rapid dragging**: Pointer position tracked via pointermove event for accuracy
- **Nested folders**: Each level maintains independent drop zones
- **Root level items**: Can reorder but no "into" for non-folder items

---

# Part 2: Tab & Group Drag-Drop

## Purpose

Enable reorganization of tabs and tab groups within the sidebar. Users can:
- Reorder tabs
- Move tabs between groups
- Add tabs to groups or remove from groups
- Reorder entire groups
- Create bookmarks by dragging tabs to the bookmark section

## Use Cases

1. Reorder tabs within a group
2. Move tab into a different group
3. Remove tab from group (make ungrouped)
4. Reorder groups relative to each other
5. Create bookmark from tab (cross-section drag)

## Feature Behaviours

### Draggable Items
- **Tabs**: Individual browser tabs (grouped or ungrouped)
- **Groups**: Entire tab groups (header + all tabs move together)

### Drop Zones

#### Group Header Drop Zones (when dragging a tab)

| Zone | Position | Action |
|------|----------|--------|
| Top 25% | Before | Place tab before group as ungrouped |
| Middle 50% | Into | Add tab to the group |
| Bottom 25% | After | Depends on expanded state (see below) |

**"After" on group header:**
- **Expanded group**: Insert tab at index 0 inside the group
- **Collapsed group**: Place tab after the group as ungrouped

#### Group Header Drop Zones (when dragging a group)

| Zone | Action |
|------|--------|
| Top 50% | Place group before target group |
| Bottom 50% | Place group after target group |

Note: Groups cannot be dropped "into" other groups (no nesting).

#### Tab Drop Zones

| Zone | Action |
|------|--------|
| Top 50% | Before target tab |
| Bottom 50% | After target tab |

When dropping on a grouped tab, the dragged tab joins that group.

### End-of-List Drop Zone

When the pointer is below all tab/group elements, it triggers an "end-of-list" drop zone:
- **Tabs**: Moved to the very end as ungrouped
- **Groups**: Moved to the very end

This solves the problem of dropping after a group when the last tab's bottom 50% means "add to group".

### Cross-Section Drag (Tab → Bookmark)

Tabs can be dragged onto the bookmark section to create a new bookmark:
- Uses the same drop zones as bookmark drag-drop
- Creates a bookmark with the tab's title and URL
- Tab remains open (not closed)
- Only works for non-chrome:// URLs

### Visual Indicators

Same as bookmarks:
- Blue horizontal line for before/after
- Blue ring highlight for "into" on groups

### Auto-Expand on Hover
Hovering over a collapsed group's "into" zone for ~1 second toggles its expand/collapse state.

## User Workflows

### Reorder Tabs
1. Drag a tab
2. Move cursor to edge of another tab
3. Blue line indicates insert position
4. Drop to reorder

### Add Tab to Group
1. Drag a tab (grouped or ungrouped)
2. Move cursor to center of target group header
3. Group shows blue ring highlight
4. Drop to add tab to group (placed at end)

### Remove Tab from Group
1. Drag a grouped tab
2. Drop on an ungrouped tab, or
3. Drop on top 25% of a group header, or
4. Drop below all tabs (end-of-list zone)
5. Tab becomes ungrouped

### Reorder Groups
1. Drag a group header
2. Move over another group (top or bottom half)
3. Blue line indicates position
4. Drop to reorder the entire group

### Create Bookmark from Tab
1. Drag a tab
2. Move cursor up to the bookmark section
3. Drop on a folder (into) or between bookmarks (before/after)
4. Bookmark is created with tab's title and URL

## Components

| Component | Responsibility |
|-----------|----------------|
| `TabList` | DndContext, drag state, position calculation |
| `TabRow` | Tab row rendered via TreeRow |
| `DraggableTabRow` | Wrapper adding dnd-kit drag hooks |
| `TabGroupHeader` | Group header rendered via TreeRow |
| `DraggableGroupHeader` | Wrapper adding dnd-kit drag hooks for groups |
| `TreeRow` | Shared row component with consistent layout |
| `useDragDrop` | Shared hook for drag-drop state management |

## Edge Cases

- **Dragging group over own tabs**: No drop allowed (would be a no-op)
- **Dragging to end of list**: Special drop zone below all elements
- **Chrome:// URLs**: Cannot create bookmarks from these tabs
- **Group with no tabs**: Shouldn't occur (Chrome removes empty groups)

---

# Shared Infrastructure

## TreeRow Component

Both bookmark rows and tab rows use the shared `TreeRow` component for consistent:
- Layout (chevron → icon → title → badges → actions)
- Indentation based on depth
- Leading indicator slot (e.g., speaker icon at left edge)
- Drop indicator rendering via children slot

## Position Calculation

```typescript
// Shared utility in src/utils/dragDrop.ts
function calculateDropPosition(
  element: HTMLElement,
  pointerY: number,
  isContainer: boolean
): DropPosition {
  const rect = element.getBoundingClientRect();
  const relativeY = pointerY - rect.top;
  const height = rect.height;

  if (isContainer) {
    // Containers (folders/groups): 25% before, 50% into, 25% after
    if (relativeY < height * 0.25) return 'before';
    if (relativeY > height * 0.75) return 'after';
    return 'into';
  } else {
    // Items (bookmarks/tabs): 50% before, 50% after
    return relativeY < height * 0.5 ? 'before' : 'after';
  }
}
```

## useDragDrop Hook

Shared hook providing:
- `activeId` / `setActiveId` - Currently dragged item ID
- `dropTargetId` / `setDropTargetId` - Current drop target ID
- `dropPosition` / `setDropPosition` - Current drop position
- `pointerPositionRef` - Tracked pointer position for accurate hit testing
- `setAutoExpandTimer` / `clearAutoExpandTimer` - Auto-expand on hover

## Visual Styling

```css
/* Drop before/after line */
.drop-line {
  height: 2px;
  background: #3b82f6; /* blue-500 */
  z-index: 20;
}

/* Drop into highlight */
.drop-into {
  background: #dbeafe; /* blue-100 */
  ring: 2px solid #3b82f6;
}

/* Dark mode */
.dark .drop-into {
  background: #1e3a5f; /* blue-900 */
}
```
