---
created: 2025-12-30
after-version: 1.0.132
status: draft
---

# Sanity Test Cases

Manual test cases to verify core functionality of the Chrome Sidebar extension.

## Prerequisites

- Chrome browser with extension loaded
- At least 3 open tabs
- At least one bookmark folder with bookmarks

---

## 1. Pinned Sites Bar

### 1.1 Pin a Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any bookmark | Context menu appears |
| 2 | Click "Pin to Sidebar" | Site appears in pinned bar with favicon |
| 3 | Refresh the sidebar | Pinned site persists |

### 1.2 Pin a Tab
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any tab in Active Tabs | Context menu appears |
| 2 | Click "Pin to Sidebar" | Site appears in pinned bar with favicon |

### 1.3 Open Pinned Site
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click a pinned site icon | Tab opens or activates if already open |
| 2 | Shift+click a pinned site | Opens in new window |

### 1.4 Reorder Pinned Sites
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag a pinned icon left/right | Drop indicator shows |
| 2 | Release | Icon moves to new position |
| 3 | Refresh sidebar | New order persists |

### 1.5 Edit Pinned Site
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click pinned site | Context menu appears |
| 2 | Click "Edit" | Edit modal opens |
| 3 | Change title | Title field updates |
| 4 | Click custom icon search | Icon picker appears |
| 5 | Select an icon | Icon updates in preview |
| 6 | Select a color | Icon color changes |
| 7 | Click Save | Modal closes, icon updates |

### 1.6 Unpin Site
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click pinned site | Context menu appears |
| 2 | Click "Unpin" | Site removed from bar |

