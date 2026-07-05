---
created: 2026-07-05
after-version: 1.0.322
status: in-progress
---

# 033 - Scroll to Active Tab

## Feature Goal

When Chrome activates a tab (e.g. after closing a tab, switching via keyboard, or clicking from another window), the sidebar should scroll to make that tab visible. There are two sub-behaviors controlled by the "Active Tab Sync" setting:

- **Switch to space** (`activeTabSync == 'space'`): when the activated tab belongs to a different space, switch the sidebar to that space and scroll to show the active tab. No scroll if the tab is in the current space.
- **Switch to space and show tab** (`activeTabSync == 'space-and-scroll'`): always scroll to show the active tab whenever it changes, regardless of space.

A **crosshair toolbar button** was also added so the user can manually trigger "scroll to active tab" on demand, regardless of the setting.

## Two Types of Active Tab

This is the core complexity. The sidebar has two kinds of tabs:

- **Regular tabs** - rendered in `TabList` with `data-tab-id="..."`, present in `visibleTabs`
- **Arc-style bookmark tabs** - rendered in `BookmarkTree` with `data-bookmark-id="..."`, filtered OUT of `visibleTabs` because they are managed by `BookmarkTabsContext`

This means `scrollToTab(tabId)` (which queries `[data-tab-id="..."]`) silently fails for bookmark tabs. The correct call is `scrollToBookmark(bookmarkId)`. The routing decision requires `getItemKeyForTab(tabId)` from `BookmarkTabsContext` - if the result starts with `"bookmark-"`, it is a bookmark tab.

Additionally, bookmark tabs may be inside collapsed folders, so scrolling alone is not enough - ancestor folders must be expanded first by walking the Chrome bookmarks API parent chain.

## Bugs Fixed Along the Way

### Tab-close triggered spurious scroll in "Switch to space" mode

After closing a tab, Chrome activates another tab in the same space. The `onActivated` event fired, the sidebar detected a "space change" (via a `pendingSpaceScrollRef`) and incorrectly scrolled.

**Fix**: removed `pendingSpaceScrollRef`. Reverted to checking `spaceChanged` directly from `prevSpaceIdRef` in the auto-scroll effect.

### Crosshair button did nothing (element null)

`handleScrollToActiveTab` in `App.tsx` called `scrollToTab(tabId)` unconditionally. When the active tab was an Arc-style bookmark tab, `document.querySelector('[data-tab-id="..."]')` returned null. Confirmed via debug tracing in `scrollToDataElement`.

**Fix**: route through `getItemKeyForTab` to call the correct scroll function.

## Changes Made

### `src/utils/scrollHelpers.ts`

- Added debug tracing (`console.log` in DEV mode) to `scrollToDataElement` to diagnose the null element issue.

### `src/components/BookmarkTree.tsx`

- **Extracted `scrollToActiveBookmark(activeItemKey, force?)`** from the `useEffect` body into a `useCallback`. The `force` parameter bypasses the `prevActiveItemKeyRef` change guard so external callers (crosshair button) can trigger scroll even when the active item key hasn't changed.
- **Wrapped component with `forwardRef`** and exported `BookmarkTreeHandle` interface.
- **Added `useImperativeHandle`** to expose `scrollToActiveBookmark` to the parent via a ref.

### `src/components/TabList.tsx`

- **Extracted `scrollToActiveRegularTab(currentSpaceId)`** from the `useEffect` body into a `useCallback`. The function closes over `visibleTabs` (which already filters out bookmark tabs) so no explicit bookmark check is needed.
- `visibleTabs.find(t => t.active)` is called inside the function, not passed as a parameter, making it safe by construction.

### `src/App.tsx`

- **`SidebarContentProps`**: added `onScrollHandlerReady?: (fn: () => void) => void`
- **`SidebarContent`**: 
  - Added `bookmarkTreeRef` and `useBookmarkTabsContext()` usage
  - Created unified `handleScrollToActiveTab`: queries active tab, uses `getItemKeyForTab` to route to `bookmarkTreeRef.current.scrollToActiveBookmark(key, force=true)` or `scrollToTab(tabId)` directly
  - Registers the handler with parent via `onScrollHandlerReady` effect
  - Passes `ref={bookmarkTreeRef}` to `<BookmarkTree>`
- **`App()`**:
  - Removed old broken `handleScrollToActiveTab` (called `scrollToTab` unconditionally, was outside providers)
  - Added `scrollToActiveTabFn` state to hold the registered handler
  - Wired `onScrollHandlerReady={(fn) => setScrollToActiveTabFn(() => fn)}` into `SwipeableContainer` (note: `() => fn` wrapper required because React `useState` treats a function argument as an updater)
  - Toolbar now gets `onScrollToActiveTab={scrollToActiveTabFn}`

## Ongoing Issues

### "Switch to space" mode - scroll after space switch

**Expected**: after selecting a tab in a different space with `activeTabSync == 'space'`, the sidebar switches space then scrolls to show the active tab.

**Problem**: this is a race between two async React state updates:

1. `activeSpace` updates first - `spaceChanged = true`, but `visibleTabs` hasn't updated yet so `activeTab = undefined`. The guard `if (activeTab && spaceChanged)` does not fire. `prevSpaceIdRef.current` is updated.
2. `visibleTabs` updates - `activeTab` is now found, but `spaceChanged = false` (ref was already advanced in step 1). In `'space'` mode `scrollToActiveTab` is false so the `tabChanged` branch also doesn't fire. No scroll.

**Attempted fix**: defer updating `prevSpaceIdRef.current` until an `activeTab` is found, so the `spaceChanged` signal persists across renders:

```typescript
if (activeTab)
{
  prevSpaceIdRef.current = currentSpaceId;
  prevActiveTabIdRef.current = activeTab.id ?? null;
}
```

**Status**: still not working. The race condition may be more complex - unclear whether `visibleTabs` and `activeSpace` updates land in the same render or separate renders, and whether the deferred ref update correctly preserves the `spaceChanged` signal long enough.

### Things to investigate next

- Add DEV logging to `scrollToActiveRegularTab` to trace what `spaceChanged`, `tabChanged`, and `activeTab` values are when the effect fires after a space switch
- Check if `onActivated` in background.ts fires the space switch synchronously or if there are additional async gaps
- Consider whether the auto-scroll for "Switch to space" mode should be driven by the background message response rather than a React effect watching state changes
