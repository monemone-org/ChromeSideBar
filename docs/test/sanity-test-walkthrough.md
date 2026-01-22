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

### Phase 1: Pinned Sites (5 min)

**Verify imported pinned sites**
- [ ] Check: 5 pinned sites visible (Google, GitHub, YouTube, Gmail with red icon, Calendar with blue icon)
- [ ] Click Google pin → should activate or open Google tab `[1.3]`
- [ ] Cmd+click GitHub pin → should open new tab `[1.7]`
- [ ] Shift+click YouTube pin → should open new window (close it after) `[1.3]`

**Test pinned site actions**
- [ ] Right-click Gmail (red Mail icon) → click "Reset Favicon" → icon should change to Gmail's default favicon `[1.8]`
- [ ] Right-click any pin → click "Edit" → change color → Save → verify icon color changed `[1.5]`
- [ ] Right-click Google pin → click "Duplicate" → should see two Google pins `[1.9]`
- [ ] Right-click the duplicate → click "Unpin" → should be removed `[1.6]`
- [ ] Right-click a pinned site with tab loaded → click "Move to New Window" → tab moves to new window `[1.10]`
- [ ] Drag GitHub pin to a different position → verify order persists after refresh `[1.4]`

**Pin from tabs**
- [ ] Right-click any tab in Active Tabs → click "Pin to Sidebar" → site appears in pinned bar `[1.2]`

---

### Phase 2: Active Tabs (10 min)

**Basic tab operations**
- [ ] Click an inactive tab → should activate in browser `[3.1]`
- [ ] Hover over a tab → X button appears → click to close `[3.2]`
- [ ] Right-click a tab → click "Duplicate" → new tab opens with same URL `[3.15]`
- [ ] Drag a tab up/down → drop indicator shows → release → tab moves to new position `[3.8]`

**Tab grouping**
- [ ] Right-click Stack Overflow tab → "Add to Group" → "Create New Group" `[3.3]`
- [ ] Name it "Dev Docs", pick blue color → Create
- [ ] Right-click MDN tab → "Add to Group" → select "Dev Docs" `[3.4]`
- [ ] Verify both tabs are now in the blue "Dev Docs" group
- [ ] Click group chevron → group collapses → click again → expands `[3.5]`

**Group management**
- [ ] Right-click "Dev Docs" header → "Rename Group" → change to "Documentation" `[3.6]`
- [ ] Right-click header → "Change Color" → pick green → verify color changes `[3.7]`
- [ ] Right-click header → "Sort by Name (A-Z)" → tabs should sort `[3.19]`
- [ ] Right-click header → "Save Group to Bookmarks" → pick a folder → verify bookmarks created `[3.20]`

**Drag operations**
- [ ] Drag a grouped tab above the group header → should become ungrouped `[3.10]`
- [ ] Drag an ungrouped tab onto the group header → should join the group `[3.9]`
- [ ] Drag the group header up/down → entire group should move `[3.11]`

**Tab context menu extras**
- [ ] Right-click a tab → "Add to Bookmark" → pick folder → verify bookmark created `[3.16]`
- [ ] Right-click middle tab → "Close Tabs Before" → tabs above it close `[3.17]`
- [ ] Create 3 new tabs → right-click middle one → "Close Others" → only that tab remains `[3.18]`
- [ ] Right-click a tab → "Move to Space" → select a space → tab moves to that space's group `[3.21]`

**Tab panel header**
- [ ] Right-click "Active Tabs" header → "Sort by Domain (A-Z)" → tabs sorted by domain `[3.12]`

**YouTube chapters** (if YouTube tab with chapters is open)
- [ ] Look for chapters icon on YouTube tab row → click it → chapter list popup appears `[3.13]`
- [ ] Click a chapter → video jumps to that timestamp `[3.13]`

---

### Phase 3: Bookmarks (10 min)

**Navigation**
- [ ] Click folder chevron → folder expands → click again → collapses `[2.1]`
- [ ] Click a bookmark → opens in current tab `[2.2]`
- [ ] Cmd+click a bookmark → opens in new tab `[2.2]`
- [ ] Shift+click a bookmark → opens in new window (close after) `[2.2]`

**Folder operations**
- [ ] Right-click "Shopping" folder → "New Folder" → name it "Electronics" `[2.3]`
- [ ] Right-click "Electronics" → "Rename Folder" → change to "Tech Deals" `[2.4]`
- [ ] Right-click any folder → "Duplicate" → copy of folder with all contents appears `[2.12]`
- [ ] Right-click "Tech Deals" → "Delete" → folder removed `[2.8]`

