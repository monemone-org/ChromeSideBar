# Multi-Selection Feature Implementation Plan

## Overview

Add multi-selection support for drag/drop and context menu operations in both tabs and bookmarks sections.

---

## Phase 1: Selection State Foundation

### 1.1 Create `src/contexts/SelectionContext.tsx`

**Types:**
```typescript
type SelectionSection = 'tabs' | 'bookmarks';

interface SelectionItem {
  id: string;
  type: 'tab' | 'group' | 'bookmark' | 'folder';
  index: number;  // For range selection
}

interface SelectionContextValue {
  // Tab selection
  tabSelection: Map<string, SelectionItem>;
  setTabSelection: (items: Map<string, SelectionItem>) => void;
  clearTabSelection: () => void;
  tabAnchor: SelectionItem | null;
  setTabAnchor: (item: SelectionItem | null) => void;

  // Bookmark selection
  bookmarkSelection: Map<string, SelectionItem>;
  setBookmarkSelection: (items: Map<string, SelectionItem>) => void;
  clearBookmarkSelection: () => void;
  bookmarkAnchor: SelectionItem | null;
  setBookmarkAnchor: (item: SelectionItem | null) => void;

  // Helpers
  isTabSelected: (id: string) => boolean;
  isBookmarkSelected: (id: string) => boolean;
  clearOtherSection: (currentSection: SelectionSection) => void;
  clearAll: () => void;
}
```

**Pattern:** Follow `BookmarkTabsContext.tsx` - interface → createContext → useSelectionContext hook → SelectionProvider

---

### 1.2 Create `src/hooks/useSelection.ts`

Click handler logic:
- **Plain click:** Select only this item, set anchor
- **Cmd/Ctrl+click:** Toggle item in selection, update anchor
- **Shift+click:** Range select from anchor to clicked item
- **Always:** Clear the OTHER section first (tabs clears bookmarks, vice versa)

```typescript
interface UseSelectionOptions {
  section: 'tabs' | 'bookmarks';
  getItemsInRange: (startIndex: number, endIndex: number) => SelectionItem[];
}
```

---

## Phase 2: Visual Styling

### 2.1 Update `src/components/TreeRow.tsx`

Add `isSelected` prop:

```typescript
interface TreeRowProps {
  // ... existing
  isSelected?: boolean;  // NEW
}
```

Styling (same visual as isActive):
```typescript
className={clsx(
  // ...
  isActive && 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-100',
  !isActive && isSelected && 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-100',
  // ...
)}
```

---

## Phase 3: Tab Section Selection UX

### 3.1 Update `src/components/TabList.tsx`

1. Import SelectionContext
2. Create `getTabItemsInRange()` function based on displayItems order
3. Pass `isSelected` prop to DraggableTab/TabRow
4. Update click handler to use useSelection hook
5. Update context menu handler:
   - If right-clicked item NOT in selection → select only that item
   - Otherwise preserve selection

---

## Phase 4: Bookmark Section Selection UX

### 4.1 Update `src/components/BookmarkTree.tsx`

Same pattern as TabList:
1. Import SelectionContext
2. Create `getBookmarkItemsInRange()` based on visible flattened order
3. Pass `isSelected` to BookmarkRow/TreeRow
4. Selection-aware click and context menu handlers

---

## Phase 5: Multi-Drag

### 5.1 Tab Multi-Drag (`TabList.tsx`)

**handleDragStart:**
- If dragged item in selection → drag all selected
- If not in selection → clear selection, single-item drag

**handleDragEnd - Multi-move algorithm:**
```
1. Sort selected items by original index
2. Determine if moving forward (target > max selected) or backward
3. If forward: iterate reverse order (last first)
4. If backward: iterate normal order (first first)
5. Clear selection after successful drag
```

**Group into group:** Extract tabs from source groups, move into target group

### 5.2 Bookmark Multi-Drag (`BookmarkTree.tsx`)

Same algorithm using `chrome.bookmarks.move()`. Folders can nest.

---

## Phase 6: Delete Confirmation

### 6.1 Create `src/components/ConfirmDeleteDialog.tsx`

Follow `SpaceDeleteDialog.tsx` pattern:

```typescript
interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  itemCount: number;
  itemType: 'tabs' | 'bookmarks';
  details?: string;  // "3 tabs, 2 groups"
  onConfirm: () => void;
  onClose: () => void;
}
```

---

## Phase 7: Multi-Operations

### 7.1 Tab Multi-Close (`TabList.tsx`)

