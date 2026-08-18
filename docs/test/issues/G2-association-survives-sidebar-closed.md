---
created: 2026-08-05
status: open
severity: medium
---

# Bookmark/pinned association survives a cross-space or cross-window move when the sidebar is closed (G2)

## Summary

If a tracked tab (bookmark or pinned) is moved to a different space's Chrome group, or dragged to a different window, while the sidebar is closed, the stored association isn't cleared. Reopening the sidebar still shows the bookmark/pin as "loaded," pointing at a tab that's no longer actually in that space/window.

## Repro

Four confirmed reproduction paths, all the same underlying bug:

- **A.3** - bookmark tab dragged to another space's Chrome group, sidebar closed at drag time
- **A.6** - bookmark tab dragged to a different window, sidebar closed at drag time
- **A.6c** - same as A.6, with a pinned site instead of a bookmark
- **A.7 Step 5** - bookmark created via drag-into-tree (not click-to-open), then dragged to another space's group with the sidebar closed - only reproduces after the A.7 registration fix made these tabs correctly tracked (previously they weren't registered at all, so they were accidentally immune)

See `docs/test/tab-space-association-test-cases-result-2026-08-01.md` (`#a3`, `#a6`, `#a6c`) for the detailed per-case writeups.

## Root cause

Two related code paths, same shape: the only code that clears a stale association lives in the sidebar's own React effects, which don't exist while the sidebar is closed.

**Cross-space group change (A.3, A.7 Step 5):**
- `src/background.ts:~1115-1140` detects the group change and fires `chrome.runtime.sendMessage({ action: DEASSOCIATE_TAB, ... })`, swallowing the error if nothing's listening ("Sidepanel may not be open - ignore error").
- The only listener is `src/contexts/BookmarkTabsContext.tsx:~289-307`, a React `onMessage` effect that only exists while the sidebar is mounted.
- Sidebar closed → message goes nowhere → `tabAssociations_{windowId}` in `chrome.storage.session` never updates.

**Cross-window move (A.6, A.6c):**
- `chrome.tabs.onDetached` is only listened to in `BookmarkTabsContext.tsx:~265-284` - `background.ts` has no equivalent listener at all.
- The reconciliation pass that runs on sidebar reopen, `rebuildAssociations()` (`BookmarkTabsContext.tsx:~102-187`), doesn't self-heal this either: it only checks that `chrome.tabs.get(tabId)` succeeds, never that the tab's *current* `windowId` still matches the window being rebuilt. A detached tab still exists (just in another window), so it's silently kept and written back as-is.

Both boil down to the same architectural gap already documented in `docs/decisions/2026-07-30-shared-storage-multiple-writers.md` (Case 1): the sidebar is the only writer for these associations, and fire-and-forget messages to a possibly-closed sidebar aren't a substitute for an owner that can always write.

## Proposed fix

Not a standalone patch - tracked as part of the single-owner refactor in `docs/decisions/2026-07-30-shared-storage-multiple-writers.md`: background becomes the sole writer of `tabAssociations`, reacting directly to `chrome.tabs.onUpdated` (group change) and a new `chrome.tabs.onDetached` listener, instead of relying on a message to a sidebar that might not be there.

## Status

Not fixed. Deferred until the shared-storage-multiple-writers.md refactor lands - fixing one repro path without the others would just be a partial patch of the same root cause.
