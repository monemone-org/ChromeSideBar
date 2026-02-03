# TODO


- [-] bookmark tree not handling multi-item drop

- backup/restore should support all root folders and root folders with different names.

- settings dialog, cancel button looks disabled. import export dialogs too.

- popup menu "Edit" -> "Edit Pin..." and "Edit Bookmark..."


## In-Progress


## Pending

- Review Code:
   - [ ] Check for memory, resource leak, e.g. global collections that keep growing but never gets clean up.

- [ ] Support drag links from browser pane to
            - bookmark  - drop before/after bookmark
                        - create new bookmark 
            - folder - drop into/intoFirst folder
                    - create new bookmark 
            - group - drop into/intoFirst group
                    - open as new tab grouped
            - tab - drop before/after tab
                  - open as new tab 
            - end of list - drop 
                          - open as new tab 
            - space bar into space bar buttons 
                  - open as new tab in the target space.
            - pinned site area
                  - before/after pinned site 
                  - create new pinned site
             
- [ ] Folder popup menu
       - [ ] add "Close Live Bookmarks" to the end of the popup menu which closes live bookmarks under the selected folder.


## Aborted

- [aborted] Cmd+Click on bookmark doesn't create new tab. 
      - it is disabled now because Cmd+Click is now a multi-select gesture. Use popup menu to Open In New Taa
      - ccompromised solution: open a new tab if the bookmark is selected and the bookmark is
  the only selection. So instead of unselecting the only selection in bookmarktree, it will
  open it as a new tab


- saved filter
      - [ ] focus doesn't go to the input field

- Spaces:
      - [ ] popup menu edit spaces: a new dialog that lists all the spacs with name and icon.  users can add, edit , delete and reorder spaces in the dialog

- [ ] if useSpace==YES, in All Space's tabList, show all the tabs not belong to any space first. thens group the rest of tabs by their Space.  Render the Space row with the space icon, use the space colour as the label background colour.


## Done

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

- [x] inefficent batch operation
   - delete group causes fetchTabs to be called many times (148)

- [x] when switch from arc style bookmark to traditional style, move all tabs under SideBarForArc group to ungrouped

- [x] drag group to bookmark folder to create bookmark subfolder
- [x] change toast message from "Export

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
- [x] add filter toolbar button: filter by domain name, and save as quick access.

- saved filter
      - [x] recent filter is not saved. there should be a debounce to start search. that search string is remembered in memory.  the string should be saved in recent. if user edit the search string without deleting all charactors, then edit that recent search string without adding another new one to the recent list.
      - [x] add a [reset] filter button to toolbar that clear the search string , filter with open tab and filter with speaker.

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

- [x] add right click action on tab "Move to Space". It's similar to add to group but it's for moving a tab to space.

- Spaces:
      - [x] popup menu action: Close All Tabs In Space
      - [x] import/export, phase 6 in the plan

- [x] live bookmark tab and live pinned site tab, after moving to new window, it should be considered closed in this window. so no [x] button or speaker button should be presented

- [x] Close icon on all popup menu should be consistent . use x , not trash can
- [x] add icons to Space popup menus.

- [x] import tabs/groups with replace options - will create a blank page to prevent the windows from being closed.  that blank page needs to be closed after import completes if the import contains no tabs.

- [x] when creating/editing space, check if the name already used. if so , show error and don't commit changes and keep dialog open till a valid unique space name is entered.

- [x] WelcomeDialog , add a welcome /product overview page as the 1st page.

- [x] when activate to a different space, activate the last activated tab in the Space.  If there is no history of which tab is the last activated one, activate the 1st tab.  if there is no tab, no-op

- [x] when space has no bookmark (i.e. the bookmark folder has no bookmarks), i can't drop tab to bookmark section to create bookmarks.

- [x] tab popup menu "move to bookmark" , if in a space, use the space bookmark folder as the default selection in the select folder dialog.

- [x]  when switching to a new space A from space B, right now the extension will record the current
  active tab T1 (even though the tab is from antoher space B) as its active
  tab.  When switch away to antoher space C another tab T2, then switch back
  to that space A, it will bring up the active tab T1 again.  This is
  confusing. T1 belongs to space B. Technically space A still doesn't have any
  tab opened.  I think we should only record active tab for space A if the
  tab doesn't belong to any group (i.e. live bookmark or live pinned site) or
  belong to group A.

- [x] bookmark popup menu: add "open in new tab" (same behaviour as CMD+click on the bookmark)

- [x]  bookmark popup menu: add a "move to space" menu item. it moves
  the bookmark to under the target space's bookmark folder. then show a toast to confirm the new
  bookmark location by path. the target space's bookmark folder.

