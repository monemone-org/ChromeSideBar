---
created: 2026-01-17
after-version: 1.0.149
status: draft
---

# Chrome Restart State Restoration (v2 - Marker Group Approach)

## Goal

Restore space-tab assignments and bookmark/pinned-site associations after Chrome restarts.

**Problem:** Chrome assigns new window and tab IDs on restart. Current state stored with old IDs becomes orphaned.


## Approach Overview

Use Chrome Tab Groups to manage space tabs directly:
- Each Space maps to a Tab Group with the same name
- Space is the persisted definition; Group is the runtime manifestation
- All tabs in a group belong to that space

Use a special marker group for window identification:
- Contains an identify tab with `window_uuid` in URL
- Contains live bookmark/pinned site tabs (from "All" space)

Since Tab Groups persist across Chrome restarts, we can:
- Find groups by name after restart
- Restore space-tab assignments based on group membership
- Read the UUID from the identify tab's URL


## Space = Tab Group

### Concept

Spaces now map 1:1 to Chrome Tab Groups:

| Space (persisted) | Tab Group (runtime) |
|-------------------|---------------------|
| Defined in storage | Created on demand |
| Has id, name, icon, color | Has name, color |
| Survives restart | Survives restart |

### How it works

1. **First tab in space**: When opening a tab in a space, create a Tab Group with the space's name (if not exists)
2. **Tab membership**: All tabs in a group with matching name belong to that space
3. **After restart**: Find groups by name → tabs already assigned to correct spaces

### Benefits

- No need to store `spaceTabs` mapping - group membership IS the assignment
- Tab Groups persist across restart naturally
- Simpler mental model: space name = group name
- Chrome's native group UI works with our spaces

### Still Needed: Last Active Tab per Space

We still track `spaceLastActiveTabs` (in `bg_windowState_{uuid}`) so when user switches spaces, we can jump to the last active tab in that space.

**Approach:** Store tab index position in group (not tab ID):
```typescript
spaceLastActiveTabs: Record<string, number>  // spaceId → index in group
```
- At runtime: query group's tabs, get tab at that index
- After restart: no remapping needed (index is stable)

### Group Creation

```typescript
// When opening first tab in a space
async function ensureSpaceGroup(windowId: number, space: Space): Promise<number>
{
  // Check if group with space name already exists
  const groups = await chrome.tabGroups.query({ windowId, title: space.name });
  if (groups.length > 0)
  {
    return groups[0].id;
  }

  // Create new group
  const groupId = await chrome.tabs.group({ windowId, tabIds: [] });
  await chrome.tabGroups.update(groupId, {
    title: space.name,
    color: mapSpaceColorToGroupColor(space.color)
  });
  return groupId;
}
```


## Marker Tab Group

### Group Structure

```
┌─────────────────────────────────────────────────────┐
│ Tab Group: "SideBar"                                │
├─────────────────────────────────────────────────────┤
│ Tab 1: chrome-extension://<ID>/identify.html?       │
│        window_uuid=abc-123-def                      │
│ Tab 2: https://github.com (bookmark live tab)       │
│ Tab 3: https://docs.google.com (pinned site tab)   │
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

### Group Creation

Created lazily when user opens first live bookmark or pinned site:
1. Create Tab Group named "SideBar"
2. Create identify tab: `chrome-extension://<ID>/identify.html?window_uuid={new_uuid}`
3. Move the live tab into the group
4. Collapse the group by default (less intrusive)

**First-time onboarding:** Show tooltip in sidebar when group is first created:
```
Your bookmark tabs are now in the "SideBar" group.
This helps restore them after Chrome restarts.
```

### Identify Tab

The identify tab serves as a persistent UUID marker:
- URL: `chrome-extension://<EXTENSION_ID>/identify.html?window_uuid={uuid}`
- Content: Self-explanatory page with title "SideBar - Do not close" and brief explanation:
  ```
  This tab helps SideBar remember your bookmarks across Chrome restarts.
  If you close this tab, SideBar won't be able to reopen your
  pinned sites and bookmarks when Chrome restarts.
  ```
- Persists across restart because it's an extension page with stable URL

### Tab Management

All live bookmark/pinned site tabs go into the marker group:
- When user clicks a bookmark/pinned site → open tab in marker group
- Group is hidden from the tab list in the extension side panel (infrastructure, not user-facing)


## `window_uuid`

