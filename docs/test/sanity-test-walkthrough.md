# Sanity Test Walkthrough

Step-by-step guide using test data to verify extension functionality before release.

---

## Setup

### 1. Create Test Bookmarks

Before importing, create these bookmark folders in Chrome:

```
Bookmarks Bar/
├── Work/
│   ├── Jira (https://jira.atlassian.com)
│   ├── Confluence (https://confluence.atlassian.com)
│   └── Slack (https://slack.com)
├── Personal/
│   ├── Netflix (https://netflix.com)
│   ├── Spotify (https://spotify.com)
│   └── Reddit (https://reddit.com)
├── Research/
│   ├── Wikipedia (https://wikipedia.org)
│   ├── arXiv (https://arxiv.org)
│   └── Google Scholar (https://scholar.google.com)
└── Shopping/
    ├── Amazon (https://amazon.com)
    └── eBay (https://ebay.com)
```

### 2. Import Test Data

1. Open the sidebar (Cmd+Shift+E)
2. Click the gear icon (Settings)
3. Click "Import"
4. Select `docs/test-data.json`
5. Choose "Replace existing" for pinned sites
6. Choose "Append to existing" for spaces
7. Click Import

### 3. Open Test Tabs

Open these tabs for testing:

- Tab 1: https://www.google.com (keep as homepage)
- Tab 2: https://github.com
- Tab 3: https://stackoverflow.com
- Tab 4: https://developer.mozilla.org
- Tab 5: https://www.youtube.com (video with chapters for YouTube test)
- Tab 6: Any site with audio/video (for audio filter test)

---

## Walkthrough

### Phase 0: Welcome Dialog (2 min)

**Fresh install trigger**
- [x] Clear localStorage key `sidebar-has-seen-welcome` (or use fresh Chrome profile)
- [x] Open sidebar → Welcome dialog appears automatically `[0.1]`

**Page 1: Welcome overview**
- [x] Extension icon displayed at top
- [x] "Arc browser's sidebar experience for Chrome" description shown
- [x] Feature preview list shows: Pinned Sites, Live Bookmarks, Spaces (each with icon)
- [x] 4 page indicator dots at bottom, first dot highlighted
- [x] Only "Next →" button visible (no Prev on first page)

**Navigation**
- [x] Click "Next →" → Page 2 (Pinned Sites) with screenshot `[0.2]`
- [x] Click "← Prev" → back to Page 1 `[0.2]`
- [x] Click 3rd dot → jumps to Page 3 (Live Bookmarks) `[0.2]`
- [x] Click 4th dot → jumps to Page 4 (Spaces) `[0.2]`

**Page content verification**
- [x] Page 2: "Pinned Sites" title, description, screenshot visible
- [x] Page 3: "Live Bookmarks" title, description, screenshot visible
- [x] Page 4: "Spaces" title, description, screenshot visible

**Completion**
- [x] On last page, button shows "Get Started" instead of "Next →"
- [x] Click "Get Started" → dialog closes, sidebar shows `[0.3]`
- [x] Reopen sidebar → Welcome dialog does NOT appear again `[0.3]`

**Re-view welcome**
- [x] Click gear icon → About → click "Show Welcome" → Welcome dialog opens `[0.4]`
- [x] Press Escape → dialog closes `[0.4]`

---

### Phase 1: Pinned Sites (5 min)

**Verify imported pinned sites**
- [x] Check: 5 pinned sites visible (Google, GitHub, YouTube, Gmail with red icon, Calendar with blue icon)
- [x] Click Google pin → should activate or open Google tab `[1.3]`
- [x] Cmd+click GitHub pin → should open new tab `[1.7]`
- [x] Shift+click YouTube pin → should open new window (close it after) `[1.3]`

**Test pinned site actions**
- [x] Right-click Gmail (red Mail icon) → click "Reset Favicon" → icon should change to Gmail's default favicon `[1.8]`
- [x] Right-click any pin → click "Edit" → change color → Save → verify icon color changed `[1.5]`
- [x] Right-click Google pin → click "Duplicate" → should see two Google pins `[1.9]`
- [x] Right-click the duplicate → click "Unpin" → should be removed `[1.6]`
- [x] Right-click a pinned site with tab loaded → click "Move to New Window" → tab moves to new window `[1.10]`
- [x] Drag GitHub pin to a different position → verify order persists after refresh `[1.4]`

