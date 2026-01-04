# Multi-Selection Feature

## Overview

Add multi-selection support for drag/drop and delete/close operations in both tabs/groups and bookmarks/folders sections.

## Design Decisions

| Feature | Decision |
|---------|----------|
| Selection UX | Click=select one, Shift+click=range, Cmd/Ctrl+click=toggle |
| Tab/Bookmark scope | Separate selection states (independent) |
| Mixed types | Allowed - can select both tabs AND groups, or bookmarks AND folders |
| Multi-drag | Drag any selected item → moves all selected items |
| Tab groups into groups | Block "drop INTO" when selection contains groups |
| Folders into folders | Allow nesting (bookmarks support nested folders) |
| Delete confirmation | Show dialog: "Delete N items?" with details |

---

## New Files

### 1. `src/contexts/SelectionContext.tsx`

Selection state provider with separate tab and bookmark selection:

```
State:
├── Tab Selection
│   ├── selectedTabIds: Set<number>
│   ├── selectedGroupIds: Set<number>
│   └── lastSelectedTabId / lastSelectedGroupId (for range)
└── Bookmark Selection
    ├── selectedBookmarkIds: Set<string>
    └── lastSelectedBookmarkId (for range)

Methods:
├── selectTab(id, mode: 'replace'|'toggle'|'range')
├── selectGroup(id, mode)
├── selectBookmark(id, isFolder, mode)
├── clearTabSelection() / clearBookmarkSelection()
├── isTabSelected(id) / isGroupSelected(id) / isBookmarkSelected(id)
└── getSelectedTabIds() / getSelectedGroupIds() / getSelectedBookmarkIds()
```

### 2. `src/hooks/useSelection.ts`

Hook encapsulating click handlers and selection logic:

```typescript
handleTabClick(tabId, event)      // Determines mode from event modifiers
handleGroupClick(groupId, event)
handleBookmarkClick(bookmarkId, isFolder, event)
```

### 3. `src/components/ConfirmDeleteDialog.tsx`

Confirmation dialog for bulk delete:

```
┌───────────────────────────────────────┐
│ Delete 5 items?                       │
├───────────────────────────────────────┤
│ This will close 3 tabs and all tabs   │
│ in 2 groups.                          │
│                                       │
│            [Cancel]  [Delete]         │
└───────────────────────────────────────┘
```

---

## File Modifications

### `src/components/TreeRow.tsx`

- Add `isSelected?: boolean` prop
- Add selected styling: `bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400`
- Style priority: Normal < Selected < Active < Dragging

### `src/components/TabList.tsx`

1. **Selection integration**
   - Wire up click handlers from `useSelection`
   - Pass `isSelected` to `TreeRow`

2. **Multi-drag changes**
   - `handleDragStart`: If dragging selected item, collect all selected items
   - `handleDragMove`: Block "into" position when `selectionContainsGroups`
   - `handleDragEnd`: Move all items in order, clear selection
   - `DragOverlay`: Show first item + "+N more" badge

3. **Multi-delete**
   - Context menu shows "Close N items" when multi-selected
   - Collect all tabs (including tabs in selected groups)
   - Show confirmation dialog, then call `closeTabs(tabIds[])`

### `src/components/BookmarkTree.tsx`

1. **Selection integration**
   - Wire up click handlers from `useSelection`
   - Pass `isSelected` to `TreeRow`

2. **Multi-drag changes**
   - `handleDragStart`: Collect all selected items
   - `handleDragMove`: Allow nesting (folders into folders OK)
   - `handleDragEnd`: Move all items in order, clear selection
   - `DragOverlay`: Show first item + "+N more" badge

3. **Multi-delete**
   - Context menu shows "Delete N items" when multi-selected
   - Show confirmation, then call `removeBookmark` for each

### `src/App.tsx`

- Wrap app with `SelectionProvider`

---

## Multi-Drag Index Handling

When moving multiple items to a later index, indexes shift as items are removed:

```
Before:  [A] [B*] [C*] [D] [E]    (* = selected, moving after D)
          0   1    2   3   4

Naive approach (wrong):
  Move B to index 3 → [A] [C] [D] [B] [E]
  Move C to index 3 → [A] [D] [B] [C] [E]  ← Wrong! C ended up before B

Correct approach - move from back to front:
  Move C to index 3 → [A] [B] [D] [C] [E]
  Move B to index 3 → [A] [D] [B] [C] [E]  ← Correct! B before C preserved
```

**Algorithm:**
1. Sort selected items by original index (ascending)
2. Determine if moving forward (target > max selected index) or backward
3. If moving forward: iterate in reverse order (last selected first)
4. If moving backward: iterate in normal order (first selected first)
5. Adjust target index based on items already moved

---

## Selection Clearing Rules

| Trigger | Clear? |
|---------|--------|
| Escape key | Yes |
| Click empty area | Yes |
| Successful drag | Yes |
| Successful delete | Yes |
| Context menu | No |
| Scroll | No |

---

## Implementation Order

1. `SelectionContext.tsx` - state foundation
2. `useSelection.ts` - click handlers
3. `TreeRow.tsx` - `isSelected` styling
4. `TabList.tsx` - selection UX
5. `BookmarkTree.tsx` - selection UX
6. `TabList.tsx` - multi-drag
7. `BookmarkTree.tsx` - multi-drag
8. `ConfirmDeleteDialog.tsx` - confirmation UI
9. `TabList.tsx` - multi-delete
10. `BookmarkTree.tsx` - multi-delete
11. Selection clearing (Escape, click outside)

---

## Critical Files

- `src/components/TabList.tsx` - main tab/group changes
- `src/components/BookmarkTree.tsx` - main bookmark/folder changes
- `src/components/TreeRow.tsx` - selected visual style
- `src/contexts/BookmarkTabsContext.tsx` - pattern to follow for SelectionContext
- `src/hooks/useDragDrop.ts` - pattern to follow for useSelection
