# Code Audit: Testing Coverage

**Date:** 2026-01-23

## Purpose

Assesses automated test coverage, identifies critical paths lacking tests, and recommends testing priorities for the ChromeSideBar extension.

## Summary Table

| Fix Status | Issue # | Description | Priority | Recommended | Dev Notes |
|------------|---------|-------------|----------|-------------|-----------|
|  | 1 | Background script untested | High | Yes | |
|  | 2 | useTabs hook untested | Medium | Yes | |
|  | 3 | useBookmarks hook untested | Medium | Yes | |
|  | 4 | useTabGroups hook untested | Medium | Maybe | |
|  | 5 | usePinnedSites hook untested | Medium | Maybe | |
|  | 6 | SpacesContext untested | Medium | Yes | |
|  | 7 | BookmarkTabsContext untested | Medium | Yes | |
|  | 8 | tabMove.ts utility untested | Medium | Yes | |
|  | 9 | groupMove.ts utility untested | Medium | Yes | |
|  | 10 | dragDrop.ts utility untested | Medium | Maybe | |
|  | 11 | backupRestore.ts utility untested | Medium | Yes | |
|  | 12 | Cross-context messaging untested | High | Yes | |
|  | 13 | Multi-window scenarios untested | High | Yes | |

---

## Issue #1: Background Script Untested

### Problem
The background script is the central nervous system of the extension, managing state across windows. It has 0% test coverage.

### Cause
**File:** `src/background.ts`

No test file exists. The file contains critical classes: `SpaceWindowStateManager`, `TabHistoryManager`, `TabGroupTracker`, `LastAudibleTracker`.

### Suggested Fixes

#### Option A: Add unit tests for each manager class
```typescript
// background.test.ts
describe('SpaceWindowStateManager', () => {
  it('returns default state for unknown windowId');
  it('persists activeSpace to session storage');
  it('restores state from session storage on load');
  it('notifies listeners on state change');
});

describe('TabHistoryManager', () => {
  it('adds entries and trims to MAX_SIZE');
  it('removes duplicates before adding');
  it('navigates back and forward correctly');
});
```

**Why it works**: Tests critical state management logic in isolation.

**Pros/Cons**:
- Pros: Catches regressions; documents expected behavior
- Cons: Requires Chrome API mocking infrastructure

#### Option B: Add integration tests for message handlers
Test the complete request/response cycle.

**Why it works**: Tests real user scenarios.

**Pros/Cons**:
- Pros: Higher confidence in end-to-end behavior
- Cons: More complex setup

### Recommendation
**Yes fix.** Option A first - unit tests for manager classes are high value because the background script orchestrates all state. This is the highest priority testing gap in the codebase.

---

## Issue #2: useTabs Hook Untested

### Problem
Core hook for tab operations has no tests. Complex operations like sorting, grouping, and batch operations are untested.

### Cause
**File:** `src/hooks/useTabs.ts`

### Suggested Fixes

#### Option A: Add comprehensive unit tests
```typescript
describe('useTabs', () => {
  describe('closeTabs', () => {
    it('closes single tab');
    it('closes multiple tabs in batch');
    it('handles already-closed tabs gracefully');
  });

  describe('sortTabs', () => {
    it('sorts by title alphabetically');
    it('sorts by URL domain');
    it('preserves group membership during sort');
  });
});
```

**Why it works**: Tests complex tab manipulation logic.

**Pros/Cons**:
- Pros: Catches off-by-one errors in index calculations
- Cons: Chrome API mocking required

### Recommendation
**Yes fix.** Option A - tab operations (sorting, closing, grouping) are core user functionality with complex index calculations that are prone to off-by-one errors. High value tests.

---

## Issue #3: useBookmarks Hook Untested

### Problem
CRUD operations on bookmarks lack tests. Path-based navigation and batch operations untested.

### Cause
**File:** `src/hooks/useBookmarks.ts`

### Suggested Fixes

#### Option A: Test CRUD and query operations
```typescript
describe('useBookmarks', () => {
  describe('moveBookmark', () => {
    it('moves "before" target correctly');
    it('moves "after" target correctly');
    it('moves "into" folder at end');
    it('moves "intoFirst" at beginning');
  });

  describe('findFolderByPath', () => {
    it('finds nested folder by path');
    it('returns null for non-existent path');
  });
});
```

**Why it works**: Tests bookmark tree manipulation.

**Pros/Cons**:
- Pros: Catches tree structure bugs
- Cons: Need to model bookmark tree structure

### Recommendation
**Yes fix.** Option A - bookmark operations affect user data. Move operations with "before/after/into" positions are tricky to get right. Tests would catch regressions that could corrupt bookmark organization.

---

## Issue #4: useTabGroups Hook Untested

### Problem
Tab group operations untested.

### Cause
**File:** `src/hooks/useTabGroups.ts`

### Suggested Fixes

#### Option A: Add basic tests
```typescript
describe('useTabGroups', () => {
  it('updates group title and color');
  it('moves group to new index');
  it('handles group removal events');
});
```

