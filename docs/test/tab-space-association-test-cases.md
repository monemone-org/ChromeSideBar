---
created: 2026-07-29
after-version: 1.0.326
status: draft
---

# Tab / Bookmark / Pinned-Site / Space Association Test Cases

This is the manual test plan for the fixes in this round, before release. The fixes are:

- `getSpaceForTab()` now reads the live Chrome group of a tab first. It uses `tabSpaceRegistry` only as a fallback.
- A new `DEASSOCIATE_TAB` flow. If you drag a tracked bookmark tab or pinned tab into the group of a different space, the tab loses its bookmark association.
- The "Follow active tab" setting, with three values: off, space, and space-and-scroll.
- The "Show active tab" toolbar button.
- Tab history navigation. It now scrolls the sidebar and switches the space through an explicit broadcast.

## Known gaps to watch for

A known gap is a fault that is not fixed yet. Make sure that each gap below still occurs. Do not assume that no error means no fault.

- G1: You delete a bookmark in the bookmark manager of Chrome (`chrome://bookmarks`) while its tab is open. The tab used to become orphaned: it continued to run, but it disappeared from both lists. This gap is fixed: background now listens for `chrome.bookmarks.onRemoved` and turns the tab into a regular tab. It applies only to bookmarks. The delete option of the extension always closes the tab first, and Chrome has no delete function for pinned sites. B.5, B.5b and B.5c check it.
- G2: You drag a tracked tab to another space, or to another window, while the side panel is closed. The bookmark used to stay "loaded" against the old space, because only the sidebar cleared the association. This gap is fixed: background now clears the association itself. A.3, A.6 and A.6c check it.
- G3: You use the "Remove from group" command of Chrome on a tracked tab. The bookmark association used to stay, because the detection ran only when the tab moved to another group. This gap is fixed: background now unlinks a bookmark tab that leaves its group, and the Tabs sort no longer ungroups tabs. A.5 checks the fix, and A.5d checks the sort. See `docs/test/issues/G3-native-remove-from-group-keeps-association.md`.

## Prerequisites

Before you start, set up these items:

- At least two spaces, for example Work and Video. Create them in Settings → Spaces, or in the Space Navigator.
- A bookmark folder for each space, with at least two bookmarks in each folder.
- At least one pinned site.
- Access to the "Follow active tab" setting, in Settings → Behaviour.

Two DevTools consoles help when something looks wrong. You do not need them for every step. To open the console of the sidebar, right-click the sidebar and click "Inspect". To open the console of the background service worker, open chrome://extensions and click the "service worker" link.

The cases use these terms:

- Regular tab: a plain tab with no bookmark or pin association.
- Bookmark tab: a tab that opens when you click a bookmark in the tree. The bookmark then shows "loaded" in the tree.
- Pinned tab: a tab that opens when you click an icon in the pinned bar.

---

## Automated coverage

The in-panel test runner automates each case marked "Yes" below. The runner exists only in a DEV build, in `src/tests/inpanel/`. To open it, use the DEV dropdown of the sidebar → "Test Runner…". Each case marked "No" is manual only.

A guided case stops at a pause and asks you to do one action. Then the runner checks the result. Some cases have one pause that needs Chrome itself: a reload of the extension, a stop of the service worker, or a clear of browsing data. The driver script `tools/run-inpanel-tests.mjs` does that action when it runs the suite. When you run the case from the panel, you do it.

The Test Runner has a "Manual" checkbox. When you turn it on, each step that the runner usually does with simulated input becomes a pause, and you do it yourself with real input: a real close of the side panel, real key presses, real mouse gestures, and the real Play and Stop buttons of the tone page. Use Manual mode for a run that is fully real. The automated run, with Manual off, is the one for regression. `docs/test/writing-test-cases.md` describes how a step gets a manual version.

| Case | Covered |
| ---- | ------- |
| A.1  | Yes     |
| A.2  | Yes     |
| A.3  | Yes     |
| A.4  | Yes     |
| A.5  | Yes     |
| A.5b | Yes     |
| A.5c | Yes     |
| A.5d | Yes     |
| A.6  | Yes     |
| A.6b | Yes     |
| A.6c | Yes     |
| A.7  | Yes     |
| A.7b | Yes     |
| A.7c | Yes     |
| B.1  | Yes     |
| B.2  | Yes     |
| B.2b | Yes     |
| B.3  | Yes     |
| B.4  | No      |
| B.5  | Yes     |
| B.5b | Yes     |
| B.5c | Yes     |
| C.1a | Yes     |
| C.1b | Yes     |
| C.1c | Yes     |
| C.1d | Yes     |
| C.1e | Yes     |
| C.1f | Yes     |
| C.2a | Yes     |
| C.2b | Yes     |
| C.2c | Yes     |
| C.2d | Yes     |
| C.2e | Yes     |
| C.2f | Yes     |
| C.2g | Yes     |
| D.1  | Yes     |
| D.1b | Yes     |
| D.2  | Yes     |
| D.3  | Yes     |
| D.4  | Yes     |
| E.1  | Yes, needs the driver or a person |
| E.2  | No      |
| E.3  | Yes, needs the driver or a person |
| F.1  | Yes     |
| F.2  | Yes     |
| F.3  | Yes     |
| F.4  | Yes     |
| P.1  | Yes     |
| P.2  | Yes     |
| P.3  | Yes     |
| P.4  | Yes     |
| P.5  | Yes     |
| P.6  | Yes, needs the driver or a person, and the network |
| P.7  | Yes, needs the network |
| P.8  | Yes, needs the driver or a person |
| P.9  | Yes, import only. Export is manual |
| P.10 | Yes, guided |
| T.1  | Yes     |
| T.2  | Yes     |
| T.3  | Yes     |
| T.4  | Yes     |
| T.5  | Yes     |
| T.6  | Yes     |
| U.1  | Yes     |
| U.2  | Yes     |
| U.3  | Yes     |

All of Section P is automated in `src/tests/inpanel/cases/sectionP.ts`. Its pin changes go through the same `usePinnedSites` callbacks that the pinned bar uses. They do not call the proxy below those callbacks. Thus a fault in a hook callback makes a case fail. The list for Section P at the end of this part gives the limits of its four rows that are not a plain "Yes".

C.2a to C.2e end with variant steps that start "Repeat, but ...". Each variant runs as its own case, with the variant in its name. Two examples are `C.2b (same space)` and `C.2e (same space, collapsed folder)`. C.2f runs its same-space pick (step 4) at its own end.

Some "Yes" rows cover the main flow of a case but not every step. These parts are still manual:

- D.1 step 3. It needs the sidebar of a second window.
- The press-and-hold gesture of C.2d. The automated case makes the two proxy calls that the dropdown makes (`getHistoryDetails`, `navigateToIndex`). Thus it covers only the background half. C.2g covers the other half: the 300 ms hold timer, the branch between a quick click and a hold in `handleHistoryMouseUp` of `Toolbar.tsx`, the dropdown display, and the click on an entry.
- The reload of the extension in E.1, the stop of the service worker in E.3 and P.8, and the clear of browsing data in P.6. The driver does these. Without the driver, you do them at a pause, and the runner checks the result.

B.4 and E.2 are manual. B.4 closes the window that holds the panel, and E.2 restarts the browser. Both stop the runner in the middle of the case. Also, in E.2 Chrome gives new tab IDs to the restored tabs. The saved references of the runner cannot find those tabs again.

Section P is automated, but four of its cases have a limit:

