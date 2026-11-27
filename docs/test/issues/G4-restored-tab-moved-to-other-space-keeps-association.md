---
created: 2026-11-26
status: fixed, not verified
severity: low
---

# A bookmark tab linked again by undo or a restart keeps its link when moved to another space (G4)

## Summary

A bookmark tab can be linked to its bookmark again in three ways: undo after closing it, undo after deleting its space, and the startup restore after a browser restart. If such a tab is then moved into the Chrome group of another space, it stays linked. The bookmark still shows as loaded in its own space, although its tab is now in another one.

The same move on a tab the sidebar opened works, which is what A.2 checks.

## Repro

- **B.3c**: close a bookmark tab and a pinned-site tab from the sidebar, undo, and drag the bookmark's tab into the group of Space B.
- **D.2c**: delete a space with a bookmark tab open, undo, and drag the tab into the group of Space B.
- **T.8 to T.8c**: simulate a restart, then move the restored tab into another space's group. T.8b navigates the tab first, and T.8c moves the bookmark to another space before the restart.

See `docs/test/tab-space-association-test-cases.md` for the steps.

## Root cause

When a tab joins a group, Chrome's `onUpdated` reports only the new group id. To see that the tab left its space, the group-change handler in `src/background.ts` compares the new group's space with the space in `tabSpaceRegistry`. It skips tabs that are not registered.

The sidebar registers a tab when it opens a bookmark, and when a bookmark moves to another space. The paths above link a tab without registering it:

- **The startup restore** (`TabAssociationManager.restoreFromBackup`). The registry lives in session storage, which a restart empties, and the backup in local storage has no record of the tab's space.
- **Undo** (`restoreItemAssociation` in `src/contexts/BookmarkTabsContext.tsx`, used by `CloseTabAction` and `DeleteSpaceAction`). It links the reopened tab but does not register it.

## Fix

Register the space again on both paths:

- Each association backup entry records the tab's registered space (`spaceId`). `TabSpaceRegistry` reports each registration to `TabAssociationManager.noteTabSpace`, which writes it into the entry. The association save and the save after a navigation keep the field too.
- `restoreFromBackup` registers each restored tab with the space from its entry. Entries saved before this change have no `spaceId`, and their tabs restore unregistered, as they do today.
- `restoreItemAssociation` takes the space and registers it for a bookmark tab, never for a pinned site's. `DeleteSpaceAction` passes the restored space, which keeps its id. `CloseTabAction` passes the space whose name matches the group the tab was in when it closed.

The space is stored, not worked out from the bookmark's folder. A bookmark tab opens into the active space, and T.6 drops a bookmark onto another space's icon, so the tab's space is not always the space of the bookmark's folder.

## Not covered

If a space is renamed between closing a tab and undoing, `CloseTabAction` finds no space with the group's old title, and the reopened tab stays unregistered.

## Status

Fixed, not verified. Without the fix, B.3c, D.2c, T.8, T.8b and T.8c failed at the check that the bookmark is unloaded, with the G3 fix already in. T.8d, T.8e and T.8f guard the fix and passed without it, and so did B.3c's pinned-site step. To verify, build with `npm run build:debug`, run those cases, then Sections A, B, D and T in full.
