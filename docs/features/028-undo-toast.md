---
created: 2026-02-06
after-version: 1.0.259
status: draft
---

# 028 - Undo Toast

## Purpose

Replace the current intrusive green toast with a subtle snackbar-style notification, and add undo support for all destructive actions (bookmark deletion, tab closing). This removes the need for confirmation dialogs since users can simply undo.

**Target personas:** All users -- reduces friction for power users who delete/close often, provides a safety net for accidental deletions.

**Major use cases:**
- User accidentally deletes a bookmark or folder and wants to recover it
- User closes a tab (or group of tabs) and wants to reopen them
- User performs bulk deletion and wants to undo it


## Toast UI Redesign

Current toast is a full-width green bar at the bottom with a CheckCircle icon. Replace with:

```
┌─────────────────────────────────────────┐
│ (sidebar content)                       │
│                                         │
│                                         │
│                                         │
│   ┌───────────────────────────────┐     │
│   │ "Deleted 'Folder'"    [Undo]  │     │
│   └───────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

- Compact, min-width 80% of panel, centered at bottom
- Smaller padding, dark gray background (`bg-gray-800`) instead of bright green
- Slide-up animation on appear, slide-down on dismiss (no fade)
- No CheckCircle icon -- lightweight text is enough
- X dismiss button kept
- When `onUndo` callback is provided, show an `[Undo]` button
- Undo toast auto-dismisses after 5s (regular toast stays at 2.5s)
- Only one toast at a time -- a new action replaces the previous one


## Undo: Bookmark Deletion

### Snapshot before deletion

Before calling `chrome.bookmarks.removeTree()`, snapshot the bookmark subtree using `chrome.bookmarks.getSubTree()`. Store:
- Each node's `parentId`, `index`, `title`, `url`
- For folders: recursively snapshot all children

### Deletion order

Remove all leaf bookmarks first, then remove folders. This way the reverse order naturally restores correctly.

### Undo (restore)

Recreate in reverse order using the recorded `parentId` and `index`:
- Recreate folders first (since children need the parent to exist)
- Then recreate bookmarks at their original positions

### Multi-bookmark deletion

Works the same way -- record the *current* index of each item right before it is removed. Example:
- Items at indices [2, 5, 8]
- After removing index 2: remaining items shift to [4, 7]
- After removing index 4: remaining shifts to [6]
- To undo: add at 6, then add at 4, then add at 2

### Replaces confirmation dialog

The `ConfirmDeleteDialog` for multi-bookmark delete is no longer needed since the user can undo. Delete immediately, show undo toast.


## Undo: Tab Close

### Snapshot before closing

Before calling `chrome.tabs.remove()`, snapshot each tab's:
- `url`, `title`, `pinned` state
- `index` (current index at time of removal, adjusted as tabs close)
- `groupId` (Chrome tab group membership)

### Index tracking for multi-tab close

Record the *updated* tab index as each removal happens:
- Tabs at indices [2, 5, 8]
- After closing index 2: [5, 8] shift to [4, 7]
- After closing index 4: [7] shifts to [6]
- To undo: create at index 6, then 4, then 2

### Undo (restore)

Recreate tabs in reverse order using `chrome.tabs.create()` with saved URL, index, and pinned state.

**Tab group restoration:**
- Save `groupId` with each closed tab
- On undo, check if the group still exists
- If the group no longer exists, recreate it
- If the group was a space group, rebuild the group-space association

**Limitations:** Tab state (scroll position, form data, session cookies) cannot be restored -- only URL + position + properties.


## Undoable Actions

### P1 — Bookmark deletion

-[x] 1. Delete single bookmark
-[x] 2. Delete single folder (and all contents)
-[x] 3. Delete multiple selected bookmarks/folders (mix of both)

### P1 — Tab close

-[x] 4. Close single tab (X button or context menu)
-[x] 5. Close multiple selected tabs
-[x] 6. Close tabs before
-[x] 7. Close tabs after
-[x] 8. Close other tabs
-[x] 10. Close all tabs in space
-[x] 10. Close all tabs in All, not undoable but with confirmation 

### P2 — Pinned sites & spaces

11. Delete pinned site
12. Delete space

### P3 — Move operations

13. Move bookmark(s) to folder
14. Move bookmark(s) to space
15. Move tab(s) to space

### Not undoable (confirmation dialog instead)

- **Close all tabs in window** — closes the window, can't undo. Any close-tab action that would result in closing all tabs in the window should show a confirmation dialog instead.
- **Backup/restore operations** — already behind import confirmation dialogs


## User Workflows

1. **Single bookmark delete:** User deletes a bookmark -> toast shows "Deleted 'Page Title'" with [Undo] -> user taps Undo -> bookmark restored at original position
2. **Folder delete:** User deletes a folder -> toast shows "Deleted 'Folder Name'" with [Undo] -> Undo recreates folder and all contents
3. **Multi-bookmark delete:** User selects multiple bookmarks and deletes -> no confirmation dialog -> toast with [Undo] -> Undo restores all in correct positions
4. **Single tab close:** User closes a tab -> toast with [Undo] -> Undo reopens tab at original position in original group
5. **Close all tabs in group:** User closes a tab group -> toast with [Undo] -> Undo reopens all tabs and recreates group if needed
6. **Toast expires:** If user doesn't tap Undo within 5s, toast auto-dismisses and the action stands
7. **Successive actions:** User deletes item A, then immediately deletes item B -> first undo is lost, only B can be undone


## Implementation Notes

### Toast component changes
- Add optional `onUndo` callback to `ToastProps`
- When `onUndo` is provided, render `[Undo]` button and use 5s duration
- Restyle from green full-width bar to compact dark gray snackbar
