---
created: 2026-01-26
after-version: 1.0.189
status: draft
---

# Fix: Switch to Correct Space on Tab Activation

## Problem

When navigating tab in history, sometimes it switches to the wrong space. That's because when restoring tab history, it mixes up the active space and the space to be activated.  This messed up the record history.  To fix this, I propose to always:
    1. for live bookmark, use the space that the live bookmark tab is created.
    2. for normal tabs, use the space group


## Tab Activation Scenarios

These are all the scenarios where a tab gets activated and the sidebar needs to decide whether to switch spaces.

### From Chrome directly

1. **User clicks an existing tab** -- should switch to that tab's space
2. **User creates new tab** (Cmd+T, "Open Link In New Tab" from page popup menu) -- existing code groups it to the current active space (BookmarkTabsContext.tsx). No space switch needed unless `getSpaceForTab` finds a definite space (e.g. the new tab inherited the space of its opener tab)
3. **Close active tab** -- Chrome activates the adjacent tab. Should switch to that tab's space
4. **Window focus change** -- should switch to the active tab's space

### From Sidebar

5. **LiveBookmark/Pinned site click** -- creates a new tab. Should stay in current space
6. **Audio dropdown click** -- activates an existing tab. Should switch to that tab's space
7. **History navigation (prev/next)** -- activates an existing tab. Should switch to that tab's space

## Design

### Principle: Only switch space when certain

Only switch space if we can definitively determine the tab belongs to a space. If we can't determine the space, stay on the current space.

**Limitation:** We won't be able to auto-switch to "All" space for ungrouped tabs. The sidebar stays on its current space instead. This is an acceptable tradeoff -- switching to the wrong space is worse than not switching.

### `getSpaceForTab` -- single source of truth

One function in background.ts, replacing the duplicate in AudioTabsDropdown:

1. Check `TabSpaceRegistry` -- returns registered space if found
2. Check Chrome tab group -- match group title to space name
3. Return `undefined` -- tab has no definite space

### Two paths for tab activation

**Path A: Chrome-initiated activations (scenarios 1-4)** -- handled by `onActivated`

`onActivated` calls `getSpaceForTab`. If a definite space is found and the user is not in "All" space, switch to it. Otherwise stay on the current space.

| Scenario | getSpaceForTab returns | Action |
|----------|----------------------|--------|
| Click existing tab | space or undefined | Switch if definite space found |
| New tab (Cmd+T) | undefined (not yet grouped) | No switch |
| Close active tab | space or undefined | Switch if definite space found |
| Window focus change | space or undefined | Switch if definite space found |
| In "All" space | any | No switch (keep "All") |

**Path B: Sidebar-initiated activations (scenarios 5-7)** -- handled by a new `setActiveTabAndSpace` operation

For sidebar-initiated tab activations, 

`setActiveTabAndSpace(tabId)`:
1. Activate the tab
    chrome.tabs.onActivate will switch active space
    add history if !isNavigating
5. Return success with spaceId, or error

### Scenario-by-scenario rationale

**Scenario 5 -- LiveBookmark/Pinned site click (new tab creation):**

After creating a new tab, the caller sets up `tabAssociation` and registers tab-space in `TabSpaceRegistry`. The `onActivated` notification can fire before or after this setup:

- **Before setup:** `getSpaceForTab` returns undefined, so `onActivated` doesn't switch space. Correct -- we stay in the current space where the bookmark lives.
- **After setup:** `getSpaceForTab` returns the registered space, which is the current active space. `onActivated` switches to it -- a no-op since we're already there.

Either way, the behavior is correct. No changes needed to BookmarkTree, TabList, or PinnedBar.

**Scenario 6 -- Audio dropdown click:**

Use `setActiveTabAndSpace` activate the tab and chrome.tabs.onActivate will switch active space.

**Scenario 7 -- History navigation:**

Use `setActiveTabAndSpace` activate the tab and chrome.tabs.onActivate will switch active space.
`setNavigating` will preventing tab activation from being pushed into the history list.
Note: `isNavigating` flag is for preventing tab activation from being pushed into the history list, not for space switching.

## Verification

- Click a grouped tab in Chrome tab bar -- sidebar switches to that tab's space
- Click an ungrouped tab -- sidebar stays on current space
- While in "All" space, click any tab -- sidebar stays in "All"
- Audio dropdown: click a tab -- sidebar switches to correct space
- History prev/next: navigate -- sidebar switches to correct space, no duplicate history entries
- Create tab from bookmark -- sidebar stays on current space
- Close active tab -- sidebar switches to adjacent tab's space (if known)
