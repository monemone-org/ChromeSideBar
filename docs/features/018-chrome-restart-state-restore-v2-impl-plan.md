---
created: 2026-01-17
after-version: 1.0.149
status: draft
---

# Chrome Restart State Restoration v2 - Implementation Plan

Implementation plan for the marker group approach described in `018-chrome-restart-state-restore-v2.md`.


## Phase 1: Foundation

### 1.1 Create identify.html page

Create the extension page that serves as the UUID marker.

**File:** `public/identify.html`

**Content:**
- Title: "SideBar - Do not close"
- Brief explanation of purpose
- Simple, clean styling
- Read `window_uuid` from URL and display it (for debugging)

**Tasks:**
- [ ] Create `public/identify.html`
- [ ] Add basic CSS styling inline
- [ ] Add JS to parse and display UUID from query param


### 1.2 Define new storage types and keys

**File:** `src/types/storage.ts` (or new file)

**Types to add:**
```typescript
interface WindowRestoreData
{
  windowUuid: string;
  tabIds: number[];  // Tab IDs in marker group order (excluding identify tab)
}

type TabAssociations = Record<number, string>;  // tabId → itemKey
type SpaceLastActiveTabs = Record<string, number>;  // spaceId → index in group
```

**Storage keys:**
- `window_restore_data` → `WindowRestoreData[]`
- `tabAssociations_{uuid}` → `TabAssociations`
- `spaceLastActiveTabs_{uuid}` → `SpaceLastActiveTabs`

**Tasks:**
- [ ] Add type definitions
- [ ] Add storage key constants
- [ ] Add helper functions for reading/writing these keys


### 1.3 Add storage helper functions

**File:** `src/background/storage/` (new or existing)

**Functions:**
```typescript
// Window restore data
async function getWindowRestoreData(): Promise<WindowRestoreData[]>
async function setWindowRestoreData(data: WindowRestoreData[]): Promise<void>
async function getWindowRestoreDataByUuid(uuid: string): Promise<WindowRestoreData | undefined>
async function updateWindowRestoreData(uuid: string, tabIds: number[]): Promise<void>
async function removeWindowRestoreData(uuid: string): Promise<void>

// Tab associations (per window)
async function getTabAssociations(uuid: string): Promise<TabAssociations>
async function setTabAssociations(uuid: string, data: TabAssociations): Promise<void>

// Space last active tabs (per window)
async function getSpaceLastActiveTabs(uuid: string): Promise<SpaceLastActiveTabs>
async function setSpaceLastActiveTabs(uuid: string, data: SpaceLastActiveTabs): Promise<void>
```

**Tasks:**
- [ ] Implement storage helper functions
- [ ] Add error handling


## Phase 2: Marker Group Management

### 2.1 Create marker group utilities

**File:** `src/background/markerGroup.ts` (new)

**Functions:**
```typescript
const MARKER_GROUP_NAME = 'SideBar';

// Find marker group in a window
async function findMarkerGroup(windowId: number): Promise<chrome.tabGroups.TabGroup | null>

// Get identify tab from marker group
async function getIdentifyTab(groupId: number): Promise<chrome.tabs.Tab | null>

// Parse UUID from identify tab URL
function parseUuidFromUrl(url: string): string | null

// Get window UUID (from session storage cache or identify tab)
async function getWindowUuid(windowId: number): Promise<string | null>

// Create marker group with identify tab
async function createMarkerGroup(windowId: number): Promise<{ groupId: number; uuid: string }>

// Check if marker group exists and is valid
async function validateMarkerGroup(windowId: number): Promise<{
  valid: boolean;
  groupId?: number;
  uuid?: string;
  issue?: 'no_group' | 'no_identify_tab' | 'invalid_uuid';
}>
```

**Tasks:**
- [ ] Implement `findMarkerGroup`
- [ ] Implement `getIdentifyTab`
- [ ] Implement `parseUuidFromUrl`
- [ ] Implement `getWindowUuid` with session storage caching
- [ ] Implement `createMarkerGroup`
- [ ] Implement `validateMarkerGroup`


### 2.2 Integrate marker group with live tab opening

When user opens a bookmark or pinned site:

