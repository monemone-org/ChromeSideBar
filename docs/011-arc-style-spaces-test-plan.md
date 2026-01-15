# Arc-Style Spaces Test Plan (Phases 1-5)

Manual test plan for the Spaces feature. A Space links a bookmark folder to a Chrome tab group, creating isolated workspaces.

## Prerequisites

- Create a test bookmark folder (e.g., "Bookmarks Bar/TestSpace") with 3-5 bookmarks
- Have some existing tabs open in the browser

---

## Phase 1: Core Infrastructure

### 1.1 Space Creation
- [ ] Click "+" button in SpaceBar
- [ ] SpaceEditDialog opens in create mode
- [ ] Enter name, pick icon, pick color
- [ ] New space appears in SpaceBar after "All"

### 1.2 Space Persistence
- [ ] Create a space, close sidebar, reopen - space still exists
- [ ] Create multiple spaces - order is preserved after reload

### 1.3 Space Deletion
- [ ] Right-click space icon → Delete
- [ ] Space is removed from SpaceBar
- [ ] Associated bookmarks and tabs remain (not deleted)

---

## Phase 2: SpaceBar UI

### 2.1 Layout
- [ ] SpaceBar appears at bottom of sidebar
- [ ] "SPACE" label on left (vertical text)
- [ ] "+" button on right (fixed position)
- [ ] Space icons in scrollable middle area

### 2.2 "All" Space
- [ ] "All" space always appears first
- [ ] Cannot delete "All" space (no context menu)
- [ ] Cannot edit "All" space

### 2.3 Space Icons
- [ ] Each space shows colored icon
- [ ] Active space has solid background (badge color)
- [ ] Inactive spaces have light background
- [ ] Hover shows tooltip with space name

### 2.4 Space Switching
- [ ] Click space icon to switch
- [ ] Active space styling updates immediately
- [ ] Content area updates to show filtered content

### 2.5 Context Menu
- [ ] Right-click space icon shows menu
- [ ] "Edit" option present
- [ ] "Delete" option present (with danger styling)

---

## Phase 3: Filtering

### 3.1 Bookmark Filtering - "All" Space
- [ ] Shows all bookmark folders and bookmarks
- [ ] All bookmark operations work normally

### 3.2 Bookmark Filtering - Active Space
- [ ] Only shows bookmarks from space's linked folder
- [ ] Folder is displayed as collapsible item
- [ ] Folder auto-expands when switching to space
- [ ] Nested folders within space folder are visible

### 3.3 Bookmark Filtering - Missing Folder
- [ ] If space's folder doesn't exist, shows error message
- [ ] Message: `Folder "path" not found. Pick new folder`
- [ ] Uses same font size as rest of extension

### 3.4 Tab Filtering - "All" Space
- [ ] Shows all tabs (grouped and ungrouped)
- [ ] Tab groups show with headers and colored styling

### 3.5 Tab Filtering - Active Space
- [ ] Only shows tabs in space's tab group
- [ ] Tabs shown without group header (flat list)
- [ ] If no tab group exists, shows empty list

### 3.6 Pinned Sites Filtering
- [ ] Pinned sites respect filterLiveTabs, filterAudible, filterText
- [ ] Pinned sites are NOT filtered by active space

---

## Phase 4: Tab Group Integration

### 4.1 New Tab in Space (+ Button)
- [ ] Click "+ New Tab" in TabList while in a space
- [ ] New tab is added to space's tab group
- [ ] If no group exists, creates one with space name/color

### 4.2 New Tab in Space (Cmd+T)
- [ ] Press Cmd+T while in a space
- [ ] New tab is added to space's tab group
- [ ] Tab appears in Chrome's tab bar under the group

### 4.3 New Tab in "All" Space
- [ ] Click "+ New Tab" in "All" space
- [ ] New tab is created ungrouped
- [ ] Cmd+T creates ungrouped tab

### 4.4 Live Bookmark/Pinned Tabs Stay Ungrouped
- [ ] Open a bookmark while in a space
- [ ] The tab is NOT added to space's group
- [ ] Tab appears ungrouped in Chrome's tab bar
- [ ] Tab shows in Bookmarks section with loaded indicator

### 4.5 Tab Group Restoration After Reload
- [ ] Create a space with tabs in its group
- [ ] Reload extension (or close/reopen sidebar)
- [ ] Switch to the space
- [ ] Tab group mapping is restored (finds group by name)
- [ ] Tabs in the group are visible