- P.6 needs the network. It starts with a pause that clears the browsing history of Chrome. The driver does this step only on a profile inside `tools/tmp/` that is not signed in. In every other case, you do it. Chrome keeps favicons there, and the extension cannot clear favicons without also deleting real history. The case tells a write by background apart from a write by the sidebar resolver. It watches for a `PINNED_SITES_CHANGED` broadcast that has no `senderId`. P.6 uses wikipedia.org and P.7 uses mozilla.org. Thus a run of one case does not load the icon for the other case.
- P.7 opens the page and unpins the other pin at the same moment, then checks the result. But nothing can make a background write occur in the few milliseconds that a sidebar write is in progress. Thus a pass can mean that the race did not occur. Run the case, but do not use a pass as proof. Its site must also be cleared from the history, as in P.6. If not, the background write that the case races never occurs.
- P.8 needs a stop of the service worker, as in E.3. The driver does it. Without the driver, you do it.
- P.9 calls `importFullBackup` with a fixture file in the repository (`src/tests/inpanel/data/pinned-sites-backup.json`). The import dialog uses the same path below its file picker. The replace step deletes the full pin list on purpose. A `finally` block puts the list back, so a stopped run cannot leave your pins deleted. Export is manual. The custom-icon step needs the network, as in P.6.
- P.10 needs a sidebar open in two windows, and you change the pins by hand in the other window. Run the case from the receiving window. It reads its own mirror (the copy of the pin list that a window keeps), so the runner makes every check. Only the last step, the reverse direction, is a `confirm` pause (a pause where you answer Pass or Fail).

---

## Writing a case

The conventions for new cases, in this document and in the in-panel runner, are in
`docs/test/writing-test-cases.md`.

---

## Section A - Tab moved between spaces

You can move the Chrome group of a tab in two ways. Test both. They can behave differently, because only one of them can be instrumented.

- Method a, native: right-click the tab in the tab strip of Chrome → "Add tab to group" → select the group of the other space. You can also drag the tab into the other group in the tab strip.
- Method b, sidebar: right-click the tab row in the tab list of the sidebar → "Move to Space" → select the other space.

### A.1 Regular tab moved to another space, sidebar open

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a regular tab (no bookmark or pin). Let it go into the group of Space A | The tab shows in the tab list of Space A |
| 2    | With the sidebar open, move the tab (method a) to the group of Space B | The tab moves. If the sidebar shows Space B, the tab shows there |
| 3    | Switch the sidebar to Space B | The tab shows under Space B |
| 4    | Do this again with method b | The result is the same |
| 5    | Close the sidebar panel | - |
| 6    | Move the tab (method a) into the group of Space B | - |
| 7    | Open the sidebar again and switch to Space B | The tab shows under Space B. The result is the same as with the sidebar open |

### A.2 Bookmark tab moved to a different space's group, sidebar open

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Click a bookmark in the folder of Space A to open its tab | The bookmark shows "loaded". The tab shows in the group of Space A |
| 2    | Move the tab (method a) into the group of Space B | The bookmark in the tree of Space A changes to "unloaded". The association is broken |
| 3    | Switch the sidebar to Space B | The tab, now a regular tab, shows in the tab list of Space B. It is not under a bookmark |
| 4    | Switch back to Space A and look at the bookmark tree | The bookmark is not loaded and not active |
| 5    | Do steps 1 to 4 again with method b | The result is the same. Make sure that both methods break the association |

### A.3 Bookmark tab moved to a different space's group, sidebar CLOSED (G2, fixed)

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Click a bookmark in Space A to open its tab | The bookmark shows "loaded" |
| 2    | Close the sidebar panel | - |
| 3    | Move the tab (method a) into the group of Space B | - |
| 4    | Open the sidebar again and look at Space A | The bookmark shows "not loaded", the same as in A.2. The tab stays open in the group of Space B as a regular tab |

### A.4 Pinned tab moved to a different space's group

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Click a pinned site to open its tab | The pinned icon shows "loaded" |
| 2    | Move that tab (method a) into the group of any space | Pinned sites are never registered in `tabSpaceRegistry` (see the code comments). Thus no deassociation occurs. The pin continues to track the tab in any group |
| 3    | Make sure that the pinned icon still shows "loaded", and that a click on it activates the same tab again | It works normally |
| 4    | Close the sidebar panel | - |
| 5    | Move the pinned tab (method a) into the group of another space | - |
| 6    | Open the sidebar again | The pinned icon still shows "loaded". A click on it activates the same tab again |

### A.5 Bookmark tab: native "Remove from group" / ungroup (G3, fixed)

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Click a bookmark in Space A to open its tab | The bookmark shows "loaded" |
| 2    | Right-click the tab in the tab strip of Chrome → "Remove from group" | The tab has no group now |
| 3    | Look at the bookmark in the tree of Space A | The bookmark shows as unloaded. The tab stays open as a regular tab with no group, the same result as A.2 |
| 4    | Activate that tab from another place (for example, Cmd+Tab through the Chrome tabs) | The sidebar does not switch to Space A, because the tab is no longer in Space A |
| 5    | Close the sidebar panel. Then do it again with another bookmark tab: right-click it in the tab strip → "Remove from group" | - |
| 6    | Open the sidebar again and look at the tree of Space A | The bookmark shows as unloaded, as in step 3 |
| 7    | Activate that tab from another place | The sidebar does not switch to Space A, as in step 4 |

### A.5b Regular tab: native "Remove from group" / ungroup

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a regular tab. Let it go into the group of Space A | The tab shows in the tab list of Space A |
| 2    | With the sidebar open, right-click the tab in the tab strip of Chrome → "Remove from group" | The tab has no group now. The tab list changes: the tab is no longer under Space A, or it shows as ungrouped |
| 3    | Close the sidebar panel. Press Cmd+T to open a new tab, which goes into Space A. Then right-click it in the tab strip → "Remove from group" | - |
| 4    | Open the sidebar again | The tab shows its ungrouped state correctly: it is no longer under Space A, or it shows as ungrouped |

### A.5c Pinned tab: native "Remove from group" / ungroup

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Click a pinned site to open its tab | The pinned icon shows "loaded". The tab opens with no group, because the extension does not group pinned tabs. Make sure that the tab has no Chrome group. If it has one, step 3 has nothing to remove |
| 2    | Right-click the tab in the tab strip of Chrome → "Add tab to group" → select the group of any space | The tab joins that group |
| 3    | With the sidebar open, right-click the tab → "Remove from group" | The pinned icon continues to track the tab in any group. The association logic does not group pinned tabs |
| 4    | Close the sidebar panel. Do steps 1 to 3 again with another pinned tab | - |
| 5    | Open the sidebar again | The pinned icon still shows "loaded". A click on it activates the same tab again |

### A.5d Sorting the Tabs list keeps bookmark tabs linked

The Tabs sort used to ungroup every tab and then group them again. Since the G3 fix, a bookmark tab that leaves its group is unlinked, so this case checks that the sort no longer takes tabs out of their groups.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | In Space A, open two bookmarks and two regular tabs, mixed | Both bookmarks show "loaded". All four tabs are in the group of Space A |
| 2    | Click the "..." button of the Tabs header → "Sort by Domain (A-Z)" | The tabs are reordered |
| 3    | Look at the tab strip of Chrome and at the bookmark tree | All four tabs are still in the group of Space A, and both bookmarks still show "loaded" |

### A.6 Tab moved to a different window

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a bookmark tab in Space A, in window 1 | The bookmark shows "loaded" |
| 2    | Drag the tab out of the tab strip of Chrome into a new window of its own, or into a second window that is already open | The tab detaches |
| 3    | Look at the bookmark tree of Space A in the sidebar of window 1 | The bookmark shows as unloaded, because the tab left this window |
| 4    | If a sidebar is open in the new window, look at its state | The sidebar of the new window shows a plain regular tab. No association moves with the tab |
| 5    | Do steps 1 and 2 again, but close the sidebar panel of window 1 before you drag the tab out | - |
| 6    | Open the sidebar of window 1 again and look at the bookmark tree of Space A | The bookmark shows as unloaded, because the tab left this window. Compare with step 3, and record whether the closed sidebar changes the result |

