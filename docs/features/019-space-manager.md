---
created: 2026-01-17
after-version: 0.0.0
status: draft
---

# Consolidate Space Management into SpacesContext

## Purpose

Refactor scattered Space management code into a single `SpacesContext` that owns all Space-related state and operations.

## Current State (Problems)

Space logic is scattered across multiple files:

| File | What it does | Problem |
|------|--------------|---------|
| `useSpaces.ts` | Space CRUD | Used directly in App.tsx, bypassing context |
| `useSpaceWindowState.ts` | Per-window tab tracking | Separate hook, hard to understand |
| `useCloseAllTabsInSpace.ts` | Close all tabs in space | Separate hook, should be part of context |
| `SpacesContext.tsx` | Combines hooks | Just a thin wrapper, doesn't own the logic |

**Import inconsistency:**
- `Space` type imported from `useSpaces.ts` in some files
- `Space` type imported from `SpacesContext.tsx` in others

## Proposed Design

Move all Space logic directly into `SpacesContext.tsx`:

```
┌─────────────────────────────────────────────────────────┐
│                   SpacesContext                          │
├─────────────────────────────────────────────────────────┤
│ Types:                                                   │
│  - Space, SpaceWindowState                              │
│  - ALL_SPACE constant                                   │
├─────────────────────────────────────────────────────────┤
│ Space CRUD (chrome.storage.local):                      │
│  - spaces[], createSpace, updateSpace, deleteSpace      │
│  - moveSpace, getSpaceById                              │
│  - replaceSpaces, appendSpaces (import/export)          │
├─────────────────────────────────────────────────────────┤
│ Per-window State (chrome.storage.session):              │
│  - activeSpaceId, setActiveSpaceId, switchToSpace       │
│  - spaceTabs, addTabToSpace, removeTabFromSpace         │
│  - getSpaceForTab, getTabsForSpace                      │
├─────────────────────────────────────────────────────────┤
│ Actions (Chrome API, no local state):                   │
│  - closeAllTabsInSpace                                  │
└─────────────────────────────────────────────────────────┘
```

## Changes

### 1. SpacesContext.tsx - Inline all logic

Move code from `useSpaces.ts` and `useSpaceWindowState.ts` directly into the context file. Add `closeAllTabsInSpace` functionality.

The context will:
- Own all state (not delegate to hooks)
- Handle storage reads/writes
- Listen to `chrome.storage.onChanged`
- Provide all operations via context value

### 2. Delete these files

- `src/hooks/useSpaces.ts`
- `src/hooks/useSpaceWindowState.ts`
- `src/hooks/useCloseAllTabsInSpace.ts`

### 3. Update imports everywhere

All files should import from `SpacesContext`:
```typescript
import { useSpacesContext, Space, ALL_SPACE } from '../contexts/SpacesContext';
```

### 4. Update App.tsx

Currently App.tsx uses `useSpaces()` directly for import/export dialogs. After refactor, it should use `useSpacesContext()`.

## Updated SpacesContextValue Interface

```typescript
interface SpacesContextValue
{
  // Derived state
  spaces: Space[];
  allSpaces: Space[];        // [ALL_SPACE, ...spaces]
  activeSpace: Space;
  isInitialized: boolean;
  windowId: number | null;

  // Space CRUD
  createSpace: (name: string, icon: string, color: ColorEnum, bookmarkFolderPath: string) => Space;
  updateSpace: (id: string, updates: Partial<Omit<Space, 'id'>>) => void;
  deleteSpace: (id: string) => void;
  moveSpace: (activeId: string, overId: string) => void;
  getSpaceById: (id: string) => Space | undefined;

  // Import/Export
  replaceSpaces: (spaces: Space[]) => void;
  appendSpaces: (spaces: Space[]) => void;

  // Per-window state
  activeSpaceId: string;
  setActiveSpaceId: (spaceId: string) => void;
  switchToSpace: (spaceId: string) => void;
  spaceTabs: Record<string, number[]>;

  // Tab tracking
  addTabToSpace: (tabId: number, spaceId: string) => void;
  removeTabFromSpace: (tabId: number) => void;
  getSpaceForTab: (tabId: number) => string | null;
  getTabsForSpace: (spaceId: string) => number[];
  clearStateForSpace: (spaceId: string) => void;

  // Actions
  closeAllTabsInSpace: (space: Space) => Promise<void>;
}
```

## Files Modified

| File | Change |
|------|--------|
| `src/contexts/SpacesContext.tsx` | Inline all logic from hooks |
| `src/hooks/useSpaces.ts` | Delete |
| `src/hooks/useSpaceWindowState.ts` | Delete |
| `src/hooks/useCloseAllTabsInSpace.ts` | Delete |
| `src/App.tsx` | Use useSpacesContext instead of useSpaces |
| `src/components/SpaceBar.tsx` | Remove useCloseAllTabsInSpace import |
| `src/components/SpaceEditDialog.tsx` | Import Space from SpacesContext |
| `src/components/SpaceDeleteDialog.tsx` | Import Space from SpacesContext |
| `src/components/ExportDialog.tsx` | Import Space from SpacesContext |
| `src/components/ImportDialog.tsx` | Import Space from SpacesContext |
| `src/components/SpaceIcon.tsx` | Import Space from SpacesContext |

## Implementation Steps

1. Copy code from `useSpaces.ts` into SpacesContext (state, effects, callbacks)
2. Copy code from `useSpaceWindowState.ts` into SpacesContext
3. Copy `closeAllTabsInSpace` logic into SpacesContext
4. Update context value to include all operations
5. Update all imports across the codebase
6. Delete old hook files
7. Build and test

## Testing

1. `npm run build` passes
2. Manual testing:
   - Create/edit/delete spaces
   - Reorder spaces
   - Switch spaces (verify tab activation)
   - Add/remove tabs from spaces
   - Close all tabs in space
   - Import/export spaces
   - Multi-window isolation



### TEST

Test Space operations (SpacesContext)

X Create a new space
X Edit space (name, icon, color, bookmark folder)
X Delete a space
X Reorder spaces via drag-drop
X Switch between spaces - verify the view changes
X Add a tab to a space (via context menu)
Close all tabs in a space (via space context menu)
X Test Space switching with tab activation (SpaceTabTracker)

X Switch to a space, activate some tabs
X Switch to a different space
X Switch back - should restore the last active tab
X Close a tab that was "last active" for a space, switch back - should X activate first available tab
X Test Tab History (TabHistoryManager)

X Activate several tabs in sequence
X Use keyboard shortcut or history navigation to go back/forward
X Verify the correct tabs are activated
X Test multi-window isolation

X Open two Chrome windows
X  Each should have independent:
  X Active space
  X Last active tab per space
  X Tab history
  X Test persistence

X Make some changes (switch spaces, activate tabs)
X Reload the extension (or restart Chrome)
X Verify state is restored
