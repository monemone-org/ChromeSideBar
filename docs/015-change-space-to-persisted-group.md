---
created: 2026-01-15
after-version: 1.0.149
status: draft
---

 i feel that the current implementation of space is confusing when adding in
  Group in the user interface.

  i am thinking to treat Space as Groups. there will be persisted Groups. 
  Persisted groups are groups that still exist even when there are not tabs  under the group

Concept:

  Persisted Group is basically Space. It has properties:
  - name
  - icon
  - colour
  - Bookmark folder to filter on
      - differ from space, bookmark folder will optional.  if not provided, all bookmarks will be shown in the bookmark section.
      - by default bookmark folder is empty.
      - users can enter in edit/create group dialog (former edit/create space dialog)
      - need a name for this.  "Focused Bookmark Fodler"? "Filtered Bookmark Folder"?  
          Or create dialog doesn't set it.  Users in the bookmark tree can right click to "focus on" a folder. there is a "Reset" button on that focused bookmark folder row (i.e. the root space bookmark folder right now)to "Unfocus".

      
Space Bar -> Group Bar:
  - now "Group Bar"
  - Show all groups
  - when extension is started, all persisted group are shown first in the group bar, then the temp groups.
  - user can reorder groups at runtime but only the relative order of persisted group is persisted.
  - the order in Group Bar doesn't need to match the group order in Chrome's tab bar.
  - [+] will create a new persiste group. Same as in Space, but may not have a corresponding group till an tab is added.
  - new group created (either persited group or normal chrome group) is added to the end.


There will be no more both operation "Add to Group" and "Add to Space" because they will be the same.
