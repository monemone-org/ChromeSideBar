---
created: 2026-11-24
status: open, not reproduced
severity: low
---

# The audio quick-jump to a bookmark tab sometimes does not scroll (S1)

## Summary

The audio quick-jump switches to the audio tab's space and should scroll that tab's row into view. Once, for a bookmark tab in another space, the switch worked but the list did not scroll at all. A rerun of the same case passed, so this is an intermittent fault, either in the product or in the test.

## Repro

C.2e (bookmark) failed once in the full driver run of 2026-11-24 (`tools/tmp/test-results-failed-2026-11-24T06-45-39-774Z.json`). Every step passed up to the last one:

```
Tab "audioTab"'s sidebar row is visible
expected row [data-bookmark-id="3917"] to be visible, but it isn't (waited 1500ms)
container=[114.0, 392.0] element=[710.0, 738.0]
```

The case had scrolled the list to the top to hide the row, and the row was still at the same place afterwards, so the scroll never moved the list. The jump itself worked: the audio tab was active and the sidebar showed spaceB. It passed in the earlier run of the same day and in a rerun of the case on its own.

## Possible causes

The scroll is `scrollToBookmark` in `src/utils/scrollHelpers.ts`, started by the `TAB_ACTIVATED` broadcast in `useFollowActiveTab`. Three things give the result above:

1. **The scroll looked in the wrong list.** `useScrollToTabItem` picks the list from `getItemKeyForTab`. If the sidebar's link map did not yet name the tab as a bookmark tab, it called `scrollToTab`, which looks for `data-tab-id` in the Tabs list, where bookmark tabs are hidden, and gives up after 2 seconds.
2. **The row did not render within 2 seconds.** The space switch has to render spaceB's tree with its filler bookmarks before the row exists.
3. **The smooth scroll started and was cancelled**, for example by a re-render while spaceB's tree was still filling in.

In a debug build, causes 1 and 2 log `scrollHelpers: gave up waiting for [...]` in the sidebar console. The attribute in that line tells the two apart. Cause 3 logs nothing.

## Next time it fails

Check the sidebar console for that line before rerunning, and note which attribute it names. The fix depends on the cause, so nothing is changed until one is known.

## Status

Open, not reproduced. Seen once in a full run, passed on a rerun.
