# TODO

- [x] display tab row in full width.  when cursor is hover over, show pin and x button over the row label.
- [x] speaker icon on the very right end of the row
- [x] display all custom icons
- [x] drag bookmark item is covering up the drap target indicator 

- [x] remove tab count  in "Active Tab" row. add a "..." menu button which contains these actions
   - sort by domain, then by title
   - close all tabs
   
- [x] export/import pinned sites in json 

- [x] Active Tab, "sort by domain" support accending (a-z) and descending (z-a). 
- [x] rename group dialog: text field should have default focus

- [x] Save and cancel buttons in dialog is bigger than system default font. check all UI in all dialogs to use system normal size font.
- [x] pin site icon size , configurable in option dialog.
- [x] pin site to be in sync with Chrome's pinned tab

- [x] add icon to popup menu for tabs and groups , similar to bookmarks and bookmark folders.
- [x] drag /drop to reorder tab groups, along with all the group tabs inside.

- [x] after manually closing all tabs in SideBarForArc and the SideBarForArc group, loading any bookmark or pinned site doesn't recreate the group

- [x] cmd+T to create new tab, shouldn't move tab to under sidebarforArc group., if the active group is sidebarforArc.  leave the tab as in ungroup tab.

- [x] introduce a "active" state for pinned site if the active tab is for that pinned site.

- [x] when active tab is changed and the tab is from a bookmark/pinned site, highlight and jump to the bookmark row. for pinned site, show in active state.

- [x] drag/drop a tab to bookmark folder, should create a new bookmark and move that tab to SideBarForArc and create a bookmark-tab association as a loaded bookmark

- [x] cannot drop tab behind the last group if group is expended.  new a empty dummuy last row??
    
- [x] pinned site's loaded state background colour is not obvious enough.

- [x] add a line to separate the bookmark and tabs sections. 
    remove "Activee Tabs" and replace with a  `+ New Tab       [...]` row with action button that show the original "Active Rows"'s popup menu to allow sort and close all tabs.

bugs:
- [x] tab and group row indentation

- [x] dropping to top 25% of group header should place the tab before the group header as ungrouped tab. right now it moves the tab into the group.
- [x] speaker icon should be at the beginning of the row

- [x] background colour of group need fixes:
      group header row: only top left/right corner has rounding.  the bottom left/right corner - no rounding
      last grouped tab row: only bottom left/right corner has rounding
      all other grouped tab: no rounding corners
        
- [x] empty row at the end of tabList. so the gear setting button is not mixed up with the last tab row's speaker icon.

- [ ] Pinned site sometimes opens in unnamed group instead of "SideBarForArc"
      **Problem:** After reloading extension, deleting existing SideBarForArc group, then clicking a pinned site - the tab opens in an unnamed group.
      **Potential cause:** In `BookmarkTabsContext.tsx` `createItemTab()`, when `chrome.tabs.group` creates a new group, Chrome returns `newGroupId` in the callback. Then `chrome.tabGroups.update(newGroupId, {title: 'SideBarForArc', ...})` sets the name. If `newGroupId` is invalid or `tabGroups.update` fails silently, the group remains unnamed.
      **Suggested fix:** Add validation `typeof newGroupId !== 'number'` before calling `chrome.tabGroups.update` in both the error recovery path (line ~379) and normal create path (line ~443).
      **Status:** Cannot reproduce consistently. May be a transient race condition.

- [x] inefficent batch operation 
   - delete group causes fetchTabs to be called many times (148)

- [x] when switch from arc style bookmark to traditional style, move all tabs under SideBarForArc group to ungrouped

- [x] drag group to bookmark folder to create bookmark subfolder
- [x] change toast message from "Export

- [ ] multiple selection : drag/drop, copy/paste and delete

- [x] settings: 
      Behaviour:
         Open bookmark:  Arc style | In new tab | In active tab
             [ explaination of the selected open bookmark style ] 
                         
- [x] while dragging tabs/group over bookmark folders, when hover for 1sec+, the folder doesn't auto expand.


- [x] change to not use SideBarForArc group.  just keep track of the tab ids associated with bookmarks

- [x] when drag/dropping tab ot bookmark and arc style bookmark is on, automatically turn the dragged tab to associated/managed/persistent tab of the newly created bookmark

- [x] add a menu item to tab's popup menu: "Add/Move to Bookmark" (Add for non-arc style bookmark. Move for arc style bookmark) which then prompt select a folder dialog.  then create a bookmark.  If it's in arc style bookmark, turn the tab to the bookmark's arc style persistent tab 

- [x] tooltips are clipped
- [x] tab/bookmark rows have no tooltips
- [x] remove seperate line in filtering mode if there is no pinned site nor bookmarks after filtering
- [ ] add filter toolbar button: filter by domain name, and save as a "Named filtered view" (please suggest a better name). show a drop down to let user choose and apply/unapply a "filtered named view".

- saved filter
      - [x] recent filter is not saved. there should be a debounce to start search. that search string is remembered in memory.  the string should be saved in recent. if user edit the search string without deleting all charactors, then edit that recent search string without adding another new one to the recent list.
      - [x] add a [reset] filter button to toolbar that clear the search string , filter with open tab and filter with speaker.
      - [ ] focus doesn't go to the input field

- [x] arc style "live" bookmark row title should be updated to match the live bookmark tab's current page
  title. When live bookmark tab is closed, restore the row title back to the name of the bookmark.


- [x]  in pinned site edit dialog, reset site icon should fetch and display the site icon in the selected icon in the dialog.

- [x] New feature: add a popup menu "Open as tab group" for bookmark folder to open the selected bookmark folder as a tab group:
   - Create a tab group with the same name as the selected folder, randomly pick a colour for the group
   - Open all the tabs (recursively) under that folder and place them in the group.
   - This would be a reverse action of the existing feature: "Save to Bookmarks"

- [x] new feature: A welcome dialog that explains the following features. Briefly explain what they are and their purposes
      - pinned sites
      - arc-style live bookmarks
      - arc-style space
      only show the 1st time the extension is run.    

- [x] 2 finger swipe left/right on side panel to change space changes 2 spaces forward/backward each time            

SpaceBar
- [x] add button + at the end of the space bar , need to clean up its style
- [x] remove the vertical seperator lines before and after the space for Space buttons.

- [ ] Persist the bookmark folders collapse/expand states in storage, so when chrome is reloaded or space is activated again, the folder states remain the same.

- [ ] Review code for O(n²) or less efficient logic.

- [ ] Remove duplicated code. simplify code.

- [ ] add right click action on tab "Move to Space". It's similar to add to group but it's for moving a tab to space.

- Spaces:
      - [x] popup menu action: Close All Tabs In Space
      - [ ] popup menu edit spaces: a new dialog that lists all the spacs with name and icon.  users can add, edit , delete and reorder spaces in the dialog
      - [x] import/export, phase 6 in the plan

- [x] live bookmark tab and live pinned site tab, after moving to new window, it should be considered closed in this window. so no [x] button or speaker button should be presented

- [x] Close icon on all popup menu should be consistent . use x , not trash can
- [x] add icons to Space popup menus.

- [x] import tabs/groups with replace options - will create a blank page to prevent the windows from being closed.  that blank page needs to be closed after import completes if the import contains no tabs.

- [ ] when creating/editing space, check if the name already used. if so , show error and don't commit changes and keep dialog open till a valid unique space name is entered.

- [ ] WelcomeDialog , add a welcome /product overview page as the 1st page.