**Modify:** `src/background/tabManager.ts` (or equivalent)

**Logic:**
1. Check if marker group exists for window
2. If not, create it (with identify tab)
3. Open new tab
4. Move tab into marker group
5. Update `tabAssociations_{uuid}`
6. Update `windowRestoreData.tabIds`

**Tasks:**
- [ ] Find existing live tab opening code
- [ ] Add marker group creation on first live tab
- [ ] Add tab-to-group assignment
- [ ] Update storage on tab open


### 2.3 Handle tab lifecycle events

**Modify:** Background script tab event listeners

**On tab closed:**
- If tab was in marker group:
  - Remove from `tabAssociations_{uuid}`
  - Update `windowRestoreData.tabIds`

**On tab moved/reordered:**
- If tab moved within marker group:
  - Update `windowRestoreData.tabIds` order

**On identify tab closed:**
- Log warning
- Mark window as needing recovery

**Tasks:**
- [ ] Add/modify `chrome.tabs.onRemoved` listener
- [ ] Add/modify `chrome.tabs.onMoved` listener
- [ ] Handle identify tab removal specially


## Phase 3: Space = Tab Group

### 3.1 Create space group utilities

**File:** `src/background/spaceGroup.ts` (new)

**Functions:**
```typescript
// Ensure a tab group exists for a space
async function ensureSpaceGroup(windowId: number, space: Space): Promise<number>

// Find group for a space by name
async function findSpaceGroup(windowId: number, spaceName: string): Promise<chrome.tabGroups.TabGroup | null>

// Get all tabs in a space (via group membership)
async function getSpaceTabs(windowId: number, spaceName: string): Promise<chrome.tabs.Tab[]>

// Map space color to Chrome group color
function mapSpaceColorToGroupColor(spaceColor: string): chrome.tabGroups.ColorEnum
```

**Tasks:**
- [ ] Implement space group utilities
- [ ] Add color mapping


### 3.2 Modify tab opening to use space groups

When opening a tab in a space:

**Modify:** Existing tab opening logic

**Logic:**
1. Get or create group for the space
2. Create tab
3. Add tab to group

**Tasks:**
- [ ] Find existing space tab opening code
- [ ] Integrate `ensureSpaceGroup`
- [ ] Remove or deprecate `spaceTabs` storage


### 3.3 Update last active tab tracking

**Modify:** Active tab tracking logic

**Change:** Store index position in group instead of tab ID

**On tab activated in space:**
1. Find tab's index within its group
2. Store index in `spaceLastActiveTabs_{uuid}`

**On space switch:**
1. Get stored index for target space
2. Query group's tabs
3. Activate tab at that index (or first tab if index invalid)

**Tasks:**
- [ ] Modify last active tab storage format
- [ ] Update tab activation listener
- [ ] Update space switch logic


## Phase 4: Restoration Logic

### 4.1 Create restoration service

**File:** `src/background/restoration.ts` (new)

**Functions:**
```typescript
interface RestorationResult
{
  windowId: number;
  uuid: string;
  tabsRestored: number;
  errors: string[];
}

// Main restoration entry point
async function restoreWindowState(windowId: number): Promise<RestorationResult | null>

// Find and validate marker groups across all windows
async function discoverMarkerGroups(): Promise<Map<number, { groupId: number; uuid: string }>>

// Restore tab associations for a window
async function restoreTabAssociations(
  windowId: number,
  uuid: string,
  oldTabIds: number[],
  newTabs: chrome.tabs.Tab[]
): Promise<void>
```

**Tasks:**
- [ ] Implement marker group discovery
- [ ] Implement tab ID remapping
- [ ] Implement `tabAssociations` restoration
- [ ] Add restoration status tracking


### 4.2 Trigger restoration on extension load

**Modify:** `src/background/index.ts` (or main background script)

**Logic:**
1. On extension startup, check if this is a restart scenario
2. Discover all marker groups
3. For each, run restoration
4. Clean up orphaned `windowRestoreData` entries
5. Set restoration complete flag

**Tasks:**
- [ ] Add startup restoration trigger
- [ ] Add restoration complete flag/event
- [ ] Add cleanup for unmatched restore data


### 4.3 Handle sidebar loading during restoration

