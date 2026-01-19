---
created: 2026-01-18
after-version: 1.0.149
status: completed
---

# LiveBookmark Group

## Goal

Provide visibility into orphaned tabs after Chrome restart without complex state restoration.

**Problem**: When Chrome restarts, tab IDs change. Tab associations (`tabAssociations_{windowId}`) stored in session storage are lost. Previously managed tabs become "orphaned"—they exist but the sidebar doesn't know about them.

**Solution**: Put all managed tabs into a "LiveBookmarks" Chrome tab group. After restart, we can identify orphaned tabs by checking: "Is this tab in the LiveBookmarks group but has no association?"


## Background

This replaces the [aborted 018 feature](018-chrome-restart-state-restore.md) which attempted automatic restoration via URL fingerprinting, custom UUIDs, and debounce-based restore detection. That approach was over-engineered for the value it provided.

This feature accepts that associations are session-only but gives users a way to see and handle orphaned tabs.


## How It Works

### 1. Group Managed Tabs

When a bookmark or pinned site opens a tab:
1. Find or create "LiveBookmarks" group (collapsed, grey color)
2. Add the new tab to that group

### 2. After Chrome Restart

Chrome restores the group and its tabs, but session storage (associations) is cleared. The sidebar shows:
- Tabs in "LiveBookmarks" group that have no current association = orphaned tabs

### 3. Orphaned Tabs Display

Show an "Orphaned Tabs" section in sidebar that:
- Only appears when orphaned tabs exist
- Lists each tab with close button
- Action to "Keep as regular tabs"

## User Workflows

### Normal Use
1. User clicks bookmark → tab opens in LiveBookmarks group
2. Tab shows as "loaded" on the bookmark row
3. User closes tab → association removed, bookmark shows "unloaded"
4. Group is mostly invisible during normal use

### After Chrome Restart
1. Chrome restores tabs including LiveBookmarks group
2. User opens sidebar
3. "Orphaned Tabs" section appears with previously managed tabs
4. User can:
   - Click X to close orphaned tab
   - Keep as regular tabs

## Group Rename Handling

If user renames the "LiveBookmarks" group:
- Existing tabs stay in renamed group
- New live bookmarks create a fresh "LiveBookmarks" group

This is intentional—renaming the group is an implicit "I'll manage these tabs myself" signal.


## Scope

**In scope:**
- Create/manage "LiveBookmarks" Chrome tab group 
- Auto-add managed tabs to group
- Detect and display orphaned tabs in sidebar
- Actions: the normal tab and tab group actions.

**Out of scope:**
- Automatic association restoration
- Fuzzy matching tabs to bookmarks
- Tracking tabs we added vs user-added tabs
- Allow user to manually reassociate tab with bookmark/pinned site


## UI

```
┌─────────────────────────────────────┐
│ Bookmarks                           │
├─────────────────────────────────────┤
│ ▼ Folder 1                          │
│   📄 Bookmark A          [loaded] X │
│   📄 Bookmark B                     │
├─────────────────────────────────────┤
│ ⚠️ Orphaned Tabs (2)                │  ← Only if orphans exist
│   🔗 github.com/some/page        X  │
│   🔗 docs.google.com/doc/abc     X  │
│   [Keep as regular tabs]            │
└─────────────────────────────────────┘
```


## Edge Cases

| Case | Handling |
|------|----------|
| User renames group | Ignore; new live bookmarks create fresh group |
| User manually adds tab to group | Treated as orphaned (no association) |
| Multiple windows | Each window gets its own LiveBookmarks group |
| Tab moved to another window | Loses association; may appear orphaned in new window |
| Group deleted by user | Fine; new live bookmarks recreate it |


## Test Cases

### Basic Functionality

- [x] Click a bookmark → tab opens in collapsed "LiveBookmarks" group (grey color)
- [x] Click a pinned site → tab opens in the same "LiveBookmarks" group
- [x] Bookmark row shows "loaded" indicator when tab is open
- [x] Close the tab → bookmark shows unloaded, tab removed from group
- [x] LiveBookmarks group is NOT shown in the Tabs section (hidden from display)

### Multiple Tabs

- [x] Open multiple bookmarks → all tabs added to same LiveBookmarks group
- [x] Close one tab → others remain in group, only that bookmark shows unloaded
- [x] Open same bookmark twice → reuses existing tab (doesn't create duplicate)

### Orphaned Tabs Detection

- [ ] Close Chrome with LiveBookmarks tabs open
- [x] Reopen Chrome → tabs restored but associations lost
- [x] Open sidebar → "Orphaned Tabs (N)" virtual group appears at bottom of Tabs section
- [x] Orphaned tabs show warning icon in group header
- [x] Count in header matches actual orphaned tab count

### Orphaned Tabs Actions

- [x] Click orphaned tab → activates that tab in Chrome
- [x] Click X on orphaned tab → closes tab, removed from orphaned list
- [x] Right-click orphaned group header → context menu appears
- [x] Select "Keep as Regular Tabs" → all tabs ungrouped, appear as normal tabs
- [x] After "Keep as Regular Tabs" → orphaned group disappears

### Edge Cases

- [x] User renames LiveBookmarks group → next bookmark creates fresh LiveBookmarks group
- [x] User deletes LiveBookmarks group → next bookmark creates fresh LiveBookmarks group
- [x] User manually adds tab to LiveBookmarks group → shows as orphaned (no association)
- [x] Open bookmark in Window A, move tab to Window B → tab loses association in Window B
- [x] No orphaned tabs exist → orphaned group doesn't appear

### Visual/UI

- [x] Orphaned tabs rendered with grey group color styling
- [x] Orphaned tabs are indented under the group header
- [x] Orphaned tabs show favicon or globe icon
- [x] Hover on orphaned tab shows close button
- [x] Group header hover shows border highlight
- [x] Orphaned tabs can be dragged out of "Orphaned tabs" group to tab list as normal tabs.


## Bugs
1. [x] drag drop issue
- [x] Shouldn't be allowed to drag a normal tab into "Orphaned Tabs" group
- [x] Shouldn't be allowed to drag a normal tab to after "Orphaned Tabs" group
- [x] Shouldn't be allowed to drag a normal tab to before/after orphaned tabs