### A.6b Regular tab moved to a different window

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a regular tab in Space A, in window 1 | The tab shows in the list of Space A |
| 2    | With the sidebar open, drag the tab into a new window of its own, or into a second window that is already open | The tab detaches. The tab list of window 1 no longer shows it |
| 3    | If a sidebar is open in the new window, look at its state | The sidebar of the new window shows a plain regular tab, in the group that the tab went into |
| 4    | Do steps 1 and 2 again with the sidebar of window 1 closed. Then open that sidebar again | The tab list no longer shows the tab, as in step 2 |

### A.6c Pinned tab moved to a different window

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Click a pinned site to open its tab, in window 1 | The pinned icon shows "loaded" |
| 2    | With the sidebar open, drag the tab into a new window of its own, or into a second window that is already open | Look at whether the pinned icon in window 1 changes to unloaded, or continues to track the tab in the other window |
| 3    | Do steps 1 and 2 again with the sidebar of window 1 closed. Then open that sidebar again | Compare with step 2. Record whether the closed sidebar changes the result |

### A.7 Regular tab bookmarked via drag-into-tree, then moved to another space

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a regular tab in Space A | The tab shows in the list of Space A |
| 2    | Drag that tab onto the bookmark tree to make a new bookmark for it, or use "Add to Bookmark" | The new bookmark exists. The tab shows as its "loaded" bookmark tab |
| 3    | Move the tab (method a) into the group of Space B | Look at whether the new bookmark changes to unloaded, as in A.2. A review reported that this path does not register a space with `tabSpaceRegistry` when it makes the bookmark. Thus record what occurs. The result can be different from A.2 |
| 4    | Do steps 1 and 2 again. Then right-click the bookmark (not the tab) → "Move to Space" → select Space B | The bookmark moves to the folder of Space B. The tab also moves into the Chrome group of Space B. This did not work before. It is fixed now (see the results document) |
| 5    | Do steps 1 and 2 again. Close the sidebar panel. Then move the tab (method a) into the group of Space B | - |
| 6    | Open the sidebar again and look at the bookmark tree of Space A | Compare with step 3. Record whether the closed sidebar changes the result |

In step 4, use "Move to Space" on the bookmark row, not on the tab row. These are two different actions. The bookmark action moves the bookmark to a different folder. The tab action is the one that A.1 and A.2 use. For a bookmarked tab, a right-click opens the menu of the bookmark row. Thus step 4 names the row that you must right-click.

### A.7b Bookmarked tab moved via generic "Move Bookmark to..." folder picker

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a regular tab in Space A. Bookmark it: drag it into the tree, or use "Add to Bookmark" | The bookmark shows "loaded" in Space A |
| 2    | Right-click the bookmark → "Move to...". This is the general folder picker, not "Move to Space". Select a folder inside the bookmark folder of Space B | The bookmark moves to that folder |
| 3    | Look at the Chrome group of the tab | The tab moves into the Chrome group of Space B |
| 4    | Switch the sidebar to Space B | The bookmark shows "loaded" there, with the tab under it |

### A.7c Multiple bookmarked tabs moved via multi-select "Move to..."

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open two regular tabs in Space A. Bookmark both: drag them into the tree, or use "Add to Bookmark" | Both bookmarks show "loaded" in Space A |
| 2    | Select both bookmarks in the tree. Use the multi-select "Move to..." or "Move to Space" → select Space B | Both bookmarks move to the folder of Space B |
| 3    | Look at the Chrome groups of both tabs | Both tabs move into the Chrome group of Space B |
| 4    | Switch the sidebar to Space B | Both bookmarks show "loaded" there |

---

## Section B - Tab closing

### B.1 Close a bookmark tab directly (X button / Cmd+W)

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a bookmark tab | The bookmark shows "loaded" |
| 2    | Close the tab | The bookmark changes back to unloaded. No stale references stay |
| 3    | Open another bookmark tab. Then close the sidebar panel | - |
| 4    | Close that tab (X button or Cmd+W) while the sidebar is closed | - |
| 5    | Open the sidebar again | The bookmark shows unloaded. No stale references stay |

### B.2 Close a pinned tab directly

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a pinned tab | The pinned icon shows "loaded" |
| 2    | Close the tab | The pinned icon changes back to closed |
| 3    | Open another pinned tab. Then close the sidebar panel | - |
| 4    | Close that tab while the sidebar is closed | - |
| 5    | Open the sidebar again | The pinned icon shows closed. No stale references stay |

### B.2b Close a regular tab directly

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | With the sidebar open, open a regular tab (no bookmark or pin) | The tab shows in the tab list of its space |
| 2    | Close the tab | The tab disappears from the list. No errors occur |
| 3    | Open another regular tab. Then close the sidebar panel | - |
| 4    | Close that tab while the sidebar is closed | - |
| 5    | Open the sidebar again | The tab is not in the list. No stale references stay |

### B.3 Close via "Close Tab" in the sidebar's own context menu / multi-close

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open two or three bookmark tabs or pinned tabs | All show "loaded" |
| 2    | Select more than one and close them through the sidebar (toolbar or context menu) | All change back to unloaded. An undo toast shows. If you click it, it restores them correctly |

### B.4 Close the whole window with tracked tabs open

The result depends on the "Continue where you left off" setting of Chrome (Settings → On Startup). This setting changes what Chrome does with the window when it starts again. Thus it changes what the case tests. Test with the setting off and with the setting on.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open some bookmark tabs, pinned tabs and regular tabs in two spaces | - |
| 2    | Close the full browser window | No errors show in the background console. To look, open chrome://extensions → service worker, and look for uncaught errors after this step |
| 3    | Open a new window | The state is new. No old association applies to a new tab |
| 4    | With "Continue where you left off" off, quit Chrome and start it again | Chrome opens with no restored tabs. Make sure only that no errors occur. `chrome.windows.onRemoved` deleted the association backup of the window when the window closed (`background.ts:1055-1070`). Thus nothing is left to restore, even if Chrome tried |
| 5    | With "Continue where you left off" on, quit Chrome and start it again | Chrome restores the window and its tabs with new tab IDs. See E.2 for the full check. The restore works only if the backup survived the quit. This is a race between the operating system, which stops the process, and the cleanup in `onRemoved`. If this step gives different results on different runs, the race is the cause |

### B.5 Delete a bookmark while its tab is open (G1, fixed)

This case applies only to bookmarks. The delete option in the bookmark tree of the extension (`DeleteBookmarkAction`) calls `chrome.tabs.remove()` on the associated tab. Thus it never orphans a tab. G1 occurred only through the bookmark manager of Chrome (`chrome://bookmarks`), because the extension had no `chrome.bookmarks.onRemoved` listener to see that delete. Background has one now. This case is the sidebar-open version of B.5b, which covers the sidebar-closed version. Keep both.

This case does not apply to pinned sites. Chrome has no view of them at all: they have no node in the bookmark tree and no entry in `chrome://bookmarks` (see the note after B.5b). Their only remove path is the unpin action in `PinnedBar.tsx` → `DeletePinnedSiteAction`, and that path always closes the tab. No code path can orphan the tab of a pinned site.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open the tab of a bookmark | The bookmark shows "loaded" |
| 2    | Delete that bookmark (not the tab) in the bookmark manager of Chrome (`chrome://bookmarks`), not in the tree of the extension | The tab continues to run, and it now shows in the regular tab list, in whatever group it was in. The bookmark is gone from the tree |

