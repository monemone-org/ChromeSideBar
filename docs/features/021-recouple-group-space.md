---
created: 2025-01-18
after-version: 1.0.xxx
status: completed
---

# Recouple Space with Chrome Tab Groups

Simplify Space tab bookkeeping by using Chrome's native tab groups to manage Space membership.

## Current Data Structure (to be simplified)

```typescript
export interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabs: Record<string, number[]>;     // space ID → array of tab IDs
  lastActiveTabs: Record<string, number>;  // space ID → last active tab ID
}
```

## Changes

### 1. Remove SpaceWindowState.lastActiveTabs

- Stop tracking lastActiveTab per Space
- When extension changes active space in side panel → don't change Chrome's active tab
- When user activates a tab → bring up the Space it belongs to

### 2. Use Chrome Tab Groups to Manage Space

Undo the decoupling from @docs/features/015-decouple-space-group.md.

- Create Chrome group for Space (with same name) when opening 1st tab in that Space
- No need to maintain `SpaceWindowState.spaceTabs` - query Chrome groups instead
- Space is like a persisted group: Space remains in sidebar even when Chrome group is gone


## Scenarios

### Chrome Events

| Event | Handling |
|-------|----------|
| Tab created | If new tab is ungrouped and there's an active Space → add to Space's group. Notify sidebar. |
| Tab closed | Notify sidebar to update. |
| Tab moved/ungrouped/grouped | Listen to `tabs.onUpdated`. Notify sidebar. |
| Tab activated | Bring up the associated Space in sidebar. |
| Tab attached/detached | Treat as tab closed on old window, new tab on new window. |
| Tab pinned/unpinned | Do nothing special. Only care about group membership. |
| Tab duplicated | Duplicate stays in same Space (same group). |
| Group created | Do nothing. |
| Group removed/closed | Space remains in sidebar but shows no tabs. |
| Group updated (renamed/color) | Do nothing. Space name is source of truth. If group renamed to not match, link breaks. |
| Group collapsed/expanded | Don't care about collapse state. |
| Window created/closed | Spaces on different windows have separate tab lists (like groups). |

### Extension Events

| Event | Handling |
|-------|----------|
| Create new tab | Place under associated group of active Space. |
| Create new Space | Wait until first tab to create Chrome group. |
| Delete/close Space | Close all tabs in the group. |
| Rename Space | Rename the associated Chrome group. |
| Change Space color | Update Chrome group color. |
| Reorder Spaces | Group order doesn't matter. |
| Load live bookmark / pinned site | Create tab ungrouped. |
| Close tab | No change to existing behavior. |
| Move tab to another Space | Move tab to that Space's group. |
| Move tab out of Space | Ungroup the tab. |
| Change active Space (swipe/spacebar) | Change activeSpace, don't change Chrome's active tab. |
| Navigate via history | Change activeSpace and activate the tab. |
| Restore recently closed tab | Should go back to original Space. (Phase 2) |

### Edge Cases

| Case | Handling |
|------|----------|
| Last tab in Space closed | Space remains in sidebar, Chrome group is gone. |
| User creates group with same name as Space | That group becomes the Space's group (name matching). |
| User renames Space's group to different name | Link breaks, Space shows no tabs until group renamed back or new group created. |
| User changes Space's group color | No effect on Space. Space color is source of truth. |
| Tab in Chrome group with no Space | Tab is not in any Space (shows in "All"). |
| Chrome restart / session restore | Space finds group with same name and lists those tabs. |


## Implementation Notes

- Space ↔ Chrome group linking: Match `Space.name` to `group.title`
- Each window has independent groups (same Space name can have different groups per window)
- `SpaceWindowState` simplified to only `activeSpaceId`

## Test Plan

### Setup
1. Build extension: `npm run build`
2. Load unpacked extension in Chrome
3. Create 2-3 Spaces with different names and colors

### Basic Tab Creation

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 1 | Switch to a Space, click "+ New Tab" | New tab opens and appears in that Space's Chrome group |
| [x] | 2 | Switch to a Space, press Cmd+T | New tab opens and appears in that Space's Chrome group |
| [x] | 3 | Create tab while in "All" space | Tab is ungrouped |
| [x] | 4 | Create first tab in a Space with no group | Chrome group is created with Space name and color |

### Tab Activation & Space Switching

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 5 | Click a tab in a Space's group | Sidebar switches to that Space |
| [x] | 6 | Click an ungrouped tab | Sidebar stays on current Space (or goes to "All") |
| [x] | 7 | Switch Space via spacebar (click on space bar) | Active Space changes, Chrome's active tab unchanged |
| [x] | 8 | Switch Space via swipe gesture | Active Space changes, Chrome's active tab unchanged |

### Move Tab to Space

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 9 | Right-click tab → "Move to Space..." → select Space | Tab moves to that Space's Chrome group |
| [x] | 10 | Move tab to Space that has no group yet | Chrome group created, tab added to it |
| [x] | 11 | Move grouped tab to different Space | Tab moves from old group to new Space's group |

### Space CRUD

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 12 | Create new Space | Space appears in sidebar, no Chrome group yet |
| [x] | 13 | Delete Space with tabs | All tabs in that Chrome group are closed |
| [x] | 14 | Rename Space | Associated Chrome group title updates |
| [x] | 15 | Change Space color | Associated Chrome group color updates |

### Close All Tabs

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 16 | "Close Tabs" in a Space | All tabs in that Space's group are closed |
| [x] | 17 | Close all tabs in Space manually | Space remains in sidebar, shows empty tab list |

### Chrome Group Interactions

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 18 | Manually rename Chrome group to match a Space name | That group becomes the Space's group |
| [x] | 18b | Manually rename Space's group to different name | Link breaks, Space shows no tabs |
| [x] | 18c | Manually change Space's group color | Space color unchanged (Space is source of truth) |
| [x] | 19 | Manually drag tab out of Space's group | Tab disappears from Space's tab list |
| [x] | 20 | Manually drag tab into Space's group | Tab appears in Space's tab list |

### Multi-Window

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 21 | Open sidebar in 2 windows, same Space | Each window can have its own group for the Space |
| [x] | 22 | Create tab in Space on window 1 | Only window 1's group is affected |

### Chrome Restart

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 23 | Have tabs in Spaces, quit Chrome, reopen | Spaces reconnect to their groups by name |
| [x] | 24 | Tabs show correctly in each Space after restart | Name matching links Space to correct group |

### Audio Tab Dialog

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 25 | Play audio, click speaker icon, select tab | Sidebar switches to that tab's Space |

### History Navigation

| ✓ | # | Test | Expected |
|---|---|------|----------|
| [x] | 26 | Navigate back to tab in different Space | Sidebar switches to that Space, tab activates |
| [x] | 27 | Navigate forward to tab in different Space | Sidebar switches to that Space, tab activates |


## Issues

- [x] 1.
current behavior: changing active tab -> change space 
but if current space is "All", do not change space.

- [x] 2. 
when creating new Space, it auto create bookmark folder "Other bookmark/{space name}", 
before it creates the folder , it should check if such a folder already exists, if so , use it instead.


