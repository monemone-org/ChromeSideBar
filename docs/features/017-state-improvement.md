---
created: 2026-01-16
after-version: 1.0.149
status: draft
---

# State Storage Improvement

Migrate select browser localStorage settings to `chrome.storage.local` for better cross-window sync.

## Problem

Browser `localStorage` doesn't provide real-time cross-window sync:
- The `storage` event only fires in OTHER windows, not the window that made the change
- If user opens two sidebar windows and changes a setting in one, the other may not update

## Settings to Migrate

| Key | Priority | Reason |
|-----|----------|--------|
| `sidebar-has-seen-welcome` | High | Prevents welcome dialog showing in multiple windows |
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
