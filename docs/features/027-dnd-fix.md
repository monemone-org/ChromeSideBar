Drag data will be data format focus, instead of UX element focus:

PinnedIcon can be PIN, URL
BookmarkRow can be TAB (if have live bookmark), Bookmark, URL
TabRow can be TAB, URL
TabGroup : TAB_GROUP
SpaceIcon can be SPACE

| Drop Zone    | Accept Format | Action                                           | Position                                   |
| ------------ | ------------- | ------------------------------------------------ | ------------------------------------------ |
| PinnedBar    | PIN           | Reorder pin position                             | before/after PinnedIcon                    |
| PinnedBar    | URL           | Create new pinned site                           | before/after PinnedIcon                    |
| BookmarkTree | BOOKMARK      | Move bookmark and update live bookmark if needed | before, after, into, intoFirst             |
| BookmarkTree | TAB           | Create new bookmark                              | before, after, into, intoFirst             |
| BookmarkTree | URL           | Create new bookmark                              | before, after, into, intoFirst             |
| TabList      | TAB_GROUP     | Reorder group and its tabs                       | before, after, after the last tab in group |
| TabList      | TAB           | Reorder tab to different index/group             | before, after, into, intoFirst             |
| TabList      | URL           | Create new tab                                   | before, after, into, intoFirst             |
| SpaceBar     | SPACE         | Reorder space                                    | before, after SpaceIcon                    |
| SpaceBar     | TAB           | Move tab to a different space                    | into                                       |
| SpaceBar     | URL           | Create new tab in space                          | into                                       |



* duplicated code

    setOverId(null);
      setOverZone(null);
      setOverData(null);
      setDropPosition(null);
      setAcceptedFormat(null);

      in UnifiedDndContext.tsx

      make a clearDnDState() shared function


