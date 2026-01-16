---
created: 2026-01-15
after-version: 1.0.149
status: in-progress
---

# Decouple Space and Group 

## Summary

Decouple Space and Group. Space no longer uses Group to keep track of tabs.  It will keep a list of tabs itself in the session.

Also Space is an optional feature toggled in Settings. When enabled, the extension tracks tabs internally (session-only). When disabled, SpaceBar is hidden. "All" space behaves as usual.

When Space is on, right-click menu for tab will only have "Add to Space"
When Space is off, right-click menu for tab will only have "Add to Group"


## Background

The original "Space" concept was confusing when combined with Chrome's native tab groups - users didn't know when to use "Add to Space" vs "Add to Group".

**Value of Spaces**: Focus on what matters. Each space shows only its bookmarks and tabs, reducing clutter. Chrome groups don't filter bookmarks, and display tabs in a flat list that becomes hard to read as the number grows.

This design makes Space an optional feature:
- **Space mode ON**: Extension-managed workspaces with filtered bookmarks and tabs
- **Space mode OFF**: SpaceBar hidden, normal tab/bookmark view (no special organization)

## Feature Behavior

### Welcome Dialog

- Explain Space feature (no opt-in question, Space is on by default)

### Settings Toggle

- New setting: "Use Spaces" (default: ON)
- Location: Settings dialog
- Changing requires no restart - takes effect immediately

### Space Mode (Toggle ON)

**Tabs**
- Tracked by tab ID internally (not Chrome tab groups)
- Session-only - tabs "leave" spaces on browser restart
- New tabs auto-add to active space
- Closing a tab removes it from its space
- Move tabs between spaces via right-click menu "Add to Space" (no drag-drop)
- No "Add to Group" menu items

**Bookmarks**
- Each space filters to show only its associated bookmarks
- Bookmarks are always visible in their respective space

**Windows**
- Each window tracks its own active space independently

**Chrome Tab Groups**
- Extension doesn't create or manage Chrome groups
- "All" space still displays Chrome groups if user creates them via Chrome's UI
- Spaces and Chrome groups are independent - user can use both


### Space Mode OFF

- SpaceBar completely hidden
- Only "All" space is displayed
- No "Add to Space" menu items


## Key Decisions

1. **Tabs are ephemeral in Space mode** - Want persistence? Use bookmarks. This is simpler than trying to restore tabs on restart.

2. **Don't manage Chrome groups** - Extension doesn't create/sync Chrome groups, but "All" space still displays them if user creates via Chrome UI.

3. **Default ON** - Space feature is enabled by default. Users who prefer simpler view can turn it off in Settings.
