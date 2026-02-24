---
created: 2026-02-23
after-version: 1.0.277
status: draft
---

# Emoji Icons & Custom Space Colors

## Purpose

Extend PinnedSites and Spaces to support emoji icons and custom (hex) colors. This is a prerequisite for the Arc Browser import (feature 029), which needs to map Arc's emoji icons and gradient theme colors into our data model. These enhancements also benefit regular users who want more expressive icons and colors.

### Target persona

- Arc Browser migrants (emoji icons + theme colors from Arc)
- Power users wanting more icon/color options beyond Lucide icons and Chrome's 9 group colors

## Part 1: Emoji Icons

### Current state

| Component | Lucide icons | Emoji | Favicon |
|---|---|---|---|
| **PinnedSite** | `customIconName` field | Not supported | `favicon` field (default) |
| **Space** | `icon` field (comment says "Lucide or emoji") | Partial - renders in BookmarkTree/FolderPickerDialog overlays, but `getIcon()` sends all values to Iconify CDN. No emoji picker in SpaceEditDialog. SpaceNavigatorDialog missing emoji handling. | N/A |

### Changes

#### PinnedSite emoji

Add an `emoji` field to `PinnedSite`:

```typescript
interface PinnedSite
{
  id: string;
  url: string;
  title: string;
  favicon?: string;
  customIconName?: string;   // Lucide icon name
  iconColor?: string;        // hex color for custom icon
  emoji?: string;            // emoji character (e.g. "😀")
}
```

**Icon priority**: `emoji` > `customIconName` > `favicon`

When `emoji` is set, render it as text directly (no Iconify, no favicon). Clear `customIconName` when setting emoji, and vice versa.

**Files to change:**
- `src/hooks/usePinnedSites.ts` - add `emoji` field to interface
- `src/components/PinnedIcon.tsx` - render emoji when present, add emoji input to edit dialog
- `src/utils/backupRestore.ts` - `PinnedSite` type already imported, no schema change needed (just passes through)

#### Space emoji (complete the partial implementation)

`Space.icon` already accepts emoji strings. Fix the gaps:

**Files to change:**
- `src/utils/spaceIcons.tsx` - `getIcon()`: detect emoji (codepoint > 255) and render as `<span>` instead of Iconify `<img>`
- `src/components/SpaceNavigatorDialog.tsx` - add emoji detection to `renderIcon()` (currently missing)
- `src/components/SpaceEditDialog.tsx` - add emoji input option to the icon picker

#### Emoji detection

Reuse the existing pattern found in BookmarkTree.tsx:

```typescript
const isEmoji = (s: string) => s.codePointAt(0)! > 255;
```

Extract to a shared utility so all files use the same check:
- `src/utils/emoji.ts` - `isEmoji(s: string): boolean`

#### Emoji picker UI

Add a built-in emoji picker to `IconColorPicker.tsx` using the same virtualized grid pattern already used for Lucide icons. No new dependencies - we bundle a static emoji dataset.

**Tab switcher**: Add an `[Icons]` / `[Emoji]` tab toggle above the search bar. Both tabs share the same grid layout, search, and scroll infrastructure.

```
┌─────────────────────────────────────┐
│ Icon                                │
│ [■ Icons] [☺ Emoji]                 │
│ ┌─────────────────────────────────┐ │
│ │ 🔍 Search emoji...              │ │
│ └─────────────────────────────────┘ │
│ 😀 😃 😄 😁 😆 😅 🤣              │
│ 😊 🥰 😍 🤩 😘 😗 😚              │
│ 😋 😛 😜 🤪 😝 🤑 🤗              │
│ ...                     (scroll)    │
│                                     │
│ Color                               │
│ ● ● ● ● ● ● ● ● ●                │
└─────────────────────────────────────┘
```

**Emoji dataset**: Bundle a static TypeScript file `src/data/emojiData.ts` containing a curated list of ~1,800 common emoji (skip skin tone variants and obscure symbols):

```typescript
interface EmojiEntry
{
  emoji: string;      // "😀"
  name: string;       // "grinning face" (for search)
  category: string;   // "Smileys & Emotion"
}

export const EMOJI_DATA: EmojiEntry[] = [ ... ];
```

