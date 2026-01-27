---
created: 2026-01-24
decision: remove-livebookmarks-group
status: implemented
---

# LiveBookmarks Group Removal

## Background

The LiveBookmarks group (feature 022) was added to manage orphaned tabs after Chrome restart. It put all managed tabs (opened from bookmarks/pinned sites) into a hidden "LiveBookmarks" Chrome tab group.

## Why It Was Removed

**Commit d3f5343 (Jan 24, 2026)** removed the feature.

**Bug**: When using "Open Link in New Tab" on links within LiveBookmarks tabs, new tabs inherited the LiveBookmarks group instead of joining the active Space's group. This broke expected Space grouping behavior.

**Simplification**: Removing the group also eliminated complex cleanup code required on extension/Chrome restart. Previously needed `cleanupOrphanedTabs()` to handle tabs stuck in the LiveBookmarks group after restart - now unnecessary.

## Solution

Remove the LiveBookmarks group approach entirely:
- Managed tabs (LiveBookmarks/pinned sites) are now kept ungrouped
- Background checks `isManagedTab()` before auto-grouping
- If a tab is managed, it stays ungrouped
- Tab association tracking moved to shared utility (`src/utils/tabAssociations.ts`)

## Related Removals

- `LIVEBOOKMARKS_GROUP_NAME` constant
- `cleanupOrphanedTabs()` function
- Orphaned tabs UI display
- `addTabToLiveBookmarksGroup()` function

## Feature Timeline

1. **Jan 17**: Feature added (commit 5605920)
2. **Jan 21-22**: Orphaned tabs UI added (commits 3ec43fb, 5f172c8)
3. **Jan 22**: Auto-cleanup replaced UI (commit afc4f66)
4. **Jan 24**: Feature removed entirely (commit d3f5343)
