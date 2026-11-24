---
created: 2026-11-23
decision: new-tab-grouping-two-writers
status: implemented
depends-on: 2026-01-22-queue-tab-grouping-location
---

# Two writers group the same new tab

## Summary

When the sidebar creates a tab and then puts it into a group itself, background also sees the new tab through `chrome.tabs.onCreated` and tries to group it into the active space. The two writers race. Depending on which one reads the tab first, the sidebar's call fails with `No group with id`, or the tab ends up in the wrong group with no error at all.

The in-panel tests hit this first, as issue N1 (`docs/test/issues/fixed/N1-no-group-with-id-when-adding-tab-to-space.md`), and seven product paths had the same race. The decision is that a tab the sidebar wants somewhere specific is created and placed by background, as one job in its grouping queue, through `SpaceTabManager.createTabs`. Background's own request for the new tab then runs after the tab is placed and leaves it alone. This document explains the race, an interim fix that was not enough, the product paths, and the decision. `2026-11-23-new-tab-grouping-two-writers progress/implementation-plan.md` is the plan that carried it out.

## How a new tab gets its space

Background owns the grouping of new tabs, as `2026-01-22-queue-tab-grouping-location.md` decided. Its `chrome.tabs.onCreated` listener in `src/background.ts` queues every new tab that has no group, for the space that is active in that window. `processGroupingRequest()` then works through the queue one tab at a time. It finds the space's Chrome group by title, or creates the group if the space has none, and puts the tab in it. This is what puts a tab from Cmd+T into the current space, even while the sidebar is hidden.

That design is right for a tab that Chrome's own interface creates, because nothing else will place that tab. The trouble starts when the sidebar creates a tab for a reason of its own and wants it somewhere specific. Chrome cannot create a tab inside a group: `chrome.tabs.create()` has no group option, so creating the tab and placing it are always two separate calls. Between them, background receives `onCreated` for a tab that has no group yet, and it has no way to know that the sidebar is about to place it.

Two more facts about Chrome make the race worse. Chrome cannot create an empty group, so the only way to make a space's first group is `chrome.tabs.group({ tabIds, createProperties })`, which creates the group and moves a tab into it in one call. And the title of a new group is set in a second call, `chrome.tabGroups.update()`, so a group is invisible to a lookup by title until that second call finishes.

## The original problem

The in-panel test helpers `openTabInSpace()` and `openFillerTabsUntilScrollable()` in `src/tests/inpanel/actions.ts` created a tab with `chrome.tabs.create()` and then called `getOrCreateSpaceGroup()` in `src/utils/tabOperations.ts` to put it in a space. When that space had no group yet, both the test helper and background created one, and this happened:

```
 Test step (sidebar)                 Chrome                     Background (service worker)
 ───────────────────                 ──────                     ───────────────────────────
 1. tabs.create(url) ──────────────▶ tab T, no group
                                     onCreated(T) ────────────▶ queueTabForGrouping(T)
                                                                  target = active space (A)
 2. resolveGroupId:
    tabGroups.query("Work…") ──────▶ [] (no group yet)
                                                                processGroupingRequest(T):
                                                                  tabs.get(T) → no group
                                                                  findGroupByName("Work…") → none
 3. tabs.group([T], create) ───────▶ new group G1 = {T}
                                     (G1 has no title yet)
                                                                  tabs.group([T], create)
                                     new group G2 = {T}  ◀──────
                                     T left G1, G1 is empty
                                     → Chrome deletes G1
 4. tabGroups.update(G1, title)
 5. tabs.group([T], groupId: G1) ──▶ ✗ "No group with id: G1"
                                                                  tabGroups.update(G2, title "Work…")
```

Step 4 or step 5 fails, depending on when background's call lands, and the id in the error is the group the test step created a moment earlier. The race needs two things to line up. Background has to read the tab before the sidebar has grouped it, because `processGroupingRequest()` skips a tab that already has a group. And background's lookup by title has to run before the sidebar's new group gets its title, because otherwise background finds that group and simply puts the tab in it.

The race existed long before it showed up often. Until step 6b of `2026-07-30-shared-storage-multiple-writers.md`, `processGroupingRequest()` started with `await isPinnedManagedTab()`, which read session storage. That read usually held background back until the sidebar had grouped and titled the tab, so background found the tab grouped and stopped. Step 6b moved the associations into `TabAssociationManager` and made `isPinnedManagedTab()` a lookup in memory with no `await`. Background now reads the tab almost at once, inside the window where the tab has no group or the new group has no title, so the failure went from rare to frequent. The two N1 failures on 2026-11-18 came from a branch without step 6b, on the rare runs where the storage read was fast.

## Considered: a forced grouping request after the tab exists

The first fix for the test helpers kept the two steps but gave both to background: the helper created the tab, then sent `queue-tab-for-grouping` with the space's id, which made it a forced request, and waited until the tab was in a group with the space's title. Background was then the only writer for the tab, and its queue handled one request at a time, so two groups for the same space could not appear and no step used a group that someone else had emptied.

