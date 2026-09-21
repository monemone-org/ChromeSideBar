---
created: 2026-09-16
updated: 2026-09-21
status: draft
---

# Test Pass Results - 2026-09-21

Source test plan: [tab-space-association-test-cases.md](tab-space-association-test-cases.md).

- Run: in-panel test runner, every section including the new Section P, raw results in `tools/tmp/test-results-2026-09-21T00-17-13-481Z.json`
- Code under test: step 5 of `docs/decisions/2026-07-30-shared-storage-multiple-writers.md` (`PinnedSitesManager`), plus the icon-resolver fix in `usePinnedSites.ts` described in that step's progress notes
- 65 of 71 automated cases pass
- None of the failures are caused by the step 5 port. All 6 are the same known gaps that were open at the last pass, and all belong to step 6 or the behaviour-fix pass after it
- B.4 and E.2 remain manual only, so they were not run

Result values: Pass / Fail (with cause) / Not run.

| Test case                           | Name                                                                                         | Result                | Details      |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- | ------------ |
| A.1                                 | Regular tab moved to another space                                                           | Pass                  |              |
| A.2                                 | Bookmark tab moved to a different space's group, sidebar open                                | Pass                  |              |
| A.3                                 | Bookmark tab moved to a different space's group, sidebar CLOSED (known gap G2)               | ✗ Fail - known gap G2 | [below](#a3) |
| A.4                                 | Pinned tab moved to a different space's group                                                | Pass                  |              |
| A.5                                 | Bookmark tab: native "Remove from group" / ungroup (known gap G3)                            | ✗ Fail - known gap G3 | [below](#a5) |
| A.5b                                | Regular tab: native "Remove from group" / ungroup                                            | Pass                  |              |
| A.5c                                | Pinned tab: native "Remove from group" / ungroup                                             | Pass                  |              |
| A.6                                 | Tab moved to a different window                                                              | ✗ Fail - known gap    | [below](#a6) |
| A.6b                                | Regular tab moved to a different window                                                      | Pass                  |              |
| A.6c                                | Pinned tab moved to a different window                                                       | ✗ Fail - known gap    | [below](#a6) |
| A.7                                 | Regular tab bookmarked via drag-into-tree, then moved to another space                       | Pass                  |              |
| A.7b                                | Bookmarked tab moved via generic "Move Bookmark to..." folder picker                         | Pass                  |              |
| A.7c                                | Two bookmarked tabs each individually moved to the same space                                | Pass                  |              |
| B.1                                 | Close a bookmark tab directly (X button / Cmd+W)                                             | Pass                  |              |
| B.2                                 | Close a pinned tab directly                                                                  | Pass                  |              |
| B.2b                                | Close a regular tab directly                                                                 | Pass                  |              |
| B.3                                 | Close via "Close Tab" in the sidebar's own context menu / multi-close                        | Pass                  |              |
| B.4                                 | Close the whole window with tracked tabs open                                                | Not run - manual only |              |
| B.5                                 | Delete a bookmark while its tab is open (known gap G1)                                       | ✗ Fail - known gap G1 | [below](#b5) |
| B.5b                                | Delete a bookmark via Chrome's native bookmark manager, sidebar closed                       | ✗ Fail - known gap G1 | [below](#b5) |
| C.1a (off)                          | Activate another tab in the same space                                                       | Pass                  |              |
| C.1a (space)                        | Activate another tab in the same space                                                       | Pass                  |              |
| C.1a (space-and-scroll)             | Activate another tab in the same space                                                       | Pass                  |              |
| C.1b (off)                          | Activate a tab in a different space                                                          | Pass                  |              |
| C.1b (space)                        | Activate a tab in a different space                                                          | Pass                  |              |
| C.1b (space-and-scroll)             | Activate a tab in a different space                                                          | Pass                  |              |
| C.1c (off)                          | Close the active tab, Chrome activates another tab in the same space                         | Pass                  |              |
| C.1c (space)                        | Close the active tab, Chrome activates another tab in the same space                         | Pass                  |              |
| C.1c (space-and-scroll)             | Close the active tab, Chrome activates another tab in the same space                         | Pass                  |              |
| C.1d (off)                          | Close the active tab, Chrome activates another tab in a different space                      | Pass                  |              |
| C.1d (space)                        | Close the active tab, Chrome activates another tab in a different space                      | Pass                  |              |
| C.1d (space-and-scroll)             | Close the active tab, Chrome activates another tab in a different space                      | Pass                  |              |
| C.1e (off)                          | Activate a bookmark tab in another space (collapsed folder auto-expands)                     | Pass                  |              |
| C.1e (space)                        | Activate a bookmark tab in another space (collapsed folder auto-expands)                     | Pass                  |              |
| C.1e (space-and-scroll)             | Activate a bookmark tab in another space (collapsed folder auto-expands)                     | Pass                  |              |
| C.1f (off)                          | Activate a pinned-site tab from another space                                                | Pass                  |              |
| C.1f (space)                        | Activate a pinned-site tab from another space                                                | Pass                  |              |
| C.1f (space-and-scroll)             | Activate a pinned-site tab from another space                                                | Pass                  |              |
| C.2a                                | "Show active tab" toolbar button                                                             | Pass                  |              |
| C.2a (bookmark)                     | "Show active tab" toolbar button - bookmark tab in a collapsed folder                        | Pass                  |              |
| C.2b                                | Tab history Previous/Next toolbar buttons                                                    | Pass                  |              |
| C.2b (same space)                   | Tab history Previous/Next toolbar buttons - both tabs in the same space                      | Pass                  |              |
| C.2c                                | History keyboard shortcuts (Previous/Next Used Tab)                                          | Pass                  |              |
| C.2c (same space)                   | History keyboard shortcuts (Previous/Next Used Tab) - both tabs in the same space            | Pass                  |              |
| C.2d                                | Jump to a specific tab-history entry (dropdown navigate-to-index path)                       | Pass                  |              |
| C.2d (same space)                   | Jump to a specific tab-history entry - all tabs in the same space                            | Pass                  |              |
| C.2e                                | Audio quick-jump (single click on audio button)                                              | Pass                  |              |
| C.2e (bookmark)                     | Audio quick-jump - audio tab is a bookmark tab                                               | Pass                  |              |
| C.2e (same space)                   | Audio quick-jump - audio tab in the space the sidebar shows                                  | Pass                  |              |
| C.2e (same space, collapsed folder) | Audio quick-jump - same space, bookmark tab in a collapsed folder                            | Pass                  |              |
| C.2f                                | Select a tab from the audio tabs dropdown list                                               | Pass                  |              |
| C.2g                                | History dropdown press-and-hold gesture (guided)                                             | Pass                  |              |
| D.1                                 | Rename a space while it has tracked tabs                                                     | Pass (steps 1-2)      | [below](#d1) |
| D.2                                 | Delete a space with tracked tabs                                                             | Pass                  |              |
| D.3                                 | Background's own space cache must drop a deleted space immediately                           | Pass                  |              |
| D.4                                 | Legacy space (bookmarkFolderPath, no bookmarkFolderSegments) self-heals through updateSpaces | Pass                  |              |
| E.1                                 | Reload the extension (chrome://extensions -> reload)                                         | Pass                  |              |
| E.2                                 | Full browser restart                                                                         | Not run - manual only |              |
| E.3                                 | Service worker restart repopulates tab history and audible tracking (guided)                 | Pass                  |              |
| F.1                                 | Drag a tab onto another space in the space bar (guided)                                      | Pass                  |              |
| F.2                                 | "Move To Tabs" on a bookmark tab                                                             | Pass                  |              |
| F.3                                 | A brand-new tab joins the active space's group                                               | Pass                  |              |
| F.4                                 | "Show active tab" on a bookmark tab three collapsed folders deep                             | Pass                  |              |
| P.1                                 | Every pin mutation reaches background's own list                                             | Pass                  |              |
| P.2                                 | Read-after-write: two pin mutations in a row                                                 | Pass                  |              |
| P.3                                 | Delete and undo restores a pin at its original position                                      | Pass                  |              |
| P.4                                 | Background's own pin cache reflects a sidebar change immediately                             | Pass                  |              |
| P.5                                 | A late icon patch must not overwrite a newer choice                                          | Pass                  |              |
| P.6                                 | Scenario 5 - background fills in a missing favicon (guided, needs network)                   | Pass                  |              |
| P.7                                 | A background favicon patch must not resurrect an unpinned pin (guided)                       | Pass                  | [below](#p7) |
| P.8                                 | Pins survive a service worker restart (guided)                                               | Pass                  |              |
| P.9                                 | Import appends and replaces pins through the manager (needs network for step 3)              | Pass                  |              |
| P.10                                | Two windows stay in sync (guided, run in the receiving window)                               | Pass                  |              |

---

<a id="a3"></a>

# A.3 - Known Gap G2

Bookmark tab dragged into another space's group while the sidebar is closed. The bookmark still shows "loaded" when the sidebar reopens.

- `background.ts:501-526` spots the cross-space move and sends `DEASSOCIATE_TAB`, swallowing the error when nobody's listening
- The only listener is in `BookmarkTabsContext.tsx:289-307`, which only exists while the sidebar is mounted
- Sidebar closed means the message goes nowhere and `tabAssociations_{windowId}` never changes

Fix: step 6 of the shared-storage decision doc (`TabAssociationManager`), where background owns association writes.

---

<a id="a5"></a>

# A.5 - Known Gap G3

Bookmark tab removed from its group entirely (native "Remove from group"). The association survives, with the sidebar open or closed.

- The detection in `background.ts:501` only fires when the new `groupId` is a real group
- Ungrouping sets it to `TAB_GROUP_ID_NONE`, so nothing deassociates

Fix: not scheduled yet. Belongs with step 6 or the behaviour-fix pass after it.

---

<a id="a6"></a>

# A.6 / A.6c - Detach With Sidebar Closed

Bookmark tab (A.6) or pinned tab (A.6c) dragged into another window while the first window's sidebar is closed. The item still shows "loaded" when the sidebar reopens. Both fail only in their sidebar-closed half.

- `chrome.tabs.onDetached` is only listened to in `BookmarkTabsContext.tsx:279`. `background.ts` has no listener
- `rebuildAssociations` (`BookmarkTabsContext.tsx:103`) runs on reopen but only checks that `chrome.tabs.get` succeeds. A detached tab still exists, just in another window, so it's kept
- Pinned sites share the same `tabAssociations` record and code path, so A.6c is the same bug

Fix: step 6 of the shared-storage decision doc, which has to add an `onDetached` listener in `background.ts`.

---

<a id="b5"></a>

# B.5 / B.5b - Known Gap G1

A bookmark deleted outside the extension's own UI while its tab is open. The tab keeps running but its association never clears. B.5b reproduces it with the sidebar closed.

- Nothing in the extension listens to `chrome.bookmarks.onRemoved`
- The extension's own delete always closes the tab first, so only external deletes (e.g. `chrome://bookmarks`) hit this

Fix: listed in the behaviour-fix pass that follows the shared-storage refactor (decision doc, "Migration order").

---

<a id="d1"></a>

# D.1 Step 3 - Rename Not Synced to Other Windows' Groups

Steps 1-2 are automated and pass. Step 3 needs a second window's sidebar, so it's manual only and wasn't re-run.

The bug is still in the code:

- `updateSpace` (`SpacesContext.tsx:258`) renames the Chrome group in its own window only
- Other windows get the new space list from the `SPACES_CHANGED` broadcast, so their sidebar shows the new name
- Nothing renames their Chrome group, so it keeps the old title

Fix: listed in the behaviour-fix pass that follows the shared-storage refactor (decision doc, "Migration order").

---

<a id="p7"></a>

# P.7 - What Its Pass Does And Does Not Show

P.7 wants a favicon write from background to land inside the few milliseconds a
sidebar write is in flight, and the tester supplies that timing by hand. Nothing
can force the two to overlap, so a pass means either that the guard held or that
the race never happened on this run.

What the pass does establish is that this window's pin list and background's own
list agreed at the end, which is the exact shape the bug would take. Making it
prove more would need a DEV-only message that has background emit a pin
broadcast on demand, which does not exist.
