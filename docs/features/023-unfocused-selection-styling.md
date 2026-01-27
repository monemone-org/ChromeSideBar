---
created: 2026-01-26
after-version: 1.1.025
status: draft
---

# Unfocused Selection Styling

## Problem
When user switches tabs by clicking Chrome's tab bar, the sidebar selection remains but looks the same (bright blue). This is misleading because the sidebar no longer has focus.

## Goal
- Keep selection when switching tabs (don't clear it)
- Show dimmed/unfocused selection style when sidebar loses focus
- Like macOS Finder: blue selection when focused, gray when unfocused

## Current State
- Selection managed in `SelectionContext.tsx`
- Selection styling in `TreeRow.tsx` line 78: `bg-blue-200 dark:bg-blue-800/60`
- **No focus tracking** - sidebar doesn't detect blur/focus events

## Implementation Plan

### Step 1: Add Focus State to SelectionContext
Track whether the sidebar window has focus.

**File: `src/contexts/SelectionContext.tsx`**
- Add `isFocused` state (default: true)
- Add `useEffect` to listen for `window` blur/focus events:
```typescript
const [isFocused, setIsFocused] = useState(true);

useEffect(() => {
  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);

  window.addEventListener('focus', handleFocus);
  window.addEventListener('blur', handleBlur);

  return () => {
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('blur', handleBlur);
  };
}, []);
```
- Export `isFocused` in context value

### Step 2: Update TreeRow Selection Styling
Add unfocused selection style (gray instead of blue).

**File: `src/components/TreeRow.tsx`**
- Add `isFocused?: boolean` prop
- Update selection styling (around line 78):
```typescript
// Focused selection (bright blue)
isSelected && isFocused && 'bg-blue-200 dark:bg-blue-800/60 text-blue-800 dark:text-blue-50',
// Unfocused selection (gray/muted)
isSelected && !isFocused && 'bg-gray-200 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300',
```

### Step 3: Pass Focus State to Components
Thread `isFocused` from context to TreeRow.

**Files to update:**
- `src/components/TabList.tsx` - Get `isFocused` from SelectionContext, pass to TabRow/TreeRow
- `src/components/BookmarkTree.tsx` - Get `isFocused` from SelectionContext, pass to BookmarkRow/TreeRow
- `src/components/PinnedIcon.tsx` - If it has selection styling, update similarly

## Files to Modify
1. `src/contexts/SelectionContext.tsx` - Add focus tracking
2. `src/components/TreeRow.tsx` - Add unfocused selection styling
3. `src/components/TabList.tsx` - Pass isFocused to rows
4. `src/components/BookmarkTree.tsx` - Pass isFocused to rows

## Visual Design
| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Selected + Focused | `bg-blue-200` | `bg-blue-800/60` |
| Selected + Unfocused | `bg-gray-200` | `bg-gray-700/60` |

## Verification
1. Build: `npm run build`
2. Load in Chrome, open sidebar
3. Select an item in TabList or BookmarkTree
4. Click on Chrome's tab bar (or another Chrome UI element)
5. Verify selection changes to gray/muted style
6. Click back on sidebar
7. Verify selection returns to blue style
