---
created: 2026-07-29
after-version: 1.0.326
status: draft
---

# Tab / Bookmark / Pinned-Site / Space Association Test Cases

Manual test plan for this round's fixes before release:

- `getSpaceForTab()` now checks a tab's live Chrome group before falling back to `tabSpaceRegistry`
- New `DEASSOCIATE_TAB` flow: dragging a tracked bookmark/pinned tab into a different space's group breaks its bookmark association
- "Follow active tab" setting (off / space / space-and-scroll)
- "Show active tab" toolbar button
- Tab history navigation now scrolls/switches space via an explicit broadcast

## Known gaps to specifically watch for

These are called out so you notice them rather than assume "no news is good news" - confirm each one, don't just skim past it.

- **G1 - Deleting a bookmark via Chrome's native bookmark manager (`chrome://bookmarks`) while its tab is open** is expected to currently orphan the tab (tab keeps running but disappears from both lists). Not fixed yet - confirm it still reproduces, don't be surprised by it. Bookmark-only: the extension's own delete option always closes the tab first, and pinned sites have no native deletion surface at all - see B.5.
- **G2 - Cross-space drag while the side panel is closed**: the association fix relies on a message to the sidebar. If the panel is closed when you drag a tracked tab to another space, expect the bookmark to still show "loaded" against the old space when you reopen the panel. Not fixed yet.
- **G3 - Native "Remove from group" (ungroup) on a tracked tab**: the new detection only fires when the tab moves to _another_ group, not when it's removed from its group entirely. Expect the bookmark association to survive removing the tab from its group, and expect activating that tab afterward to possibly force-switch the sidebar back to the tab's original bookmark space. Not fixed yet.

## Prerequisites / Setup