**Bookmark operations**
- [ ] Right-click Work folder → "New Bookmark" → enter "Notion" + https://notion.so → Save `[2.9]`
- [ ] Right-click the new Notion bookmark → "Edit" → change title → Save `[2.10]`
- [ ] Right-click any bookmark → "Duplicate" → copy appears below `[2.11]`
- [ ] Right-click a bookmark → "Move Bookmark..." → select different folder `[2.13]`
- [ ] Right-click a bookmark → "Pin to Sidebar" → appears in pinned bar `[1.1]`

**Folder bulk actions**
- [ ] Right-click a folder with 3+ bookmarks → "Sort by Name" → alphabetized `[2.5]`
- [ ] Right-click folder → "Expand All" → all subfolders expand `[2.14]`
- [ ] Right-click folder → "Open All in Tabs" → all bookmarks open `[2.15]`
- [ ] Right-click folder → "Open All in New Window" → new window opens with all bookmarks `[2.16]`
- [ ] Right-click folder → "Open as Tab Group" → creates new group with folder name `[2.17]`

**Drag and drop**
- [ ] Drag a bookmark over a folder → "into" ring appears → drop → moves inside `[2.6]`
- [ ] Drag a folder over another folder → drop → nested inside `[2.7]`

---

### Phase 4: Spaces (8 min)

**Verify imported spaces**
- [ ] Check: Space bar shows "All" + Work (blue) + Personal (green) + Research (purple)

**Space switching**
- [ ] Click "Work" space → only Work folder bookmarks visible `[12.2]`
- [ ] Click "Personal" space → only Personal folder bookmarks visible `[12.2]`
- [ ] Click "All" → all bookmarks and tabs visible `[12.2]`
- [ ] Two-finger swipe left/right → cycles through spaces `[12.2]`

**Space with tab groups**
- [ ] While in "Work" space, create a tab group named "Work" `[12.3]`
- [ ] Add some work-related tabs to this group
- [ ] Switch to "All" space → group visible `[12.3]`
- [ ] Switch back to "Work" space → only Work group tabs shown `[12.3]`

**Space management**
- [ ] Right-click "Research" space → "Edit Space" → change icon/color → Save `[12.4]`
- [ ] Drag "Personal" space icon left → reorder in space bar `[12.5]`
- [ ] Drag a tab onto "Work" space icon → tab moves to Work group `[12.5]`

**Create new space**
- [ ] Click "+" in space bar → select Shopping folder → pick icon/color → Create `[12.1]`
- [ ] Verify new space appears, filters correctly

**Delete space**
- [ ] Right-click "Shopping" space → "Delete Space" `[12.4]`
- [ ] Verify space removed but bookmarks/tabs unchanged

**Space visual indicators**
- [ ] Select a space with color → title header shows space color `[12.6]`
- [ ] Open folder picker → linked folders show space indicators `[12.6]`
- [ ] Check tab group linked to space → group header shows space icon `[12.6]`

---

### Phase 5: Multi-Selection (5 min)

**Selection mechanics**
- [ ] Click tab 1 → selected (highlighted) `[10.1]`
- [ ] Cmd+click tab 2 → both selected `[10.1]`
- [ ] Cmd+click tab 2 again → deselected `[10.1]`
- [ ] Click tab 1, Shift+click tab 4 → range selected `[10.1]`
- [ ] Press Escape → all deselected `[10.1]`

**Multi-selection tabs**
- [ ] Select 3 tabs → drag one → all move together with count badge `[10.2]`
- [ ] Select 2 tabs → right-click → "Pin to Sidebar" → both pinned `[10.3]`
- [ ] Select 2 tabs → right-click → "Close" → confirmation → all close `[10.3]`

**Multi-selection bookmarks**
- [ ] Select 3 bookmarks in same folder `[10.4]`
- [ ] Right-click → "Open In New Tab" → all open `[10.4]`
- [ ] Select 2 bookmarks → right-click → "Move Bookmark..." → pick folder → all move `[10.4]`
- [ ] Select 2 bookmarks → right-click → "Delete" → confirmation → all deleted `[10.4]`

---

### Phase 6: Settings (3 min)