### B.5b Delete a bookmark via Chrome's native bookmark manager, sidebar closed

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open the tab of a bookmark | The bookmark shows "loaded" |
| 2    | Close the sidebar panel | - |
| 3    | Open `chrome://bookmarks`, find that bookmark, and delete it there, not in the tree of the extension | - |
| 4    | Open the sidebar again | The same result as in B.5 step 2: the tab shows in the regular tab list. The listener is in background, so the open or closed sidebar at the time of the delete does not change the result |

This case does not apply to pinned sites. They are entries in `chrome.storage.local`, not real bookmarks, so they have no entry in `chrome://bookmarks`. You can delete a pinned site only in the sidebar of the extension, and you cannot do that while the sidebar is closed.

### B.5c Delete a folder whose bookmarks have open tabs

Chrome reports a folder delete as one `chrome.bookmarks.onRemoved` event for the folder, not one per bookmark in it. This case checks that every open tab under the folder is unlinked, not only a tab whose bookmark the event names.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | In Space A, make a subfolder with two bookmarks, and open the tab of each | Both bookmarks show "loaded" |
| 2    | Delete the subfolder in the bookmark manager of Chrome (`chrome://bookmarks`) | Both tabs continue to run, and both show in the regular tab list. The folder and its bookmarks are gone from the tree |

---

## Section C - "Follow active tab" modes

Set the mode in Settings → Behaviour → "Follow active tab". The modes are "Off", "Switch to the tab's space", and "Switch space and show the tab".

- C.1 runs once for each mode, because the mode is what it tests. A full pass is three runs of the table. At a minimum, run the starred rows in all three modes.
- C.2 runs under "Off" only. That section tells why the other two modes prove nothing there.
- C.2g, at the end of C.2, does not depend on the mode.

### C.1 Activation scenarios per mode

To activate a tab means to make an open tab the active tab (`chrome.tabs.onActivated`). It does not mean to open a new tab. Each sub-case below is a separate test. Run it once for each mode. The last three columns give the expected result of each step in each mode. A setup step shows "-". At a minimum, run C.1a and C.1b (starred) in all three modes.

#### C.1a\* Activate another tab in the same space

| Step | Action | Off | Space | Space and scroll |
| ---- | ------ | --- | ----- | ---------------- |
| 1    | Switch the sidebar to Space A | - | - | - |
| 2    | Open a regular tab. It goes into Space A | - | - | - |
| 3    | Open a second regular tab in Space A (for example, Cmd+click a link on the page of the first tab) | - | - | - |
| 4    | In the tab strip of Chrome, click the first tab to activate it | No space switch. No scroll | No space switch. No scroll | No scroll if the tab is already visible. No space switch, because it is the same space |

#### C.1b\* Activate a tab in a different space

| Step | Action | Off | Space | Space and scroll |
| ---- | ------ | --- | ----- | ---------------- |
| 1    | Switch the sidebar to Space A and open a regular tab there | - | - | - |
| 2    | Switch the sidebar to Space B and open a regular tab there | - | - | - |
| 3    | Switch the sidebar back to Space A, and activate the Space A tab | - | - | - |
| 4    | In the tab strip of Chrome (not the sidebar), click the Space B tab to activate it | The sidebar stays on Space A. It does not follow | The sidebar switches to Space B and scrolls to show the tab | The same as in Space mode |

#### C.1c Close the active tab, Chrome activates another tab in the same space

The two tabs must be far apart in the sidebar, so that you can see whether it scrolled. Two tabs that you open one after the other usually show next to each other. Then you cannot see a scroll. To prevent this, open the first tab from the first bookmark of Space A. This keeps it at the top, far from the place where a new regular tab shows.

| Step | Action | Off | Space | Space and scroll |
| ---- | ------ | --- | ----- | ---------------- |
| 1    | Switch the sidebar to Space A | - | - | - |
| 2    | Click the first bookmark of Space A to open it as a tab ("tab 1"). It shows at the top of the bookmark tree | - | - | - |
| 3    | Open a second, plain regular tab in Space A ("tab 2") and activate it | - | - | - |
| 4    | Scroll the sidebar until the bookmark row of tab 1 is out of view (for example, scroll down to the tabs section) | - | - | - |
| 5    | Close tab 2, which is active. Chrome activates tab 1, which is still in Space A | No scroll. The bookmark row of tab 1 stays out of view | No scroll. The row stays out of view. This was the original fault where a tab close caused a scroll. Make sure that it is still fixed | The sidebar scrolls the bookmark row back into view |

#### C.1d Close the active tab, Chrome activates another tab in a different space

When you close a tab, Chrome activates another tab in the same tab group if one exists. Thus the group of Space B must contain only the tab that you close. If not, Chrome activates the other Space B tab and does not cross into Space A. Then the test does not cover the cross-space case.

| Step | Action | Off | Space | Space and scroll |
| ---- | ------ | --- | ----- | ---------------- |
| 1    | Switch the sidebar to Space A. Open a regular tab there and activate it | - | - | - |
| 2    | Switch the sidebar to Space B. Open a regular tab there and activate it. Make sure that it is the only tab in the group of Space B. Then the Space A tab is next in the order of recent use, and Chrome has no sibling in the group to select instead | - | - | - |
| 3    | Close the active tab, in Space B. Chrome activates the previous tab in the order of recent use, which is in Space A | No switch. No scroll | The sidebar switches to that space. It scrolls only if the tab is out of view | The sidebar switches the space and scrolls to show the tab that became active |

#### C.1e Activate a bookmark tab in another space (collapsed folder auto-expands)

| Step | Action | Off | Space | Space and scroll |
| ---- | ------ | --- | ----- | ---------------- |
| 1    | Switch the sidebar to Space B. Expand a folder if necessary, and click a bookmark inside it to open its tab | - | - | - |
| 2    | Collapse that folder. Then switch the sidebar to Space A and activate a tab in Space A | - | - | - |
| 3    | In the tab strip of Chrome, click the tab of that bookmark to activate it | No switch | The sidebar switches the space. The folder expands. The sidebar scrolls to the bookmark row | The same: the folder expands and the sidebar scrolls |

#### C.1f Activate a pinned-site tab from another space

| Step | Action | Off | Space | Space and scroll |
| ---- | ------ | --- | ----- | ---------------- |
| 1    | Switch the sidebar to Space A | - | - | - |
| 2    | Click a pinned site to open its tab. The extension never groups a pinned tab into the Chrome group of a space | - | - | - |
| 3    | Switch the sidebar to Space B and activate a tab in Space B | - | - | - |
| 4    | In the tab strip of Chrome, click the pinned tab to activate it | No switch, because pinned tabs belong to no space | No switch, for the same reason | No switch, for the same reason |

### C.2 Explicit actions bypass the mode (should always scroll/switch regardless of setting)

An explicit action is a button, a shortcut, or a menu item that you use to go to a tab. An explicit action must switch the space and scroll in every mode, and so bypass the mode.

Run every sub-case below under "Off" only, not in all three modes. Only "Off" tests the bypass. Explicit actions set `explicit: true`, which skips the scroll decision in `useFollowActiveTab.ts`. The space switch does not read the mode at all (`setActiveTabAndSpace` in `background.ts`). Under the other two modes, the switch and the scroll occur anyway. Thus those runs pass even if the bypass is fully broken. They take twice the work and prove nothing about this group.

The sub-cases are grouped by trigger. Each group covers the cross-space case and the same-space case in one table, because the setup is almost the same.

