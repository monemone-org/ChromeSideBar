---
created: 2026-01-15
after-version: 1.0.149
status: completed
---

# Last Active Tab Per Space

When switching to a different space, automatically activate the last used tab in that space. Like how IDE tabs remember which file you were editing per project.

## Goal

Make space switching seamless - you return to exactly where you left off in each space.

## Expected Behavior

When user switches to a space:
1. **Has last active tab** → activate that tab
2. **No history, but has tabs** → activate the first tab in the space's group
3. **No tabs at all** → do nothing (stay on current tab)

## How it works

Track last active tab per space in `SpaceWindowState`:
```
spaceLastActiveTabMap: { spaceId → tabId }
```

### Storage approach: Hybrid

Background.js writes to `chrome.storage.session` (same storage as SpaceWindowState). This way:
- Tab activations are captured even when sidebar is closed (background always runs)
- State stays unified with other space-related data

### Flow

```
┌────────────────────────────────────────────────────────────┐
│  User clicks/switches to a tab                             │
│  → background.js: chrome.tabs.onActivated                  │
│  → write to session storage: spaceLastActiveTabMap[spaceId]│
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  User clicks a different space in SpaceBar                 │
│  → sidebar sends 'set-active-space' message                │
│  → background.js receives & activates:                     │
│      1. last active tab (if exists & valid)                │
│      2. first tab in group (fallback)                      │
│      3. do nothing (no tabs exist)                         │
└────────────────────────────────────────────────────────────┘
```

## Edge Cases

1. **Tab closed while in different space** - cleanup via `onRemoved`
2. **Tab moved to different group** - tab is still activated (pinned/live bookmark tabs have groupId=-1)
3. **Space has no group yet** - do nothing, stay on current tab
4. **"All" space** - skip tracking/activation
5. **Sidebar closed during tab activation** - background still updates session storage

## Testing

1. Switch to Space A, click Tab 1, switch to Space B, switch back to A → Tab 1 active
2. In Space A, close last-active tab, switch away and back → First tab in A activates
3. Switch to empty space → stays on current tab (no blank page created)
4. Close sidebar, switch tabs in Space A, reopen sidebar, switch to B then A → correct tab activates
5. Multiple windows → each tracks independently
6. Activate a pinned/live bookmark tab, switch spaces, switch back → pinned tab activates

## Files to modify

1. `src/hooks/useSpaceWindowState.ts` - add `spaceLastActiveTabMap`, getter, cleanup function
2. `public/background.js` - track activations, write to storage, activate on space switch
3. `src/contexts/SpacesContext.tsx` - expose new functions
4. `src/components/SpaceDialogs.tsx` - call cleanup on space delete
