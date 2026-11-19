---
created: 2026-11-18
status: open
severity: unknown
---

# "No group with id" when a tab is added to a space

## Summary

Sometimes a step that adds a tab to a space fails with a Chrome error such as `No group with id: 117192212.` The failure is intermittent. The same case passed in other runs on the same day.

The error comes from product code, not from test code. The tests call `getOrCreateSpaceGroup()` in `src/utils/tabOperations.ts`. The sidebar calls the same function when a user moves a tab to a space. A real user can therefore possibly get the same error.

Nobody has examined the cause yet. The section "Suspected cause" gives a hypothesis that agrees with both failures, but nobody has tested it.

## Where it was seen

Both failures happened on 2026-11-18, in the test Chrome, with the debug build of this worktree.

| Case | Failing step | Error | Run |
|---|---|---|---|
| A.1 | `Open regular tab https://example.com/inpanel-test-a1-sidebar in space "spaceA"` | `No group with id: 117192212.` | An unattended run from the panel. The test window was covered by other windows at that time, so Chrome slowed down its timers. |
| C.2e | `Open filler tabs in space "spaceB" until the sidebar scrolls` | `No group with id: 1413579754.` | A run of the full suite through the driver. The results are in `tools/tmp/test-results-2026-11-18T23-09-30-767Z.json`. |

In the next full-suite run, C.2e passed. A.1 passed in each other run.

## What the error means

A Chrome tab group has a number, its group id. Chrome deletes a tab group as soon as the group has no tabs. After that, each call that uses the old group id fails with `No group with id: <id>.`

The extension does not store group ids. A space finds its Chrome group by the title of the group, which is the name of the space. `resolveGroupId()` in `src/utils/tabOperations.ts` does these steps:

1. It calls `chrome.tabGroups.query({ windowId, title: space.name })`.
2. If the query returns a group, it uses the id of the first group.
3. If the query returns no group, it creates a new group with the tab, and gives the group the title and color of the space.

`getOrCreateSpaceGroup()` then calls `chrome.tabs.group({ tabIds: [tabId], groupId })` with that id. The error comes from this call. The group was therefore in the result of the query in step 1, but it did not exist when `chrome.tabs.group()` ran.

## Suspected cause

This is a hypothesis. Nobody has tested it.

Before each failure, the group of the space possibly lost its last tab a short time earlier:

- In A.1, the step before the failure moves `nativeTab` from space A to space B with a native Chrome call. `nativeTab` was the only tab in the group of space A. Chrome therefore deleted that group. The failing step then adds a new tab to space A.
- In C.2e, the cleanup before the case closes all the test tabs of the earlier case. The earlier case also used a space called "Video (inpanel-test)". Chrome deleted that group when its last tab closed. The new setup then makes a space with the same name, and the failing step adds tabs to it.

The hypothesis has two possible forms:

1. `chrome.tabGroups.query()` returns a group that Chrome is deleting, or one that it deleted a short time earlier. `src/background.ts` already has `ISSUE_52949_WORKAROUND` for a related bug, where `query()` returns old data for a new group. See https://github.com/brave/brave-browser/issues/52949. The opposite case, old data for a deleted group, is possible too.
2. The group still exists at the query, but its last tab leaves it between the query and the `chrome.tabs.group()` call. Another part of the extension can move that tab, for example background in `processGroupingRequest()` in `src/background.ts`. Chrome then deletes the group before the call.

In both forms, the code trusts a group id from the query, and that id is no longer valid when the code uses it.

## Who can see it

These product paths call `getOrCreateSpaceGroup()` through `moveTabToSpace()`:

- A drag of a tab onto a space icon in the space bar (`src/components/SpaceBar.tsx`).
- The move-to-space commands in the tab list (`src/components/TabList.tsx`).

If the hypothesis is correct, a user sees the error in this situation: the user moves the last tab out of a space, and then quickly moves a different tab into that same space. `moveTabToSpace()` catches the error and returns it, so the user possibly sees an error message, and the tab does not move.

## Steps to reproduce

No step list below has made the error happen on purpose yet. Start with method 1, because it shows the failure with the real test steps. Methods 2 and 3 test the hypothesis directly.

### Method 1: run the failing cases many times through the driver