**Why it works**: Tests group management.

**Pros/Cons**:
- Pros: Catches group-related regressions
- Cons: Lower priority than tabs/bookmarks

### Recommendation
**Maybe fix.** Option A - tab groups are simpler than tabs/bookmarks. Lower priority, but useful to have once higher-priority hooks are covered.

---

## Issue #5: usePinnedSites Hook Untested

### Problem
Pinned sites persistence and favicon handling untested.

### Cause
**File:** `src/hooks/usePinnedSites.ts`

### Suggested Fixes

#### Option A: Test storage and favicon operations
```typescript
describe('usePinnedSites', () => {
  it('persists pins to chrome.storage.local');
  it('loads pins on mount');
  it('handles favicon fetch failures');
  it('deduplicates pins by URL');
});
```

**Why it works**: Tests data persistence.

**Pros/Cons**:
- Pros: Catches storage bugs
- Cons: Need favicon fetch mocking

### Recommendation
**Maybe fix.** Option A - pinned sites are relatively simple CRUD operations with chrome.storage. Lower priority than tabs/bookmarks since the logic is straightforward.

---

## Issue #6: SpacesContext Untested

### Problem
Space CRUD, message passing to background, and per-window state untested.

### Cause
**File:** `src/contexts/SpacesContext.tsx`

### Suggested Fixes

#### Option A: Test space lifecycle and messaging
```typescript
describe('SpacesContext', () => {
  describe('createSpace', () => {
    it('generates unique ID');
    it('persists to storage');
    it('syncs to Chrome tab group');
  });

  describe('message handling', () => {
    it('updates state on STATE_CHANGED message');
    it('switches space on HISTORY_TAB_ACTIVATED');
  });
});
```

**Why it works**: Tests complex state coordination.

**Pros/Cons**:
- Pros: Catches state sync bugs
- Cons: Complex mocking required

### Recommendation
**Yes fix.** Option A - SpacesContext coordinates state between background script and UI. Bugs here cause inconsistent space switching across windows. High-value testing target.

---

## Issue #7: BookmarkTabsContext Untested

### Problem
Tab-bookmark associations, Live Bookmarks group management untested.

### Cause
**File:** `src/contexts/BookmarkTabsContext.tsx`

### Suggested Fixes

#### Option A: Test association lifecycle
```typescript
describe('BookmarkTabsContext', () => {
  describe('rebuildAssociations', () => {
    it('validates stored tabIds');
    it('removes associations for closed tabs');
  });

  describe('openBookmarkTab', () => {
    it('creates new tab for unloaded bookmark');
    it('activates existing tab for loaded bookmark');
  });
});
```

**Why it works**: Tests Live Bookmarks feature.

**Pros/Cons**:
- Pros: Catches association bugs
- Cons: Complex state to mock

### Recommendation
**Yes fix.** Option A - Live Bookmarks is a unique feature with complex tab-bookmark association logic. The `rebuildAssociations` flow is particularly important to test for data integrity.

---

## Issue #8: tabMove.ts Utility Untested

### Problem
Complex index calculations in tab move operations untested.

### Cause
**File:** `src/utils/tabMove.ts`

### Suggested Fixes

#### Option A: Comprehensive move tests
```typescript
describe('moveSingleTab', () => {
  describe('drop on tab', () => {
    it('places before target when dropPosition="before"');
    it('places after target when dropPosition="after"');
    it('joins target group when target is grouped');
    it('ungroups when moving to ungrouped area');
  });

  describe('index adjustment', () => {
    it('decrements target when source is before');
    it('keeps target when source is after');
  });
});
```

**Why it works**: Tests tricky index math.

**Pros/Cons**:
- Pros: Catches off-by-one errors
- Cons: Many edge cases to cover

### Recommendation
**Yes fix.** Option A - tab move index calculations have high bug potential. Testing drop positions (before/after) and group membership changes would catch subtle off-by-one errors.

---

## Issue #9: groupMove.ts Utility Untested

### Problem
Group move operations have similar complexity to tab moves.

### Cause
**File:** `src/utils/groupMove.ts`

### Suggested Fixes

#### Option A: Test group move operations
Same approach as Issue #8.

**Why it works**: Tests group positioning.

**Pros/Cons**:
- Pros: Catches move bugs
- Cons: Similar to tabMove tests

### Recommendation
**Yes fix.** Option A - same rationale as Issue #8. Group move operations have similar index calculation complexity.

---

## Issue #10: dragDrop.ts Utility Untested

### Problem
Drop position calculation (25/50/25 zones) untested.

### Cause
**File:** `src/utils/dragDrop.ts`

### Suggested Fixes

#### Option A: Test position calculation
```typescript
describe('calculateDropPosition', () => {
  it('returns "before" for top 25%');
  it('returns "into" for middle 50%');
  it('returns "after" for bottom 25%');
  it('handles zero height elements');
  it('handles exact threshold boundaries');
});
```

**Why it works**: Tests drop targeting accuracy.