#### C.2a "Show active tab" toolbar button

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to "Off" | - |
| 2    | Switch the sidebar to Space A. Open a regular tab there and activate it | - |
| 3    | Switch the sidebar to Space B. Open a regular tab there and activate it | - |
| 4    | Switch the sidebar back to Space A. The active tab is now in Space B, but the sidebar shows Space A | - |
| 5    | Click the "Show active tab" toolbar button | The sidebar switches to Space B and scrolls to the tab. This was reported as broken in "Off", so "Off" is the mode that matters |
| 6    | Do steps 2 to 5 again, but make the Space B tab a bookmark tab inside a collapsed folder | The folder expands. The sidebar scrolls to the bookmark row |

#### C.2b Tab history Previous/Next toolbar buttons

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to "Off" | - |
| 2    | Switch the sidebar to Space A. Open a regular tab there and activate it (tab 1) | - |
| 3    | Switch the sidebar to Space B. Open a regular tab there and activate it (tab 2) | - |
| 4    | Click the "Previous" button on the toolbar to go back to tab 1 | The sidebar switches to Space A and scrolls to tab 1 |
| 5    | Click "Next" to go back to tab 2 | The sidebar switches to Space B and scrolls to tab 2 |
| 6    | Do steps 2 to 5 again, but open tab 1 and tab 2 in the same space | No space switch. The sidebar scrolls to the tab if it is out of view |

#### C.2c History keyboard shortcuts (Cmd+Shift+< / Cmd+Shift+>)

The setup is the same as in C.2b, but you use the keyboard instead of the toolbar buttons. Test this separately. This path has no other way to reach the sidebar, so it is the best proof that explicit actions bypass "Off" mode.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to "Off" | - |
| 2    | Switch the sidebar to Space A. Open a regular tab there and activate it (tab 1) | - |
| 3    | Switch the sidebar to Space B. Open a regular tab there and activate it (tab 2) | - |
| 4    | Press Cmd+Shift+< (back) | The sidebar switches to Space A and scrolls to tab 1 |
| 5    | Press Cmd+Shift+> (forward) | The sidebar switches to Space B and scrolls to tab 2 |
| 6    | Do steps 2 to 5 again, but open both tabs in the same space | No space switch. The sidebar scrolls to the tab if it is out of view |

#### C.2d Tab-history dropdown (press-and-hold Previous/Next)

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to "Off" | - |
| 2    | Switch the sidebar to Space A. Open a regular tab there and activate it (tab 1) | - |
| 3    | Switch the sidebar to Space B. Open a regular tab there and activate it (tab 2) | - |
| 4    | Switch the sidebar to Space A again. Open a third regular tab there and activate it (tab 3). Tab 2 is now some entries back in the history | - |
| 5    | Press and hold the "Previous" button on the toolbar to open the history dropdown. Select the entry for tab 2 | The sidebar switches to Space B and scrolls to tab 2 |
| 6    | Do steps 2 to 5 again, but open all three tabs in the same space | No space switch. The sidebar scrolls to the tab if it is out of view |

#### C.2e Audio quick-jump (single click on audio button)

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to "Off" | - |
| 2    | Switch the sidebar to Space A | - |
| 3    | Switch the sidebar to Space B. Open a tab there that plays audio (for example, a page with a video that plays automatically) | - |
| 4    | Switch the sidebar back to Space A | - |
| 5    | Click the audio quick-jump button on the toolbar | The sidebar switches to Space B and scrolls to the audio tab |
| 6    | Do steps 3 to 5 again, but make the audio tab a bookmark tab, not a regular tab | The sidebar scrolls to the bookmark row. It does not only look for `data-tab-id` and fail |
| 7    | Do steps 2 to 5 again, but open the audio tab in the space that the sidebar already shows | No space switch. The sidebar scrolls to the tab if it is out of view |
| 8    | Do step 7 again, but make that audio tab a bookmark tab in a collapsed folder | No space switch. The sidebar scrolls to the bookmark row. The folder expands if it is collapsed |

#### C.2f Select a tab from the audio tabs dropdown list

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to "Off" | - |
| 2    | Have two or more tabs that play audio. At least one must be in a space that the sidebar does not show now | - |
| 3    | Open the audio tabs dropdown on the toolbar, and select the entry from the other space | The sidebar switches the space and scrolls correctly, for a regular tab and for a bookmark tab |
| 4    | Do step 3 again, but select an entry that is in the space that the sidebar shows | No space switch. The sidebar scrolls to the tab if it is out of view |

The next sub-case is not about the bypass of the follow mode, which is different from C.2a to C.2f. It covers the press-and-hold gesture on the history buttons. C.2d reaches only the background half of that gesture. The follow mode has no effect on it, so run it under the mode that is set now.

Not covered: the window that receives a history request or an audio request. Every entry point to those calls in the sidebar is a click. A click on the side panel of a background window also focuses that window. Thus the request and the focused window are always the same window.

#### C.2g History dropdown press-and-hold gesture

The runner does the setup, does each gesture with simulated mouse events, and checks each result in the DOM of the sidebar. The case is automated in `src/tests/inpanel/cases/sectionC.ts`.

C.2d covers the background half of the same dropdown. It calls `getHistoryDetails` and `navigateToIndex` directly. Thus this case adds the `Toolbar.tsx` half: the hold timer, the branch between a quick click and a hold in `handleHistoryMouseUp`, the dropdown display, and the click on an entry.

Every test tab is an `example.com` URL, so all the dropdown rows have the same title. The dropdown lists the entries with the most recent first. Thus the steps below find the target by its position, not by its name.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Activate three or more tabs in two spaces to make some history | - |
| 2    | Press and hold the "Previous" button on the toolbar for approximately half a second | The dropdown opens. It lists the earlier tabs, each with its title and favicon |
| 3    | Make sure that each entry in the list shows a title, and also a favicon or the grey fallback square | The titles are there. A grey square is not a failure: `Toolbar.tsx` shows one for each tab that has no favicon. This step tests `getHistoryDetails` from end to end, with the space lookup that it does for each entry |
| 4    | Click one of the entries | The sidebar goes to that tab and switches the space if necessary. The dropdown closes |
| 5    | Click "Previous" quickly, and do not hold it | The sidebar goes back one step. No dropdown shows |
| 6    | Click "Previous" one time, normally, while the dropdown is open | The dropdown closes. No navigation occurs. Use a plain click, not a hold. The open dropdown puts a full-screen overlay (`MenuBase.tsx`) over the button. Thus no hold timer can start, and the length of the press has no effect |
| 7    | Go back some steps first. Then do steps 2 to 4 again on the "Next" button | It behaves the same, and lists the entries after the current position |

Not covered: the timer cancel in `handleHistoryMouseLeave`. To reach it, you must press the button and move off it in the 300 ms before the dropdown opens. This is too hard to do the same way every time.

---

## Section D - Space lifecycle

### D.1 Rename a space while it has tracked tabs

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a bookmark tab in Space A | The bookmark is loaded. The tab is in the Chrome group of Space A |
| 2    | Rename Space A (in Settings, or right-click → Edit Space) | The title of the Chrome group changes to the new name. The bookmark tab still shows as loaded. When you activate it, it still goes to the renamed space |
| 3    | Open two windows that both show the group of Space A. Rename the space from window 1 | The Chrome group in window 2 also gets the new name, and its sidebar shows the new name. Background renames the group of the space in every window, also in a window whose sidebar is closed (D1). D.1b automates this step |

### D.2 Delete a space with tracked tabs

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a bookmark tab in Space A. Make sure that it is loaded | - |
| 2    | Also open the tab of a pinned site, and a plain regular tab, in Space A. All three types of tab are now open | - |
| 3    | Delete Space A, with all three tabs open | The bookmark tab and the regular tab close. They are in the Chrome group of Space A, and `DeleteSpaceAction` closes that group. The pinned tab stays open, with no change. Make sure that no orphaned association or registry state stays for the two closed tabs if they are used again later |
| 4    | Undo the delete of the space, if the sidebar offers it | The space, the bookmark tab, and the regular tab come back correctly, with their associations. The pinned tab had no change, so nothing comes back for it |