### 4.6 Lazy Tab Group Creation
- [ ] Create a new space linked to a folder
- [ ] Switch to the space (no tab group exists yet)
- [ ] TabList shows empty
- [ ] Open first tab (Cmd+T or "+ New Tab")
- [ ] Tab group is created with space name and color

---

## Tab Operations in Space

### Sort Tabs
- [ ] In space: Sort by Domain sorts only space's tabs
- [ ] Group name is preserved after sorting
- [ ] In "All": Sort works on all visible tabs

### Close All Tabs
- [ ] In space: "Close All Tabs" closes only space's tabs
- [ ] Other tabs/groups remain open
- [ ] In "All": Closes all tabs

### Close Tabs Before/After/Others
- [ ] Operations only affect visible tabs in current view
- [ ] In space: Only space's tabs are affected
- [ ] In "All": All visible tabs are affected

---

## Phase 5: SpaceEditDialog

### 5.1 Create Space Dialog
- [ ] Click "+" button in SpaceBar
- [ ] Dialog opens with title "Create Space"
- [ ] Name field is empty and focused
- [ ] Icon picker shows current icon preview and searchable grid
- [ ] Icon search filters icons as you type
- [ ] Color picker shows 9 color circles (grey, blue, red, yellow, green, pink, purple, cyan, orange)
- [ ] Folder shows "Other Bookmarks/{name}" in italic with message "This folder will be created when saved"

### 5.2 Create Space with Default Folder
- [ ] Enter name "MySpace"
- [ ] Folder preview updates to "Other Bookmarks/MySpace"
- [ ] Click Create
- [ ] New folder "MySpace" is created under "Other Bookmarks"
- [ ] Space is created and becomes active

### 5.3 Create Space with Existing Folder
- [ ] Click "+" button
- [ ] Enter name
- [ ] Click "Pick existing folder" button
- [ ] FolderPickerDialog opens
- [ ] Select existing folder
- [ ] Dialog shows selected folder path (no longer italic)
- [ ] Create space - uses existing folder (no new folder created)

### 5.4 Edit Space Dialog
- [ ] Right-click space icon → Edit
- [ ] Dialog opens with title "Edit Space"
- [ ] Fields are populated with space's current values
- [ ] Save button says "Save" (not "Create")

### 5.5 Edit Space Properties
- [ ] Change name → space name updates
- [ ] Change icon → space icon updates in SpaceBar
- [ ] Change color → space color updates in SpaceBar
- [ ] Change folder → space shows new folder's bookmarks

### 5.6 Delete Space
- [ ] Right-click space icon → Delete
- [ ] Confirmation dialog appears
- [ ] Shows space name being deleted
- [ ] Click Cancel → dialog closes, space remains
- [ ] Click Delete → space removed, switches to "All"

### 5.7 Delete Preserves Data
- [ ] Delete a space that has tabs and bookmarks
- [ ] Tabs remain open (not closed)
- [ ] Bookmark folder remains (not deleted)

### 5.8 Validation
- [ ] Create with empty name → shows error, cannot save
- [ ] Edit existing space folder to one that doesn't exist → shows error

### 5.9 Dialog Scrolling
- [ ] Shrink Chrome window vertically
- [ ] SpaceEditDialog content scrolls, header and footer buttons remain visible
- [ ] SettingsDialog content scrolls, Apply/Cancel buttons remain visible
- [ ] ImportDialog content scrolls when importing large backup
- [ ] PinnedIcon edit modal scrolls, Save/Cancel buttons remain visible

---

## Edge Cases

### Tab Group Manually Closed
- [ ] Manually close the space's tab group in Chrome
- [ ] Switch away and back to the space
- [ ] Creating a new tab recreates the group

### Multiple Windows
- [ ] Open sidebar in two windows
- [ ] Each window can have different active space
- [ ] Tab group mappings are per-window

### Space Color Matches Tab Group
- [ ] Space color should match its tab group color in Chrome
- [ ] Edit space color → tab group color updates when new tabs are added

---

## Test Matrix

| Action | "All" Space | Active Space |
|--------|-------------|--------------|
| View bookmarks | All folders | Space's folder only |
| View tabs | All tabs | Space's group only |
| New tab (button) | Ungrouped | In space group |
| New tab (Cmd+T) | Ungrouped | In space group |
| Open bookmark | Ungrouped | Ungrouped |
| Open pinned site | Ungrouped | Ungrouped |
| Close all tabs | All tabs | Space's tabs only |
| Sort tabs | All visible | Space's tabs only |