It had a side effect. It showed when a case opens a tab in a space that is not the active one, and the active space has no group yet. Background then gets two requests for the same tab, and handles them in order:

```
 Test step (sidebar)                    Chrome                        Background (service worker)
 ───────────────────                    ──────                        ───────────────────────────
 1. tabs.create(url) ─────────────────▶ tab T, no group
                                        onCreated(T) ───────────────▶ queueTabForGrouping(T)
                                                                        no space given → active space A
                                                                        queue: [R1: T → A, not forced]
 2. sendMessage('queue-tab-for-grouping',
      T, space B) ────────────────────────────────────────────────────▶ queue: [R1, R2: T → B, forced]

                                                                      R1 (processGroupingRequest):
                                                                        tabs.get(T) → no group
                                                                        findGroupByName(A) → none
                                        new group GA = {T} ◀───────────  tabs.group([T], create)
                                        GA titled "Work…" ◀────────────  tabGroups.update(GA, title)

                                                                      R2 (forced, so it moves T anyway):
                                                                        findGroupByName(B) → GB
                                        T moves GA → GB ◀──────────────  tabs.group([T], groupId: GB)
                                        GA is empty
                                        → Chrome deletes GA

 3. waits until T's group title is
    "Video…" → done
```

So group GA exists for a few milliseconds and the tab strip can show it briefly. It does not cause an error, because both requests run in sequence on background's queue. It does not happen when the active space already has a group with other tabs (the tab only passes through that group), when the case opens the tab in the active space (R2 finds the tab already in place), when R2 reaches the queue before R1 (R1 is not forced, so it skips a tab that is already grouped), or when the active space is "All" (R1 is never queued).

The approach did not remove the underlying problem. The tab was still created and placed in two steps, and it only avoided the race by giving background both steps through two separate requests. It also could not express "this particular group", which most of the product paths below need.

## The product paths

The product leaves most new tabs to background. Opening a bookmark through `createItemTab()` in `src/contexts/BookmarkTabsContext.tsx` asks background to group the tab into the active space, and a tab from Cmd+T goes through `onCreated` alone. Neither races.

These paths, however, created a tab and then placed it from the sidebar, which is the same pattern the test helpers used:

| Where | Action | The new tab goes into |
|---|---|---|
| `src/components/SpaceBar.tsx`, through `createTabInSpace()` | Dragging a bookmark or pinned site onto a space icon | That space, so possibly not the active one |
| `src/components/TabList.tsx`, `handleExternalUrlDrop` | Dropping a link next to a tab in a group | That tab's group |
| `src/components/TabList.tsx`, `handleTabListDrop` | A multi-drop onto a group, for items with no live tab | The target group |
| `src/components/BookmarkTree.tsx`, `handleOpenAsTabGroup` | "Open all in group" on a folder | A new group named after the folder |
| `src/actions/closeTabAction.ts`, `undo` | Undo after closing tabs | Each tab's old group |
| `src/actions/deleteSpaceAction.ts`, `undo` | Undo after deleting a space | A group with the space's name |
| `src/utils/backupRestore.ts`, `importTabGroups` | Importing tab groups from a backup | The groups in the backup |

For each of these tabs, background's `onCreated` listener queued a request for the active space at the same moment. Which writer reads the tab first decides the outcome. When the sidebar is creating a new group for the tab, as with a bookmark dragged onto a space that has no group yet, background can empty that group and the sidebar's call fails with `No group with id`. When the sidebar is adding the tab to a group that already exists, background can pull the tab out of it into the active space's group, and the tab silently ends up in the wrong place. In "open all in group", that can take a tab out of the new folder group. Step 6b made these outcomes more likely for the same reason it made N1 frequent.

The core of it is that a tab the sidebar creates for a purpose of its own is not placed atomically. Background's `onCreated` handling is right for tabs from Chrome's own interface, but it cannot tell those apart from a tab the sidebar is about to place, because Chrome sends `onCreated` before the sidebar's second call.

## Decision

A tab that the sidebar wants in a particular space or group is created by background, not by the sidebar. The sidebar calls `SpaceTabManager.createTabs(windowId, tabs, placement)`, and background creates the tabs and places them as one job in its grouping queue. `onCreated` fires while the job runs, so background's own request for each new tab is queued behind the job, and it skips a tab that a job has placed. Every path in the table above goes through `createTabs`, and so do the test helpers.

The placement says one of three things: a space (its group, created if it has none, or no group for "All"), a particular group (an existing group id, or a title and color for a new group), or no group. `SpaceTabManager` is the first part of the manager proposed in `2026-09-22-space-tab-manager.md`. It owns the grouping queue, and the sidebar's grouping requests reach it as `assignTabToSpace` and `requestGrouping` instead of the raw `queue-tab-for-grouping` message.

Other directions that were considered:

- The sidebar tells background before it creates the tab, so background's `onCreated` handling skips a tab that the sidebar is about to place. Chrome does not give the tab id before `chrome.tabs.create()` returns, so this needed some other way to match the event to the request, such as the URL and window, and a time limit.
- Background waits briefly before it acts on a new tab, and skips the tab if it has a group by then. This narrows the window but does not close it.