Source the data from [Unicode CLDR](https://github.com/unicode-org/cldr-json) or [emojibase](https://github.com/milesj/emojibase) compact dataset, transform to our minimal format at build time (or just commit the generated .ts file). Estimated size: ~80-100 KB uncompressed, ~15-20 KB gzipped.

**Category filter**: Optional horizontal category bar above the grid (Smileys, People, Animals, Food, Travel, Activities, Objects, Symbols, Flags). Clicking a category scrolls to that section. Nice-to-have for v1 - search alone is sufficient initially.

**Selection behavior**:
- Clicking an emoji calls `onIconSelect(emoji)` with the emoji character string
- This clears the Lucide icon selection (and vice versa - clicking a Lucide icon clears emoji)
- The preview box shows the emoji character directly
- `isEmoji()` utility distinguishes emoji from Lucide icon names in the stored value

**Grid reuse**: The existing virtualized grid constants (`COLS`, `ICON_SIZE`, `GAP`, `ROW_HEIGHT`, etc.) and scroll logic work as-is. The only difference is rendering: emoji cells show a `<span>` with the character instead of an `<img>` from Iconify.

**Files to create/change:**
- `src/data/emojiData.ts` - new file, static emoji dataset
- `src/components/IconColorPicker.tsx` - add tab toggle, emoji grid mode, emoji search filtering
- `src/utils/emoji.ts` - new file, shared `isEmoji()` utility

## Part 2: Custom Space Colors

### Current state

`Space.color` is typed as `chrome.tabGroups.ColorEnum` - one of 9 named colors (grey, blue, red, yellow, green, pink, purple, cyan, orange). This color is used for:

1. **Space bar display** (`SpaceIcon.tsx`) - background/text via Tailwind classes from `GROUP_COLORS` lookup
2. **Bookmark folder overlays** (`BookmarkTree.tsx`, `FolderPickerDialog.tsx`) - colored badge
3. **Chrome tab group creation** (`background.ts`) - `chrome.tabGroups.update({ color })` requires `ColorEnum`
4. **Space edit dialog** (`SpaceEditDialog.tsx`) - 9-color picker
5. **Drag data** (`SpaceIcon.tsx`) - includes color in drag payload

### Strategy

Store any color (hex string like `"#8AB4F8"` or Chrome enum name like `"blue"`). Display the actual color everywhere in our UI. Only convert to the nearest `chrome.tabGroups.ColorEnum` when calling Chrome's tab group API.

### Data model change

```typescript
interface Space
{
  id: string;
  name: string;
  icon: string;
  color: string;              // hex (e.g. "#8AB4F8") or Chrome color name (e.g. "blue")
  bookmarkFolderPath: string;
}
```

The `createSpace` function signature also changes from `color: chrome.tabGroups.ColorEnum` to `color: string`.

### Color rendering

**When color is a Chrome enum name** (e.g. `"blue"`): use existing `GROUP_COLORS[color]` Tailwind classes. No change needed.

**When color is a hex string** (e.g. `"#8AB4F8"`): use inline styles instead of Tailwind classes. Generate light/dark variants from the hex:

```typescript
function hexColorStyles(hex: string, isActive: boolean, isDark: boolean)
{
  // Active state: solid background, white/black text
  // Inactive state: light tinted background, colored text
  // Dark mode: adjust opacity/brightness
}
```

A helper function in `groupColors.ts` checks if a color string is a known Chrome enum name. If yes, use the lookup table. If no, treat as hex and generate inline styles.

### Hex to Chrome color mapping

For `chrome.tabGroups.update()` calls, map hex to nearest Chrome color by hue:

```typescript
function hexToNearestChromeColor(hex: string): chrome.tabGroups.ColorEnum
```

Same hue mapping from feature 029:

```
Hue range     Chrome color
─────────────────────────
  0° -  15°   red
 15° -  45°   orange
 45° -  70°   yellow
 70° - 160°   green
160° - 200°   cyan
200° - 260°   blue
260° - 290°   purple
290° - 330°   pink
330° - 360°   red
```

For very low saturation (< 10%), map to `grey`.

### Files to change

| File | Change |
|---|---|
| `src/contexts/SpacesContext.tsx` | `Space.color` type: `ColorEnum` → `string`. `createSpace` parameter type. |
| `src/utils/groupColors.ts` | Add `isChromeName(color)`, `hexToNearestChromeColor(hex)`, `getColorStyles(color, isActive, isDark)` helpers. |
| `src/components/SpaceIcon.tsx` | `SpaceIconVisual`: support hex colors via inline styles when `GROUP_COLORS[color]` returns undefined. |
| `src/components/SpaceEditDialog.tsx` | Add hex color input alongside the 9-color picker. Use `onColorSelect` with hex string. |
| `src/background.ts` | When calling `chrome.tabGroups.update()`, pass `hexToNearestChromeColor(space.color)` instead of `space.color` directly. |
| `src/components/BookmarkTree.tsx` | `renderSpaceIconOverlay` - support hex color for badge. |
| `src/components/FolderPickerDialog.tsx` | Same as BookmarkTree - support hex color for overlay badge. |
| `src/utils/backupRestore.ts` | `TabGroupBackup.color` stays as `ColorEnum` (that's Chrome's format). `Space.color` is already `string` in the backup - just works. |

### Migration

Existing spaces have Chrome enum names (e.g. `"blue"`). These are valid strings and `GROUP_COLORS["blue"]` still works. No migration needed - it's backward compatible.

### Space edit dialog color picker

Add a custom hex input below the 9-color circles:

```
Color
● ● ● ● ● ● ● ● ●           <- existing 9 Chrome colors
Custom: [#______] [■]         <- hex input + preview swatch
```

When a hex color is entered, it deselects the 9-circle picker. When a circle is clicked, the hex input clears. The Chrome enum name colors remain the quick-pick defaults.

## Import/Export (backup/restore)

The backup format (`FullBackup` in `backupRestore.ts`) serializes `PinnedSite[]` and `Space[]` directly. Since we're adding/changing fields on those interfaces:

- **`PinnedSite.emoji`**: New optional field. Passes through naturally - export includes it, import restores it. Older backups without `emoji` just have `undefined`, which is fine.
- **`Space.color`**: Changes from `ColorEnum` to `string`. Already stored as a plain string in JSON, so older backups with `"blue"` still work. Newer backups with `"#8AB4F8"` also work.
- **`TabGroupBackup.color`**: Stays as `chrome.tabGroups.ColorEnum` - this is Chrome's format for tab groups, not our spaces.

No backup version bump needed. Forward/backward compatible.

## Scope notes

- No full emoji picker widget - rely on OS emoji keyboard (macOS: ⌘⌃Space, Windows: Win+., Linux: varies). Add hint text below the emoji input.
- No migration needed for existing data
- The Arc import (feature 029) depends on these changes being in place first