1. Build the debug build with `npm run build:debug`.
2. Start the test Chrome with `tools/start-test-chrome.sh`. Make sure that the extension is loaded unpacked from the `dist` folder of this checkout.
3. Put this configuration in `tools/tmp/run-inpanel-tests.json`. The cases before C.2e in the list make sure that a space called "Video (inpanel-test)" exists and is removed just before C.2e starts.

   ```json
   {
     "cases": ["A.1", "C.2c", "C.2c (same space)", "C.2e", "C.2e (bookmark)"],
     "timeoutMinutes": 15
   }
   ```

4. Run `node tools/run-inpanel-tests.mjs`.
5. Run step 4 again and again. Look in each summary for `No group with id` on A.1 or C.2e.
6. To make the failure more likely, cover the test window with other windows during the run. In the A.1 failure, the window was covered and Chrome slowed it down. `start-test-chrome.sh` now turns that slowdown off. For this test, you can remove the three `--disable-...` flags from the script, start Chrome again, and repeat steps 4 and 5.

### Method 2: reproduce it by hand in the sidebar

1. Open the sidebar. Make two spaces, for example "S1" and "S2".
2. In S1, open one tab only. Make sure that S1 has no other tab, so its Chrome group has exactly one tab.
3. In S2, open two tabs.
4. Move the tab of S1 to S2. Use the Chrome tab strip, or drag the tab onto the S2 icon in the space bar. The group of S1 is now empty, and Chrome deletes it.
5. Immediately, within one second, drag a tab of S2 onto the S1 icon in the space bar.
6. Look for an error message in the sidebar, and look at the console of the sidebar. In a debug build, `[moveTabToSpace] Failed:` shows the error.
7. If the tab moves correctly, repeat steps 2 to 5 several times and make step 5 faster.

### Method 3: test the hypothesis with the Chrome API only

This method does not use the extension code. It shows if `chrome.tabGroups.query()` can return a group that is deleted.

1. Open any page of the extension in a tab, for example `chrome-extension://<id>/icon.png`. Use the id from `chrome://extensions`.
2. Open DevTools for that tab, and run this script in the console:

   ```js
   (async () =>
   {
     const win = await chrome.windows.getCurrent();
     let failures = 0;
     // Repeat the delete-then-reuse sequence to catch a rare timing window.
     for (let i = 0; i < 200; i++)
     {
       const title = `stale-group-test-${i}`;
       const first = await chrome.tabs.create({ windowId: win.id, url: 'about:blank', active: false });
       const groupId = await chrome.tabs.group({ tabIds: [first.id], createProperties: { windowId: win.id } });
       await chrome.tabGroups.update(groupId, { title });

       // Empty the group, so that Chrome deletes it.
       await chrome.tabs.remove(first.id);

       // Look the group up by title at once, the same way resolveGroupId() does.
       const found = await chrome.tabGroups.query({ windowId: win.id, title });
       const second = await chrome.tabs.create({ windowId: win.id, url: 'about:blank', active: false });
       try
       {
         if (found.length > 0) await chrome.tabs.group({ tabIds: [second.id], groupId: found[0].id });
       }
       catch (error)
       {
         failures++;
         console.log(`round ${i}: query returned group ${found[0].id}, then: ${error.message}`);
       }
       await chrome.tabs.remove(second.id);
     }
     console.log(`done: ${failures} failure(s) in 200 rounds`);
   })();
   ```

3. If the script prints a failure, form 1 of the hypothesis is correct: the query returns a deleted group.
4. If the script prints `0 failure(s)`, form 1 is less likely. Next, test form 2. Move the last tab out of the group with `chrome.tabs.group()` into a different group, in place of `chrome.tabs.remove()`. Also run the query and the move at the same time, with `Promise.all`, so that the move can happen between the query and the group call.

## Possible fix

This is not agreed or scoped. If the hypothesis is correct, `getOrCreateSpaceGroup()` can catch `No group with id`, and then run `resolveGroupId()` again. The second call does not find the deleted group, so it creates a new group for the space. One retry is probably enough. The fix belongs in `src/utils/tabOperations.ts`, so the sidebar and the tests both get it.

## Status

Open. Nobody has examined it yet.
