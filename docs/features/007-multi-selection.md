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

---

## Test Cases

### Selection UX

| Pass | Test | Expected |
|:----:|------|----------|
| [ ] | Click single tab | Selects only that tab, clears any previous selection |
| [ ] | Click single bookmark | Selects only that bookmark, clears any previous selection |
| [ ] | Cmd/Ctrl+click to add | Adds item to existing selection |
| [ ] | Cmd/Ctrl+click selected item | Deselects that item, keeps others selected |
| [ ] | Shift+click expands forward | Selects range from first selected to clicked item |
| [ ] | Shift+click expands backward | Selects range from clicked item to last selected |
| [ ] | Shift+click with gap | Fills in all items between min and max indices |
| [ ] | Select tab + group mixed | Both tab and group are selected together |
| [ ] | Select bookmark + folder mixed | Both bookmark and folder are selected together |
| [ ] | Tab and bookmark selections independent | Selecting tabs doesn't affect bookmark selection and vice versa |

### Multi-Drag

| Pass | Test | Expected |
|:----:|------|----------|
| [ ] | Drag single selected tab | Moves just that tab |
| [ ] | Drag one of multiple selected tabs | Moves all selected tabs |
| [ ] | Drag unselected tab while others selected | Clears selection, drags only the unselected tab |
| [ ] | Multi-drag tabs forward | Items maintain relative order after move |
| [ ] | Multi-drag tabs backward | Items maintain relative order after move |
| [ ] | Multi-drag bookmarks forward | Items maintain relative order after move |
| [ ] | Multi-drag bookmarks backward | Items maintain relative order after move |
| [ ] | Drag selected groups into another group | Moves all tabs from source groups into target group |
| [ ] | Drag selected folders into another folder | Creates nested folders correctly |
| [ ] | Drag overlay shows count | Shows "N items" badge during multi-drag |


drag single bookmark
- into folder
- intoFirst folder
- before
- after 

drag multiple bookmarks
- into folder
- intoFirst
- before
- after 

drag a mix of folder + its bookmark children + decendents
- into folder
- intoFirst
- before
- after 

drag a mix of folder, folder, other bookmarks
- into folder
- intoFirst
- before
- after 


drag single tabs
- into group
- intoFirst group
- before
- after 

drag multi-tabs from one group
- into group
- intoFirst group
- before
- after 

drag multi-tabs across multi-groups
- into group
- intoFirst group
- before
- after 




### Context Menu

| Pass | Test | Expected |
|:----:|------|----------|
| [ ] | Right-click on selected item | Shows context menu, keeps selection |
| [ ] | Right-click on unselected item | Selects that item, shows context menu |
| [ ] | "Pin To Sidebar" on multiple tabs | Pins all selected tabs |
| [ ] | "Pin To Sidebar" on multiple bookmarks | Pins all selected bookmarks |
| [ ] | "Open In New Tab" on multiple bookmarks | Opens all in new tabs |
| [ ] | "Open In New Window" on multiple bookmarks | Opens all in new window |
| [ ] | "Move Bookmark..." on multiple bookmarks | Opens move dialog, moves all selected |
| [ ] | "Delete" on multiple bookmarks | Shows confirmation, deletes all |
| [ ] | "Add To Bookmark..." on multiple tabs | Opens dialog, bookmarks all selected |
| [ ] | "Move To Space..." on multiple tabs | Opens dialog, moves all selected |
| [ ] | "Move To New Window" on multiple tabs | Moves all selected to new window |
| [ ] | "Close" on multiple tabs | Shows confirmation, closes all |

### Selection Clearing

| Pass | Test | Expected |
|:----:|------|----------|
| [ ] | Press Escape with tabs selected | Clears tab selection |
| [ ] | Press Escape with bookmarks selected | Clears bookmark selection |
| [ ] | Click empty area in tab list | Clears tab selection |
| [ ] | Click empty area in bookmark tree | Clears bookmark selection |
| [ ] | Successful drag completion | Clears selection |
| [ ] | Successful delete completion | Clears selection |
| [ ] | Scroll while items selected | Selection persists |
| [ ] | Open context menu | Selection persists |

### Edge Cases

| Pass | Test | Expected |
|:----:|------|----------|
| [ ] | Select all tabs then close all | Confirmation dialog, all closed, selection cleared |
| [ ] | Select items across collapsed/expanded groups | Only visible items can be selected |
| [ ] | Drag to invalid drop target | No changes, selection preserved |
| [ ] | Cancel delete confirmation | Selection preserved, nothing deleted |
| [ ] | Select then switch sidebar sections | Selection preserved per section |
