---
created: 2025-01-31
after-version: 1.0.235
status: in-progress
---

# 027 - Unified Drag-and-Drop Refactor

## Purpose

Refactor drag-and-drop to be data-format-focused with proper multi-selection support.

**Problems with previous approach:**
- DragData represented a single item
- Multi-selection was resolved at drop time by querying selection state
- Mixed selection (e.g., groups + tabs) was handled inconsistently

**New approach:**
- DragData contains all selected items upfront
- Each item declares its available formats
- Drop handlers process items directly from DragData

## Data Model

### DragItem

A single dragged item that can provide multiple formats:

```typescript
interface DragItem {
  formats: DragFormat[];  // Available formats (first = most specific)
  tab?: TabData;
  tabGroup?: TabGroupData;
  bookmark?: BookmarkData;
  pin?: PinData;
  space?: SpaceData;
  url?: UrlData;
}
```

### DragData

Container for all items being dragged:

```typescript
interface DragData {
  items: DragItem[];
}
```

### Example: Dragging 1 group + 2 tabs

```typescript
{
  items: [
    { formats: [TAB_GROUP], tabGroup: { groupId: 1, title: 'Work' } },
    { formats: [TAB, URL], tab: { tabId: 101, ... }, url: { ... } },
    { formats: [TAB, URL], tab: { tabId: 102, ... }, url: { ... } },
  ]
}
```

## Drag Formats

| Source      | Formats Provided                          |
| ----------- | ----------------------------------------- |
| PinnedIcon  | PIN, URL                                  |
| BookmarkRow | BOOKMARK, URL                             |
| BookmarkRow | TAB, BOOKMARK, URL (if live bookmark)     |
| TabRow      | TAB, URL                                  |
| TabGroup    | TAB_GROUP                                 |
| SpaceIcon   | SPACE                                     |

## Drop Zone Acceptance

| Drop Zone    | Accepts       | Action                  |
| ------------ | ------------- | ----------------------- |
| PinnedBar    | PIN           | Reorder pin             |
| PinnedBar    | URL           | Create new pin          |
| BookmarkTree | BOOKMARK      | Move bookmark           |
| BookmarkTree | TAB_GROUP     | Create folder with tabs |
| BookmarkTree | URL           | Create bookmark         |
| TabList      | TAB_GROUP     | Reorder group           |
| TabList      | TAB           | Reorder/regroup tab     |
| TabList      | URL           | Create new tab          |
| SpaceBar     | SPACE         | Reorder space           |
| SpaceBar     | TAB           | Move tab to space       |
| SpaceBar     | URL           | Create tab in space     |

## Multi-Selection Architecture

### Problem

dnd-kit attaches drag data to individual items at render time via `useDraggable({ data })`. It doesn't know about selection state.

### Solution: DragItemsProvider

Components register a provider callback that builds multi-item DragData at drag start:

```
┌──────────────────────────────────────────────────────────────┐
│ Render: Each item has single-item DragData via useDraggable  │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Drag Start: UnifiedDndContext intercepts                     │
│   1. Identifies source zone                                  │
│   2. Calls zone's DragItemsProvider(draggedItemId)           │
│   3. Provider checks selection, returns DragItem[]           │
│   4. Replaces single-item data with multi-item DragData      │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Drop: Handler receives complete DragData with all items      │
└──────────────────────────────────────────────────────────────┘
```

### Provider Logic

```typescript
getDragItems(draggedItemId) {
  if (draggedItem not in selection) → return [] (single-item fallback)
  if (selection.length <= 1)        → return [] (single-item fallback)
  return selection.map(item => createDragItem(item))
}
```

**Key behavior:** If user drags an unselected item while other items are selected, only the dragged item moves (not the selection).

## Zones with Multi-Selection

| Zone         | Has Selection | Provider |
| ------------ | ------------- | -------- |
| TabList      | Yes           | Yes      |
| BookmarkTree | Yes           | Yes      |
| PinnedBar    | No            | No       |
| SpaceBar     | No            | No       |

## TODO

- [ ] Update drop handlers to process all items in `dragData.items`
- [ ] Test mixed selection (groups + tabs) drag behavior
- [ ] Refactor duplicated state clearing code in UnifiedDndContext
