 i feel that the current implementation of space is confusing when adding in
  Group in the user interface.

  i am thinking to treat Space as Groups. there will be persisted Groups. 
  Persisted groups are groups that still exist even when there are not tabs  under the group

Concept:

  perssted grouip will have the same properties as Space:
  - name
  - icon
  - colour
  - bookmark folder to filter on
      -bookmark folder will optional.  if not provided, all bookmarks will be shown in the bookmark section.
      -by default bookmark folder is empty. users can enter in edit/create group dialog (former edit/create space dialog)
      
SpaceBar:
  - now "Group Bar"
  - show all groups
  - by default all persisted group are shown first in the group bar, then the temp groups.
  - the order in space bar doesnt need to match the group order in tab bar.
  - [+] will create a new persiste group. Same as in Space, but may not have a corresponding group till an tab is added.

  means:
  Space Bar -> Group Bar: it shows persisted groups and all the groups.
  persisted group will be placed first in the bar by default. but users can
  reorder them.

update CLAUDE.md to explain the front matter requirements for the feature docs under docs/