- Single item: close directly
- Multiple items: show ConfirmDeleteDialog, then `chrome.tabs.remove(tabIds)`

### 7.2 Bookmark Multi-Delete (`BookmarkTree.tsx`)

- Show ConfirmDeleteDialog
- Delete via `chrome.bookmarks.removeTree(id)` for each

### 7.3 Context Menu Multi-Operations

**Tabs:**
- Pin To Sidebar → pin all selected
- Add To Bookmark... → FolderPickerDialog, create bookmarks for all
- Move To Space... → SpaceNavigatorDialog, move all
- Move To New Window → create window with all selected
- Close → multi-close

**Bookmarks:**
- Pin To Sidebar → pin all
- Open In New Tab → open all
- Open In New Window → open all in new window
- Move Bookmark... → FolderPickerDialog, move all
- Delete → multi-delete

---


## Phase 8: Selection Clearing

### 8.1 Escape Key

Add global keydown listener in SelectionContext:
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') clearAll();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [clearAll]);
```

### 8.2 Click Empty Area

Add onClick to main container that clears selection when clicking directly on container (not child).

### 8.3 Clear After Operations

Clear selection after:
- Successful drag/drop
- Successful delete/close

Do NOT clear after:
- Context menu open
- Scroll

---

## Implementation Order

| # | Task | File(s) |
|---|------|---------|
| 1 | SelectionContext | `src/contexts/SelectionContext.tsx` (new) |
| 2 | useSelection hook | `src/hooks/useSelection.ts` (new) |
| 3 | TreeRow isSelected | `src/components/TreeRow.tsx` |
| 4 | TabList selection UX | `src/components/TabList.tsx` |
| 5 | BookmarkTree selection UX | `src/components/BookmarkTree.tsx` |
| 6 | TabList multi-drag | `src/components/TabList.tsx` |
| 7 | BookmarkTree multi-drag | `src/components/BookmarkTree.tsx` |
| 8 | ConfirmDeleteDialog | `src/components/ConfirmDeleteDialog.tsx` (new) |
| 9 | TabList multi-close | `src/components/TabList.tsx` |
| 10 | BookmarkTree multi-delete | `src/components/BookmarkTree.tsx` |
| 11 | Selection clearing | `src/contexts/SelectionContext.tsx`, components |
| 12 | Context menu multi-ops | `src/components/TabList.tsx`, `BookmarkTree.tsx` |

---

## Critical Files

**New files:**
- `src/contexts/SelectionContext.tsx`
- `src/hooks/useSelection.ts`
- `src/components/ConfirmDeleteDialog.tsx`

**Major changes:**
- `src/components/TabList.tsx` - selection, multi-drag, multi-close, context menus
- `src/components/BookmarkTree.tsx` - selection, multi-drag, multi-delete, context menus

**Minor changes:**
- `src/components/TreeRow.tsx` - add isSelected prop
- `src/App.tsx` - wrap with SelectionProvider

**Reference patterns:**
- `src/contexts/BookmarkTabsContext.tsx` - context pattern
- `src/components/SpaceDeleteDialog.tsx` - delete confirmation pattern

---

## Edge Cases

- **Collapsed groups:** Range selection skips hidden tabs
- **Filtered views:** Range selection only includes visible items
- **Special folders:** Bookmarks Bar / Other Bookmarks cannot be deleted
- **Empty selection:** Gracefully handle operations when nothing selected
- **Drag during selection:** Disable click-selection while dragging

---

## Verification

1. **Selection UX:**
   - Click tab → selects only that tab, clears bookmark selection
   - Cmd+click → toggles selection
   - Shift+click → range selects from anchor
   - Same for bookmarks

2. **Multi-drag:**
   - Select 3 tabs, drag one → all 3 move
   - Select tabs + groups, drag → all move correctly
   - Verify order preserved after move

3. **Multi-delete:**
   - Select multiple tabs → Close shows confirmation → closes all
   - Select multiple bookmarks → Delete shows confirmation → deletes all

4. **Context menu:**
   - Right-click selected item → menu shows, selection preserved
   - Right-click unselected item → selects that item, shows menu
   - Multi-operations work (pin all, open all, etc.)

5. **Clearing:**
   - Escape → clears all selection
   - Click empty area → clears selection
   - After successful drag → clears selection


  Implemented Phase 1-4, 5, 6, 8

  Pending Features:

  1. Context menu multi-operations - Pin all, open all, move all, etc.

  


## Bugs:

1. when there are multi-selection, clicking on the trashbutton of a tab/bookmark row should still only delete that tab/bookmark, not the selectioin

