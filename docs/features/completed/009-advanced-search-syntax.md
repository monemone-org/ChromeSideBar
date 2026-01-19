---
created: 2026-01-09
after-version: 1.0.140
status: completed
---

# Advanced Search Syntax

## Overview

Add boolean search operators to the tab/bookmark search bar, allowing complex queries like `(youtube || instagram) && canada`.

**Target users**: Power users with many tabs who need precise filtering.

## Syntax

| Operator | Meaning | Example |
|----------|---------|---------|
| `\|\|` | OR - match either term | `youtube \|\| instagram` |
| `&&` | AND - match both terms | `youtube && canada` |
| *(space)* | Implicit AND | `youtube canada` = `youtube && canada` |
| `!` | NOT - exclude term | `youtube !shorts` |
| `( )` | Grouping | `(youtube \|\| instagram) && news` |
| `"..."` or `'...'` | Exact phrase | `"react hooks"` or `'react hooks'` |
| `""...""` | Phrase with quotes | `""say "hello"""` matches `say "hello"` |

**Quoted strings:**
- `"..."` - double quotes for exact phrase
- `'...'` - single quotes for exact phrase
- `""...""` or `'''...'''` - matching pairs of multiple quotes to include quotes in phrase
  - e.g. `""His name is "Peter".""` matches literal `His name is "Peter".`

**Precedence** (highest to lowest):
1. Quoted phrases (`"..."`, `'...'`)
2. `!` negation
3. `( )` grouping
4. `&&` AND
5. `||` OR
6. *(space)* implicit AND (same as `&&`)

## Examples

```
youtube || instagram           → tabs with "youtube" OR "instagram"
youtube && canada            → tabs with both "youtube" AND "canada"
youtube canada               → same as above (space = implicit AND)
(youtube || instagram) && news → tabs with ("youtube" or "instagram") AND "news"
react !tutorial              → tabs with "react" but NOT "tutorial"
"react hooks"                → tabs containing exact phrase "react hooks"
'single quoted'              → same as double quotes
""say "hi"""                 → tabs containing literal: say "hi"
!(youtube || instagram)        → tabs without "youtube" AND without "instagram"
```

## Design Decisions

| Question | Decision |
|----------|----------|
| Case sensitivity | Case-insensitive (match current behavior) |
| Match target | Title and URL (match current behavior) |
| Empty/whitespace-only | Show all tabs (no filter) |
| Invalid syntax | Fall back to literal search of the entire string |
| Escape characters | Not supported (keep it simple) |

## Implementation

### New File: `src/utils/searchParser.ts`

Parser that converts search string to an AST, then evaluates against tab/bookmark:

```
Input: "(youtube || instagram) && canada"

AST:
{
  type: 'AND',
  left: {
    type: 'OR',
    left: { type: 'TERM', value: 'youtube' },
    right: { type: 'TERM', value: 'instagram' }
  },
  right: { type: 'TERM', value: 'canada' }
}

Evaluator:
matchesSearch(tab, ast) → boolean
```

**Functions:**
```typescript
// Parse search string into AST (returns null if invalid syntax)
parseSearchQuery(query: string): SearchAST | null

// Evaluate AST against a searchable item
matchesSearch(title: string, url: string, ast: SearchAST): boolean

// Convenience function combining both
filterBySearch(query: string, items: Array<{title: string, url: string}>): Array<...>
```

### Modified Files

**`src/components/TabList.tsx`**
- Replace simple `.includes()` filter with `matchesSearch()` call

**`src/components/BookmarkTree.tsx`**
- Replace simple `.includes()` filter with `matchesSearch()` call

**`src/components/PinnedBar.tsx`**
- Replace simple `.includes()` filter with `matchesSearch()` call

## Parser Implementation Notes

Use recursive descent parser:

```
expression   → orExpr
orExpr       → andExpr ('||' andExpr)*
andExpr      → unaryExpr (('&&' | whitespace) unaryExpr)*
unaryExpr    → '!'* primaryExpr
primaryExpr  → '(' expression ')' | quotedString | term
term         → [^\s()"'|&!]+
quotedString → multiQuote | singleQuote | doubleQuote
doubleQuote  → '"' [^"]* '"'
singleQuote  → "'" [^']* "'"
multiQuote   → '""' .* '""' | "''" .* "''"   (greedy match of delimiter)
```

**Tokenizer approach:**
1. Scan for multi-quote delimiters first (`""`, `'''`, etc.)
2. Then single/double quotes
3. Then operators: `||`, `&&`, `!`, `(`, `)`
4. Then whitespace (implicit AND boundary)
5. Remaining text = terms

**Edge cases:**
- `||` at start/end → invalid, fall back to literal search
- Unmatched `(` or `)` → invalid, fall back to literal search
- Empty `""` or `''` → matches empty string (matches everything)
- `!!term` → double negation, evaluates as positive match
- Unclosed quote → invalid, fall back to literal search

## UI Changes

### Help Tips Button

Add a `(?)` button at the end of the search bar (after the save button) that shows a quick help popup.

```
┌─────────────────────────────────────────────────────────┐
│ [Filter input...........................] [x] [v] [S] [?] │
└─────────────────────────────────────────────────────────┘
                                                       ↑
                                                   tips button
```

**On click**: Show a tooltip/popover with syntax quick reference:

```
┌─────────────────────────────────────┐
│ Search Syntax                       │
├─────────────────────────────────────┤
│ space      implicit AND             │
│ &&         AND                      │
│ ||         OR                       │
│ !          NOT                      │
│ ( )        grouping                 │
│ "..." '...'  exact phrase           │
├─────────────────────────────────────┤
│ Examples:                           │
│ youtube canada                      │
│ youtube || instagram                  │
│ react !tutorial                     │
│ (a || b) && c                       │
└─────────────────────────────────────┘
```

**Implementation**:
- Add `HelpCircle` icon from lucide-react
- Use a simple popover (click to toggle, click outside to close)
- Position: below the button, right-aligned

### Modified File

**`src/components/Toolbar.tsx`**
- Add `(?)` help button after save button
- Add state for popover visibility
- Add popover content with syntax reference

## Implementation Order

1. `src/utils/searchParser.ts` - tokenizer + parser + evaluator
2. Unit tests for parser (various query combinations)
3. `TabList.tsx` - integrate `matchesSearch()`
4. `BookmarkTree.tsx` - integrate
5. `PinnedBar.tsx` - integrate
6. `Toolbar.tsx` - add help tips button and popover
7. Manual testing with edge cases