### D.3 Background's own space cache must drop a deleted space immediately

This is a regression check for Case 3 in `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`. A regression check makes sure that a fixed fault does not come back. This case is automated in `src/tests/inpanel/cases/sectionD.ts`.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Make Space A | - |
| 2    | Delete Space A | Space A disappears from the sidebar immediately |
| 3    | Immediately, with no other space change first, open the Space Navigator popup (Cmd/Ctrl+Shift+S) in any window | Space A is not in the list of the popup |
| 4    | For a deeper check, open the console of the service worker (`chrome://extensions` → this extension → "service worker"). Find the log line from the delete in step 2. This line exists only in a DEV build | The most recent `[SpaceManager] updateSpaces applied: [...]` line does not list Space A |

### D.4 Legacy space (`bookmarkFolderPath`, no `bookmarkFolderSegments`) self-heals immediately

This is a regression check for the segment self-heal in `SpaceManager.updateSpaces()` (see `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`). The self-heal adds missing `bookmarkFolderSegments` back to a space. This case is automated in `src/tests/inpanel/cases/sectionD.ts`.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Make a space with a real bookmark folder | The space has `bookmarkFolderSegments` set |
| 2    | Remove `bookmarkFolderSegments` from it, but keep `bookmarkFolderPath`. Write the list through `spaceManagerProxy.updateSpaces()`. An Arc import and a backup from before `bookmarkFolderSegments` make this shape | - |
| 3    | Look at the space list of background | `bookmarkFolderSegments` is back, and it matches the original |
| 4    | Look at the mirror of this window, which `BookmarkTree.tsx` displays | `bookmarkFolderSegments` is back there too, not only in the copy of background |

Manual-only gap: some data has no `bookmarkFolderSegments` and never went through `updateSpaces()`. An example is the first start after an upgrade from an old version. That data still depends on the startup `migrate()` in `SpaceManager.load()`, and this case does not test that path.

---

## Section E - Restart / reload durability

### E.1 Reload the extension (chrome://extensions → reload)

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Have some bookmark tabs and pinned tabs open in different spaces | - |
| 2    | Reload the extension | The service worker starts again. The tab IDs stay the same, because the browser session continues |
| 3    | Open the sidebar again | All associations are correct. Bookmarks and pins show "loaded" for their current tabs, in their current spaces |

### E.2 Full browser restart

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Have some bookmark tabs and pinned tabs open. Quit Chrome and start it again, with "Continue where you left off" on | Chrome restores the tabs with new tab IDs |
| 2    | Open the sidebar | The backup matching associates the bookmarks and pins again with their restored tabs. It matches by domain and by index. Make sure that this still works after the changes in this round to `tabAssociations.ts` and `getSpaceForTab` |

### E.3 Service worker restart repopulates tab history and audible tracking

The runner plays and stops the audio itself. For the stop of the service worker, it pauses. The driver does that step. Without the driver, you stop the worker by hand. Then the runner checks the recovery itself. The case is automated in `src/tests/inpanel/cases/sectionE.ts`.

This case is a regression check for step 4 of `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`. Both managers moved out of `background.ts`. `LastAudibleTracker` holds a `TabHistoryManager`, so it must now be constructed after it. A wiring fault there shows only on a cold start (a start of the service worker from the stopped state), when `load()` runs.

Do not use E.1 instead of this case. A reload of the extension is a new load of the extension, and it can clear `chrome.storage.session`. Then nothing is left to restore, and the case proves nothing. A stop of the worker keeps session storage, and this case needs that condition. Step 3 checks this condition.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Activate four or five tabs, one after the other, to make some history. Play audio in one of them, then stop it | The audio dropdown lists that tab under recently played |
| 2    | At the pause, the runner opens `chrome://serviceworker-internals` in a window of its own. There, find the entry whose Script is `chrome-extension://<this extension's id>/background.js` and click Stop. If the entry already shows "Running Status: STOPPED", the worker stopped by itself after it was idle, and you have nothing to do. Do not use DevTools for this step: DevTools on the worker has no Stop button, and while it is open it keeps the worker running. To come back, click inside the sidebar of the first window, not on a tab | The worker stops. The extension does not reload. The tab history of the first window has no change, because each window has its own history and the page opened in a different window |
| 3    | In the sidebar, press the "Previous" button on the toolbar | The worker starts. `TabHistoryManager.load()` fills the history from session storage, and the navigation goes back one step as usual. If the history is empty, session storage did not survive, and this case cannot run on this Chrome build |
| 4    | Open the audio dropdown | The tab from step 1 is still under recently played. Thus `LastAudibleTracker.load()` also ran |
| 5    | Press and hold "Previous" to open the history dropdown | The entries still have their titles, favicons and correct space. Thus the injected `getSpaceForTab` survived the restart |

---

## Section F - Regression check on pre-existing behavior

This section checks related behavior that must not break. It is automated in `src/tests/inpanel/cases/sectionF.ts`. F.1 does its drag with simulated mouse events.

| #   | Action | Expected Result |
| --- | ------ | --------------- |
| 1   | In Space A, drag the row of a regular tab onto the icon of Space B in the space bar | The tab moves into the Chrome group of Space B |
| 2   | Open a bookmark tab in Space A. Then right-click the bookmark → "Move To Tabs" | The bookmark shows as not loaded. The tab stays open, still in the Chrome group of Space A |
| 3   | With Space B active, open a new tab (Cmd+T) | The tab joins the Chrome group of Space B |
| 4   | Open a bookmark tab that is three collapsed folders deep in Space B, and activate it. Switch the sidebar to Space A. Then click "Show active tab" | The sidebar switches to Space B. All three folders expand. The sidebar scrolls to the bookmark row |

---

## Section P - Pinned site list ownership

These cases are for step 5 of `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`. `PinnedSitesManager` is now the only writer of `chrome.storage.local['pinnedSites']`. The sidebar reaches it through `pinnedSitesManagerProxy`. The section letter is P, not G, so that the IDs are not confused with the known gaps G1 to G3.

This section is automated in `src/tests/inpanel/cases/sectionP.ts`. P.10 is guided. P.6 and P.8 each have one pause that the driver does, or that you do without the driver. P.6, P.7 and one step of P.9 need the network.

Most of these cases check the same two things, and the rows use these two names for them:

- Background's list: the result of `pinnedSitesManagerProxy.getPinnedSites()`. This call is a new round trip to the in-memory copy of the manager. Correct storage is not sufficient. In Case 3, storage was correct, but the cache of background stayed stale for the rest of the session.
- The mirror of this window: `pinnedSitesManagerProxy.snapshot`, which `PinnedBar` displays.
- The bar: the pinned bar that you see in the sidebar.

### P.1 Every pin mutation reaches background's own list

This case is a full round trip. It does each pin operation one time. None of these operations had a test before.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin | The pin shows in the bar. It is in background's list |
| 2    | Change its title and URL | Both change in the bar and in background's list |
| 3    | Give it an emoji. Then replace the emoji with a custom Lucide icon | The bar shows the emoji, then the icon. In background's list, `emoji` is set and `customIconName` is clear, then the reverse. The two are never set at the same time |
| 4    | Right-click → "Reset to site icon" | Background's list has no custom icon and no emoji. The bar shows the site favicon, or a letter tile if Chrome has no cached favicon |
| 5    | Duplicate the pin | Two pins show next to each other, with different IDs. Both are in background's list |
| 6    | Drag one pin to a different position | The bar and background's list show the same new order |
| 7    | Unpin both | Both are gone from the bar and from background's list |

