---
created: 2026-08-05
status: fixed
severity: low
---

# Deleting a bookmark via Chrome's native bookmark manager orphans its open tab (G1)

## Summary

If a bookmark's tab is open and the bookmark is deleted in `chrome://bookmarks` (Chrome's own bookmark manager, not the extension's own UI), the tab keeps running but disappears from both lists in the sidebar. It is gone from the bookmark tree, because the bookmark node is gone. It is also missing from the regular tab list, because the sidebar still counts it as a tab that a bookmark manages, and the tab list hides those. Nothing in the sidebar can reach the tab any more.

## Repro

- **B.5** deletes the bookmark in `chrome://bookmarks` with the sidebar open.
- **B.5b** does the same with the sidebar closed. The outcome is identical either way.

This is bookmark-only. Pinned sites have no Chrome-native surface at all (no bookmark tree node, no `chrome://bookmarks` entry), and their only removal path, the unpin action in `PinnedBar.tsx` that runs `DeletePinnedSiteAction`, always closes the tab first. So no code path can orphan a pinned site's tab.

See `docs/test/tab-space-association-test-cases.md` (`### B.5`, `### B.5b`) for the detailed steps.

## Root cause

Nothing in the extension listens for `chrome.bookmarks.onRemoved`, neither in `background.ts` nor in any sidebar context.

The extension's own delete option (`DeleteBookmarkAction.do()` in `src/actions/deleteBookmarkAction.ts`) never hits this gap, because it closes the tab itself with `chrome.tabs.remove()` as part of the delete. It does not rely on any event. But that only covers deletes that go through the extension's own UI. A delete in `chrome://bookmarks` bypasses that code, and since no listener hears it, `TabAssociationManager` keeps the tab's association and `tabSpaceRegistry` keeps its space entry.

Unlike G2, this has nothing to do with whether the sidebar is open: there is no listener in either state, so B.5 and B.5b fail the same way.

## Proposed fix

Keep the tab open and turn it into a regular, unassociated tab. The person deleted the bookmark, not the page, and may still be reading it; closing a tab they did not ask to close would lose whatever state it had. Once unlinked, the tab shows up in the regular tab list like any other tab, in whatever Chrome group it already sits in. This is the same end state as a bookmark row's "Move To Tabs" menu item.

This is also what B.5 and B.5b already check for: the tab still exists, and the bookmark is no longer loaded.

The change, all in background:

1. Add a `chrome.bookmarks.onRemoved` listener in `background.ts`, waiting on `stateReady` like the other listeners.
2. Collect the removed bookmark ids. A deleted folder takes everything under it, and `removeInfo.node` carries the removed node with its children, so walk it and gather every bookmark id beneath it, not just the top one.
3. For each window, look in `TabAssociationManager`'s map for tabs whose item key is `bookmark-{id}` for one of those ids. For each tab found:
   - remove it from `tabSpaceRegistry` (`tabSpaceRegistry.unregister(windowId, tabId)`), the same way the group-change handler does, since an unassociated tab gets its space from its live Chrome group;
   - call `tabAssociationManager.deassociate(windowId, tabId)`. That also removes the backup entry, and its broadcast tells any open sidebar, so the sidebar needs no change.

`TabAssociationManager` has no lookup from item key to tab today, so step 3 needs a small method on it, for example `findTabsForItemKeys(itemKeys)`, returning each match with its window id.

### Points to check while implementing

- **The extension's own delete.** `DeleteBookmarkAction.do()` closes the tab and removes the bookmark, so `onRemoved` fires for that delete too. If the tab is already closed by then, the lookup finds nothing and the listener does nothing. If the bookmark is removed before the tab closes, the listener unlinks a tab that is about to close anyway, which is harmless. Its undo recreates the bookmark with a new id, so the listener never sees the restored one.
- **Bookmark import in replace mode** removes bookmarks in bulk through the same API, so the listener will unlink every open bookmark tab it touches. That matches what a person would expect after replacing their bookmarks, but run P.8 and the import cases to be sure nothing there relied on the old behaviour.

## Status

Fixed. Section B passed, B.5c included, and so did P.8 and P.9. An import in replace mode, tried by hand, turned every open bookmark tab into a regular tab, as expected. The fix above is in:

- `bookmarkItemKey(id)` in `src/managers/shared/tabAssociationsApi.ts` builds the `bookmark-{id}` key.
- `TabAssociationManager.findTabsForItemKeys(itemKeys)` returns every tab, in any window, associated with one of the keys. It is background-only, like `isPinnedManagedTab`.
- The `chrome.bookmarks.onRemoved` listener in `src/background.ts` collects the ids of the whole removed subtree, then unregisters and deassociates each tab it finds.
- B.5 and B.5b now expect the tab to be unlinked. The new case B.5c deletes a folder with two open bookmarks and checks that both tabs are unlinked.
