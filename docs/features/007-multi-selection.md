---
created: 2026-01-03
after-version: 1.0.108
status: draft
---

# Multi-Selection Feature

## Overview

Add multi-selection support for drag/drop and delete/close operations in both tabs/groups and bookmarks/folders sections.

Functionalities supported multi-selection

- drag/drop

- popup menu

   Bookmark:
      - Pin To Sidebar     
      ---         
      - Open In New Tab             
      - Open In New Window
      - Move Bookmark...
      ---
      - Delete

   Tabs
      - Pin To Sidebar     
      ---         
      - Add To Bookmark...
      - Move To Space...
      - Move To New Window      
      ---
      - Close


## Design Decisions

| Feature | Decision |
|---------|----------|
| Selection UX | Click=select one, Shift+click=expand range, Cmd/Ctrl+click=toggle |
| Tab/Bookmark scope | Separate selection states (independent) |
| Mixed types | Allowed - can select both tabs AND groups, or bookmarks AND folders |
| Multi-drag | Drag any selected item → moves all selected items |
| Tab groups into groups | Move all the tabs from the drag source groups into the drop target group |
| Folders into folders | Allow nesting (bookmarks support nested folders) |
| Delete confirmation | Show dialog: "Delete N items?" with details |

---

## Shift-Click Expand Behavior

Shift-click always **expands** the selection to cover the maximum extent. It finds the min and max indices across all currently selected items plus the clicked item, then selects everything in between.

```
Items:   [1] [2] [3] [4] [5] [6] [7] [8]

Step 1: Click 4
         [1] [2] [3] [4*] [5] [6] [7] [8]
         Selection: [4]

Step 2: Shift-click 6
         [1] [2] [3] [4*] [5*] [6*] [7] [8]
         Selection: [4,5,6]

Step 3: Shift-click 1
         [1*] [2*] [3*] [4*] [5*] [6*] [7] [8]
         Selection: [1,2,3,4,5,6]  ← expands to cover min(1) to max(6)
```

This differs from anchor-based selection where shift-click would replace the selection with anchor→clicked range.

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