### P.2 Read-after-write: two mutations in a row

This is a regression check for the mirror, which is a plain store and not React state. Before step 5, a second pin change made its new array from the list that the last render captured. Thus the write of the first change was lost.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add two pins, one immediately after the other, with no wait between them | Both pins are in the mirror and in background's list. If only one pin stays, the snapshot fault is back |
| 2    | Unpin two pins, one immediately after the other | Both are gone from the mirror and from background's list |
| 3    | Read the mirror on the line immediately after an unpin returns, with no sleep | The unpinned pin is already gone. The optimistic write makes this true, not the round trip |

### P.3 Delete and undo restores position

This case runs `DeletePinnedSiteAction` through the manager. The only other test is the "Unit Test Do/Undo Delete Pinned Sites" item in the DEV dropdown. That test writes the full pin list as its setup. This case does the same check with pins that you can see.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | With at least four pins, unpin the second one | It disappears. The other pins keep their order |
| 2    | Undo | It comes back at position two, not at the end. Background's list shows the same |
| 3    | Unpin two pins at once (multi-select). Then undo | Both come back at their original positions |
| 4    | Unpin a pin whose tab is open. Then undo | The tab closes when you unpin. The pin comes back when you undo, but the tab does not open again. Undo restores only the pin data |

### P.4 Background's own pin cache must reflect a sidebar change immediately

This is the Case 2 version of D.3. Before step 5, background had no pin list in memory. Thus this case tests a new guarantee, not a fixed fault.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin | - |
| 2    | Immediately, with no other pin change first, read background's list | The new pin is there |
| 3    | Unpin it. Immediately read background's list again | The pin is gone. If it is still there, the in-memory copy of the manager and storage do not agree |

### P.5 A late icon patch must not overwrite a newer choice

This is a regression check for the provenance in `PinnedSiteFaviconPatch`. The provenance records which icon choice a patch is for. Each icon lookup is asynchronous. Thus a patch can arrive for a pin that the user changed after the lookup started.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin with no favicon. Give it the custom Lucide icon "Star" | The bar shows a star |
| 2    | Change it to a different icon, or to an emoji, before the first lookup completes. If that is too fast to do by hand, change it first. Then run `pinnedSitesManagerProxy.setFavicons([{ id, favicon: <any data url>, forCustomIconName: 'Star' }])` in the console of the sidebar. A late lookup sends a patch of the same shape | The pin keeps the newer icon. The sidebar drops the stale patch and does not apply it |
| 3    | Do the same for a site favicon. Give a pin with no favicon an emoji. Then send a patch with no `forCustomIconName` | The emoji stays |

### P.6 Scenario 5 - background fills in a missing favicon

This case is the reason that the manager needs a writer in background.

The case needs a site whose favicon Chrome does not hold. Thus it starts with a pause that clears the favicon. The driver does this pause only on a safe profile, as the list at the start of this document says. You must clear "Browsing history", because Chrome keeps favicons there. If Chrome has no icon for the exact address, it uses the icon that it holds for the site. Thus a unique query string cannot replace the clear.

The automated case uses `https://www.wikipedia.org/`. P.7 uses `https://www.mozilla.org/`. Thus a run of one case does not give the site of the other case an icon.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | At the pause, the runner opens the "Clear browsing data" settings. Select "Browsing history", set the range to "All time", and delete | Chrome holds no icon for either site. If you use a shorter range, the icon stays, and the next step fails |
| 2    | Pin the site: paste the URL in "Add pin". Do not pin an open tab | The pin shows a letter tile and no favicon. Make sure that `favicon` is not set in background's list. Do not rely on the tile |
| 3    | Open a normal tab on that URL | In one or two seconds, the pin icon changes to the favicon of the site. The sidebar does not reload |
| 4    | Look at background's list | `favicon` is set on that pin |

The writer of the favicon matters, and the two possible writers look the same. The lazy resolver of the sidebar also adds missing favicons. Thus a pass of step 3 can come from either writer. The broadcast tells them apart. A `PINNED_SITES_CHANGED` message with no `senderId` came from background, because only a call from a sidebar has one. Thus the case watches for that message and does not poll the icon. In practice the resolver cannot win here. It runs on mount and when the list changes, and a page visit changes neither.

### P.7 A background favicon patch must not resurrect an unpinned pin

This is the in-flight broadcast case (decision 2 in the step 5 plan). An in-flight broadcast is one that background sends while a sidebar write is in progress. The runner does the setup, starts the page load and the unpin at the same moment, and does the checks.

A pass here is weaker than a pass in other cases. Nothing can make background patch a favicon in the few milliseconds that a sidebar write is in progress. Thus the race can fail to occur, and then the case passes with no test done. Run it anyway. The fault that it looks for is specific, and the runner can detect it: this window does not agree with background.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Set up as in P.6: pin A on a site that Chrome holds no icon for, and a second pin B | Neither pin has a favicon. The clear step of P.6 also covers the site of this case |
| 2    | Open a tab on the URL of A and unpin B at the same time, as near as possible | - |
| 3    | Wait until both are complete. Then look at the bar | A has its favicon, and B is gone. If B comes back and stays, that is the fault that this case looks for |
| 4    | Compare the mirror of this window with background's list, entry by entry | They are the same. A difference means that this window is stale while storage is correct. That is the exact form of the fault |

Not covered: a run in which the race did not occur. A deterministic version needs a DEV-only message that makes background send a pin broadcast on demand. That message does not exist.

### P.8 Pins survive a service worker restart

This is the cold-start path, for the same reason as E.3. `PinnedSitesManager.load()` runs only when the worker starts, so a fault there shows in no other place. Stop the worker. Do not reload the extension. A reload is a new load of the extension and proves less.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Record the current pins and their order | - |
| 2    | Stop the service worker (E.3 step 2 tells how) | - |
| 3    | In the sidebar, unpin a pin | The worker starts. `load()` fills the list, and the unpin applies to the full list. All the other pins are still there. An empty or short bar means that `load()` did not run before the change |
| 4    | Undo | The pin comes back at its original position |

### P.9 Import and export

This case covers `replaceAll` and the bulk append. No other case reaches them.

The case uses a fixture file in the repository, not a file that you select: `src/tests/inpanel/data/pinned-sites-backup.json`. The case imports this file directly, because `resolveJsonModule` is on and the include list of `tsconfig` contains `src`. The titles of its pins start with `TEST_PINNED_PREFIX`, so `resetTestData` removes them like other test pins. One pin has an embedded favicon and one pin has none, so step 4 has an icon to find.

The fixture goes through `importFullBackup` -> `replacePinnedSites` / `appendPinnedSites` -> the proxy. The import dialog uses the same wiring. Only the file picker is skipped, in the same way that D.4 skips it for the Import dialog.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Start with two known pins. Import the fixture with pinned sites set to "append" | The original two pins are still first. The pins of the fixture come after them, all with new IDs. Background's list agrees |
| 2    | Import the same fixture again with "replace" | The list contains only the pins of the fixture. The original pins and the copies from the first import are gone |
| 3    | Compare the IDs from the two imports | Each import gives new IDs, so no ID from step 1 stays in step 2 |
| 4    | Look at the pin of the fixture that has no favicon, some seconds after the import | Its icon shows without a reload, through `setFavicons` of the lazy resolver |
| 5    | Manual only: export a full backup with pins selected, in the Export dialog | The downloaded JSON contains every pin, with the favicons embedded. No runner can control the file picker |

### P.10 Two windows stay in sync

The sync between windows is a broadcast from the manager, so it needs a direct check.