- At least 2 Spaces defined, e.g. **Work** and **Video** (Settings → Spaces, or Space Navigator)
- A bookmark folder linked to each space, each containing at least 2 bookmarks
- At least 1 pinned site
- "Follow active tab" setting reachable: Settings → Behaviour tab
- Have both Chrome DevTools consoles handy: the sidebar's (right-click sidebar → Inspect) and the background service worker's (chrome://extensions → "service worker" link) - useful if something looks wrong and you want to check for errors, not required for every step

Terminology used below:

- **Regular tab** - a plain tab, no bookmark/pin association
- **Bookmark tab** - opened by clicking a bookmark in the tree (shows as "loaded" in the bookmark tree)
- **Pinned tab** - opened by clicking a pinned-bar icon

---

## Automated coverage

Which cases below are automated by the DEV-only in-panel test runner (`src/tests/inpanel/`, sidebar's DEV dropdown → "Test Runner…"). Everything marked "No" is still manual-only.

| Case | Covered |
| ---- | ------- |
| A.1  | Yes     |
| A.2  | Yes     |
| A.3  | Yes     |
| A.4  | Yes     |
| A.5  | Yes     |
| A.5b | Yes     |
| A.5c | Yes     |
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
| D.2  | Yes     |
| D.3  | Yes     |
| D.4  | Yes     |
| E.1  | Yes     |
| E.2  | No      |
| E.3  | Yes     |
| F.1  | Yes     |
| F.2  | Yes     |
| F.3  | Yes     |
| F.4  | Yes     |
| P.1  | Yes     |
| P.2  | Yes     |
| P.3  | Yes     |
| P.4  | Yes     |
| P.5  | Yes     |
| P.6  | Yes - guided, needs network |
| P.7  | Yes - guided |
| P.8  | Yes - guided |
| P.9  | Yes - import only; export stays manual |
| P.10 | Yes - guided |

All of Section P is automated in `src/tests/inpanel/cases/sectionP.ts`. Its
mutations go through the same `usePinnedSites` callbacks the pinned bar uses,
rather than the proxy underneath them, so a bug in a hook callback fails a case
instead of passing beneath it. What the four non-plain rows give up is listed
under "Why the No rows are still manual" below.

The trailing "repeat, but ..." variant steps in C.2a-C.2e run as their own cases, named after the variant - e.g. `C.2b (same space)`, `C.2e (same space, collapsed folder)`. C.2f's same-space pick (step 4) runs at the end of C.2f itself.

Some "Yes" rows cover the case's main flow but not every sub-step. Still manual:

- **D.1 step 3** - needs a second window's sidebar to observe.
- **C.2d's press-and-hold gesture** - the automated case makes the two proxy calls the dropdown ends up making (`getHistoryDetails`, `navigateToIndex`), so it covers the background half only. The 300ms hold timer, the quick-click-vs-hold branch in `Toolbar.tsx`'s `handleHistoryMouseUp`, the dropdown rendering, and the entry click wiring are covered by C.2g instead.
- **C.2g's gestures, E.3's worker stop, and F.1's drag** - performed by you at a pause, with the runner checking the result. See those cases.

Why the "No" rows are still manual:

- **B.4, E.2** - close the window hosting the panel / restart the browser, which kills the runner mid-case. E.2 also gets fresh tab ids on restore, which the runner's saved refs can't re-resolve.

Section P is automated, but four of its cases carry a caveat:

- **P.6** depends on the network, and it opens with a guided step asking you to clear Chrome's browsing history, because that is where favicons live and there is no way for the extension to clear them without also deleting real history. It tells background's write apart from the sidebar resolver's by watching for a `PINNED_SITES_CHANGED` broadcast with no `senderId`. P.6 and P.7 deliberately use different sites (wikipedia.org and mozilla.org) so that running one does not warm the other's icon.
- **P.7** sets up and checks itself, but nothing can force a background write into the few milliseconds a sidebar write is in flight, so a pass may mean the race never happened. Run it, but do not read a green as proof. It also needs its site cleared from history, same as P.6, or the background write it tries to race never happens at all.
- **P.8** needs you to stop the service worker, like E.3.
- **P.9** drives `importFullBackup` against a checked-in fixture (`src/tests/inpanel/data/pinned-sites-backup.json`), which is the identical path the dialog takes below its file picker. Its replace step wipes the whole pin list by design and restores it in a `finally`, so an abandoned run cannot leave your pins deleted. Export stays manual. Its custom-icon step needs the network, like P.6.
- **P.10** needs both sidebars open and the pin edits performed by hand in the other window. **Run it from the receiving window** - it reads its own mirror, so every check is machine-made. Only its last step, the reverse direction, is a `confirm` pause.

---

## Writing a case

Conventions for adding cases here or to the in-panel runner live in
`docs/test/writing-test-cases.md`.

---

## Section A - Tab moved between spaces

Two ways to move a tab's Chrome group - test both, they may behave differently since only one may be instrumented:

- **(a) Native**: right-click the tab in Chrome's own tab strip → "Add tab to group" → pick the other space's group (or drag the tab in the tab strip into the other group)
- **(b) Sidebar**: right-click the tab row in the sidebar's tab list → "Move to Space" → pick the other space

### A.1 Regular tab moved to another space, sidebar open

| Step | Action                                                                | Expected Result                                               |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | Open a regular tab (no bookmark/pin), let it land in Space A's group  | Tab shows in Space A's tab list                               |
| 2    | With sidebar open, move the tab (native, method a) to Space B's group | Tab moves; if sidebar is on Space B, it appears there instead |
| 3    | Switch sidebar to Space B                                             | Tab now shown under Space B                                   |
| 4    | Repeat using sidebar method (b) instead                               | Same result                                                   |
| 5    | Close the sidebar panel                                               | -                                                             |
| 6    | Move the tab (native, method a) into Space B's group                  | -                                                             |
| 7    | Reopen the sidebar, switch to Space B                                 | Tab shown under Space B - same result as sidebar-open case    |

### A.2 Bookmark tab moved to a different space's group, sidebar open

| Step | Action                                               | Expected Result                                                             |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | Click a bookmark in Space A's folder to open its tab | Bookmark shows "loaded"; tab appears in Space A's group                     |
| 2    | Move the tab (native, method a) into Space B's group | Bookmark in Space A's tree should flip to "unloaded" (association broken)   |
| 3    | Switch sidebar to Space B                            | The (now-regular) tab appears in Space B's tab list, not under any bookmark |
| 4    | Switch back to Space A, check the bookmark tree      | Bookmark shows as not loaded/not active                                     |
| 5    | Repeat steps 1-4 using sidebar method (b)            | Same result - confirm both entry points trigger the deassociation           |

### A.3 Bookmark tab moved to a different space's group, sidebar CLOSED (known gap G2)

| Step | Action                                               | Expected Result                                                                                                                       |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Click a bookmark in Space A to open its tab          | Bookmark shows "loaded"                                                                                                               |
| 2    | Close the sidebar panel                              | -                                                                                                                                     |
| 3    | Move the tab (native, method a) into Space B's group | -                                                                                                                                     |
| 4    | Reopen the sidebar, view Space A                     | **Per G2, expect**: bookmark still shows "loaded", pointing at a tab now visibly sitting in Space B's group - confirm this reproduces |

### A.4 Pinned tab moved to a different space's group

| Step | Action                                                                                 | Expected Result                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Click a pinned site to open its tab                                                    | Pinned icon shows "loaded" state                                                                                                                                                   |
| 2    | Move that tab (native, method a) into any space's group                                | Pinned sites are never registered in `tabSpaceRegistry` (see code comments) - expect **no** deassociation to fire; pin should simply keep tracking the tab regardless of its group |
| 3    | Confirm the pinned icon still shows "loaded" and clicking it re-activates the same tab | Works normally                                                                                                                                                                     |
| 4    | Close the sidebar panel                                                                | -                                                                                                                                                                                  |
| 5    | Move the pinned tab (native, method a) into another space's group                      | -                                                                                                                                                                                  |
| 6    | Reopen the sidebar                                                                     | Pinned icon still shows "loaded"; clicking it re-activates the same tab                                                                                                            |

### A.5 Bookmark tab: native "Remove from group" / ungroup (known gap G3)

| Step | Action                                                                                                    | Expected Result                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1    | Click a bookmark in Space A to open its tab                                                               | Bookmark shows "loaded"                                                                                                     |
| 2    | Right-click the tab in Chrome's tab strip → "Remove from group"                                           | Tab is now ungrouped                                                                                                        |
| 3    | Check the bookmark in Space A's tree                                                                      | **Per G3, expect**: bookmark still shows "loaded" - the association survives, unlike A.2                                    |
| 4    | Activate that (now ungrouped) tab from elsewhere (e.g. Cmd+Tab through Chrome tabs)                       | **Per G3, check whether**: the sidebar force-switches back to Space A even though the tab isn't really "in" Space A anymore |
| 5    | Close the sidebar panel, then repeat: right-click the bookmark tab in the tab strip → "Remove from group" | -                                                                                                                           |
| 6    | Reopen the sidebar, check Space A's tree                                                                  | Bookmark still shows "loaded" - same as step 3                                                                              |
| 7    | Activate that ungrouped tab from elsewhere                                                                | Check whether sidebar force-switches to Space A, same as step 4                                                             |

### A.5b Regular tab: native "Remove from group" / ungroup

| Step | Action                                                                                      | Expected Result                                                                             |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1    | Open a regular tab, let it land in Space A's group                                          | Tab shows in Space A's tab list                                                             |
| 2    | With sidebar open, right-click the tab in Chrome's tab strip → "Remove from group"          | Tab is now ungrouped; tab list updates (tab no longer under Space A, or shown as ungrouped) |
| 3    | Close the sidebar panel, press Cmd+T to open a new tab (lands in Space A), then right-click it in Chrome's tab strip → "Remove from group" | -                                                                                           |
| 4    | Reopen the sidebar                                                                          | Tab reflects its ungrouped state correctly (tab no longer under Space A, or shown as ungrouped) |

### A.5c Pinned tab: native "Remove from group" / ungroup

| Step | Action                                                                             | Expected Result                                                                                                |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Click a pinned site to open its tab                                                | Pinned icon shows "loaded"; tab opens **ungrouped** (pinned tabs are deliberately not auto-grouped) - confirm no live Chrome group, otherwise there's nothing for step 3 to remove |
| 2    | Right-click the tab in Chrome's tab strip → "Add tab to group" → pick any space's group | Tab joins that group |
| 3    | With sidebar open, right-click the tab → "Remove from group"                      | Pinned icon should keep tracking the tab regardless of group (pinned tabs aren't grouped by association logic) |
| 4    | Close the sidebar panel, repeat with another pinned tab (steps 1-3)                | -                                                                                                              |
| 5    | Reopen the sidebar                                                                 | Pinned icon still shows "loaded"; clicking it re-activates the same tab                                        |

### A.6 Tab moved to a different window

| Step | Action                                                                                        | Expected Result                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open a bookmark tab in Space A, window 1                                                      | Bookmark shows "loaded"                                                                                                               |
| 2    | Drag the tab out of Chrome's tab strip into its own new window (or an existing second window) | Tab detaches                                                                                                                          |
| 3    | Check Space A's bookmark tree in window 1's sidebar                                           | Bookmark should show as unloaded (tab left this window)                                                                               |
| 4    | If a sidebar is open in the new window, check its state                                       | New window's sidebar should treat this as a plain regular tab (no association carried over)                                           |
| 5    | Repeat steps 1-2, but close window 1's sidebar panel before dragging the tab out              | -                                                                                                                                     |
| 6    | Reopen window 1's sidebar, check Space A's bookmark tree                                      | Bookmark should show as unloaded (tab left this window) - confirm whether closing the sidebar during the move changes this vs. step 3 |

### A.6b Regular tab moved to a different window

| Step | Action                                                                                 | Expected Result                                                                    |
| ---- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1    | Open a regular tab in Space A, window 1                                                | Tab shows in Space A's list                                                        |
| 2    | With sidebar open, drag the tab into its own new window (or an existing second window) | Tab detaches; window 1's tab list updates to no longer show it                     |
| 3    | If a sidebar is open in the new window, check its state                                | New window's sidebar shows it as a plain regular tab in whatever group it lands in |
| 4    | Repeat steps 1-2 with window 1's sidebar closed, then reopen it                        | Tab list no longer shows the tab, same as step 2                                   |

### A.6c Pinned tab moved to a different window

| Step | Action                                                                                 | Expected Result                                                                                       |
| ---- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Click a pinned site to open its tab, window 1                                          | Pinned icon shows "loaded"                                                                            |
| 2    | With sidebar open, drag the tab into its own new window (or an existing second window) | Check whether the pinned icon in window 1 flips to unloaded, or keeps tracking the tab across windows |
| 3    | Repeat steps 1-2 with window 1's sidebar closed, then reopen it                        | Compare against step 2 - confirm whether sidebar-closed changes the outcome                           |

### A.7 Regular tab bookmarked via drag-into-tree, then moved to another space

| Step | Action                                                                                               | Expected Result                                                                                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open a regular tab in Space A                                                                        | Tab in Space A's list                                                                                                                                                                                                  |
| 2    | Drag that tab onto the bookmark tree to create a new bookmark for it (or use "Add to Bookmark")      | A new bookmark is created; tab now shows as its "loaded" bookmark tab                                                                                                                                                  |
| 3    | Move the tab (native, method a) into Space B's group                                                 | Check whether the new bookmark flips to unloaded, same as A.2 - this path was flagged as not registering a space with `tabSpaceRegistry` at creation time, so confirm what actually happens here (may differ from A.2) |
| 4    | Repeat steps 1-2, then right-click the **bookmark** (not the tab) → "Move to Space" → pick Space B    | Bookmark moves to Space B's folder; the tab should also move into Space B's Chrome group to match - previously didn't (fixed, see results doc)                                                                        |
| 5    | Repeat steps 1-2, close the sidebar panel, then move the tab (native, method a) into Space B's group | -                                                                                                                                                                                                                      |
| 6    | Reopen the sidebar, check Space A's bookmark tree                                                    | Compare against step 3 - confirm whether closing the sidebar during the move changes the outcome                                                                                                                       |

Note: step 4 means the **bookmark** row's "Move to Space", not the tab row's. They are different actions - the bookmark one moves the bookmark's folder location, the tab one is what A.1/A.2 use - and for a bookmarked tab a right-click lands on the bookmark row, so step 4 names the target explicitly.

### A.7b Bookmarked tab moved via generic "Move Bookmark to..." folder picker

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a regular tab in Space A, bookmark it via drag-into-tree (or "Add to Bookmark") | Bookmark shows "loaded" in Space A |
| 2 | Right-click the bookmark → "Move to..." (the generic folder picker, distinct from "Move to Space") → pick a folder inside Space B's bookmark folder | Bookmark moves to the chosen folder |
| 3 | Check the tab's Chrome group | Tab should move into Space B's Chrome group to match |
| 4 | Switch sidebar to Space B | Bookmark shows "loaded" there, tab appears under it |

### A.7c Multiple bookmarked tabs moved via multi-select "Move to..."

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open 2 regular tabs in Space A, bookmark both (drag-into-tree or "Add to Bookmark") | Both bookmarks show "loaded" in Space A |
| 2 | Select both bookmarks in the tree, use multi-select "Move to..." (or "Move to Space") → target Space B | Both bookmarks move to Space B's folder |
| 3 | Check both tabs' Chrome groups | Both tabs should move into Space B's Chrome group |
| 4 | Switch sidebar to Space B | Both bookmarks show "loaded" there |

---

## Section B - Tab closing

### B.1 Close a bookmark tab directly (X button / Cmd+W)

| Step | Action                                                        | Expected Result                                                   |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Open a bookmark tab                                           | Bookmark shows "loaded"                                           |
| 2    | Close the tab                                                 | Bookmark flips back to unloaded/closed state, no stale references |
| 3    | Open another bookmark tab, then close the sidebar panel       | -                                                                 |
| 4    | Close that tab (X button / Cmd+W) while the sidebar is closed | -                                                                 |
| 5    | Reopen the sidebar                                            | Bookmark shows unloaded/closed state, no stale references         |

### B.2 Close a pinned tab directly

| Step | Action                                                | Expected Result                                             |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------- |
| 1    | Open a pinned tab                                     | Pinned icon shows "loaded"                                  |
| 2    | Close the tab                                         | Pinned icon flips back to closed state                      |
| 3    | Open another pinned tab, then close the sidebar panel | -                                                           |
| 4    | Close that tab while the sidebar is closed            | -                                                           |
| 5    | Reopen the sidebar                                    | Pinned icon flips back to closed state, no stale references |

### B.2b Close a regular tab directly

| Step | Action                                                  | Expected Result                                |
| ---- | ------------------------------------------------------- | ---------------------------------------------- |
| 1    | Open a regular tab (no bookmark/pin), with sidebar open | Tab shows in its space's tab list              |
| 2    | Close the tab                                           | Tab disappears from the list, no errors        |
| 3    | Open another regular tab, then close the sidebar panel  | -                                              |
| 4    | Close that tab while the sidebar is closed              | -                                              |
| 5    | Reopen the sidebar                                      | Tab is gone from the list, no stale references |

### B.3 Close via "Close Tab" in the sidebar's own context menu / multi-close

| Step | Action                                                              | Expected Result                                                                      |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | Open 2-3 bookmark/pinned tabs                                       | All show "loaded"                                                                    |
| 2    | Select multiple and close via the sidebar (toolbar or context menu) | All flip back to unloaded; undo toast appears and correctly restores them if clicked |

### B.4 Close the whole window with tracked tabs open

Depends on Chrome's own "Continue where you left off" setting (Settings → On Startup) - test both states below, since it changes what Chrome does with the window on relaunch and therefore what's actually being verified.

| Step | Action                                                    | Expected Result                                                                                               |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | Open several bookmark/pinned/regular tabs across 2 spaces | -                                                                                                             |
| 2    | Close the entire browser window                           | No errors in background console (chrome://extensions → service worker → check for uncaught errors after this) |
| 3    | Open a new window                                         | Fresh state, no leftover associations misapplied to new tabs                                                  |
| 4    | With "Continue where you left off" **off**, quit and relaunch Chrome | Chrome opens fresh with no restored tabs - nothing to verify beyond no errors. `chrome.windows.onRemoved` already deleted that window's association backup on close (`background.ts:1055-1070`), so there'd be nothing to restore even if Chrome tried |
| 5    | With "Continue where you left off" **on**, quit and relaunch Chrome | Chrome restores the window/tabs with new tab IDs. See E.2 for the detailed check - restoration depends on whether the backup survived the quit (a race between the OS killing the process and `onRemoved`'s cleanup finishing); if this step is flaky, that's why |

### B.5 Delete a bookmark while its tab is open (known gap G1)

Bookmark-only. The extension's own bookmark-tree delete option (`DeleteBookmarkAction`) explicitly `chrome.tabs.remove()`s the associated tab, so it never orphans anything - G1 only reproduces via Chrome's **native** bookmark manager (`chrome://bookmarks`), since there's no `chrome.bookmarks.onRemoved` listener anywhere in the extension to catch that. This step therefore doubles as a same-sidebar-state variant of B.5b (which covers the sidebar-closed case) - keep both.

Not applicable to pinned sites: they have no Chrome-native surface at all (no bookmark tree node, no `chrome://bookmarks` entry - see B.5b's note), and their only removal path (`PinnedBar.tsx`'s unpin action → `DeletePinnedSiteAction`) also always closes the tab. There's no code path that can orphan a pinned site's tab.

| Step | Action                                                                                  | Expected Result                                                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open a bookmark's tab                                                                     | Bookmark shows "loaded"                                                                                                                                                                                                                                     |
| 2    | Delete that bookmark (not the tab) via Chrome's **native** bookmark manager (`chrome://bookmarks`) - not the extension's own tree | **Per G1, expect**: the tab keeps running, but disappears from _both_ the bookmark tree (node gone) and the regular tab list (still counted as "managed") - confirm this reproduces and note whether the tab is reachable at all from the sidebar afterward |

### B.5b Delete a bookmark via Chrome's native bookmark manager, sidebar closed

| Step | Action                                                                                        | Expected Result                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open a bookmark's tab                                                                         | Bookmark shows "loaded"                                                                                                                                                                                         |
| 2    | Close the sidebar panel                                                                       | -                                                                                                                                                                                                               |
| 3    | Open `chrome://bookmarks`, find that bookmark, delete it there (not via the extension's tree) | -                                                                                                                                                                                                               |
| 4    | Reopen the sidebar                                                                            | Same as B.5 step 2's gap - there's no `chrome.bookmarks.onRemoved` listener at all, so unlike G2 (which specifically depends on the sidebar being open to catch a message) this isn't a sidebar-state race; whether the sidebar was open or closed at delete time shouldn't change the outcome. Confirm that prediction holds |

Not applicable to pinned sites: they're `chrome.storage.local` entries, not real bookmarks, so they have no entry in `chrome://bookmarks` to delete - the only way to delete one is the extension's own sidebar UI, which by definition can't happen while the sidebar is closed.

---

## Section C - "Follow active tab" modes

Set via Settings → Behaviour → "Follow active tab": **Off**, **Switch to the tab's space**, **Switch space and show the tab**.

- **C.1** runs once per mode, since the mode is exactly what it's testing. A full pass is 3x that table; at minimum cover the starred rows in all 3.
- **C.2** runs under **Off** only - see that section for why the other two prove nothing there.

### C.1 Activation scenarios per mode

"Activate" = make an already-open tab the active one (`chrome.tabs.onActivated`) - not opening a new tab. Each sub-case below is its own step-by-step test, run once per "Follow active tab" mode - the last three columns hold that mode's expected result for each step (setup steps are just "-"). At minimum cover C.1a and C.1b (starred) in all 3 modes.

#### C.1a\* Activate another tab in the same space

| Step | Action                                                                     | Off - expected               | Space - expected | Space-and-scroll - expected                                               |
| ---- | --------------------------------------------------------------------------- | ----------------------------- | ----------------- | --------------------------------------------------------------------------- |
| 1    | Switch sidebar to Space A                                                    | -                              | -                  | -                                                                             |
| 2    | Open a regular tab (lands in Space A)                                        | -                              | -                  | -                                                                             |
| 3    | Open a second regular tab in Space A (e.g. Cmd+click a link on the first tab's page) | -                       | -                  | -                                                                             |
| 4    | In Chrome's native tab strip, click the first tab to activate it             | No space switch, no scroll    | No space switch, no scroll | No scroll needed if already visible; no space switch (already same space) |

#### C.1b\* Activate a tab in a different space

| Step | Action                                                                     | Off - expected                          | Space - expected                                          | Space-and-scroll - expected |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| 1    | Switch sidebar to Space A, open a regular tab there                          | -                                          | -                                                              | -                               |
| 2    | Switch sidebar to Space B, open a regular tab there                          | -                                          | -                                                              | -                               |
| 3    | Switch sidebar back to Space A , activate Space A tab                        | -                                          | -                                                              | -                               |
| 4    | In Chrome's native tab strip (not the sidebar), click the Space B tab to activate it | Sidebar stays on Space A - does not follow | Sidebar switches to Space B and scrolls to show the tab | Same as Space mode here        |

#### C.1c Close the active tab, Chrome activates another tab in the same space

The two tabs need to be far enough apart in the sidebar that "did it scroll" is actually observable - two tabs opened back-to-back usually land next to each other, which can't tell scrolling apart from not. Anchor the first tab at the top (open it from Space A's first bookmark) so it's far from wherever a second, freshly-opened regular tab lands.

| Step | Action                                                                     | Off - expected        | Space - expected                                                                                                     | Space-and-scroll - expected            |
| ---- | --------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | Switch sidebar to Space A                                                    | -                         | -                                                                                                                      | -                                          |
| 2    | Click Space A's first bookmark to open it as a tab ("tab 1") - it loads at the top of the bookmark tree | - | - | - |
| 3    | Open a second, plain regular tab in Space A ("tab 2") and activate it        | -                         | -                                                                                                                      | -                                          |
| 4    | Scroll the sidebar so tab 1's bookmark row is out of view (e.g. scrolled down to show the tabs section) | - | - | - |
| 5    | Close the active tab 2 - Chrome activates tab 1, still in Space A            | No scroll - tab 1's bookmark row stays out of view | No scroll - stays out of view (this was the original "close tab causes spurious scroll" bug, confirm it's still fixed) | Scrolls the bookmark row back into view |

#### C.1d Close the active tab, Chrome activates another tab in a different space

Chrome prefers to keep activation inside the same tab group when closing a tab, if another tab in that group exists - so Space B's group must have **only** the one tab being closed, otherwise Chrome activates a Space B sibling instead of crossing into Space A, and this test doesn't actually exercise the cross-space case.

| Step | Action                                                                                                                    | Off - expected     | Space - expected                                             | Space-and-scroll - expected                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Switch sidebar to Space A, open a regular tab there and activate it                                                           | -                      | -                                                                  | -                                                                  |
| 2    | Switch sidebar to Space B, open a regular tab there and activate it, making sure it's the **only** tab in Space B's group (so Space A's tab is next in MRU order, and there's no in-group sibling for Chrome to prefer instead) | -                      | -                                                                  | -                                                                  |
| 3    | Close the active (Space B) tab - Chrome activates the previous tab in its MRU order, which lives in Space A                    | No switch, no scroll  | Switches to that space, no scroll needed unless out of view       | Switches space and scrolls to show the newly-activated tab       |

#### C.1e Activate a bookmark tab in another space (collapsed folder auto-expands)

| Step | Action                                                                                                                          | Off - expected | Space - expected                                                  | Space-and-scroll - expected            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| 1    | Switch sidebar to Space B, expand a folder if needed, and click a bookmark inside it to open its tab                             | -                  | -                                                                      | -                                            |
| 2    | Collapse that folder, then switch sidebar to Space A and activate a tab in Space A                                                                             | -                  | -                                                                      | -                                            |
| 3    | In Chrome's native tab strip, click that bookmark's tab to activate it                                                            | No switch          | Switches space; folder auto-expands; scrolls to the bookmark row     | Same, folder auto-expands and scrolls      |

#### C.1f Activate a pinned-site tab from another space

| Step | Action                                                                                       | Off - expected                     | Space - expected                  | Space-and-scroll - expected       |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ | ------------------------------------- |
| 1    | Switch sidebar to Space A                                                                        | -                                       | -                                      | -                                        |
| 2    | Click a pinned site to open its tab (pinned tabs are never grouped into any space's Chrome group) | -                                       | -                                      | -                                        |
| 3    | Switch sidebar to Space B and activate a tab in Space B                                                                       | -                                       | -                                      | -                                        |
| 4    | In Chrome's native tab strip, click the pinned tab to activate it                                | No switch expected (pinned tabs are space-agnostic) | No switch expected (same reason) | No switch expected (same reason) |

### C.2 Explicit actions bypass the mode (should always scroll/switch regardless of setting)

Run every sub-case below under **Off** only, not all 3 modes. "Off" is the only mode that actually tests the bypass:

- Explicit actions set `explicit: true`, which short-circuits the scroll decision in `useFollowActiveTab.ts`, and the space switch never reads the mode at all (`setActiveTabAndSpace` in `background.ts`).
- Under "Space" / "Space and scroll" the switch and scroll happen anyway, so those runs pass even with the bypass completely broken. They cost 2x the work and prove nothing this group is about.

Grouped by trigger mechanism; each group covers cross-space and same-space in one table since the setup is nearly identical.

#### C.2a "Show active tab" toolbar button

| Step | Action                                                                                                  | Expected Result                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to **Off**                                                 | -                                                                                                                      |
| 2    | Switch sidebar to Space A, open a regular tab there and activate it                                       | -                                                                                                                      |
| 3    | Switch sidebar to Space B, open a regular tab there and activate it                                       | -                                                                                                                      |
| 4    | Switch sidebar back to Space A (so the active tab is now in Space B, but the sidebar shows Space A)        | -                                                                                                                      |
| 5    | Click the "Show active tab" toolbar button                                                                | Switches sidebar to Space B, scrolls to the tab - previously reported broken in **Off**, so this is the mode that matters |
| 6    | Repeat steps 2-5, but make the Space B tab a bookmark tab inside a collapsed folder instead of a regular tab | Folder expands, scrolls to the bookmark row                                                                          |

#### C.2b Tab history Previous/Next toolbar buttons

| Step | Action                                                                                                  | Expected Result                                              |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to **Off**                                                  | -                                                                  |
| 2    | Switch sidebar to Space A, open a regular tab there and activate it (tab 1)                                | -                                                                  |
| 3    | Switch sidebar to Space B, open a regular tab there and activate it (tab 2)                                | -                                                                  |
| 4    | Click the toolbar's "Previous" button to go back to tab 1                                                  | Switches sidebar to Space A, scrolls to tab 1                    |
| 5    | Click "Next" to return to tab 2                                                                             | Switches sidebar to Space B, scrolls to tab 2                    |
| 6    | Repeat steps 2-5, but open both tab 1 and tab 2 in the same Space                                           | No space switch; scrolls to the tab if out of view               |

#### C.2c History keyboard shortcuts (Cmd+Shift+< / Cmd+Shift+>)

Same setup as C.2b, triggered via keyboard instead of the toolbar buttons. Worth testing on its own: this is the one path with **no other way to reach the sidebar**, so it's the strongest confirmation that explicit actions bypass **Off** mode.

| Step | Action                                                                       | Expected Result                                              |
| ---- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to **Off**                       | -                                                                  |
| 2    | Switch sidebar to Space A, open a regular tab there and activate it (tab 1)      | -                                                                  |
| 3    | Switch sidebar to Space B, open a regular tab there and activate it (tab 2)      | -                                                                  |
| 4    | Press Cmd+Shift+< (back)                                                        | Switches to Space A, scrolls to tab 1                            |
| 5    | Press Cmd+Shift+> (forward)                                                     | Switches to Space B, scrolls to tab 2                            |
| 6    | Repeat steps 2-5, but open both tabs in the same Space                          | No space switch; scrolls to the tab if out of view               |

#### C.2d Tab-history dropdown (press-and-hold Previous/Next)

| Step | Action                                                                                                          | Expected Result                            |
| ---- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to **Off**                                                        | -                                               |
| 2    | Switch sidebar to Space A, open a regular tab there and activate it (tab 1)                                      | -                                               |
| 3    | Switch sidebar to Space B, open a regular tab there and activate it (tab 2)                                      | -                                               |
| 4    | Switch sidebar to Space A again, open a third regular tab there and activate it (tab 3) - tab 2 is now a few entries back in history | -                                               |
| 5    | Press and hold the toolbar's "Previous" button to open the history dropdown, select tab 2's entry               | Switches to Space B, scrolls to tab 2         |
| 6    | Repeat steps 2-5, but open all three tabs in the same Space                                                       | No space switch; scrolls to the tab if out of view |

#### C.2e Audio quick-jump (single click on audio button)

| Step | Action                                                                                                  | Expected Result                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to **Off**                                                  | -                                                                                                |
| 2    | Switch sidebar to Space A                                                                                  | -                                                                                                |
| 3    | Switch sidebar to Space B, open a tab there playing audio (e.g. a page with autoplay video)                | -                                                                                                |
| 4    | Switch sidebar back to Space A                                                                             | -                                                                                                |
| 5    | Click the toolbar's audio quick-jump button                                                                | Switches to Space B, scrolls to the audio tab                                                   |
| 6    | Repeat steps 3-5, but make the audio tab a bookmark tab instead of a regular tab                            | Scrolls to the bookmark row (not just tries `data-tab-id` and fails)                            |
| 7    | Repeat steps 2-5, but open the audio tab in the same Space the sidebar is already showing                  | No space switch; scrolls to the tab if out of view                                              |
| 8    | Repeat step 7, but make that same-space audio tab a bookmark tab in a collapsed folder                     | No space switch; scrolls to the bookmark row, folder auto-expands if collapsed                  |

#### C.2f Select a tab from the audio tabs dropdown list

| Step | Action                                                                                                 | Expected Result                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------| -------------------------------------------------------------------------- |
| 1    | Settings → Behaviour → set "Follow active tab" to **Off**                                                  | -                                                                            |
| 2    | Have 2+ tabs playing audio, at least one in a different Space than the sidebar is currently showing        | -                                                                            |
| 3    | Open the audio tabs dropdown (toolbar), select the entry from the other Space                              | Switches space, scrolls correctly whether it's a regular or bookmark tab   |
| 4    | Repeat step 3, selecting an entry that's already in the Space the sidebar is showing                       | No space switch; scrolls to the tab if out of view                        |

The sub-case below is not about the follow-mode bypass, unlike C.2a-C.2f. It
covers the press-and-hold gesture on the history buttons, which C.2d only
reaches the background half of. The follow mode is irrelevant to it, so run it
under whatever is already set.

Not covered: which window a history or audio request lands on. Every sidebar
entry point to those calls is a click, and clicking a background window's side
panel focuses that window as part of the click, so there is no reachable state
where the request and the focused window disagree.

#### C.2g History dropdown press-and-hold gesture

Guided case: the runner drives the setup and every assertion, and pauses for
you to perform each gesture. Automated in `src/tests/inpanel/cases/sectionC.ts`.

C.2d covers the background half of the same dropdown by calling
`getHistoryDetails` and `navigateToIndex` directly, so everything on the
`Toolbar.tsx` side is what this case adds: the hold timer, the
quick-click-versus-hold branch in `handleHistoryMouseUp`, the dropdown
rendering, and the entry click wiring.

Every test tab is an `example.com` URL, so the dropdown rows all carry the same
title. Entries are listed most recent first, so the steps below identify the
target by position rather than by name.

| Step | Action                                                                              | Expected Result                                                                          |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | Activate three or more tabs across two spaces to build some history                   | -                                                                                          |
| 2    | Press and hold the toolbar's "Previous" button for about half a second                | Dropdown opens, listing earlier tabs, each with its title and favicon                      |
| 3    | Confirm each listed entry shows a title, plus a favicon or the grey fallback square    | Titles are populated. A grey square is not a failure: `Toolbar.tsx` renders one for any tab with no favicon. This is `getHistoryDetails` end to end, including the Space lookup it does per entry |
| 4    | Click one of the entries                                                              | Jumps to that tab, switching space if needed; dropdown closes                               |
| 5    | Quick-click "Previous" instead of holding                                             | Navigates one step back; no dropdown appears                                                |
| 6    | Click "Previous" once, normally, while the dropdown is already open                   | Dropdown dismisses; no navigation happens. A plain click, not a hold: the open dropdown puts a full-screen overlay (`MenuBase.tsx`) over the button, so no hold timer can start and the duration is irrelevant |
| 7    | Repeat steps 2-4 on the "Next" button, after navigating backwards first               | Same behaviour, listing the entries ahead of the current position                            |

Not covered: `handleHistoryMouseLeave`'s timer cancel. Reaching it means
pressing the button and dragging off within the 300ms before the dropdown
opens, which is too fiddly to perform the same way twice.

---

## Section D - Space lifecycle

### D.1 Rename a space while it has tracked tabs

| Step | Action                                                                        | Expected Result                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open a bookmark tab in Space A                                                | Loaded, tab in Space A's Chrome group                                                                                                                                                                 |
| 2    | Rename Space A (Settings or right-click → Edit Space)                         | Chrome group's title updates to match; bookmark tab still shows as loaded and still resolves to the (renamed) space on activation                                                                     |
| 3    | With **two windows** open, both showing Space A's group, rename from window 1 | Check window 2's sidebar/group: does its Chrome group also get renamed, or is it now orphaned (group title no longer matches the space name)? This was flagged as a likely pre-existing gap - confirm |

### D.2 Delete a space with tracked tabs

| Step | Action                                                                       | Expected Result                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open a bookmark tab in Space A, note it's loaded                             | -                                                                                                                                                                     |
| 2    | Also open a pinned site's tab, and a plain regular tab, in Space A - all three tab types now open at once | -                                                                                                                                                                     |
| 3    | Delete Space A (with all three tabs open)                                    | The bookmark tab and regular tab should close (they're members of Space A's Chrome group, which `DeleteSpaceAction` closes); the pinned tab should stay open and untouched.  Confirm no leftover/orphaned association or registry state for the two closed tabs if reused afterward |
| 4    | Undo the space deletion (if offered)                                         | Space, the bookmark tab, and the regular tab restore correctly, associations intact; the pinned tab was never affected, so there's nothing to restore for it         |

### D.3 Background's own space cache must drop a deleted space immediately

Regression check for Case 3 in `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`.
Automated in `src/tests/inpanel/cases/sectionD.ts`.

| Step | Action                                                                                                                   | Expected Result                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Create Space A                                                                                                            | -                                                                                                                                    |
| 2    | Delete Space A                                                                                                            | Space A disappears from the sidebar immediately                                                                                     |
| 3    | **Immediately** (no other space edit first), open the Space Navigator popup (Cmd/Ctrl+Shift+S) - any window                | Space A must **not** appear in the popup's list                                                                                     |
| 4    | Deeper check: open the service worker's own console (`chrome://extensions` → this extension → "service worker") and look at the log line from step 2's delete (DEV builds only) | The most recent `[SpaceManager] updateSpaces applied: [...]` line must **not** list Space A |

### D.4 Legacy space (`bookmarkFolderPath`, no `bookmarkFolderSegments`) self-heals immediately

Regression check for `SpaceManager.updateSpaces()`'s segment self-heal (see
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`). Automated in
`src/tests/inpanel/cases/sectionD.ts`.

| Step | Action                                                                                                                                    | Expected Result                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1    | Create a space with a real bookmark folder                                                                                                   | Space has `bookmarkFolderSegments` set                              |
| 2    | Strip `bookmarkFolderSegments` from it (keep `bookmarkFolderPath`) and write the list via `spaceManagerProxy.updateSpaces()` - the shape Arc import and any pre-`bookmarkFolderSegments` backup produce | -                                                                    |
| 3    | Check background's own space list                                                                                                            | `bookmarkFolderSegments` restored, matching the original            |
| 4    | Check this window's own mirror (what `BookmarkTree.tsx` renders from)                                                                        | `bookmarkFolderSegments` restored there too, not just background's copy |

Manual-only gap: data that predates `bookmarkFolderSegments` entirely and has
never gone through `updateSpaces()` (e.g. first launch after an old-version
upgrade) still depends on `SpaceManager.load()`'s startup `migrate()`, which
this case doesn't exercise.

---

## Section E - Restart / reload durability

### E.1 Reload the extension (chrome://extensions → reload)

| Step | Action                                               | Expected Result                                                                                                                       |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Have several bookmark/pinned tabs open across spaces | -                                                                                                                                     |
| 2    | Reload the extension                                 | Service worker restarts; tab IDs are preserved (same browser session)                                                                 |
| 3    | Reopen the sidebar                                   | All associations should still be correct - bookmarks/pins show "loaded" for their actual current tabs, in their actual current spaces |

### E.2 Full browser restart

| Step | Action                                                                                                        | Expected Result                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Have several bookmark/pinned tabs open, and quit/relaunch Chrome (with "continue where you left off" enabled) | Chrome restores tabs with new tab IDs                                                                                                                                                                       |
| 2    | Open the sidebar                                                                                              | Backup-matching logic should re-associate bookmarks/pins to their restored tabs (by domain/index matching) - confirm this still works after this session's changes to `tabAssociations.ts`/`getSpaceForTab` |

### E.3 Service worker restart repopulates tab history and audible tracking

Guided case: the runner pauses for you to stop the service worker by hand,
then verifies the recovery itself. Automated in
`src/tests/inpanel/cases/sectionE.ts`. Regression check for step 4 of
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`: both managers
moved out of `background.ts`, and `LastAudibleTracker` now has to be
constructed after `TabHistoryManager` because it holds one. A wiring mistake
there shows up only on a cold start, when `load()` runs.

Do **not** substitute E.1 for this. Reloading the extension is a fresh
extension load, and `chrome.storage.session` may well be cleared with it, in
which case there is nothing left to repopulate and the case proves nothing
either way. Terminating the worker leaves session storage alone, which is the
condition this case needs. Step 3 checks that assumption rather than trusting
it.

| Step | Action                                                                                                                             | Expected Result                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1    | Activate four or five tabs in turn to build some history, and play then stop audio in one of them                                    | The audio dropdown lists that tab under recently played                                                |
| 2    | At the pause: the runner opens `chrome://extensions` in its own window, so click this extension's "service worker" link there, then in the DevTools that open go to Application → Service Workers → Stop. Letting it idle for a minute or so works too. Come back by clicking inside the first window's sidebar, not a tab | Worker terminated. The extension is NOT reloaded. The first window's tab history is untouched, since history is kept per window and the page was opened in a separate one |
| 3    | Back in the sidebar, press the toolbar's "Previous" button                                                                          | Worker wakes, `TabHistoryManager.load()` repopulates from session storage, and navigation goes one step back as if nothing happened. If history is empty instead, session storage did not survive and this case cannot run on this Chrome build |
| 4    | Open the audio dropdown                                                                                                            | The tab from step 1 is still listed under recently played, so `LastAudibleTracker.load()` ran too       |
| 5    | Press and hold "Previous" to open the history dropdown                                                                             | Entries still carry their titles, favicons and correct Space, so the injected `getSpaceForTab` survived the restart |

---

## Section F - Regression check on pre-existing behavior

Adjacent behaviour that shouldn't break. Automated in `src/tests/inpanel/cases/sectionF.ts`; F.1 is guided.

| #   | Action                                                                                                        | Expected Result                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | In Space A, drag a regular tab's row onto Space B's icon in the space bar                                      | Tab moves into Space B's Chrome group                                                             |
| 2   | Open a bookmark tab in Space A, then right-click the bookmark → "Move To Tabs"                                | Bookmark shows as not loaded; the tab stays open, still in Space A's Chrome group                 |
| 3   | With Space B active, create a brand-new tab (Cmd+T)                                                           | The tab joins Space B's Chrome group                                                              |
| 4   | Open a bookmark tab three collapsed folders deep in Space B, activate it, switch the sidebar to Space A, then click "Show active tab" | Switches to Space B, all three folders expand, and it scrolls to the bookmark row |

---

## Section P - Pinned site list ownership

Cases for step 5 of `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`:
`PinnedSitesManager` is now the only writer of `chrome.storage.local['pinnedSites']`,
and the sidebar reaches it through `pinnedSitesManagerProxy`. Lettered P rather
than G so the ids don't read like the known gaps G1-G3.

Automated in `src/tests/inpanel/cases/sectionP.ts`. P.7, P.8 and P.10 are
guided; P.6 and one step of P.9 need the network.

Two things most of these cases check, so they aren't repeated in every row:

- **background's own list** means `pinnedSitesManagerProxy.getPinnedSites()`, a
  fresh round trip to the manager's in-memory copy. Storage being right is not
  enough: Case 3 was a bug where storage was right and background's cache was
  stale for the rest of the session.
- **this window's mirror** means `pinnedSitesManagerProxy.snapshot`, which is
  what `PinnedBar` renders from.

### P.1 Every pin mutation reaches background's own list

The broad round trip. One pass over the operations that have no coverage at all
today.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin | Appears in the pinned bar; present in background's own list |
| 2    | Edit its title and URL | Both update in the bar and in background's list |
| 3    | Give it an emoji, then replace the emoji with a custom Lucide icon | The bar shows the emoji, then the icon. Background's list shows `emoji` set with `customIconName` cleared, then the reverse - the two are never both set |
| 4    | Right-click → "Reset to site icon" | Custom icon and emoji both cleared in background's list; the bar falls back to the site favicon, or a letter tile if Chrome has nothing cached |
| 5    | Duplicate the pin | Two pins, adjacent, with different ids. Both in background's list |
| 6    | Drag one pin to a different position | New order in the bar and in background's list, identical |
| 7    | Unpin both | Gone from the bar and from background's list |

### P.2 Read-after-write: two mutations in a row

Regression check for the mirror being a plain store rather than React state.
Before step 5, a second pin mutation built its new array from the render-
captured list, so the first one's write was silently dropped.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add two pins in immediate succession, with no wait between them | **Both** present, in both the mirror and background's list. One surviving pin means the snapshot bug is back |
| 2    | Unpin two pins in immediate succession | Both gone, from both |
| 3    | Read the mirror on the line straight after an unpin returns, with no sleep | The unpinned pin is already absent. It is the optimistic write that makes this true, not the round trip |

### P.3 Delete and undo restores position

`DeletePinnedSiteAction` through the manager. The only coverage today is the
DEV dropdown's "Unit Test Do/Undo Delete Pinned Sites", which rewrites the
whole pin list as setup - this case is the same check against pins you can see.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | With at least four pins, unpin the **second** one | It disappears; the rest keep their order |
| 2    | Undo | It comes back **at position two**, not at the end. Same in background's list |
| 3    | Unpin two pins at once (multi-select), then undo | Both return at their original indices |
| 4    | Unpin a pin whose tab is open, then undo | The tab closes on delete; the pin returns on undo, and the tab does not reopen (undo restores pin data only) |

### P.4 Background's own pin cache must reflect a sidebar change immediately

The Case 2 equivalent of D.3. Before step 5 background had no in-memory pin
list at all, so this is a new guarantee rather than a fixed bug.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin | - |
| 2    | **Immediately** (no other pin edit first) read background's own list | The new pin is there |
| 3    | Unpin it, and immediately read background's own list again | Gone. A stale entry here means the manager's in-memory copy and storage have diverged |

### P.5 A late icon patch must not overwrite a newer choice

Regression check for `PinnedSiteFaviconPatch`'s provenance. Every icon resolve
is asynchronous, so a patch can land for a pin the user has since changed.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Add a pin with no favicon, and give it custom Lucide icon "Star" | The bar shows a star |
| 2    | Change it to a different icon, or an emoji, before the first resolve has landed. If that is too fast to hit by hand, call `pinnedSitesManagerProxy.setFavicons([{ id, favicon: <any data url>, forCustomIconName: 'Star' }])` from the sidebar console afterwards - the same shape a late resolve produces | The pin keeps the **newer** icon. The stale patch is dropped, not applied |
| 3    | Same again for a site favicon: give a favicon-less pin an emoji, then send a patch with **no** `forCustomIconName` | The emoji survives |

### P.6 Scenario 5 - background fills in a missing favicon

The reason the manager needs a writer in background at all.

The case needs a site whose favicon Chrome does not already hold, so it starts
with a guided step that clears it. Clearing has to include **Browsing
history**, because that is where Chrome keeps favicons. Chrome also falls back
to the icon it holds for a site when it has nothing for an exact address, so a
unique query string is not an alternative to clearing.

The automated version uses `https://www.wikipedia.org/`, and P.7 uses
`https://www.mozilla.org/` so that running one case does not give the other
one's site an icon.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | At the pause: the runner opens the Clear browsing data settings, so tick "Browsing history", set the range to **All time**, and delete | Chrome no longer holds an icon for either site. A shorter range leaves the icon in place and the next step fails |
| 2    | Pin the site by pasting the URL via "Add pin", not by pinning an open tab | The pin shows a letter tile, no favicon. Confirm `favicon` is unset in background's list, rather than trusting the tile |
| 3    | Open a normal tab on that URL | Within a second or two the pinned icon becomes the site's favicon, with no sidebar reload |
| 4    | Check background's own list | `favicon` set on that pin |

Who set it matters, and the two candidates are hard to tell apart by looking.
The sidebar's own lazy resolver also fills in missing favicons, so a passing
step 2 could be either writer. The discriminator is the broadcast: a
`PINNED_SITES_CHANGED` message with **no** `senderId` came from background,
because only a sidebar-originated call carries one, so the case watches for
that message rather than polling the icon. In practice the resolver cannot win
here, because it runs on mount and on list changes, and visiting a page changes
neither.

### P.7 A background favicon patch must not resurrect an unpinned pin

The in-flight broadcast case (decision 2 in the step 5 plan). Guided: the
runner sets up and checks, you supply the timing.

**A pass here is weaker than a pass elsewhere.** Nothing can make background
patch a favicon inside the few milliseconds a sidebar write is in flight, so
the race may simply not have happened, and the case then passes without having
tested anything. It is worth running anyway because the failure it looks for is
machine-checkable and specific: this window disagreeing with background.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Set up as in P.6: pin A on a site Chrome holds no icon for, plus a second pin B | Neither has a favicon. P.6's clearing step covers this case's site too |
| 2    | At the pause: open a tab on A's URL and unpin B **as close to simultaneously as you can manage** | - |
| 3    | Let both settle, then look at the bar | A has its favicon **and** B is gone. B flickering back and staying is the failure this case exists for |
| 4    | Compare this window's mirror against background's own list, entry by entry | Identical. A mismatch means this window is stale while storage is correct, which is the exact shape of the bug |

Not covered: a run where the race did not happen. Making it deterministic
would need a DEV-only message that has background emit a pin broadcast on
demand, which does not exist.

### P.8 Pins survive a service worker restart

The cold-start path, same reasoning as E.3: `PinnedSitesManager.load()` only
runs when the worker starts, so a mistake there shows up nowhere else. Stop the
worker, don't reload the extension - a reload is a fresh extension load and
proves less.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Note the current pins and their order | - |
| 2    | Stop the service worker (see E.3 step 2 for how) | - |
| 3    | Back in the sidebar, unpin a pin | Worker wakes, `load()` repopulates, and the unpin applies to the **full** list - the other pins are all still there. An empty or truncated bar means `load()` did not run before the mutation |
| 4    | Undo | The pin returns at its original index |

### P.9 Import and export

`replaceAll` and the bulk append, which no other case reaches.

Automate this against a **checked-in fixture** rather than a file the tester
picks: a small backup JSON in the repo (say
`src/tests/inpanel/data/pinned-sites-backup.json`, imported directly -
`resolveJsonModule` is on and `src` is in `tsconfig`'s include). Give its pins
titles carrying `TEST_PINNED_PREFIX` so `resetTestData` cleans them up like any
other test pin, one pin with an embedded favicon and one deliberately without,
so step 4 has something to resolve.

The import path the fixture drives is `importFullBackup` ->
`replacePinnedSites` / `appendPinnedSites` -> the proxy, which is the identical
wiring the dialog uses. Only the file picker is skipped, the same shortcut D.4
takes for the Import dialog.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Starting from two known pins, import the fixture with pinned sites set to **append** | Original two still first, fixture's pins after them, all with fresh ids. Background's own list agrees |
| 2    | Import the same fixture again with **replace** | The list is exactly the fixture's pins - the originals and the first import's copies are both gone |
| 3    | Check ids across the two imports | Every import assigns new ids, so no id from step 1 survives into step 2 |
| 4    | Look at the fixture's favicon-less pin a few seconds after import | Its icon resolves in without a reload, via the lazy resolver's `setFavicons` |
| 5    | **Manual, not automatable:** export a full backup with pins selected through the Export dialog | The downloaded JSON contains every pin with favicons embedded. The file picker is the part no runner can drive |

### P.10 Two windows stay in sync

Cross-window sync is a manager broadcast, so it needs checking directly.

Guided, and **run the case in window 2**, the receiving window: it reads its
own mirror, so every check is machine-made and only the actions are yours.

| Step | Action | Expected Result |
| ---- | ------ | --------------- |
| 1    | Open the sidebar in two windows, and start this case in **window 2** | Both show the same pins |
| 2    | At the pause: add a pin in **window 1** | Window 2's own mirror gains it, with no reload and nothing typed in window 2 |
| 3    | At the pause: reorder that pin in window 1, and nothing else | Window 2 still shows it |
| 4    | At the pause: unpin it in window 1, watching it actually disappear there | Window 2's mirror drops it too |
| 5    | At the pause: add a pin in **window 2** (the runner's own window) | Window 1 shows it. This direction needs your eyes - the runner can't read the other window's mirror - so it is a `confirm` pause |