**Pin from tabs**
- [x] Right-click any tab in Active Tabs → click "Pin to Sidebar" → site appears in pinned bar `[1.2]`

---

### Phase 2: Active Tabs (10 min)

**Basic tab operations**
- [x] Click an inactive tab → should activate in browser `[3.1]`
- [x] Hover over a tab → X button appears → click to close `[3.2]`
- [x] Right-click a tab → click "Duplicate" → new tab opens with same URL `[3.15]`
- [x] Drag a tab up/down → drop indicator shows → release → tab moves to new position `[3.8]`

**Tab grouping**
- [x] Right-click Stack Overflow tab → "Add to Group" → "Create New Group" `[3.3]`
- [x] Name it "Dev Docs", pick blue color → Create
- [x] Right-click MDN tab → "Add to Group" → select "Dev Docs" `[3.4]`
- [x] Verify both tabs are now in the blue "Dev Docs" group
- [x] Click group chevron → group collapses → click again → expands `[3.5]`

**Group management**
- [x] Right-click "Dev Docs" header → "Rename Group" → change to "Documentation" `[3.6]`
- [x] Right-click header → "Change Color" → pick green → verify color changes `[3.7]`
- [x] Right-click header → "Sort by Name (A-Z)" → tabs should sort `[3.19]`
- [x] Right-click header → "Save Group to Bookmarks" → pick a folder → verify bookmarks created `[3.20]`

**Drag operations**
- [x] Drag a grouped tab above the group header → should become ungrouped `[3.10]`
- [x] Drag an ungrouped tab onto the group header → should join the group `[3.9]`
- [x] Drag the group header up/down → entire group should move `[3.11]`

**Tab context menu extras: Group**
- [x] Right-click a tab → "Add to Bookmark" → pick folder → verify bookmark created `[3.16]`
- [x] Right-click middle tab → "Close Tabs Before" → tabs above it close `[3.17]`
- [x] Right-click middle tab → "Close Tabs After" → tabs below it close `[3.17]`
- [x] Create 3 new tabs → right-click middle one → "Close Others" → only that tab remains `[3.18]`
- [x] Right-click a tab → "Add to Group" → select a group → tab moves to that group `[3.21]`

**Tab panel header**
- [x] Right-click "Active Tabs" header → "Sort by Domain (A-Z)" → tabs sorted by domain `[3.12]`

---

### Phase 3: Bookmarks (10 min)

**Navigation**
- [x] Click folder chevron → folder expands → click again → collapses `[2.1]`
- [x] Click a bookmark → opens in current tab `[2.2]`
- [x] Right-click "Open in new tab" a bookmark → opens in new tab 
- [x] Right-click "Open in new window" a bookmark → opens in new window (close after)
- [x] Double-click a bookmark → opens in new tab 
- [x] Click "Open tab" button on a bookmark → opens in new tab 

**Folder operations**
- [x] Right-click "Other Bookmarks" folder → "New Folder" → name it "Shopping" `[2.3]`
- [x] Right-click "Shopping" folder → "New Folder" → name it "Electronics" `[2.3]`
- [x] Right-click "Electronics" → "Rename Folder" → change to "Tech Deals" `[2.4]`
- [x] Right-click "Tech Deals" → "Delete" → folder removed `[2.8]`

**Bookmark operations**
- [x] Right-click Work folder → "New Bookmark" → enter "Notion" + https://notion.so → Save `[2.9]`
- [x] Right-click the new Notion bookmark → "Edit" → change title → Save `[2.10]`
- [x] Right-click any bookmark → "Duplicate" → copy appears below `[2.11]`
- [x] Right-click a bookmark → "Move Bookmark..." → select different folder `[2.13]`
- [x] Right-click a bookmark → "Pin to Sidebar" → appears in pinned bar `[1.1]`

**Folder bulk actions**
- [x] Right-click a folder with 3+ bookmarks → "Sort by Name" → alphabetized `[2.5]`
- [x] Right-click folder → "Expand All" → all subfolders expand `[2.14]`
- [x] Right-click folder → "Open All in Tabs" → all bookmarks open in active space `[2.15]`
- [x] Right-click folder → "Open All in New Window" → new window opens with all bookmarks `[2.16]`
- [x] Right-click folder → "Open as Tab Group" → creates new group with folder name `[2.17]`