- [ ] Click gear icon → Settings opens `[4.1]`
- [ ] Change font size to 18 → text resizes immediately `[4.2]`
- [ ] Change pinned icon size to 32 → icons resize `[4.3]`
- [ ] Toggle "Hide Other Bookmarks" → folder hides/shows `[4.4]`
- [ ] Toggle "Open Bookmarks in New Tab" → verify behavior `[4.5]`
- [ ] Toggle "Sort Groups First" → groups move above/below ungrouped tabs `[4.8]`
- [ ] Toggle "Use Spaces" off → space bar disappears → toggle on → space bar reappears `[4.9]`
- [ ] Change bookmark open mode (Active Tab / New Tab / Arc Style) → verify each mode's behavior `[4.10]`
- [ ] Click "Export" → JSON file downloads → verify valid JSON `[4.6]`
- [ ] Click "Import" → select valid JSON file → pinned sites/spaces imported `[4.7]`

---

### Phase 7: Keyboard & Navigation (3 min)

**Dialogs**
- [ ] Open Settings → press Escape → closes `[5.1]`
- [ ] Open Edit Pinned Site → press Escape → closes `[5.1]`

**Drag cancel**
- [ ] Start dragging a tab → press Escape → drag cancels `[5.2]`

**Tab history**
- [ ] Click several different tabs in sequence
- [ ] Click back arrow in toolbar → goes to previous tab `[6.1]`
- [ ] Click forward arrow → goes forward in history `[6.1]`
- [ ] Hold back arrow → dropdown shows tab history `[6.2]`
- [ ] Press Cmd+Shift+< → navigates back `[5.3]` `[6.3]`
- [ ] Press Cmd+Shift+> → navigates forward `[5.3]` `[6.3]`

**Panel toggle**
- [ ] Press Cmd+Shift+E → sidebar closes `[5.3]`
- [ ] Press Cmd+Shift+E → sidebar opens `[5.3]`

---

### Phase 8: Search & Filter (2 min)

**Text search**
- [ ] Click search icon → input appears `[7.1]`
- [ ] Type "git" → only matching tabs/bookmarks shown `[7.1]`
- [ ] Clear search → all items visible `[7.1]`

**Audio filter**
- [ ] Play audio/video in YouTube tab `[3.14]`
- [ ] Speaker icon appears in toolbar `[3.14]`
- [ ] Click speaker → only audible tabs shown `[3.14]`
- [ ] Stop audio → tab still in history `[3.14]`
- [ ] Click speaker again → filter clears `[3.14]`

---

### Phase 9: Dark Mode (1 min)

- [ ] Set system to light mode → sidebar light theme `[8.1]`
- [ ] Set system to dark mode → sidebar dark theme `[8.1]`
- [ ] Verify text readable, icons visible, no broken contrast `[8.1]`

---

### Phase 10: Edge Cases (3 min)

**Empty states**
- [ ] Remove all pinned sites → bar shows empty state `[9.1]`
- [ ] Open empty folder → expandable but empty `[9.1]`

**Special folders**
- [ ] Right-click "Bookmarks Bar" → no Delete/Rename options `[9.2]`
- [ ] Right-click "Other Bookmarks" → no Delete/Rename options `[9.2]`
- [ ] Try to drag "Bookmarks Bar" → not draggable `[9.2]`

**Long content**
- [ ] Create bookmark with very long title → truncates with ellipsis `[9.3]`
- [ ] Open 50+ tabs → list scrolls, no lag `[9.3]`

**UI state persistence**
- [ ] Expand some folders, close sidebar, reopen → folder expand states preserved `[9.4]`
- [ ] Collapse some tab groups, reload sidebar → group expand states preserved `[9.4]`

**Cross-window sync**
- [ ] Open a second Chrome window with sidebar
- [ ] Pin a site in window 1 → verify it appears in window 2's sidebar `[9.5]`
- [ ] Delete a bookmark in window 1 → verify removed from window 2 `[9.5]`
- [ ] Create a space in window 1 → verify it appears in window 2's space bar `[9.5]`

---

### Phase 11: Orphaned Tabs (if applicable)

This requires simulating orphaned tabs (Chrome restart with persistent tabs).

- [ ] Quit Chrome with tabs that belong to LiveBookmarks groups `[11.1]`
- [ ] Relaunch Chrome → orphaned tabs appear as normal ungrouped tabs (not in special group) `[11.1]`

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
