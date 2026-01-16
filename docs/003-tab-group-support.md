---
created: 2025-12-24
after-version: 1.0.22
status: completed
---

# Chrome Tab Groups Feature Planning Document

## Purpose

Integrate Chrome's native Tab Groups API into the sidebar extension to provide visual organization of tabs by group. This feature allows users to see and interact with their tab groups directly from the sidebar panel, mirroring Chrome's built-in tab grouping functionality.

## Major Features

1. **View grouped tabs** - See tabs organized under their Chrome group headers
2. **Expand/collapse groups** - Quickly show/hide tabs within a group
3. **Visual identification** - Groups display with Chrome's assigned color
4. **Ungrouped tabs** - Tabs not in any group shown separately
5. **Group operations** - Close all tabs in a group, collapse/expand

## User Workflows

### Workflow 1: Viewing Tab Groups
```
User opens sidebar
  → Sidebar fetches tabs and tab groups
  → Groups displayed as collapsible headers with color indicator
  → Tabs nested under their respective group
  → Ungrouped tabs shown in separate section
```

### Workflow 2: Interacting with Group
```
User clicks group header
  → Group expands/collapses to show/hide member tabs

User clicks tab within group
  → Tab activates in browser

User hovers group header
  → Shows action buttons (close group, etc.)
```

### Workflow 3: Group Changes Sync
```
User creates/modifies group in Chrome tab bar
  → Sidebar automatically updates via chrome.tabGroups events
  → New group appears with correct color and name
```

### Workflow 4: Moving Tabs Between Groups
```
User drags ungrouped tab onto a group header
  → Tab added to that group
  → Tab appears indented under group header
  → Chrome tab bar reflects the change

User drags grouped tab onto another group header
  → Tab moves from old group to new group
  → Both groups update in sidebar and Chrome

User drags grouped tab to ungrouped area (between groups or at root level)
  → Tab removed from its group
  → Tab appears at ungrouped level
  → Chrome tab bar reflects the change
```

## UI Layout

Ungrouped tabs appear at the same level as group headers, matching Chrome's tab bar display order.

```
┌──────────────────────────────────────┐
│ + New Tabs                    ⋮   │
├──────────────────────────────────────┤
│ 📄 Gmail                       ✕   │  ← Ungrouped tab (no indent)
│ v Work (blue)                  ▼   │  ← Group header with color dot
│   ├─ 📄 GitHub PR #123         ✕   │  ← Tabs indented under group
│   ├─ 📄 Jira Task              ✕   │
│   └─ 📄 VS Code Docs           ✕   │
│ 📄 YouTube                     ✕   │  ← Ungrouped tab between groups
│ > Research (green)             ▶   │  ← Collapsed group
│ 📄 Settings                    ✕   │  ← Ungrouped tab at end
└──────────────────────────────────────┘

Legend:
  ●   = Color indicator (Chrome group header)
  ▼/▶ = Expand/collapse toggle (groups only)
  ✕   = Close button (hover)
```

## Chrome Tab Groups API

### Required Permission
```json
"permissions": ["tabGroups"]
```

### Key APIs
- `chrome.tabGroups.query()` - Fetch all tab groups in window
- `chrome.tabGroups.get(groupId)` - Get specific group details
- `chrome.tabGroups.update()` - Modify group (name, color, collapsed)
- `chrome.tabs.Tab.groupId` - Property on tab indicating its group (-1 if ungrouped)

### Events to Listen
- `chrome.tabGroups.onCreated` - New group created
- `chrome.tabGroups.onUpdated` - Group properties changed
- `chrome.tabGroups.onRemoved` - Group deleted
- `chrome.tabGroups.onMoved` - Group position changed

### Tab Group Properties
```typescript
chrome.tabGroups.TabGroup {
  id: number;
  collapsed: boolean;
  color: "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
  title?: string;
  windowId: number;
}
```

## Feature Behaviors

### Display Rules
- Groups and ungrouped tabs shown in their natural browser order (by tab index)
- Groups appear as collapsible headers; ungrouped tabs appear at the same level
- Within each group, tabs maintain their browser index order and are indented
- Active tab highlighted regardless of group membership

### Interaction Behaviors
- Click group header → Toggle collapse/expand
- Click tab → Activate tab (existing behavior)
- Drag tab → Reorder, move between groups, or ungroup (move out of group)
- Close button on group header → Close all tabs in group

### Sync Behaviors
- Real-time sync with Chrome via event listeners
- Group color/name changes reflected immediately
- New tabs automatically appear under correct group

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Collapse state | **Independent** | Sidebar manages its own collapse state separately from Chrome |
| Ungrouped tabs | **Mixed order** | Show tabs in their natural browser index position, interleaved with groups |
| Group management | **View only** | Display and navigate groups; no create/rename/delete from sidebar |
| Drag-drop | **Full mobility** | Support moving tabs between groups and ungrouping via drag-drop |

## Implementation Phases

### Phase 1: Display Tab Groups
- Add `tabGroups` permission to manifest
- Create `useTabGroups` hook to fetch and sync tab groups
- Modify `TabList` to display groups as collapsible headers with color indicators
- Render tabs under their respective groups (indented)
- Render ungrouped tabs at root level in natural order
- Listen to `chrome.tabGroups` events for real-time sync

### Phase 2: Drag-and-Drop Between Groups
- Extend drag-drop to support moving tabs into groups
- Extend drag-drop to support moving tabs out of groups (ungroup)
- Add visual feedback during drag to indicate drop target
- Integrate with `chrome.tabs.group()` and `chrome.tabs.ungroup()` APIs

## Implementation Notes

### Mixed Order Display
Display matches Chrome's tab bar order:
- Fetch all tabs and groups
- Sort by tab index to maintain browser order
- Grouped tabs: render under their group header (indented)
- Ungrouped tabs (`groupId === -1`): render at root level between groups

### Drag-Drop Behavior
- **Reorder within group**: Move tab to new position, call `chrome.tabs.move()`
- **Move to another group**: Drop on group header or grouped tab, call `chrome.tabs.group({ tabIds, groupId })`
- **Ungroup (move out of group)**: Drop on ungrouped tab or empty space under "Active Tabs", call `chrome.tabs.ungroup(tabIds)`
- Visual feedback during drag indicates drop target (group or ungrouped position)
