---
created: 2026-01-17
after-version: 1.0.189
status: completed
---

# Background Space State Management

## Purpose

Move SpaceWindowState management from SpacesContext (React) to background.ts so that space-related state stays accurate even when the sidebar is closed.

## Problem

Currently, SpaceWindowState (activeSpaceId, spaceTabs, lastActiveTabs) is managed in SpacesContext.tsx. Since React only runs when the sidebar is open, state changes that happen while sidebar is closed are missed:

| State | Updated when sidebar closed? |
|-------|------------------------------|
| activeSpaceId | ✓ Yes (via messages) |
| lastActiveTabs | ✓ Yes (via messages) |
| spaceTabs | ✗ No - new tabs not added to active space |

**Example:** User has "Work" space active, closes sidebar, creates new tabs → tabs appear in "All" instead of "Work".

## Target Users

All users who use Spaces. This is a bug fix for consistent behavior.

## Solution

Move SpaceWindowState management to background.ts where it can track tab events continuously.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  background.ts                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ SpaceWindowStateManager                         │    │
│  │  - activeSpaceId: string                        │    │
│  │  - spaceTabs: Record<spaceId, tabId[]>          │    │
│  │  - lastActiveTabs: Record<spaceId, tabId>       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Tab Events:                                            │
│  - onCreated → add to spaceTabs[activeSpace]            │
│  - onActivated → update lastActiveTabs                  │
│  - onRemoved → remove from spaceTabs                    │
└─────────────────────────────────────────────────────────┘
              │
              │ Messages
              │ (bidirectional)
              │
┌─────────────────────────────────────────────────────────┐
│  SpacesContext.tsx                                      │
│  - Holds read-only copy of SpaceWindowState             │
│  - On mount: GET_WINDOW_STATE to sync                   │
│  - Sends user actions to background (mutations)         │
│  - On STATE_CHANGED: updates local copy → UI re-renders │
└─────────────────────────────────────────────────────────┘
```

### Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| GET_WINDOW_STATE | sidebar → background | Get current state on mount |
| SET_ACTIVE_SPACE | sidebar → background | User switched space |
| MOVE_TAB_TO_SPACE | sidebar → background | User moved tab via UI |
| CLEAR_SPACE_STATE | sidebar → background | Clear state when space is deleted |
| STATE_CHANGED | background → sidebar | Notify of state updates |

### SpaceWindowStateManager API

```typescript
class SpaceWindowStateManager {
  // State access
  getState(windowId: number): SpaceWindowState
  getActiveSpace(windowId: number): string

  // State mutations
  setActiveSpace(windowId: number, spaceId: string): void
  addTabToSpace(windowId: number, tabId: number, spaceId: string): void
  removeTabFromSpace(windowId: number, tabId: number, spaceId: string): void
  moveTabToSpace(windowId: number, tabId: number, fromSpace: string, toSpace: string): void
  setLastActiveTab(windowId: number, spaceId: string, tabId: number): void

  // Persistence
  load(): Promise<void>
  save(): Promise<void>
}
```

## User Workflows

1. **Normal use (sidebar open)** - No change in behavior
2. **Sidebar closed, create tabs** - New tabs added to active space (fixed)
3. **Sidebar closed, switch tabs** - lastActiveTabs updated (already works)
4. **Sidebar closed, history nav** - activeSpaceId updated (already works)

## Files to Modify

- `src/background.ts` - Add SpaceWindowStateManager
- `src/contexts/SpacesContext.tsx` - Refactor to sync with background
- `src/components/TabList.tsx` - Remove onCreated listener
- `src/utils/spaceMessages.ts` - Add new message types

## Migration

- SpaceWindowState storage key stays the same (`spaces_window_state_${windowId}`)
- Existing session storage data will be loaded by background.ts
- No user-facing migration needed


## Test Cases

Here's how to test the key changes:

x  1. New tabs added to active space (main fix)

  1. Open sidebar, create a space (e.g., "Work")
  2. Switch to "Work" space
  3. Close sidebar
  4. Create new tabs with Cmd+T
  5. Open sidebar
  6. Verify new tabs appear in "Work" space (not just in "All")

x  2. Tab removal when sidebar closed

  1. Have some tabs in a space
  2. Close sidebar
  3. Close some of those tabs
  4. Open sidebar
  5. Verify closed tabs are removed from the space

  3. lastActiveTabs updated when sidebar closed

  1. Switch to a space with multiple tabs
  2. Close sidebar
  3. Click on different tabs in that space
  4. Open sidebar, switch to "All", then back to the space
  5. Verify the last clicked tab becomes active

  4. switchToSpace fallback

  1. Switch to a space, note which tab is active
  2. Close that tab
  3. Switch to another space, then switch back
  4. Verify it activates the next available tab in the space

  5. Moving tabs between spaces

  1. Move a tab from "Work" to another space
  2. Verify it disappears from "Work" and appears in the target space

  6. Delete space cleanup

  1. Create a space with some tabs
  2. Delete the space
  3. Verify tabs still exist but are no longer in any space (show in "All")

bug
- when chrome changes the active tab, background.js should find the space that the tab belong to and activate that space.