**Drag and drop**
- [x] Drag a bookmark over a folder → "into" ring appears → drop → moves inside `[2.6]`
- [x] Drag a folder over another folder → drop → nested inside `[2.7]`

---

### Phase 4: Spaces (8 min)

**Verify imported spaces**
- [x] Check: Space bar shows "All" + Work (blue) + Personal (green) + Research (purple)

**Space switching**
- [x] Click "Work" space → only Work folder bookmarks visible `[12.2]`
- [x] Click "Personal" space → only Personal folder bookmarks visible `[12.2]`
- [x] Click "All" → all bookmarks and tabs visible `[12.2]`
- [x] Two-finger swipe left/right → cycles through spaces `[12.2]`

**Space with tab groups**
- [x] While in "Work" space, create a tab group named "Work" `[12.3]`
- [x] Add some work-related tabs to this group
- [x] Switch to "All" space → group visible `[12.3]`
- [x] Switch back to "Work" space → only Work group tabs shown `[12.3]`

**Space management**
- [x] Right-click "Research" space → "Edit Space" → change icon/color → Save `[12.4]`
- [x] Drag "Personal" space icon left → reorder in space bar `[12.5]`
- [x] Drag a tab onto "Work" space icon → tab moves to Work group `[12.5]`

**Create new space**
- [x] Click "+" in space bar → select Shopping folder → pick icon/color → Create `[12.1]`
- [x] Verify new space appears, filters correctly

**Delete space**
- [x] Right-click "Shopping" space → "Delete Space" `[12.4]`
- [x] Verify space removed but bookmarks/tabs unchanged

**Space visual indicators**
- [x] Select a space with color → title header shows space color `[12.6]`
- [x] Edit Space -> Open folder picker → linked folders show space indicators `[12.6]`
- [x] All Space -> Check tab group linked to space → group header shows space icon `[12.6]`

---

### Phase 5: Multi-Selection (5 min)

**Selection mechanics**
- [x] Click tab 1 → selected (highlighted) `[10.1]`
- [x] Cmd+click tab 2 → both selected `[10.1]`
- [x] Cmd+click tab 2 again → deselected `[10.1]`
- [x] Click tab 1, Shift+click tab 4 → range selected `[10.1]`
- [x] Press Escape → all deselected `[10.1]`

**Multi-selection tabs**
- [x] Select 3 tabs → drag one → all move together with count badge `[10.2]`
- [x] Select 2 tabs → right-click → "Pin to Sidebar" → both pinned `[10.3]`
- [x] Select 2 tabs → right-click → "Close" → confirmation → all close `[10.3]`

**Multi-selection bookmarks**
- [x] Select 3 bookmarks in same folder `[10.4]`
- [x] Right-click → "Open In New Tab" → all open `[10.4]`
- [x] Select 2 bookmarks → right-click → "Move Bookmark..." → pick folder → all move `[10.4]`
- [x] Select 2 bookmarks → right-click → "Delete" → confirmation → all deleted `[10.4]`
- [x] Select 3 tabs → drop to a bookmark folder → 3 bookmars are created

---

### Phase 6: Settings (3 min)

- [x] Click gear icon → Settings opens `[4.1]`
- [x] Change font size to 18 → text resizes immediately `[4.2]`
- [x] Change pinned icon size to 32 → icons resize `[4.3]`
-     Change bookmark open mode → verify each mode's behavior `[4.10]`
        - [x] Active Tab 
        - [x] New Tab 
        - [x] Arc Style - single click open live tab: ON, single click to open tab
        - [x] Arc Style - single click open live tab: OFF, double click to open tab
- [x] Toggle "Sort Groups First" → groups move above/below ungrouped tabs `[4.8]`
- [x] Toggle "Use Spaces" off → space bar disappears → toggle on → space bar reappears `[4.9]`
- [x] Click "Export" → JSON file downloads → verify valid JSON `[4.6]`
- [x] Click "Import" → select valid JSON file → pinned sites/spaces imported `[4.7]`

---

### Phase 7: Keyboard & Navigation (3 min)

**Dialogs**
- [x] Open Settings → press Escape → closes `[5.1]`
- [x] Open Edit Pinned Site → press Escape → closes `[5.1]`

