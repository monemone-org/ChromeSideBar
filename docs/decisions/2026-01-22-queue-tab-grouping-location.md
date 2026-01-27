---
created: 2026-01-22
decision: queue-tab-grouping-in-background
status: implemented
---

# Tab Grouping Queue in Service Worker

## What It Does

`queueTabForGrouping` automatically adds newly created tabs to Chrome tab groups matching the active Space. Uses a queue to batch operations and prevent race conditions.

## Why Service Worker Instead of React Components

### 1. Event Listener Constraint

Chrome's `chrome.tabs.onCreated` event can only be registered in the service worker. React components have no way to listen for tab creation events.

### 2. Lifecycle Independence

Service worker runs continuously. React components (sidebar) only exist when visible. Putting grouping logic in components would miss tabs created while sidebar is closed.

### 3. Centralized State Access

The queue needs access to:
- `SpaceWindowStateManager` - which Space is active per window
- `TabSpaceRegistry` - which tabs are "managed" (opened from bookmarks)

These live in the service worker and persist across sidebar open/close cycles.

## Alternatives Considered

### Option A: Put in BookmarkTabsContext

**Pros:**
- Closer to where bookmark tabs are created
- Simpler message flow for bookmark-initiated tabs

**Cons:**
- Can't capture tabs created outside sidebar (Cmd+T, context menu, etc.)
- Context unmounts when sidebar closes - would miss events
- Would need duplicate state management

### Option B: Put in useTabs hook

**Pros:**
- Co-located with other tab operations

**Cons:**
- Same lifecycle problem - hook doesn't exist when sidebar closed
- Can't register `chrome.tabs.onCreated` listener
- Hook is for user-initiated operations, not automatic background processing

### Option C: Put in TabList component

**Pros:**
- None significant

**Cons:**
- All the same problems as options A and B
- Components should handle UI, not background processing

## Decision

Keep `queueTabForGrouping` in `background.ts`. React components send messages to trigger re-queuing when needed (e.g., after storing a bookmark association).

## Trade-offs

**Accepted downsides:**
- More complex message passing between sidebar and background
- Grouping logic split between background (auto) and components (manual)

**Benefits gained:**
- All tab creation events captured regardless of sidebar state
- Single source of truth for grouping queue
- Race condition prevention via centralized mutex
