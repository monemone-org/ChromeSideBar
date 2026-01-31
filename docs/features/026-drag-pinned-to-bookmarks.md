---
created: 2026-01-31
after-version: 1.0.233
status: draft
---

# Drag Pinned Site to Bookmarks

## Goal

Allow users to drag a pinned site from the pinned bar and drop it onto the bookmark tree to create a bookmark. This is a copy operation - the pinned site remains in the pinned bar.


## Use Cases

- User has a pinned site they want to also save as a bookmark in a specific folder
- Quick way to organize frequently used sites into bookmark folders


## Expected Behavior

1. Drag a pinned site icon from the pinned bar
2. Hover over bookmark tree - drop indicator shows target position
3. Drop onto a folder → bookmark created inside folder
4. Drop before/after a bookmark → bookmark created at that position
5. Pinned site remains in pinned bar (copy, not move)
6. While dragging over bookmark tree, pinned bar icons should NOT shift/reorder


## Current DndContext Structure

Each component has its own isolated `<DndContext>`:

```
┌─────────────────────────────────────────┐
│ App.tsx                                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ PinnedBar.tsx                     │  │
│  │   <DndContext> ← reorder pins     │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ SpaceBar.tsx                      │  │
│  │   <DndContext> ← reorder spaces   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ TabList.tsx                       │  │
│  │   <DndContext> ← reorder tabs     │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ BookmarkTree.tsx                  │  │
│  │   <DndContext> ← reorder bookmarks│  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

Items cannot be dragged between components because each DndContext is isolated.


## Proposed Solutions

### Option A: Shared DndContext (Full Refactor)

Consolidate all DndContexts into a single context in App.tsx.

```
┌─────────────────────────────────────────┐
│ App.tsx                                 │
│   <DndContext>  ← unified drag system   │
│                                         │
│     PinnedBar   (draggable items)       │
│     SpaceBar    (draggable items)       │
│     TabList     (draggable items)       │
│     BookmarkTree (draggable items)      │
│                                         │
│   </DndContext>                         │
└─────────────────────────────────────────┘
```

Pros:
- Clean, unified drag-drop architecture
- Enables any cross-component drag (tabs→bookmarks, pins→bookmarks, etc.)
- Single source of truth for drag state

Cons:
- Significant refactoring effort
- Need to carefully handle collision detection across different component types
- Risk of regressions in existing drag behavior

---

### Option B: Partial Refactor (PinnedBar + BookmarkTree only)

Consolidate only PinnedBar and BookmarkTree into a shared context.

Pros:
- Addresses immediate need
- Less disruptive than full refactor
- Can expand to other components later

Cons:
- Still leaves inconsistent architecture
- May need another refactor later

---

### Option C: HTML5 Drag for Cross-Component

Keep @dnd-kit for internal reordering, use native HTML5 drag events for cross-component drops.

- PinnedIcon sets `draggable="true"` and `onDragStart` to provide URL/title
- BookmarkTree's `useExternalLinkDrop` hook handles the drop

Pros:
- Minimal changes to existing code
- Reuses existing external drop infrastructure

Cons:
- Two drag systems coexisting (hacky)
- Potential conflicts between @dnd-kit and HTML5 drag
- Need to prevent pinned bar reordering during external drag

---

## Decision

TBD


## Implementation Notes

For preventing pinned bar reordering during external drag (requirement #6):
- Could use `onDragMove` to detect when pointer leaves pinned bar bounds
- Or use custom collision detection that ignores targets outside container
- Or only apply reorder in `onDragEnd` if drop target is another pin