The case is guided. Run it from the test runner of your usual window, the receiving window. The case opens the other window itself, on `https://example.com/inpanel-test-p10-other`, and closes it at the end. The receiving window reads its own mirror, so the runner makes every check and you do only the actions.

Its setup creates two test pins, "P10 neighbour one" and "P10 neighbour two", so that the pin you add has somewhere to move to. The case finds your pin by its URL, so other pins in the bar do not affect the checks. Cleanup removes your pin too, because it removes every pin on a test URL.

In the table, window 1 is the new window and window 2 is the receiving window.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Start this case in window 2. It opens window 1 on an "Example Domain" page. At the pause, open the sidebar in window 1 | Both sidebars show the same pins, including the two neighbour pins |
| 2    | At the pause, pin the "Example Domain" tab from the sidebar of window 1 | The mirror of window 2 gets a pin on that URL. You do not reload or type anything in window 2 |
| 3    | At the pause, drag that pin to a new position in window 1, and do nothing else | The pin moves to a new position in window 2 too |
| 4    | At the pause, unpin it in window 1. Make sure that it disappears there | The mirror of window 2 also drops it |
| 5    | The runner adds a pin in window 2 | Window 1 shows it. The runner cannot read the mirror of the other window, so you must look. Thus this step is a `confirm` pause. The case then closes window 1 |

---

## Section T - Tab association ordering

Each case here tests for a fault that occurs only when two events occur in one specific order. For example, a call arrives while another call still waits, a reply fails, or a broadcast arrives late. Real Chrome cannot make these orders occur on demand. Thus these cases are automated only, in `src/tests/inpanel/cases/sectionT.ts`.

All cases except T.1 use the test hooks of background. A test hook is a function in background that a test can call, and it exists only in a DEV build. With the hooks, a case can do these things:

- Stop background at a named point until the case releases it.
- Make one call fail.
- Make background send a broadcast that the case selects.
- Clear the live associations of a window.
- Run the startup restore.
- Read the association backup of a window.

The tables below describe each case with these actions.

### T.1 A tab already playing audio, dragged onto a bookmark, shows the audio indicator

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open the test tone page (`test-audio.html`) in a regular tab and click "Play" | The tab plays audio |
| 2    | Open a different bookmark | Its tab opens |
| 3    | Drag the tab that plays audio onto the bookmark tree | The new bookmark is loaded and shows the audio indicator immediately |

### T.2 Opening a bookmark returns even when background rejects the association

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Make background reject the next association | - |
| 2    | Open a bookmark | The open returns with the new tab. It does not wait forever |
| 3    | Look at the bookmark | It is not loaded, because background did not record the association. The tab stays open |

### T.3 A late, stale broadcast does not leave a bookmark tab without its live info

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Record the associations of the window. Then open a bookmark | The bookmark is loaded, with the live URL of its tab |
| 2    | Make background send the recorded, older map | For a short time, the bookmark is not loaded |
| 3    | Make background send the real map | The bookmark is loaded again, and the live URL of its tab is back. The title, the drift marker and the audio indicator all need this URL |

### T.4 The startup restore does not back up an association it skipped

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open bookmark X | The backup points X at its tab |
| 2    | Clear the live associations of the window, and keep the backup | X is not loaded. A browser restart gives this state |
| 3    | Associate the same tab with bookmark Y | Y is loaded |
| 4    | Run the startup restore | Only the backup entry of Y names the tab. Y is still loaded, and X is not |

### T.5 Refreshing backup indices does not give a moved item its old tab's index

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open a bookmark. Then open two regular tabs | - |
| 2    | Close one regular tab. While background updates the stored tab indices, point the bookmark at the other regular tab | - |
| 3    | Read the backup entry of the bookmark | It names the new tab, with the index of the new tab, not the index of the old tab |

### T.6 A bookmark dragged onto another space's icon opens in that space

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Make space A active. Hold background just after it reads a new tab that has no group | - |
| 2    | Drag a bookmark onto the icon of space B in the space bar | A new tab opens for it in the group of space B |
| 3    | Let background go on | The tab stays in space B. Background must not move it to the active space A |

---

## Section U - URL drift

A pinned site or a bookmark has drifted when its tab goes to a URL that is not the saved URL. The sidebar tracks drift only when "Open bookmarks" is set to Arc. Thus every case sets Arc first. This section is automated in `src/tests/inpanel/cases/sectionU.ts`, and every check reads the DOM of the sidebar.

Pins and bookmarks react differently to the same navigation.

A pin compares the full URL to decide that it drifted. The drift tooltip and "Back to Pinned URL" use this result. But the pin replaces the loaded dot with the favicon of the new site only when the domain changes. A leading `www.` has no effect. Thus `figma.com` and `www.figma.com` are the same domain, but `mail.google.com` and `accounts.google.com` are not.

A bookmark compares the full URL, so a path change on the same domain is a drift. What a drifted row shows depends on the Arc setting "Show tab title after navigating away". When the setting is off, the row keeps the name of the bookmark (U.2). When it is on, the row shows the title of the tab (U.3). On is the default. The drift marker shows in both cases. The bookmark cases set this option themselves, and cleanup sets it to on again.

The cases go between `https://example.com/inpanel-test-...` and `https://example.org/inpanel-test-...`. Both prefixes mark a tab as test data. Thus cleanup closes a tab that is on either one.

### U.1 Pinned site button follows its tab drifting away and back

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin. Do not open it | No indicator in the corner of the button. A plain tooltip |
| 2    | Click the pin to open its tab | The loaded dot. A plain tooltip |
| 3    | In the tab, go to another path on the same domain | Still the loaded dot. The tooltip adds "Now: <tab title>" and "Double-click to go back" |
| 4    | Go to a different domain | The favicon of the new site replaces the dot. The tooltip adds "Now: <tab title>" and "Double-click to go back" |
| 5    | Right-click the pin → "Back to Pinned URL" | The loaded dot again. A plain tooltip |
| 6    | Go to a different domain again | The favicon badge of the new site again |
| 7    | Close the tab | No indicator. A plain tooltip |

### U.2 Bookmark row follows its tab drifting away and back (tab title setting off)

Before you start, set "Show tab title after navigating away" to off in Settings → Behaviour.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a bookmark to the folder of a space, and switch to that space. Do not open the bookmark | Not loaded. No drift marker. The name of the bookmark |
| 2    | Click the bookmark to open its tab | Loaded (the "Close tab" button shows). No drift marker. The name of the bookmark |
| 3    | In the tab, go to another path on the same domain | The drift marker shows next to the title. Still the name of the bookmark |
| 4    | Go to a different domain | The drift marker still shows. Still the name of the bookmark |
| 5    | Right-click the bookmark → "Back to Bookmarked URL" | The drift marker is gone. Still loaded |
| 6    | Go to a different domain again | The drift marker again |
| 7    | Close the tab | Not loaded. No drift marker. The name of the bookmark |

### U.3 Bookmark row shows its tab title while drifted (tab title setting on)

Before you start, set "Show tab title after navigating away" to on in Settings → Behaviour. On is the default.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a bookmark to the folder of a space, and switch to that space. Do not open the bookmark | Not loaded. No drift marker. The name of the bookmark |
| 2    | Click the bookmark to open its tab | Loaded. Still the name of the bookmark, although the page has its own title |
| 3    | In the tab, go to another path on the same domain | The row shows the title of the tab. The drift marker shows |
| 4    | Go to a different domain | The row shows the title of the new page. The drift marker still shows |
| 5    | Right-click the bookmark → "Back to Bookmarked URL" | The name of the bookmark again. The drift marker is gone. Still loaded |
| 6    | Go to a different domain again | The title of the tab again. The drift marker again |
| 7    | Close the tab | Not loaded. No drift marker. The name of the bookmark |
