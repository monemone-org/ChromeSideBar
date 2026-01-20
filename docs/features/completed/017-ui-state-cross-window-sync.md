---
created: 2026-01-16
after-version: 1.0.149
status: completed
---

# UI State Cross Window Sync 

Migrate select browser localStorage settings to `chrome.storage.local` for better cross-window sync.

## Problem

Browser `localStorage` doesn't provide real-time cross-window sync:
- The `storage` event only fires in OTHER windows, not the window that made the change
- If user opens two sidebar windows and changes a setting in one, the other may not update

## Settings to Migrate

| Key | Priority | Reason |
|-----|----------|--------|
| `sidebar-saved-filters` | High | User data should be available in all windows |
| `sidebar-recent-filters` | High | User data should sync |
| `sidebar-use-spaces` | High | Major feature toggle affects all windows |
| `sidebar-bookmark-open-mode` | Medium | Behavior setting, not just visual preference |

## Settings to Keep in localStorage

These are visual-only preferences where delayed sync is acceptable:

| Key | Reason |
|-----|--------|
| `sidebar-font-size-px` | Visual preference, reload to sync is fine |
| `sidebar-hide-other-bookmarks` | Visual preference |
| `sidebar-sort-groups-first` | Visual preference |
| `sidebar-pinned-icon-size-px` | Visual preference |
| `sidebar-show-filter-area` | Could be per-window preference |

**Settings Dialog**: When the settings dialog opens, it reads fresh values directly from localStorage. This ensures the dialog shows the latest values even if another window changed them.

## Implementation

### Option A: Create `useChromeLocalStorage` hook

Similar to `useLocalStorage` but using `chrome.storage.local`:

```typescript
// src/hooks/useChromeLocalStorage.ts
function useChromeLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);

  // Load on mount
  useEffect(() => {
    chrome.storage.local.get(key).then(result => {
      if (result[key] !== undefined) setValue(result[key]);
    });
  }, [key]);

  // Listen for changes (fires in ALL windows including current)
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[key]) setValue(changes[key].newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  // Setter
  const setStoredValue = useCallback((newValue: T) => {
    setValue(newValue);
    chrome.storage.local.set({ [key]: newValue });
  }, [key]);

  return [value, setStoredValue] as const;
}
```

### Option B: Extend existing hooks

Add `storage` parameter to `useLocalStorage` to choose between browser localStorage and chrome.storage.local.

## Migration Steps

1. Create `useChromeLocalStorage` hook
2. Update `App.tsx` to use new hook for high-priority settings
3. Handle migration: read old localStorage value, write to chrome.storage.local, delete old key
4. Test cross-window sync behavior

## Files to Modify

- `src/hooks/useChromeLocalStorage.ts` (new)
- `src/App.tsx` - switch hooks for migrated settings
- `src/components/SettingsDialog.tsx` - read fresh localStorage values on open

## Test Cases

### Hook Functionality

| Done | # | Test | Steps | Expected |
|------|---|------|-------|----------|
|x| 1 | Initial load with no stored value | Open sidebar with fresh profile | Uses default value |
|x| 2 | Initial load with existing value | Set value in chrome.storage.local, open sidebar | Loads stored value |
|x| 3 | Set value | Change a setting | Value persists after sidebar close/reopen |

### Cross-Window Sync

| Done | # | Test | Steps | Expected |
|------|---|------|-------|----------|
| | 4 | Sync to other window | Open 2 sidebars, change setting in window A | Window B updates immediately |
|x| 5 | Sync recent filters | Open 2 sidebars, use a filter in window A | Recent filter appears in window B |
|x| 6 | Sync spaces toggle | Open 2 sidebars, toggle spaces in window A | Spaces toggle syncs to window B |
|x| 7 | Sync saved filters | Open 2 sidebars, save a filter in window A | Filter appears in window B |

### Migration

| Done | # | Test | Steps | Expected |
|------|---|------|-------|----------|
|x| 8 | Migrate existing localStorage | User with existing localStorage values upgrades | Values copied to chrome.storage.local |
|x| 9 | No duplicate migration | Open sidebar twice after migration | Migration only runs once |
|x| 10 | Clean up old keys | After migration completes | Old localStorage keys removed |

  Test #8: Migrate existing localStorage

  1. Open DevTools → Application → Local Storage
  2. Manually add old keys (e.g., sidebar-use-spaces = "true")
  3. Clear chrome.storage.local: chrome.storage.local.remove('sidebar-use-spaces')
  4. Reload sidebar
  5. Check: value should now be in chrome.storage.local, removed from localStorage

  Test #9: No duplicate migration

  1. After test #8, reload sidebar again
  2. Check DevTools console (dev build only) - should NOT see "Migrated..." log
  3. Value should still be in chrome.storage.local only

  Test #10: Clean up old keys

  1. Same as #8 - after migration, verify localStorage key is removed
  2. DevTools → Application → Local Storage should not have the migrated key


### Settings Dialog

| Done | # | Test | Steps | Expected |
|------|---|------|-------|----------|
|x| 11 | Dialog shows fresh localStorage values | Change font size in window A, open settings in window B | Window B shows new font size |
|x| 12 | Dialog shows fresh pinned icon size | Change pinned icon size in window A, open settings in window B | Window B shows new size |

### Edge Cases

| Done | # | Test | Steps | Expected |
|------|---|------|-------|----------|
| | 13 | Rapid changes | Toggle setting quickly multiple times | Final value is correct in all windows |
| | 14 | Sidebar opened during change | Window A changes setting while window B is loading | Window B gets correct value |
