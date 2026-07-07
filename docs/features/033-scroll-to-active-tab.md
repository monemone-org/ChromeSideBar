---
created: 2026-07-05
after-version: 1.0.322
status: in-progress
---

# 033 - Scroll to Active Tab (Follow Active Tab)

## Feature Goal

When Chrome activates a tab (closing a tab, keyboard switch, clicking from another window), the sidebar should react per the "Follow active tab" setting:

- **`space-and-scroll`** (default): switch to the tab's space when needed, and always scroll to show the active tab. This matches the pre-setting behaviour.
- **`space`**: switch to the tab's space when needed; scroll only when the space actually switched. No scroll for same-space tab switches.
- **`off`**: sidebar stays put - no space switch, no scroll.

A **"show active tab" toolbar button** lets the user manually scroll to the active tab on demand, regardless of the setting. Its icon is a custom `TreeGutterIcon` (indented tree rows with a gutter arrow on the active row), defined inline in `Toolbar.tsx`.

Setting stored in `chrome.storage.local` under `sidebar-follow-active-tab` (see `src/utils/followActiveTab.ts`). UI: select in the Settings dialog Behaviour tab.

## Two Types of Active Tab

The sidebar has two kinds of tabs:

- **Regular tabs** - rendered in `TabList` with `data-tab-id="..."`
- **Arc-style bookmark tabs** - rendered in `BookmarkTree` with `data-bookmark-id="..."`, filtered OUT of TabList's `visibleTabs` because they are managed by `BookmarkTabsContext`

So a scroll must be routed: `getItemKeyForTab(tabId)` from `BookmarkTabsContext` returns `"bookmark-{id}"` for bookmark tabs → `scrollToBookmark(id)`; otherwise → `scrollToTab(tabId)`. Bookmark tabs may also sit inside collapsed folders, which must be expanded before the row exists in the DOM.

## Why Earlier Attempts Failed

Several attempts (all reverted) tried to detect "activation caused a space switch" inside React by comparing `activeSpace` / `visibleTabs` across renders with refs. That is unfixable at that layer:

- `activeSpace` (via background STATE_CHANGED message) and tab state (via `chrome.tabs.onActivated`) update in separate renders, in arbitrary order
- when the active tab is a bookmark tab it never appears in `visibleTabs`, so ref-based edge detection corrupts permanently
- one-shot `setTimeout` scrolls silently no-op when the target row isn't rendered yet

There was also a live bug: the reverted infrastructure wrote `sidebar-sync-active-tab = 'false'` on every Settings Apply, which background.ts read as "disable space switching". That key is now removed entirely.

## Final Design

Single decision point, single scroll owner, self-healing scroll:

1. **background.ts announces activations.** `onActivated` already decides whether to switch space (it computes `destinationSpaceId`). After that decision it broadcasts `TAB_ACTIVATED { windowId, tabId, spaceSwitched }` (see `spaceMessages.ts`). No React state inference needed.
2. **One hook owns all auto-scroll.** `useFollowActiveTab(mode)` (mounted in `AppContainer`, inside all providers) listens for `TAB_ACTIVATED`, filters by window, and applies the mode: always scroll (`space-and-scroll`), scroll only when `spaceSwitched` (`space`), never (`off`). Routing uses the `getItemKeyForTab` pattern proven in `AudioTabsDropdown`. It also scrolls once when the sidebar opens (after bookmark associations load).
3. **Scroll helpers retry.** `scrollToDataElement` polls every 100ms (up to 2s, newer request cancels older) until the element exists. This absorbs every timing issue in one place: space content still rendering, bookmark folder still expanding, message arriving before React commits.
4. **Folder expansion is tied to scrolling, not activation.** While the bookmark row is missing, each retry of `scrollToBookmark` dispatches a `REVEAL_BOOKMARK_EVENT` window event; BookmarkTree listens and expands the bookmark's ancestor folders, then the retry loop finds the row. Re-dispatching per retry matters because during a space switch the destination BookmarkTree may not be mounted yet for the first attempts. Tying expansion to the scroll keeps folders untouched when the mode decides not to scroll (e.g. same-space switches in `space` mode), and makes the toolbar button work on manually collapsed folders.
5. **Old scattered scrolls removed.** TabList's auto-scroll effect is deleted; BookmarkTree's activation-watching expand+scroll effect is replaced by the reveal listener above. `suppressAutoScrollRef` became dead and was removed - the saved-scroll-position restore on user space switches no longer fights an auto-scroll, because user switches don't produce `TAB_ACTIVATED` scrolls.
6. **"Show active tab" button.** `Toolbar` renders inside the providers, so it directly uses `useScrollToActiveTab()` (queries the window's active tab, routes, scrolls). No forwardRef / imperative handle needed.

## Files

- `src/utils/followActiveTab.ts` - mode type, storage key, default, parser (shared by background and sidebar)
- `src/utils/scrollHelpers.ts` - retrying scroll + `REVEAL_BOOKMARK_EVENT` dispatch
- `src/utils/spaceMessages.ts` - `TAB_ACTIVATED` message
- `src/background.ts` - mode-gated space switch + activation broadcast
- `src/hooks/useFollowActiveTab.ts` - central scroll logic + crosshair helper
- `src/App.tsx` - setting plumbing (`useChromeLocalStorage`)
- `src/components/SettingsDialog.tsx` - mode select in Behaviour tab
- `src/components/TabList.tsx`, `src/components/BookmarkTree.tsx` - old scroll paths removed
- `src/components/Toolbar.tsx` - "show active tab" button with custom `TreeGutterIcon`
