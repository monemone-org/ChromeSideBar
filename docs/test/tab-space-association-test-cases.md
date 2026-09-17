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

The trailing "repeat, but ..." variant steps in C.2a-C.2e run as their own cases, named after the variant - e.g. `C.2b (same space)`, `C.2e (same space, collapsed folder)`. C.2f's same-space pick (step 4) runs at the end of C.2f itself.

Some "Yes" rows cover the case's main flow but not every sub-step. Still manual:

- **D.1 step 3** - needs a second window's sidebar to observe.
- **C.2d's press-and-hold gesture** - the automated case makes the two proxy calls the dropdown ends up making (`getHistoryDetails`, `navigateToIndex`), so it covers the background half only. The 300ms hold timer, the quick-click-vs-hold branch in `Toolbar.tsx`'s `handleHistoryMouseUp`, the dropdown rendering, and the entry click wiring are covered by C.2g instead.
- **C.2g's gestures, E.3's worker stop, and F.1's drag** - performed by you at a pause, with the runner checking the result. See those cases.

Why the "No" rows are still manual:

- **B.4, E.2** - close the window hosting the panel / restart the browser, which kills the runner mid-case. E.2 also gets fresh tab ids on restore, which the runner's saved refs can't re-resolve.

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
| 2    | Open a **new window** and go to `chrome://extensions` there, click this extension's "service worker" link, then in the DevTools that open go to Application → Service Workers → Stop. Letting it idle for a minute or so works too. Come back by clicking inside the first window's sidebar, not a tab | Worker terminated. The extension is NOT reloaded. The first window's tab history is untouched, since history is kept per window |
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