**Modify:** Sidebar initialization

**Logic:**
- Check restoration status on load
- If in progress, show "Restoring session..." message
- Wait for completion before enabling interaction

**Tasks:**
- [ ] Add restoration status check in sidebar
- [ ] Add loading state UI
- [ ] Add message passing for restoration complete


## Phase 5: Recovery Flow

### 5.1 Add recovery UI to sidebar

**File:** `src/sidebar/components/RecoveryBanner.tsx` (new)

**UI:**
```
┌─────────────────────────────────────────┐
│ ⚠ Bookmark tracking disabled            │
│                                         │
│ The "SideBar" tab group was closed.     │
│ Your bookmark tabs won't be restored    │
│ after Chrome restarts.                  │
│                                         │
│ [Restore SideBar Group]                 │
└─────────────────────────────────────────┘
```

**Tasks:**
- [ ] Create `RecoveryBanner` component
- [ ] Add dismiss/restore actions
- [ ] Integrate into sidebar layout


### 5.2 Implement recovery action

**File:** `src/background/markerGroup.ts`

**Function:**
```typescript
async function recoverMarkerGroup(windowId: number): Promise<{ groupId: number; uuid: string }>
```

**Logic:**
1. Create new marker group with identify tab
2. Find live bookmark/pinned site tabs (from existing `tabAssociations`)
3. Move those tabs into the new group
4. Update `windowRestoreData.tabIds`

**Tasks:**
- [ ] Implement recovery function
- [ ] Add message handler for sidebar trigger
- [ ] Test recovery flow


### 5.3 Add marker group validation on sidebar open

**Modify:** Sidebar initialization

**Logic:**
- On sidebar open, validate marker group
- If invalid, show recovery banner
- Persist banner state (don't show repeatedly if dismissed)

**Tasks:**
- [ ] Add validation check on sidebar load
- [ ] Wire up recovery banner display
- [ ] Add dismiss persistence


## Phase 6: Migration & Cleanup

### 6.1 Migrate existing state

**File:** `src/background/migration.ts` (new or existing)

**Tasks:**
- [ ] Migrate `tabAssociations_{windowId}` to `tabAssociations_{uuid}` format
- [ ] Deprecate `spaceWindowState_{windowId}` (no longer needed)
- [ ] Clean up old storage keys after successful migration


### 6.2 Remove deprecated code

**Tasks:**
- [ ] Remove `spaceTabs` mapping storage/logic
- [ ] Remove old window ID based restoration code
- [ ] Update any references to old storage keys


## Phase 7: Testing & Polish

### 7.1 Manual testing checklist

- [ ] Open bookmark → marker group created
- [ ] Open pinned site → added to marker group
- [ ] Close tab → removed from associations
- [ ] Reorder tabs → restore data updated
- [ ] Chrome restart → tabs restored with correct associations
- [ ] Close identify tab → recovery banner shown
- [ ] Recovery action → group recreated, tabs moved
- [ ] Multiple windows → each has own marker group and UUID
- [ ] Space tabs → use Tab Groups correctly
- [ ] Space switching → last active tab works

### 7.2 Add debug logging

**Tasks:**
- [ ] Add dev-only logging for group/tab discovery
- [ ] Add logging for UUID extraction
- [ ] Add logging for restoration process


## Implementation Order

Recommended sequence:

1. **Phase 1** - Foundation (types, storage, identify.html)
2. **Phase 2.1** - Marker group utilities
3. **Phase 4.1-4.2** - Basic restoration logic
4. **Phase 2.2-2.3** - Tab lifecycle integration
5. **Phase 3** - Space = Tab Group
6. **Phase 4.3** - Sidebar loading state
7. **Phase 5** - Recovery flow
8. **Phase 6** - Migration
9. **Phase 7** - Testing

This order lets you test restoration early with manually created marker groups before wiring up automatic creation.


## Open Questions

1. **Group collapse state** - Should marker group be collapsed by default? Always?
2. **Onboarding tooltip** - Where exactly should it appear? How to dismiss?
3. **Multiple sidebar instances** - How to handle if user opens sidebar in multiple windows simultaneously?
4. **Tab group color** - What color for the "SideBar" marker group?
