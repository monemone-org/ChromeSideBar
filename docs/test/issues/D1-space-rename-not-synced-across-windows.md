---
created: 2026-08-05
status: fixed
severity: low
---

# Renaming a space doesn't update its Chrome group title in other windows (D1)

## Summary

With two windows both showing the same space's Chrome group, renaming that space from window 1 updated window 1's group, and both sidebars showed the new name. But window 2's Chrome group kept the old title. Its title no longer matched any space, so its tabs counted as being in no space, and the next tab opened in that space in window 2 got a new group instead of joining the old one.

## Repro

- **D.1 step 3**: open two windows that both show the same space's group, rename the space from window 1, and look at window 2's group title.
- **D.1b** automates it: it opens a second window with a tab in a group titled with the space's name, renames the space from the first window, and checks the second window's group title.

## Root cause

`updateSpace` in `src/contexts/SpacesContext.tsx` did two things. It sent the change to background's `SpaceManager`, which stores it and broadcasts it to every sidebar, so every window's space list was right. Then it renamed the Chrome group itself, but only in its own window: `chrome.tabGroups.query({ windowId, title: oldName })`. The group rename was a side effect of the rename action in one window, not of the change itself, so no other window renamed its group.

## Fix

Background renames the group in every window, the same way it already owns all grouping:

- `SpaceTabManager.renameSpaceGroups(oldTitle, newTitle, color)` in `src/managers/impl/spaceTabManager.ts` queries the groups titled with the old name in all windows and gives each one the new title and color. It runs as a job on the grouping queue, so a grouping job queued after the rename already finds the group under its new name instead of creating a second one.
- `SpaceManager` takes an `onSpaceRenamed(before, after)` callback at construction, and `updateSpace` calls it when a space's name or color changes. `src/background.ts` wires it to `renameSpaceGroups`. `SpaceManager` itself stays free of Chrome group code.
- `SpacesContext.updateSpace` no longer renames any group, so background is the only writer. A window whose sidebar is closed gets its group renamed too.

D.1 now gives background a moment to rename the group before it checks the title, since the rename happens after the change is stored. D.1b covers the second window.

## Not covered

An import in replace mode can also rename a space, through `SpaceManager.replaceAll`, and that does not rename any group. That was already true before this fix. It is left as a separate gap: an import can change many spaces at once, and matching old and new spaces needs their ids to survive the import.

## Status

Fixed. All of Section D passed with the fix in, D.1 and D.1b included. Two cases with no automated test were also checked by hand and worked: changing only a space's color recolors its group in every window and keeps the title, and renaming a space retitles its group in a window whose sidebar is closed.