- [x] tab popup menu: "move to bookmark" - change to always do "Add to bookmark" instead. position the menu item after "Add to Group"

- [x] settings dialog, options to disable Space.
      1. hide space bar

- [x] tab popup menu: "move to space" after moving tab to space, should active that space and bring that tab in that space visible in the side panel

- [x] during drag drop, when hover over a folder node, it can expand and collapse the node if the cursor hovers over the node for some period of time. change that behaviour to only expand but not collapse.

- [x] Update live bookmark title - right now it shows the loaded tab's title if it has a live tab. add the bookmark name as prefix to the title "{bookmark title} - {url title}"

- [x] change audio filter so it shows audio playing tab regardless of the active Space.

- Review Code:
      - [x] Review code for O(n²) or less efficient logic.
      - [x] Refactor reusable or self-contained code into separate components. Remove duplicated code.
      - [x] Security review

- [x] in audio filter dialog, when clicking anywhere else in the panel should dismiss the audio filter dialog
  so is "Navigate to Space" dialog

- [x] document all the session states stored: what data is for, which class/file owns it.

- [x] last active tab id not working for "All" Space.

- [x] When chrome restarts, it restores all the tabs, we need to find a way to remap live bookmarks , live pinned sites and space tab lists.

- [x] support drag/drop tabs to "Space" button

- [x] close tab after/before/others should be bounded within the active group of the active tab
      if the active tab is ungrouped, then those actions will apply to all tabs (grouped or ungrouped)

- [x] tabList, render space group with space icon. non space group with a generic group icon.

- [x] "open link in new tab" from live bookmark tabs, will have the tab opened as orphaned tab.  in this case, we need the new tab in active group or ungrouped if active group is "All"

- [x] "Orphaned Tabs" should only appear in "App" space

- [x] cannot collapse "Orphaned Tabs" group

- [x] Persist the bookmark folders collapse/expand states in storage, so when chrome is reloaded or space is activated again, the folder states remain the same.

- [x] multiple selection of the same type of rows (bookmarks+folders, tabs): drag/drop, common popup menu (move to folder  or move to space and delete)

- [x] multi-select a folder and its 2 bookmarks, after drop, the 2 bookmkars are at the same level as the folder.

- [x] multi-select tabs/bookmarks, drag overlay covers up drop location indicator

- Dropping inside a Space (non-All space)
      - [x] Dropping before root folder should not be allowed
      - [x] Dropping after last tab in space group should not be moved out of the group.  it should be moved to after the last tab inside the same group. Or we can simply make  "+ New Tab" row at the end of the Space's tab list not droppable.

- [x] Removed Orphaned tabs. It is confusing

- [x] make the area that response to group row's expand and collapse bigger, expand the area to outside of the V > icon. the area should fill the whole row.

- Folder popup menu
      - [x] after "New Folder" menu item, there should be an "New Bookmark"

- [x] autoscrolling duplicated
There are many copies of code to scroll to a bookmark row in bookmarktree and tab row in tablist.
```
      const element = document.querySelector(`[data-bookmark-id="${newNode.id}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      	in AudioTabsDropdown, BookmarkTree

        const element = document.querySelector(`[data-tab-id="${activeTab.id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            in AudioTabsDropdown and TabList
```

- [x] when right click on a single selected live bookmark , show "Close" instead of "Delete"

- [x] bookmarktree doesn't auto-expand to show the bookmark row when a bookmark tab becomes active, therefore the bookmark row is not selected.

- [x] add popup menu item to Live bookmark in space to "Move To Tabs" which deassociate the livebookmark as regular tab in the space

- [x] store last active space in local storage and restore when extension is reloaded, so it doesn't always land on "All"

- [x] All space instead of using an icon, use Text "ALL" so it's differentiated from the other Space icon that can be dragged/dropped.

- [x] handle default bookmark folder 1,2,3

- [x] after dragging a pinned icon from position 2 to 3.  the pinned site now at position 2 is loaded. it shouldn't.
  
- [x] in dnd context, do not repeat:
      setOverId(null);
      setOverZone(null);
      setOverData(null);
      setDropPosition(null);
      setAcceptedFormat(null);
  use a util function to reset dnd context

- [x] drag URL to pinned bar doesn't show indicator when cursor is at <50% of pin0.
  
- [x] a bug. after opening a pinned sites, then unpin, the associated tab should be
  unassociated and show up on All space. but it doesn't

- [x] when dnd-ing, bookmark tree shouldn't have a hover over ring on bookmarks.


