# Remove Restore Last Active Space Feature

**Date:** 2026-01-28

## Problem

When Chrome opens a new window, it creates a "dummy" tab. The extension restores the last active space ID for new windows, causing this dummy tab to be moved into that space's tab group.

Since Chrome never deletes tab groups when windows close, each new window potentially creates a new group that persists indefinitely. Users who frequently open/close windows end up with many orphaned groups cluttering their browser.

## Decision

Remove the feature that restores the last active space when a new window is created.

New windows will start in the default "All" space instead of the last used space.

## Changes

- Remove `lastActiveSpaceId` persistence to local storage in `SpaceWindowStateManager`
- Remove fallback space ID logic in `getState()` - return `DEFAULT_WINDOW_STATE` for unknown windows
- Remove loading of `lastActiveSpaceId` from storage in `load()` method

## Trade-offs

**Losing:**
- Convenience of having new windows start in the same space the user was last working in

**Gaining:**
- No more orphaned tab groups from window creation
- Cleaner browser state over time
- More predictable behavior - new windows always start fresh