**Drag cancel**
- [x] Start dragging a tab → press Escape → drag cancels `[5.2]`

**Tab history**
- [x] Click several different tabs in sequence
- [x] Click back arrow in toolbar → goes to previous tab `[6.1]`
- [x] Click forward arrow → goes forward in history `[6.1]`
- [x] Hold back arrow → dropdown shows tab history `[6.2]`
- [x] Press Cmd+Shift+< → navigates back `[5.3]` `[6.3]`
- [x] Press Cmd+Shift+> → navigates forward `[5.3]` `[6.3]`

**Panel toggle**
- [x] Press Cmd+Shift+E → sidebar closes `[5.3]`
- [x] Press Cmd+Shift+E → sidebar opens `[5.3]`

---

### Phase 8: Search & Filter (2 min)

**Text search**
- [x] Click search icon → input appears `[7.1]`
- [x] Type "git" → only matching tabs/bookmarks shown `[7.1]`
- [x] Clear search → all items visible `[7.1]`

**Audio filter**
- [x] Play audio/video in YouTube tab `[3.14]`
- [x] Speaker icon appears in toolbar `[3.14]`
- [x] Click speaker → dropdown with audible tabs shown `[3.14]`
- [x] Stop audio → tab still in history `[3.14]`

---

### Phase 9: Dark Mode (1 min)

- [x] Set system to light mode → sidebar light theme `[8.1]`
- [x] Set system to dark mode → sidebar dark theme `[8.1]`
- [x] Verify text readable, icons visible, no broken contrast `[8.1]`

---

### Phase 10: Edge Cases (3 min)

**Empty states**
- [x] Remove all pinned sites → bar shows empty state `[9.1]`
- [x] Open empty folder → expandable but empty `[9.1]`

**Special folders**
- [x] Right-click "Bookmarks Bar" → no Delete/Rename options `[9.2]`
- [x] Right-click "Other Bookmarks" → no Delete/Rename options `[9.2]`
- [x] Try to drag "Bookmarks Bar" → not draggable `[9.2]`

**Long content**
- [x] Create bookmark with very long title → truncates with ellipsis `[9.3]`
- [x] Create bookmark with url=google.com
- [x] Create bookmark with url=http://google.com
- [x] Create bookmark with url=https://google.com
- [x] Open 50+ tabs → list scrolls, no lag `[9.3]`

**UI state persistence**
- [x] Expand some folders, close sidebar, reopen → folder expand states preserved `[9.4]`
- [x] Create 2 spaces using the same folder. Expand folders in 1 space -> 2nd space shoud have its own expand states.
- [x] Collapse some tab groups, close sidebar, reopen → group expand states preserved `[9.4]`

**Cross-window sync**
- [x] Open a second Chrome window with sidebar
- [x] Pin a site in window 1 → verify it appears in window 2's sidebar `[9.5]`
- [x] Delete a bookmark in window 1 → verify removed from window 2 `[9.5]`
- [x] Create a space in window 1 → verify it appears in window 2's space bar `[9.5]`
- [x] Open a tab in Space A in window 1 -> tab in Group A in window 1. 
      Then open anoather tab in Space A in window 2 -> tab in Group A in window 2. 

---

## Post-Test Cleanup

1. Remove test pinned sites (right-click → Unpin)
2. Delete test bookmark folders if desired
3. Delete test spaces if desired
4. Close extra tabs

---

## Quick Pre-Release Checklist

### Critical Path `[13.1]`

| Test | Pass |
|------|------|
| Extension loads without console errors | [ ] |
| Pinned sites load and persist | [ ] |
| Bookmarks display correctly | [ ] |
| Tabs list shows all open tabs | [ ] |
| Click tab activates it | [ ] |
| Close tab removes it | [ ] |
| Drag and drop works for tabs | [ ] |
| Drag and drop works for bookmarks | [ ] |
| Settings dialog opens and saves | [ ] |
| Dark mode matches system theme | [ ] |

### Common Regressions `[13.2]`

| Test | Pass |
|------|------|
| Multi-selection works with Cmd/Ctrl+click | [ ] |
| Context menus show correct options | [ ] |
| Dialogs close with Escape key | [ ] |
| Cross-window sync for pins/bookmarks | [ ] |
| Spaces filter correctly | [ ] |