**Pros/Cons**:
- Pros: Pure function; easy to test
- Cons: Lower priority

### Recommendation
**Maybe fix.** Option A - pure functions are easiest to test and `calculateDropPosition` is critical for UX. Low effort, high confidence test. Good quick win after infrastructure setup.

---

## Issue #11: backupRestore.ts Utility Untested

### Problem
Import/export logic, format validation, and migration untested.

### Cause
**File:** `src/utils/backupRestore.ts`

### Suggested Fixes

#### Option A: Test backup format and import modes
```typescript
describe('backupRestore', () => {
  describe('isFullBackup', () => {
    it('returns true for valid backup');
    it('returns false for missing version');
    it('returns false for non-object');
  });

  describe('importFullBackup', () => {
    it('replaces pinned sites in replace mode');
    it('appends pinned sites in append mode');
    it('renames duplicate space names');
    it('handles corrupt backup gracefully');
  });
});
```

**Why it works**: Tests data integrity.

**Pros/Cons**:
- Pros: Catches import/export bugs
- Cons: Need to create test fixtures

### Recommendation
**Yes fix.** Option A - import/export handles user data. Bugs here could cause data loss or corruption. Testing validation and import modes (replace vs append) is important for data integrity.

---

## Issue #12: Cross-Context Messaging Untested

### Problem
Communication between sidebar and background script not tested end-to-end.

### Cause
No integration tests exist for message passing.

### Suggested Fixes

#### Option A: Integration tests for message cycles
```typescript
describe('Cross-context messaging', () => {
  it('GET_WINDOW_STATE returns correct state');
  it('SET_ACTIVE_SPACE updates and notifies');
  it('HISTORY_TAB_ACTIVATED triggers space switch');
  it('handles rapid consecutive messages');
});
```

**Why it works**: Tests real communication patterns.

**Pros/Cons**:
- Pros: High confidence in integration
- Cons: Complex test setup

### Recommendation
**Yes fix.** Option A - cross-context messaging is the backbone of the extension. Bugs in message handling cause hard-to-diagnose issues where UI and background get out of sync.

---

## Issue #13: Multi-Window Scenarios Untested

### Problem
Window-scoped state and tab detachment not tested.

### Cause
No tests for multi-window behavior.

### Suggested Fixes

#### Option A: Multi-window integration tests
```typescript
describe('Multi-window scenarios', () => {
  it('maintains independent active space per window');
  it('clears association when tab moved to other window');
  it('handles window close cleanup');
});
```

**Why it works**: Tests window isolation.

**Pros/Cons**:
- Pros: Catches window state bugs
- Cons: Complex test environment

### Recommendation
**Yes fix.** Option A - multi-window scenarios are nearly impossible to test manually and bugs are difficult to reproduce. Automated tests would catch window state isolation issues that are very hard to diagnose in production.

---

## Testing Infrastructure Needed

### Current State
- **Framework:** None (custom inline runner in searchParser.test.ts)
- **Chrome API Mocks:** None
- **CI/CD:** None
- **Coverage:** Not tracked

### Recommended Setup

#### Option A: Add Vitest with Chrome mocks
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__mocks__/chrome.ts'],
  },
});

// src/__mocks__/chrome.ts
global.chrome = {
  tabs: { query: vi.fn(), move: vi.fn(), ... },
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
};
```

**Why it works**: Modern test framework with fast execution.

**Pros/Cons**:
- Pros: Fast; good DX; works with Vite
- Cons: Setup effort

#### Option B: Jest with manual mocks
Traditional option if team prefers Jest.

**Why it works**: Well-known; extensive ecosystem.

**Pros/Cons**:
- Pros: Familiarity
- Cons: Slower than Vitest for Vite projects

### Recommendation
**Yes - prerequisite for all other testing issues.** Option A - Vitest integrates seamlessly with Vite, provides fast execution, and has good Chrome API mocking patterns. This infrastructure work must be done before addressing any of the testing gaps above.

---

## Recommended Test Implementation Phases

### Phase 1: Infrastructure (Required first)
1. Add Vitest
2. Create Chrome API mock utilities
3. Set up coverage reporting

### Phase 2: Pure Functions (Quick wins)
1. Migrate searchParser.test.ts to Vitest
2. Add dragDrop.ts tests
3. Add backupRestore.ts validation tests

### Phase 3: Chrome API Mocked Tests
1. useTabs hook
2. useBookmarks hook
3. tabMove.ts and groupMove.ts utilities

### Phase 4: Background Script
1. SpaceWindowStateManager
2. TabHistoryManager
3. Message handlers

### Phase 5: Integration Tests
1. Cross-context messaging
2. Multi-window scenarios
3. Space switching workflows

---

## Positive Findings

1. **Manual test documentation exists** - Comprehensive sanity tests in docs/test/
2. **searchParser has tests** - 44 tests with good coverage
3. **Consistent patterns** - Similar code structure makes testing systematic
4. **Pure utilities exist** - Some functions are easy to test without mocking
