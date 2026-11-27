---
created: 2026-11-23
status: fixed
severity: low
---

# Chrome's "Remove from group" keeps a bookmark tab's association (G3)

## Summary

When a bookmark's tab is taken out of its Chrome group with Chrome's own "Remove from group" (or any other way of leaving a group without joining another), the tab stays associated with its bookmark. The bookmark still shows as loaded, and the tab still counts as being in the bookmark's space, although it is no longer in that space's group. Activating the tab later can switch the sidebar back to the bookmark's space, where the tab is not actually shown.

## Repro

- **A.5** ungroups a bookmark tab, first with the sidebar open and then with it closed, and checks after each that the bookmark is no longer loaded. Both checks fail.

See `docs/test/tab-space-association-test-cases.md` (`### A.5`) for the detailed steps.

## Root cause

The group-change handler in `chrome.tabs.onUpdated` in `src/background.ts` only reacts when a tab joins a group:

```ts
if (changeInfo.groupId !== undefined && changeInfo.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && tab?.windowId)
```

When a tracked tab joins the group of a different space, the handler removes it from `tabSpaceRegistry` and calls `tabAssociationManager.deassociate`, which is what A.2 checks. But leaving a group reports `groupId === TAB_GROUP_ID_NONE`, which this condition skips, so nothing happens.

## Proposed fix

Treat leaving a group the same way as moving to another space's group: the tab stays open and becomes a regular, unassociated tab. An ungrouped tab belongs to no space, so it can no longer be in its bookmark's space, and the association no longer describes where the tab is.

The change is in that one handler:

1. Let the condition also accept `TAB_GROUP_ID_NONE`.
2. For a tab that `tabSpaceRegistry` has registered to a space:
   - if the new group id is `TAB_GROUP_ID_NONE`, the tab has left its space, so unregister and deassociate it;
   - otherwise keep today's check: look up the group's space and deassociate only when it differs from the registered space.

Pinned sites are not affected. Their tabs are kept ungrouped on purpose and are never registered in `tabSpaceRegistry`, and the handler only acts on registered tabs, which is also why A.4 (a pinned site's tab being grouped) keeps its association.

### The tab sort must stop ungrouping first

The handler change alone would break "Sort by Domain (A-Z)" and "(Z-A)" on the Tabs header. `sortTabs` in `src/hooks/useTabs.ts` sorts every tab in the window, bookmark tabs included, in three steps. It ungroups every grouped tab, moves the tabs into the new order, and then creates new groups with the old titles and colours.

Today the links survive this. Background ignores the first step, and in the last step each tab joins a group with the same title, which is the same space. With the handler change, the first step would count as leaving the group, and every open bookmark tab in a space group would be unlinked by one sort.

So the fix comes in this order:

1. Rewrite `sortTabs` so it never ungroups. It reorders whole groups with `chrome.tabGroups.move`, and the tabs inside each group and the ungrouped tabs with `chrome.tabs.move`, the way `sortGroupTabs` already sorts within one group. Groups keep their ids, so nothing has to be rebuilt.
2. Make the handler change above.
3. Add a regression case. A space has open bookmark tabs and some regular tabs. Sort the Tabs list, and check that the bookmark tabs are still loaded and still in the space's group.

Delaying the unlink in background, and checking afterwards whether the tab was regrouped, was ruled out. It depends on timing, and a sort over many tabs can take longer than any delay we would choose.

### Points to check while implementing

Some of the extension's own operations take a bookmark tab out of its group on the way to somewhere else. If any of them leaves the group in a separate step before joining the new one, this fix would unlink the tab in between. Check each of these, and the test cases that cover them:

- **Moving a bookmark to another space** (`regroupAssociatedTab`, A.7, A.7b, A.7c). It groups the tab straight into the new space's group, so Chrome reports only the new group id. The code confirms this.
- **Moving a regular tab between spaces and dragging tabs in the Tabs list** (`moveTabToSpace`, `src/utils/tabMove.ts`). These do ungroup tabs, but the Tabs list hides bookmark tabs, so only regular tabs reach them.
- **Deleting a space and its undo** (`DeleteSpaceAction`, D.2). Check whether deleting the space ungroups its tabs, and whether its bookmark tabs are meant to stay associated afterwards.
- **Moving a tab to another window** (A.6, A.6b). A tab detached from its window loses its group, which may report `TAB_GROUP_ID_NONE` before the window move is handled. The result is the same (the tab is unlinked), but the order should not cause an error.
- **Chrome's "Ungroup" on a whole group** and closing a group. Every bookmark tab in it would be unlinked, which is consistent with this fix, but worth confirming by hand.
- **Chrome's own "Pin" on a bookmark tab** is out of scope. Chrome takes a pinned tab out of its group, which may or may not reach this handler as leaving the group. What should happen to a bookmark tab pinned this way is not defined, so no test covers it and either result is accepted.

## Status

Fixed. Sections A to D passed with the fix in, A.5 and A.5d included. The only failures were B.5 and B.5b, which are G1. The three steps above are in:

- `sortTabs` in `src/hooks/useTabs.ts` moves whole groups with `chrome.tabGroups.move` and tabs only within their own group's span. Chrome's own pinned tabs are sorted among themselves first.
- The group-change handler in `src/background.ts` also reacts to `TAB_GROUP_ID_NONE`, and unlinks a registered tab that is no longer in its registered space.
- A.5d sorts the Tabs list with two bookmark tabs and two regular tabs in one space, and checks that all four stay grouped and both bookmarks stay loaded.

### Tabs linked again by undo or by a restart

A review found that the handler acted only on tabs in `tabSpaceRegistry`, and two paths link a bookmark tab without registering it: the startup restore after a browser restart, which empties the registry with the rest of session storage, and `restoreItemAssociation`, which the undo of closing a tab and of deleting a space uses. Such a tab stays linked after leaving its group.

Leaving a group does not need the registry at all. A tab in no group is in no space, so it cannot be in its bookmark's space, whatever space it was in before. The handler now decides this from the link alone: when a tab leaves its group and is linked to a bookmark, it is unlinked (`TabAssociationManager.isBookmarkManagedTab`). Only joining a group still reads the registry. Pinned-site tabs are skipped by their link's key, since they are kept ungrouped on purpose. The fewer pieces of state the check depends on, the fewer ways it can go wrong.

Moving such a tab into another space's group does need the tab's registered space, since Chrome reports only the new group. That is a separate bug, G4 (`docs/test/issues/G4-restored-tab-moved-to-other-space-keeps-association.md`).

B.3b (close a bookmark tab, undo, ungroup it), D.2b (delete a space, undo, ungroup a reopened tab), T.7 (restart, ungroup) and T.7b (restart, ungroup with the sidebar closed) cover it. All four failed before the change, at the check that the bookmark is unloaded, and pass with it. Sections A to E, P.8, P.9 and T.1 to T.6 passed with it too.
