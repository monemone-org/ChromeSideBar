---
created: 2026-01-27
after-version: 1.0.189
status: completed
---

# Group Live Bookmark Tabs into Space's Chrome Tab Group

## Why

When Chrome restarts, bookmark tab associations are lost (session storage is cleared). Previously, those tabs were ungrouped, so after restart they'd end up in a long flat list of ungrouped tabs with no space context. The user had to manually sort them back.

By grouping bookmark tabs into the active space's Chrome tab group, they survive a restart in the right place. Chrome preserves tab groups across restarts, so even after the association is lost, the tab still sits in the correct space's group — just like a regular tab would.

A secondary benefit is consistency: bookmark tabs now behave the same as Cmd+T tabs in the tab bar. Only pinned site tabs stay ungrouped (they're persistent, cross-space shortcuts).

## Behaviour Change

- **Before**: Opening a bookmark → tab stays ungrouped regardless of active space
- **After**: Opening a bookmark → tab joins the active space's Chrome tab group (same as Cmd+T tabs). Pinned site tabs remain ungrouped.

## How It Works

1. User clicks a bookmark in the sidebar → tab created ungrouped
2. Background `onCreated` fires → association not stored yet → tab grouped into active space (normal grouping path)
3. `createItemTab` stores the bookmark association and sends `queue-tab-for-grouping`
4. Background runs again → tab already in group → no-op

For pinned sites: `isPinnedManagedTab` returns true → tab ungrouped (unchanged behaviour).

The key change is replacing `isManagedTab` (which blocked all bookmark/pinned tabs) with `isPinnedManagedTab` (which only blocks pinned-site tabs) in `processGroupingRequest`.

## Affected Cases

1. **Space deletion closes bookmark tabs** — Deleting a space closes all tabs in its Chrome group, including bookmark-opened tabs. 
-> This is acceptable — `closeAllTabsInSpace` already closes them explicitly.

2. **Cross-space bookmark access** — A user in Space B could open a bookmark that lives in Space A's folder. The tab joins Space B's group (the active space), not Space A. 
-> Ideally two spaces shouldn't share the same bookmark folder, but it's possible. It's also acceptable but not ideal.

3. **Sidebar tab filtering** — `getManagedTabIds()` still hides bookmark tabs from the Tabs section, so they don't appear twice. -> No change needed.

4. **"Open Link in New Tab" from a bookmark tab** — New tab inherits the opener's group, so it stays in the same space. 
-> Correct behaviour (avoids the old LiveBookmarks separate-group bug).

5. **Space switching / collapsing** — Bookmark tabs are now scoped to a space in Chrome's tab bar. Collapsing a space group hides them. Previously they were always visible regardless of space. This only affects the Chrome tab bar; 
-> Sidebar behaviour is unchanged.

6. **Pinned site tabs** — Still kept ungrouped. `isPinnedManagedTab` checks for the `pinned-` key prefix. No behaviour change.

7. **"All" space (no active space)** — Opening a bookmark stays ungrouped because there's no space group to join. Consistent with how regular tabs behave in "All" space.

## Files Changed

- `src/utils/tabAssociations.ts` — Added `isPinnedManagedTab()` helper
- `src/background.ts` — Replaced `isManagedTab` with `isPinnedManagedTab` in `processGroupingRequest`
- `src/contexts/BookmarkTabsContext.tsx` — Updated comment to reflect new behaviour