### 1.7 Open in New Tab
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Cmd/Ctrl+click a pinned site | Opens in new tab (doesn't replace current) |
| 2 | Right-click pinned site, click "Open in New Tab" | Opens in new tab |

### 1.8 Reset Favicon
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click pinned site with custom icon | Context menu appears |
| 2 | Click "Reset Favicon" | Icon reverts to site's default favicon |

### 1.9 Duplicate Pinned Site
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any pinned site | Context menu appears |
| 2 | Click "Duplicate" | Copy appears next to original |

### 1.10 Move to New Window
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click pinned site (with tab loaded) | Context menu appears |
| 2 | Click "Move to New Window" | Tab moves to new browser window |

---

## 2. Bookmarks Panel

### 2.1 Expand/Collapse Folders
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click folder chevron | Folder expands, chevron rotates |
| 2 | Click chevron again | Folder collapses |

### 2.2 Open Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click a bookmark | Opens in current tab |
| 2 | Cmd/Ctrl+click a bookmark | Opens in new tab |
| 3 | Shift+click a bookmark | Opens in new window |

### 2.3 Create New Folder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any folder | Context menu appears |
| 2 | Click "New Folder" | Dialog opens |
| 3 | Enter folder name, click Save | New folder appears inside parent |

### 2.4 Rename Folder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click a non-special folder | Context menu with "Rename" option |
| 2 | Click "Rename Folder" | Dialog opens with current name |
| 3 | Change name, click Save | Folder name updates |

### 2.5 Sort Folder Contents
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click folder with multiple bookmarks | Context menu appears |
| 2 | Click "Sort by Name" | Bookmarks sorted alphabetically |

### 2.6 Drag Bookmark to Folder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag a bookmark over a folder | "Into" ring indicator appears |
| 2 | Release | Bookmark moves into folder |

### 2.7 Drag Subfolder to Folder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag a subfolder over another folder | "Into" ring indicator appears |
| 2 | Release | Subfolder moves into target folder |
| 3 | Expand target folder | Moved subfolder visible inside |

### 2.8 Delete Folder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click a non-special folder | Context menu with "Delete" option |
| 2 | Click "Delete" | Folder and contents removed |

### 2.9 New Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any folder | Context menu appears |
| 2 | Click "New Bookmark" | Dialog opens with title/URL fields |
| 3 | Enter title and URL, click Save | New bookmark appears in folder |

### 2.10 Edit Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any bookmark | Context menu appears |
| 2 | Click "Edit" | Dialog opens with title/URL fields |
| 3 | Modify title or URL, click Save | Bookmark updates |

### 2.11 Duplicate Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any bookmark | Context menu appears |
| 2 | Click "Duplicate" | Copy appears below original |

### 2.12 Duplicate Folder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any folder | Context menu appears |
| 2 | Click "Duplicate" | Copy of folder with all contents appears |

### 2.13 Move Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any bookmark | Context menu appears |
| 2 | Click "Move Bookmark..." | Folder picker dialog opens |
| 3 | Select destination folder | Bookmark moves to selected folder |

### 2.14 Expand All Subfolders
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click folder with nested subfolders | Context menu appears |
| 2 | Click "Expand All" | All nested subfolders expand |

### 2.15 Open All in Tabs
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click folder with bookmarks | Context menu appears |
| 2 | Click "Open All in Tabs" | All bookmarks open in new tabs |

### 2.16 Open All in New Window
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click folder with bookmarks | Context menu appears |
| 2 | Click "Open All in New Window" | New window opens with all bookmarks |

### 2.17 Open as Tab Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click folder with bookmarks | Context menu appears |
| 2 | Click "Open as Tab Group" | New tab group created with all bookmarks |
| 3 | Check group name | Uses folder name as group name |

---

## 3. Active Tabs Panel

### 3.1 Activate Tab
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click any inactive tab | Tab activates in browser, row highlights |

### 3.2 Close Tab
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover over any tab | X button appears |
| 2 | Click X button | Tab closes, removed from list |

### 3.3 Create Tab Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any ungrouped tab | Context menu appears |
| 2 | Click "Add to Group" | Group dialog opens |
| 3 | Click "Create New Group" | New group form appears |
| 4 | Enter name, select color, click Create | Tab moves to new group with colored badge |

### 3.4 Add Tab to Existing Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click ungrouped tab | Context menu appears |
| 2 | Click "Add to Group" | Dialog shows existing groups |
| 3 | Click a group name | Tab moves to that group |

### 3.5 Expand/Collapse Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click group chevron or name | Group collapses, tabs hidden |
| 2 | Click again | Group expands, tabs visible |

### 3.6 Rename Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click group header | Context menu appears |
| 2 | Click "Rename Group" | Dialog opens |
| 3 | Enter new name, click Save | Group name updates |

### 3.7 Change Group Color
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click group header | Context menu appears |
| 2 | Click "Change Color" | Color picker dialog opens |
| 3 | Click a color, click Save | Group badge and tab backgrounds update |

### 3.8 Drag Tab to Reorder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag a tab up/down | Drop indicator line shows |
| 2 | Release | Tab moves to new position |

### 3.9 Drag Tab Into Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag ungrouped tab over group header | "Into" ring indicator appears |
| 2 | Release | Tab joins the group |

### 3.10 Drag Tab Out of Group
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag grouped tab above group header | Before/after indicator shows |
| 2 | Release outside group | Tab becomes ungrouped |

### 3.11 Drag Group to Reorder
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag a group header up/down | Drop indicator line shows |
| 2 | Release | Group moves to new position with all its tabs |

### 3.12 Sort Tabs
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click "Active Tabs" header | Context menu appears |
| 2 | Click "Sort by Domain (A-Z)" | Tabs sorted by domain |

### 3.13 YouTube Chapters (if YouTube tab open)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a YouTube video with chapters | Chapters icon visible on tab row |
| 2 | Click chapters icon | Chapter list popup appears |
| 3 | Click a chapter | Video jumps to timestamp |

### 3.14 Audio Tabs Dropdown
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Play audio/video in any tab | Audible filter icon shows in toolbar |
| 2 | Click audible filter icon | Dropdown shows tabs with recent audio |
| 3 | Click a tab in dropdown | Tab activates |
| 4 | Stop audio, then recheck dropdown | Tab still shown in play history |

### 3.15 Duplicate Tab
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any tab | Context menu appears |
| 2 | Click "Duplicate" | New tab opens with same URL |

### 3.16 Add Tab to Bookmark
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any tab | Context menu appears |
| 2 | Click "Add to Bookmark" | Folder picker dialog opens |
| 3 | Select folder, click Save | Bookmark created in selected folder |

### 3.17 Close Tabs Before/After
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click a tab in middle of list | Context menu appears |
| 2 | Click "Close Tabs Before" | All tabs above it close |
| 3 | Right-click another tab | Context menu appears |
| 4 | Click "Close Tabs After" | All tabs below it close |

### 3.18 Close Other Tabs
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any tab | Context menu appears |
| 2 | Click "Close Others" | All other tabs close, clicked tab remains |

### 3.19 Sort Group Tabs
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click group header | Context menu appears |
| 2 | Click "Sort by Name (A-Z)" | Tabs within group sorted alphabetically |
| 3 | Click "Sort by Name (Z-A)" | Tabs within group sorted reverse |

### 3.20 Save Group to Bookmarks
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click group header | Context menu appears |
| 2 | Click "Save Group to Bookmarks" | Folder picker dialog opens |
| 3 | Select destination, click Save | New folder created with all group tabs as bookmarks |

### 3.21 Move Tab to Space
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click any tab (with spaces enabled) | Context menu appears |
| 2 | Click "Move to Space" | Space picker dialog opens |
| 3 | Select a space | Tab moves to that space's tab group |

---

## 4. Settings Dialog

### 4.1 Open Settings
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click gear icon (bottom-left) | Settings dialog opens |

### 4.2 Change Font Size
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change font size value (e.g., 16) | Sidebar text size updates immediately |
| 2 | Click Apply | Setting persists after refresh |

### 4.3 Change Pinned Icon Size
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change icon size value (e.g., 28) | Pinned site icons resize |
| 2 | Click Apply | Setting persists after refresh |

### 4.4 Toggle "Hide Other Bookmarks"
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check "Hide Other Bookmarks" | Other Bookmarks folder disappears |
| 2 | Uncheck | Folder reappears |

### 4.5 Toggle "Open Bookmarks in New Tab"
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check the option | Clicking bookmarks opens new tab |
| 2 | Uncheck | Clicking bookmarks opens in current tab |

### 4.6 Export Pinned Sites
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Export" | File download starts |
| 2 | Check downloaded file | Valid JSON with pinned site data |

### 4.7 Import Pinned Sites
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Import" | File picker opens |
| 2 | Select valid JSON file | Pinned sites replaced with imported data |

### 4.8 Toggle "Sort Groups First"
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check "Sort Groups First" | Tab groups appear above ungrouped tabs |
| 2 | Uncheck | Tab groups mixed with tabs by position |

### 4.9 Toggle "Use Spaces"
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Uncheck "Use Spaces" | Space bar disappears, shows all content |
| 2 | Check | Space bar reappears with spaces |

### 4.10 Bookmark Open Mode
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select "Active Tab" mode | Bookmarks replace current tab |
| 2 | Select "New Tab" mode | Bookmarks open in new background tab |
| 3 | Select "Arc Style" mode | Bookmarks use persistent tab loading |

---

## 5. Keyboard & Accessibility

### 5.1 Escape Key Closes Dialogs
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open any dialog (Settings, Edit, etc.) | Dialog visible |
| 2 | Press Escape | Dialog closes |

### 5.2 Escape Key Cancels Drag
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start dragging a tab or bookmark | Drag overlay visible |
| 2 | Press Escape | Drag cancelled, item returns |

### 5.3 Keyboard Shortcut - Toggle Panel
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press Cmd+Shift+E (Mac) or Ctrl+Shift+E | Sidebar panel toggles |

---

## 6. Tab History Navigation

### 6.1 Previous/Next Tab Buttons
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click back arrow button in toolbar | Activates previously used tab |
| 2 | Click forward arrow button | Activates next tab in history |

### 6.2 Tab History Dropdown
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hold/long-press back arrow button | Dropdown shows recent tab history |
| 2 | Click a tab in dropdown | That tab activates |
| 3 | Hold forward arrow button | Dropdown shows forward history |

### 6.3 Keyboard Shortcuts
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Switch between several tabs | Build up navigation history |
| 2 | Press Cmd+Shift+< (Mac) or Ctrl+Shift+< | Navigates to previous tab |
| 3 | Press Cmd+Shift+> (Mac) or Ctrl+Shift+> | Navigates to next tab |

---

## 7. Search & Filter

### 7.1 Text Search
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click search icon in toolbar | Search input appears |
| 2 | Type search text | Tabs and bookmarks filter by title/URL |
| 3 | Clear search | All items visible again |


---

## 8. Dark Mode

### 8.1 System Theme Response
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set system to light mode | Sidebar uses light theme |
| 2 | Set system to dark mode | Sidebar uses dark theme |
| 3 | Verify all UI elements readable | Text, icons, backgrounds contrast properly |

---

## 9. Edge Cases

### 9.1 Empty States
| Scenario | Expected Result |
|----------|-----------------|
| No pinned sites | Pinned bar shows minimal/empty state |
| Empty bookmark folder | Folder expandable but shows no children |
| Single tab | Tab displays, close creates new blank tab first |

### 9.2 Special Bookmark Folders
| Scenario | Expected Result |
|----------|-----------------|
| Right-click "Bookmarks Bar" | No Delete or Rename options |
| Right-click "Other Bookmarks" | No Delete or Rename options |
| Drag "Bookmarks Bar" | Not draggable |

### 9.3 Long Content
| Scenario | Expected Result |
|----------|-----------------|
| Very long tab title | Title truncates with ellipsis |
| Very long bookmark title | Title truncates with ellipsis |
| Many tabs (50+) | List scrolls, performance acceptable |

### 9.4 UI State Persistence
| Scenario | Expected Result |
|----------|-----------------|
| Expand folders, close sidebar, reopen | Folder expand/collapse states preserved |
| Collapse tab groups, reload sidebar | Group expand/collapse states preserved |
| Change settings in one window | Settings sync to other windows |

### 9.5 Cross-Window Sync
| Scenario | Expected Result |
|----------|-----------------|
| Pin a site in window 1 | Pinned site appears in window 2's sidebar |
| Delete bookmark in window 1 | Bookmark removed from window 2's sidebar |
| Create space in window 1 | Space appears in window 2's space bar |

---

## 10. Multi-Selection

### 10.1 Selection UX
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click a tab | Selects that tab, clears previous selection |
| 2 | Cmd/Ctrl+click another tab | Adds tab to selection |
| 3 | Cmd/Ctrl+click selected tab | Deselects that tab |
| 4 | Click first tab, Shift+click later tab | Selects range between them |
| 5 | Press Escape | Clears all selection |

### 10.2 Multi-Selection Drag
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select multiple tabs | Selected tabs highlighted |
| 2 | Drag one of selected tabs | Drag overlay shows count badge |
| 3 | Drop at new position | All selected tabs move together |
| 4 | Verify order | Selected items maintain relative order |

### 10.3 Multi-Selection Context Menu (Tabs)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select multiple tabs, right-click | Multi-selection context menu appears |
| 2 | Click "Pin To Sidebar" | All selected tabs pinned |
| 3 | Select tabs, click "Close" | Confirmation dialog, all closed |
| 4 | Select tabs, click "Move To New Window" | All move to new window |
| 5 | Select tabs, click "Add To Bookmark" | Folder picker, all bookmarked |
| 6 | Select tabs, click "Move To Space" | Space picker, all move to space |

### 10.4 Multi-Selection Context Menu (Bookmarks)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select multiple bookmarks, right-click | Multi-selection context menu appears |
| 2 | Click "Open In New Tab" | All selected bookmarks open |
| 3 | Click "Delete" | Confirmation dialog, all deleted |
| 4 | Click "Move Bookmark..." | Folder picker opens, all move together |
| 5 | Click "Pin To Sidebar" | All selected bookmarks pinned |
| 6 | Click "Open In New Window" | New window with all bookmarks |

---

## 11. Orphaned Tabs (LiveBookmarks)

### 11.1 Orphaned Tabs Group
| Scenario | Expected Result |
|----------|-----------------|
| Chrome restarts with persistent tabs | Orphaned tabs appear in grey "Orphaned Tabs" group |
| LiveBookmarks group appearance | Greyed out, collapsed by default |
| Click orphaned tab | Tab activates |
| Expand/collapse group | Chevron toggles, group expands/collapses |

### 11.2 Orphaned Tab Actions
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click orphaned tab | Context menu with special options |
| 2 | Click "Close" | Tab closes, removed from group |
| 3 | Click "Keep as Regular Tab" | Tab moves to regular tabs |
| 4 | Select multiple orphaned tabs, "Keep as Regular Tabs" | All become regular tabs |

### 11.3 Orphaned Tab Close Options
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click orphaned tab in middle | Context menu appears |
| 2 | Click "Close Tabs Before" | All orphaned tabs above close |
| 3 | Click "Close Tabs After" | All orphaned tabs below close |
| 4 | Click "Close Others" | All other orphaned tabs close |

### 11.4 LiveBookmarks Group Restrictions
| Scenario | Expected Result |
|----------|-----------------|
| Drag tab into LiveBookmarks group | Not allowed |
| Drag orphaned tab out of group | Becomes regular tab |
| View specific space | LiveBookmarks group hidden |

---

## 12. Spaces

### 12.1 Create Space
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+" in space bar | Space creation dialog opens |
| 2 | Select bookmark folder, choose icon/color | Preview updates |
| 3 | Click Create | New space appears in space bar |

### 12.2 Switch Spaces
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click space icon in space bar | Space activates, sidebar filters to space content |
| 2 | Two-finger swipe left/right | Navigates between spaces |
| 3 | Click "All" space | Shows all bookmarks and tabs |

### 12.3 Space Filtering
| Scenario | Expected Result |
|----------|-----------------|
| Switch to a space | Only space's linked folder bookmarks shown |
| Switch to a space | Only space's tab group tabs shown |
| Tabs outside space group | Hidden when viewing space |

### 12.4 Edit/Delete Space
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click space icon | Context menu appears |
| 2 | Click "Edit Space" | Edit dialog opens |
| 3 | Change icon/color, click Save | Space updates |
| 4 | Click "Delete Space" | Space removed, tabs/bookmarks unchanged |

### 12.5 Space Bar Interaction
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drag space icon in bar | Reorder indicator shows |
| 2 | Drop at new position | Space reorders |
| 3 | Drag tab onto space icon | Tab moves to that space's group |

### 12.6 Space Visual Indicators
| Scenario | Expected Result |
|----------|-----------------|
| Select a space with color | Title header shows space color |
| Open folder picker | Linked folders show space indicators |
| Tab group linked to space | Group header shows space icon |

---

## 13. Pre-Release Checklist

Quick verification before each release:

### 13.1 Critical Path
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

### 13.2 Common Regressions
| Test | Pass |
|------|------|
| Multi-selection works with Cmd/Ctrl+click | [ ] |
| Context menus show correct options | [ ] |
| Dialogs close with Escape key | [ ] |
| Cross-window sync for pins/bookmarks | [ ] |
| Spaces filter correctly | [ ] |
