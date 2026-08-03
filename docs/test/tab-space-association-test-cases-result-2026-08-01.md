---
created: 2026-08-01
status: draft
---

# Test Pass Results

Source test plan: [tab-space-association-test-cases.md](tab-space-association-test-cases.md). Test Result: Pass / Bugged / Fixed.

| Test case | Name                                                                           | Test Result | Details      |
| --------- | ------------------------------------------------------------------------------ | ----------- | ------------ |
| A.1       | Regular tab moved to another space, sidebar open                               | Pass        |              |
| A.2       | Bookmark tab moved to a different space's group, sidebar open                  | Pass        |              |
| A.3       | Bookmark tab moved to a different space's group, sidebar CLOSED (known gap G2) | Bugged      | [below](#a3) |
| A.4       | Pinned tab moved to a different space's group                                  | Fixed       | [below](#a4) |
| A.5       | Bookmark tab: native "Remove from group" / ungroup (known gap G3)              | Pass        |              |
| A.5b      | Regular tab: native "Remove from group" / ungroup                              | Pass        |              |
| A.5c      | Pinned tab: native "Remove from group" / ungroup                               | Pass        |              |
| A.6       | Tab moved to a different window                                                | Bugged      | [below](#a6) |
| A.6b      | Regular tab moved to a different window                                        | Passed      |              |
| A.6c      | Pinned tab moved to a different window                                         | Bugged      | [below](#a6c) |
| A.7 Step 3 | Regular tab bookmarked via drag-into-tree, then moved to another space        | Fixed       | [below](#a7) |
| A.7 Step 4 | Regular tab bookmarked via drag-into-tree, then "Move to Space" to another space | Fixed       | [below](#a7) |
| A.7 Step 5  | Regular tab bookmarked via drag-into-tree, close sidebar. then move tab to tab group B         | Bugged (=G2/A.3)       | [below](#a3) |
| A.7b      | Bookmarked tab moved via generic "Move Bookmark to..." folder picker           | Pass        |              |
| A.7c      | Multiple bookmarked tabs moved via multi-select "Move to..."                   | Pass        |              |
| B.1       | Close a bookmark tab directly (X button / Cmd+W)                               | Pass        |              |
| B.2       | Close a pinned tab directly                                                    | Pass        |              |
| B.2b      | Close a regular tab directly                                                   | Pass        |              |
| B.3       | Close via "Close Tab" in the sidebar's own context menu / multi-close          | Pass        |              |
| B.4, Step 4 | Close the whole window with tracked tabs open                                  | Pass        |              |
| B.4, Step 5 | Close the whole window with tracked tabs open                                  | Pass        |              |
| B.5       | Delete a bookmark while its tab is open (known gap G1)                         | Bugged      | Per G1       |
| B.5b      | Delete a bookmark via Chrome's native bookmark manager, sidebar closed         | Bugged      | Per G1       |
| C.1       | Activation scenarios per mode                                                  |             |              |
| C.2       | Explicit actions bypass the mode                                               |             |              |
| D.1       | Rename a space while it has tracked tabs                                       |             |              |
| D.2       | Delete a space with tracked tabs                                               |             |              |
| E.1       | Reload the extension (chrome://extensions → reload)                            |             |              |
| E.2       | Full browser restart                                                           |             |              |
| F         | Regression check on pre-existing behavior                                      |             |              |

---

<a id="a3"></a>

# A.3 Failure - Relation to Decision Docs

Question: does the A.3 test failure relate to `docs/decisions/2026-07-30-shared-storage-multiple-writers.md` and `docs/decisions/2026-07-30-tab-item-map-encapsulation.md`?

## Short answer

Yes, directly related to the shared-storage doc (Case 1). Only tangentially related to the tab-item-map doc.

## Why A.3 matches shared-storage-multiple-writers.md Case 1

A.3 is the automated test for known gap G2: bookmark tab dragged to another space's group while the sidebar is closed. `expected: true` in the YAML documents that the association currently survives (bug reproduces) - see `e2e/test-cases/A.3.yaml`.

Code path:

- `src/background.ts:1115-1140` detects the cross-space drag, fires `chrome.runtime.sendMessage(DEASSOCIATE_TAB)`, swallows the error if nothing's listening (line 1132-1135, "Sidepanel may not be open - ignore error").
- The only listener that clears the stored association is `src/contexts/BookmarkTabsContext.tsx:289-307`, a React `onMessage` effect that only exists while the sidebar is mounted.
- Sidebar closed at drag time -> message goes nowhere -> `tabAssociations_{windowId}` in `chrome.storage.session` never updates.

This is verbatim Case 1's third bullet in the shared-storage doc: _"Fire-and-forget messages to a possibly-absent sidebar are not a substitute for an owner that can always write."_ The doc's fix (background becomes sole writer of `tabAssociations`, sidebar becomes a read-only mirror) is what would close G2 and flip A.3's expectation from `true` to `false`.

## Why tab-item-map-encapsulation.md is only tangential

That doc is about `itemToTab`/`tabToItem` in `BookmarkTabsContext.tsx` being raw `Map`s instead of a class - a same-file code-quality concern. `removeLocalTabAssociation` (the function G2 can't reach when the sidebar's closed) does mutate those maps, but wrapping them in a class doesn't change _where_ the write happens. This refactor wouldn't fix G2 on its own.

## Open question

Didn't confirm the actual failure mode - no runner output/diff was available at the time of this analysis. Two possibilities, worth checking against `node e2e/run-test-cases.mjs` output before concluding:

1. Assertion still holds as documented (bug still reproduces) -> failure is in the new YAML harness itself, not the app.
2. Bookmark actually came back `false` (association got cleared despite sidebar being closed) -> G2 may already be fixed or masked by another code path, and `A.3.yaml`'s `expected: true` is now stale and needs updating.

## A.7 Step 5 confirms the same gap, wider reach now

A.7 Step 5 (drag-into-tree bookmark, sidebar closed, native cross-group drag) reproduces this exact bug - same `DEASSOCIATE_TAB` fire-and-forget message, same sidebar-only listener. Not a new/separate bug.

Before the A.7 registration fix, drag-into-tree bookmarks were never registered in `tabSpaceRegistry`, so `background.ts:1121-1142`'s `if (registeredSpaceId)` check was always false for them - they never even reached the `DEASSOCIATE_TAB` fire-and-forget code, i.e. they were *accidentally immune* to G2. Now that `associateExistingTab` correctly registers them, they're *correctly exposed* to the same pre-existing gap every other tracked bookmark tab already has. The registration fix was right - it just widened which tabs G2 applies to, rather than introducing anything new.

---

<a id="a4"></a>

# A.4 - Pinned Tab Space-Follow Bug (found manually, fixed)

Manually testing A.4 ("Pinned tab moved to a different space's group") surfaced a second, separate bug: dragging a pinned-site tab's underlying Chrome tab into a space's group, then activating that tab from the tab bar, force-switched the sidebar to that space. Pinned tabs are supposed to be space-agnostic - reachable from any space without a switch.

## Root cause

`getSpaceForTab()` in `src/background.ts` (drives space-follow on `chrome.tabs.onActivated`) had a stale comment claiming it "returns undefined for pinned tabs," but the code never actually checked pinned status - it only worked by accident, because pinned-site tabs are normally kept ungrouped by `processGroupingRequest`. Once a pinned tab had a _live_ Chrome group (from a manual drag), step 1 of `getSpaceForTab` matched that group to a space and returned it, same as any regular tab.

This is a different bug from G2/G1/G3 - not a shared-storage race, just a missing check. `isPinnedManagedTab(windowId, tabId)` already existed in `src/utils/tabAssociations.ts` for this exact purpose (used elsewhere for pinned-favicon matching) but wasn't called here.

Note: this does _not_ affect A.4's other expectation (pin's "loaded" state survives the drag) - that's driven by `tabSpaceRegistry`, which never registers pinned tabs in the first place, so it was already correct.

## Fix applied

Added an early-return check at the top of `getSpaceForTab()`:

```typescript
if (await isPinnedManagedTab(windowId, tabId)) return undefined;
```

Pinned tabs now bail out before the live-group check runs, so no space switch fires regardless of which group the tab ends up in. Committed as `fix: Prevent space switch when activating a pinned tab dragged into a group` (staged, not yet pushed).

## Follow-up

- `A.4.yaml` doesn't currently assert this activation-after-drag scenario - only covers the "loaded" state, not space-follow behavior. Worth adding a step if/when A.4 gets fuller automated coverage.
- Not part of the shared-storage-multiple-writers.md / tab-item-map-encapsulation.md refactor plans - unrelated subsystem (space-follow vs. tabAssociations storage ownership).

---

<a id="a6"></a>

# A.6 Failure - Will Fix Together With A.3

Step 6 failed: after moving a tracked bookmark tab to a different window while window 1's sidebar was closed, reopening the sidebar still shows the bookmark as "loaded" pointing at the now-departed tab.

## Root cause

Same underlying failure as A.3, different trigger event:

- `chrome.tabs.onDetached` is only listened to in `src/contexts/BookmarkTabsContext.tsx:265-284` - `background.ts` has no equivalent listener. Sidebar closed at detach time -> nothing calls `removeLocalTabAssociation`.
- The reconciliation pass that runs on sidebar reopen, `rebuildAssociations` (`BookmarkTabsContext.tsx:102-187`), doesn't self-heal this either: it only checks that `chrome.tabs.get(tabId)` succeeds, never that the tab's *current* `windowId` still matches the window being rebuilt. A detached tab still exists (just in another window), so it's silently kept and written back as if nothing happened.

Logged as a fourth bullet under Case 1 in `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`, with a scope note calling out that the fix needs an explicit new `chrome.tabs.onDetached` listener in `background.ts` - easy to miss since nothing else in that doc names it.

## Plan

Not fixing standalone. Will be fixed together with A.3/G2 as part of the shared-storage-multiple-writers.md single-owner refactor (background becomes sole writer of `tabAssociations`, reacting to `onDetached` directly instead of relying on the sidebar being mounted).

---

<a id="a6c"></a>

# A.6c Failure - Same Root Cause as A.6

Fails the same way as A.6, just with a pinned site instead of a bookmark: dragging a pinned tab's underlying Chrome tab to a different window while window 1's sidebar is closed, then reopening the sidebar, still shows the pinned icon as "loaded" pointing at the tab that's now in another window.

## Root cause

Pinned tabs are not a separate system from bookmark tabs here - they go through the exact same `tabAssociations` storage and code path, just with a different itemKey prefix:

- `BookmarkTabsContext.tsx:15` - `makePinnedKey = (pinnedId) => \`pinned-${pinnedId}\`` - pinned associations are stored in the same `tabAssociations_{windowId}` record as bookmarks via the same `storeAssociation`.
- `isPinnedManagedTab()` (`src/utils/tabAssociations.ts:22-27`) exists specifically to distinguish the `pinned-` prefix within that one shared record - confirming there's one storage record and one code path for both.
- That shared code path is exactly what A.6 is bugged on: `chrome.tabs.onDetached` only listened to in `BookmarkTabsContext.tsx:265-284` (sidebar-only, nothing in `background.ts`), and `rebuildAssociations` (`BookmarkTabsContext.tsx:102-187`) never checks that a tab's *current* `windowId` still matches the window being rebuilt.

Confirmed by code inspection, not yet re-verified against a fresh manual repro of A.6c specifically - but the mechanism is identical to A.6's, no separate investigation needed.

## Plan

Same as A.6: not fixing standalone. Will be fixed together with A.3/A.6/G2 as part of the shared-storage-multiple-writers.md single-owner refactor - no additional scope beyond what's already noted there, since pinned and bookmark tabs share the exact same write path.

---

<a id="a7"></a>

# A.7 Failure - Bookmark Moved to Space B, Tab Stayed in Group A (fixed)

Step 4 failed: after bookmarking a tab in Space A, then right-clicking the bookmark → "Move to Space" → Space B, the bookmark moved to Space B's folder and the tab stayed associated with it, but the tab's Chrome group stayed as Space A's group instead of following to Space B.

## Root cause

`handleMoveBookmarkToSpace()` in `src/components/BookmarkTree.tsx` (the "Move to Space" dialog's single-bookmark branch) only ever called `moveBookmark(bookmarkId, folder.id, 'into')` - a plain `chrome.bookmarks.move()`. Nothing there checked whether the bookmark had a live associated tab, and nothing sent `register-tab-space`/`queue-tab-for-grouping` to move that tab's Chrome group to match. Same underlying principle as the earlier A.7 step 3/4 fix (a bookmark's Space should drive where its tab lives) - just a different trigger: *moving* an already-associated bookmark, rather than *creating* the association.

While fixing this, found the same gap in two more places that also move a bookmark's folder without touching its tab's Chrome group:

1. `handleMoveBookmarkToFolder` - the generic single-bookmark "Move Bookmark to..." folder picker (distinct from "Move to Space" - can target any folder, not just a Space's root)
2. `handleMoveSelectedBookmarksToFolder` - the multi-select "Move to..." picker, also reused by "Move to Space"'s multi-select branch

Also clarified test-cases.md step 4's wording: it originally said "sidebar method (b)," inherited from Section A's intro definition (a tab-row "Move to Space"). For a bookmarked tab, right-clicking finds the **bookmark** row instead, whose "Move to Space" is a different action entirely - not the tab-row move A.1/A.2 exercise. Reworded to say so explicitly.

## Fix applied

Added one shared helper in `BookmarkTree.tsx`, `regroupAssociatedTab(bookmarkId, targetFolderId)`: looks up the bookmark's live tab via `getTabIdForBookmark`, resolves the target folder's owning Space via `findSpaceForFolder` (the same helper built for the earlier A.7 fix), and if both exist, sends `register-tab-space` + `queue-tab-for-grouping` - no-ops if the bookmark has no live tab or the destination isn't under any Space. Called from all three move handlers above.

### Follow-up: this alone didn't work - re-tested, tab still stayed in group A

`register-tab-space` updated the association correctly, but the actual re-group never happened. Second bug, same area: `processGroupingRequest()` in `background.ts` had a guard - `if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;` - that only ever grouped tabs that were currently **ungrouped**. It was written for brand-new tabs (Cmd+T, freshly-created bookmark tabs via `createItemTab`, which start with no group) and silently no-ops for a tab that's already sitting in a group, which is exactly `regroupAssociatedTab`'s case - the tab is already in Space A's group and needs to move to Space B's.

Fix: added a `force` flag to `TabGroupingRequest`. `queueTabForGrouping()` now sets `force = spaceId !== undefined` - an explicit target space (from `associateExistingTab`/`regroupAssociatedTab`) means the caller has a definite intended group and the tab should move there regardless of its current group; no explicit spaceId (the `onCreated`/`createItemTab` fallback-to-active-space case) keeps the old ungrouped-only safety check, so a queued new-tab request still can't race ahead of and clobber a group assigned in the meantime. `processGroupingRequest()`'s guard now reads `if (tab.groupId !== TAB_GROUP_ID_NONE && !force) return;`, plus a new short-circuit if the tab's already in the correct target group.

## New test coverage

The generic-folder-picker and multi-select paths weren't covered by any existing test case - added `A.7b` and `A.7c` to `tab-space-association-test-cases.md` to cover them going forward.
