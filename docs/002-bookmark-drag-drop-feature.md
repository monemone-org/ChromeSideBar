# Bookmark Drag-Drop Feature Overview

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

Each bookmark/folder item has three drop zones based on cursor position:

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
Hovering over a collapsed folder for ~1 second automatically expands it, allowing drops into subfolders without manually expanding first.

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
┌─────────────────────────────────┐
│ ══════════════════════════════  │  <- Blue line (drop BEFORE)
│ 📁 Folder A                     │
│ ══════════════════════════════  │  <- Blue line (drop AFTER)
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ ╔═══════════════════════════╗   │
│ ║ 📁 Folder B               ║   │  <- Ring highlight (drop INTO)
│ ╚═══════════════════════════╝   │
└─────────────────────────────────┘
```

### Drop Zone Regions (Folder)
```
┌─────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Top 25%: DROP BEFORE
│                                 │
│           DROP INTO             │  <- Middle 50%: DROP INTO
│                                 │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Bottom 25%: DROP AFTER
└─────────────────────────────────┘
```

### Drop Zone Regions (Bookmark)
```
┌─────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Top 50%: DROP BEFORE
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  <- Bottom 50%: DROP AFTER
└─────────────────────────────────┘
```

## Data Flow

### State
```typescript
type DropPosition = 'before' | 'after' | 'into' | null;

// Tracked during drag
const [dropTargetId, setDropTargetId] = useState<string | null>(null);
const [dropPosition, setDropPosition] = useState<DropPosition>(null);
```

### Position Calculation
```typescript
// Called on drag move
function calculateDropPosition(targetId: string, pointerY: number): DropPosition {
  const element = document.querySelector(`[data-bookmark-id="${targetId}"]`);
  const rect = element.getBoundingClientRect();
  const relativeY = pointerY - rect.top;
  const height = rect.height;

  const isFolder = /* check if target is folder */;

  if (isFolder) {
    if (relativeY < height * 0.25) return 'before';
    if (relativeY > height * 0.75) return 'after';
    return 'into';
  } else {
    return relativeY < height * 0.5 ? 'before' : 'after';
  }
}
```

### Move Operation
```typescript
// useBookmarks hook
function moveBookmark(
  sourceId: string,
  destinationId: string,
  position: 'before' | 'after' | 'into'
) {
  if (position === 'into') {
    // Move into folder at index 0
    chrome.bookmarks.move(sourceId, { parentId: destinationId, index: 0 });
  } else {
    // Move before/after destination item
    const dest = await chrome.bookmarks.get(destinationId);
    let index = dest.index;
    if (position === 'after') index += 1;
    // Adjust if moving within same parent
    chrome.bookmarks.move(sourceId, { parentId: dest.parentId, index });
  }
}
```

## Components

| Component | Responsibility |
|-----------|----------------|
| `BookmarkTree` | DndContext, drag state, position calculation |
| `DraggableBookmarkItem` | Individual item with drag/drop hooks, visual indicators |
| `useBookmarks` | `moveBookmark()` function wrapping Chrome API |

## Edge Cases

- **Expanded folder with "after" drop**: Line appears after folder row, not after last child
- **Collapsed folder**: "Into" drop still works, folder expands after drop
- **Rapid dragging**: Pointer position tracked via pointermove event for accuracy
- **Nested folders**: Each level maintains independent drop zones
- **Root level items**: Can reorder but no "into" for non-folder items

## Visual Styling

```css
/* Drop before/after line */
.drop-line {
  height: 2px;
  background: #3b82f6; /* blue-500 */
  z-index: 20;
}

/* Drop into folder highlight */
.drop-into {
  background: #dbeafe; /* blue-100 */
  ring: 2px solid #3b82f6;
}

/* Dark mode */
.dark .drop-into {
  background: #1e3a5f; /* blue-900 */
}
```
