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

- [ ] when switch from arc style bookmark to traditional style, move all tabs under SideBarForArc group to ungrouped

- [ ] drag group to bookmark folder to create bookmark subfolder

- [ ] multiple selection : drag/drop, copy/paste and delete

- [ ] settings: 
      Behaviour:
         Open bookmark:  Arc style | In new tab | In active tab
             [ explaination of the selected open bookmark style ] 
                         
