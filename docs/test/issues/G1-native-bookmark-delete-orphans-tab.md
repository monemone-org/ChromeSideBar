---
created: 2026-08-05
status: open
severity: low
---

# Deleting a bookmark via Chrome's native bookmark manager orphans its open tab (G1)

## Summary

If a bookmark's tab is open and the bookmark is deleted via `chrome://bookmarks` (Chrome's own bookmark manager, not the extension's own UI), the tab keeps running but disappears from both the bookmark tree (node gone) and the regular tab list (still counted internally as "managed"). It becomes unreachable from the sidebar.

## Repro

- **B.5** - delete via `chrome://bookmarks` with the sidebar open
- **B.5b** - same, with the sidebar closed at delete time - same outcome either way

Bookmark-only. Not applicable to pinned sites: they have no Chrome-native surface at all (no bookmark tree node, no `chrome://bookmarks` entry), and their only removal path (`PinnedBar.tsx`'s unpin action → `DeletePinnedSiteAction`) always closes the tab first, so there's no code path that can orphan a pinned site's tab.

See `docs/test/tab-space-association-test-cases.md` (`### B.5`, `### B.5b`) for the detailed steps.

## Root cause

There is no `chrome.bookmarks.onRemoved` listener anywhere in the extension (`background.ts` or any context) - confirmed by grep, zero matches.

The extension's own delete option (`src/actions/deleteBookmarkAction.ts`, `DeleteBookmarkAction.do()`) never hits this gap, because it explicitly closes the tab itself via `chrome.tabs.remove()` as part of the delete - it doesn't rely on any event listener. But that only covers deletes that go through the extension's own UI. Deleting the same bookmark from `chrome://bookmarks` bypasses that code path entirely, and since nothing listens for `chrome.bookmarks.onRemoved`, the tab and its stored association (`tabAssociations`) are never cleaned up.

This isn't a sidebar-open-vs-closed issue like G2 - there's no listener at all, in either state, so B.5 and B.5b reproduce identically.

## Proposed fix (not yet scoped/agreed)

Add a `chrome.bookmarks.onRemoved` listener in `background.ts`. On removal, look up whether any window's `tabAssociations_{windowId}` has an entry with `itemKey === 'bookmark-{removedId}'` (or the removed id's descendants, if a folder was deleted) and if so, close that tab and clear the association - similar in spirit to what `DeleteBookmarkAction` already does for the extension's own delete path, but triggered by the native event instead of the UI action.

## Status

Not fixed.
