---
created: 2026-11-18
status: fixed
severity: medium
---

# "No group with id" when a tab is added to a space

## Summary

Sometimes a test step that opens a new tab in a space fails with a Chrome error such as `No group with id: 117192212.` Two writers caused it. The test step grouped its new tab itself, and background grouped the same new tab at the same time. Each writer made its own group for the space, and Chrome deleted the group of the test step when background took the tab out of it.

Seven product paths had the same race, so users could hit it too. Background now creates and places such a tab as one job, through `SpaceTabManager.createTabs`, and the test helpers and those product paths all use it. `docs/decisions/2026-11-23-new-tab-grouping-two-writers.md` explains the race and the decision.

## Where it was seen

All failures happened in the test Chrome, with a debug build.

| Date | Case | Failing step | Error | Run |
|---|---|---|---|---|
| 2026-11-18 | A.1 | `Open regular tab https://example.com/inpanel-test-a1-sidebar in space "spaceA"` | `No group with id: 117192212.` | An unattended run from the panel. Other windows covered the test window, so Chrome slowed down its timers. |
| 2026-11-18 | C.2e | `Open filler tabs in space "spaceB" until the sidebar scrolls` | `No group with id: 1413579754.` | A run of the full suite through the driver. The results are in `tools/tmp/test-results-2026-11-18T23-09-30-767Z.json`. |
| 2026-11-23 | A.1 | `Open regular tab https://example.com/inpanel-test-a1-native in space "spaceA"` | `No group with id: 1543693653.` | The first run after the merge of the step-6 work. |

## What the error means

A Chrome tab group has a number, its group id. Chrome deletes a tab group as soon as the group has no tabs. After that, each call that uses the old group id fails with `No group with id: <id>.`

Chrome cannot make an empty group. The only way to make a group is `chrome.tabs.group({ tabIds, createProperties })`, which makes the group and puts a tab in it in one call. The title of the group is set in a second call, `chrome.tabGroups.update()`. The extension finds the group of a space by its title, so a new group is not visible to a lookup until that second call is complete.

## Cause

Two writers grouped the same new tab:

- The test helpers `openTabInSpace()` and `openFillerTabsUntilScrollable()` in `src/tests/inpanel/actions.ts` made a tab with `chrome.tabs.create()`. Then they called `getOrCreateSpaceGroup()` in `src/utils/tabOperations.ts`, which runs in the sidebar.
- Background's `chrome.tabs.onCreated` listener in `src/background.ts` queues each new tab that has no group, for the active space. `processGroupingRequest()` then groups the tab. This is how a tab from Cmd+T goes into the current space while the sidebar is hidden.

When the space had no group yet, both writers made one. This sequence caused the error:

```
 Test step (sidebar)                 Chrome                     Background (service worker)
 1. tabs.create(url) ──────────────▶ tab T, no group
                                     onCreated(T) ────────────▶ queueTabForGrouping(T)
 2. tabGroups.query(space) ────────▶ [] (no group yet)
                                                                processGroupingRequest(T):
                                                                  tabs.get(T) → no group
                                                                  findGroupByName(space) → none
 3. tabs.group([T], create) ───────▶ new group G1 = {T}, no title yet
                                                                  tabs.group([T], create)
                                     new group G2 = {T}  ◀──────
                                     G1 is empty → Chrome deletes G1
 4. tabGroups.update(G1, title)
 5. tabs.group([T], groupId: G1) ──▶ ✗ "No group with id: G1"
```

Step 4 or step 5 fails, depending on when background's call comes. The race needs two conditions. Background must look up the space before the group of the test step has its title. Background must also read the tab before the test step groups it, because `processGroupingRequest()` skips a tab that already has a group.

Before step 6b, `processGroupingRequest()` started with `await isPinnedManagedTab()`, which read session storage. That read usually delayed background until the test step had grouped the tab, so background found the tab grouped and stopped. Step 6b moved the associations into `TabAssociationManager` and made `isPinnedManagedTab()` a lookup in memory with no `await`. Background now reads the tab almost at once, so the race happens much more often. The two failures on 2026-11-18 were on a branch without step 6b. They came from the rare runs where the storage read was fast.

## Who can see it

Opening a bookmark and Cmd+T leave a new tab to background, so they never raced. Seven other product paths created a tab and then grouped it from the sidebar, for example a bookmark or pinned site dragged onto a space icon (`createTabInSpace()`), "open all in group" on a folder, and the undo of a closed tab. Those paths could fail with this error, or put the tab in the wrong group with no error. `docs/decisions/2026-11-23-new-tab-grouping-two-writers.md` lists them. They now go through `SpaceTabManager.createTabs`, like the test helpers.

## Fix

The test helpers `openTabInSpace()` and `openFillerTabsUntilScrollable()` in `src/tests/inpanel/actions.ts` call `spaceTabManagerProxy.createTabs()` with the space as the placement. `SpaceTabManager` in `src/managers/impl/spaceTabManager.ts` creates the tab and puts it in the space's group as one job in its grouping queue. Background's own request for the new tab, from `chrome.tabs.onCreated`, waits behind that job and then skips the tab, because the job has placed it. Background is the only writer for a new tab, so two groups for the same space cannot appear.

Case T.6 in `src/tests/inpanel/cases/sectionT.ts` holds background right after it reads a new tab, and checks that a bookmark dragged onto another space's icon opens, and stays, in that space.

`moveTabNative()` still calls `getOrCreateSpaceGroup()`, because it moves a tab that already exists, and background does not group such a tab on its own.

## Status

Fixed. In the full driver run of 2026-11-24, A.1, C.2c, C.2e and T.6 passed, and no case reported `No group with id`.

The race depends on timing, so a single clean run does not prove it is gone. To check it again, run those cases several times through the driver:

1. Build the debug build with `npm run build:debug`.
2. Start the test Chrome with `tools/start-test-chrome.sh`. Make sure that the extension is loaded unpacked from the `dist` folder of this checkout.
3. Put this configuration in `tools/tmp/run-inpanel-tests.json`:

   ```json
   {
     "cases": ["A.1", "C.2c", "C.2c (same space)", "C.2e", "C.2e (bookmark)", "T.6"],
     "timeoutMinutes": 15
   }
   ```

4. Run `node tools/run-inpanel-tests.mjs` several times. Make sure that no summary shows `No group with id`.
