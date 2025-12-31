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

## 6. Dark Mode

### 6.1 System Theme Response
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set system to light mode | Sidebar uses light theme |
| 2 | Set system to dark mode | Sidebar uses dark theme |
| 3 | Verify all UI elements readable | Text, icons, backgrounds contrast properly |

---

## 7. Edge Cases

### 7.1 Empty States
| Scenario | Expected Result |
|----------|-----------------|
| No pinned sites | Pinned bar shows minimal/empty state |
| Empty bookmark folder | Folder expandable but shows no children |
| Single tab | Tab displays, close creates new blank tab first |

### 7.2 Special Bookmark Folders
| Scenario | Expected Result |
|----------|-----------------|
| Right-click "Bookmarks Bar" | No Delete or Rename options |
| Right-click "Other Bookmarks" | No Delete or Rename options |
| Drag "Bookmarks Bar" | Not draggable |

### 7.3 Long Content
| Scenario | Expected Result |
|----------|-----------------|
| Very long tab title | Title truncates with ellipsis |
| Very long bookmark title | Title truncates with ellipsis |
| Many tabs (50+) | List scrolls, performance acceptable |