Our stable identifier for windows (Chrome's `windowId` changes on restart).

- Generated when marker group is created for a window
- Stored in identify tab URL (persists across restart)
- Also stored in session storage for quick lookup during session
- Used as suffix for all per-window storage keys


## State Changes

### Storage Migration

| Old Key | New Key | Storage | Notes |
|---------|---------|---------|-------|
| `spaceWindowState_{windowId}` | (removed) | - | Group membership replaces `spaceTabs` |
| `tabAssociations_{windowId}` | `tabAssociations_{uuid}` | local | Needs persist for bookmark/pinned site associations |
| `bg_windowActiveGroups` | (no change) | session | Keep existing implementation |
| `bg_windowActiveSpaces` | (no change) | session | Keep existing implementation |
| `bg_spaceLastActiveTabs` | `spaceLastActiveTabs_{uuid}` | local | Needs persist for space switching |
| `bg_windowTabHistory` | (no change) | session | Keep existing, lost on restart (OK) |

### New Storage Keys

#### `windowRestoreData`

Stores tab IDs in order for position-based remapping after restart:

```typescript
interface WindowRestoreData
{
  windowUuid: string;
  tabIds: number[];  // Tab IDs in group order (excluding identify tab)
}

// Storage key: 'window_restore_data'
// Storage value: Array<WindowRestoreData>
// Storage: chrome.storage.local
```

After restart, tabs maintain their order within the group, so:
- `oldTabIds[i]` → `newTabs[i].id`

#### `tabAssociations_{uuid}`

Same structure, new key format:

```typescript
// Key: tabId (number)
// Value: itemKey (bookmark ID or pinned site ID)
type TabAssociations = Record<number, string>;
// Storage: chrome.storage.local
```

#### `spaceLastActiveTabs_{uuid}`

Needs to persist for space switching:

```typescript
type SpaceLastActiveTabs = Record<string, number>;  // spaceId → index in group
// Storage: chrome.storage.local
```


## Restoration Process

After Chrome restarts:

### 1. Restore Space Tabs + Last Active Tab (automatic)

Space tabs restore automatically via Tab Group persistence:
- Chrome restores Tab Groups with their tabs
- Find groups by name → match to Space definitions
- Tabs in group = tabs in space (no remapping needed)
- `spaceLastActiveTabs` stores index, so no remapping needed either

### 2. Restore Window UUID + Bookmark Associations

1. **Find marker group**
   ```typescript
   const groups = await chrome.tabGroups.query({ title: 'SideBar' });
   ```

2. **For each marker group:**
   - Get tabs in group, sorted by index
   - Find identify tab by URL pattern (`chrome-extension://*/identify.html*`)
   - Parse `window_uuid` from URL query param
   - Load `windowRestoreData` for this UUID

3. **Build tab ID mapping (for marker group tabs only):**
   - Get non-identify tabs in order: `newTabs`
   - Load stored `windowRestoreData.tabIds`: `oldTabIds`
   - Create mapping: `oldTabIds[i]` → `newTabs[i].id`

4. **Remap stored state:**
   - `tabAssociations_{uuid}`: replace old tab IDs with new ones

5. **Update runtime state:**
   - Build space → groupId mapping from existing groups

6. **Cleanup:**
   - Delete `windowRestoreData` entries that weren't matched


## Recovery Flow

If user closes the marker group or identify tab:

1. **Detection:** Sidebar checks for marker group on load

2. **Warning:** Show message in plain language (no technical terms):
   ```
   Bookmark tracking disabled

   The "SideBar" tab group was closed. Without it, your
   bookmark tabs won't be restored after Chrome restarts.

   [Restore SideBar Group]
   ```

3. **Recovery options:**
   - Button in warning message: "Restore SideBar Group"
   - Also accessible from settings menu

4. **Recreate process:**
   - Create "SideBar" group with identify tab
   - Find all live bookmark/pinned site tabs in the window (tabs tracked in `tabAssociations`)
   - Move those tabs into the SideBar group
   - Update `windowRestoreData.tabIds` with the tab order


## Updating State on Tab Changes

### When live tab opened
1. If no marker group exists, create it (with identify tab)
2. Move new tab into marker group
3. Update `tabAssociations_{uuid}`
4. Update `windowRestoreData.tabIds` (append new tab ID)

### When live tab closed
1. Remove from `tabAssociations_{uuid}`
2. Update `windowRestoreData.tabIds` (remove tab ID)

### When tab moved/reordered in group
1. Update `windowRestoreData.tabIds` to reflect new order


## Edge Cases

| Case | Handling |
|------|----------|
| No marker group found | Treat as new window, no restoration |
| Identify tab missing | Can't get UUID, treat as new window |
| Tab count mismatch | If fewer tabs than stored, only restore matching positions |
| Multiple windows with same group name | Each has unique identify tab with different UUID |
| User manually moves tab out of group | Tab loses association tracking |
| User renames group | Group not found, no restoration |
| User reorders tabs before restoration | Position mismatch, associations may be wrong |


## Sidebar Loading State

If restoration is in progress when sidebar opens:
- Show "Restoring session..." message
- Block interaction until complete
- Background notifies sidebar when done


## Logging (Nice to Have)

Add debug logging (only if `import.meta.env.DEV`):
- Group/tab discovery
- UUID extraction
- Tab URL matching results
- Restoration success/failure


## Comparison with v1 (Fingerprint Approach)

| Aspect | v1 (Fingerprint) | v2 (Tab Groups) |
|--------|------------------|-----------------|
| Space tab management | Store `spaceTabs` mapping | Tab Group membership |
| Space tab restoration | Remap stored tab IDs | Automatic (groups persist) |
| Window identification | URL fingerprint matching | Identify tab URL |
| Bookmark tab restoration | Remap all window tabs | Remap only marker group tabs |
| Timing | 2-second debounce wait | Immediate |
| User visibility | Hidden | Visible groups |
| Recovery | None | User can recreate group |
