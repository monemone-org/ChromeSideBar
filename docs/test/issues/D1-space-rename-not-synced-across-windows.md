---
created: 2026-08-05
status: open
severity: low
---

# Renaming a space doesn't update its Chrome group title in other windows

## Summary

With two windows both showing the same space's Chrome group, renaming that space from window 1 updates window 1's group correctly, and both windows' sidebars show the new name - but window 2's actual Chrome tab group keeps the old title. Its group is now orphaned (title no longer matches the space name).

## Repro

- **D.1 Step 3** - two windows open on the same space, rename from window 1, check window 2's Chrome group title

See `docs/test/tab-space-association-test-cases-result-2026-08-01.md` (`#d1`) for the detailed writeup.

## Root cause

`updateSpace()` in `src/contexts/SpacesContext.tsx:~255-295` syncs a rename to Chrome's tab group, but only for its own window:

```typescript
if (windowId && (updates.name || updates.color))
{
  const groups = await chrome.tabGroups.query({ windowId, title: space.name });  // current window only
  if (groups.length > 0)
  {
    await chrome.tabGroups.update(groups[0].id, { title: updates.name ?? space.name, ... });
  }
}
```

Window 2 does receive the renamed `Space` object - `SpacesContext.tsx:~144-155` has a `chrome.storage.onChanged` listener that keeps every window's `spaces` React state in sync, so window 2's own sidebar UI (space list, navigator) correctly shows the new name. But that listener only calls `setSpaces(...)` - it never re-runs the `chrome.tabGroups.update()` side effect. That side effect is tied to the rename *action* (only fires in whichever window the user actually renamed from), not to the underlying *state change* every window receives.

## Proposed fix (not yet scoped/agreed)

`handleStorageChange` (or a new effect watching `spaces`) needs to diff old vs. new `spaces` arrays by `id` to detect a name/color change, then run the same `chrome.tabGroups.query`/`update` sync for its own window - more involved than a one-liner since it requires access to the previous `spaces` value to diff against (`chrome.storage.onChanged` does provide `oldValue`, so this is available).

## Status

Not fixed.
