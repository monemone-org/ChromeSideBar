---
created: 2026-01-07
after-version: 1.0.136
status: completed
---

# Tab History Navigation

Navigate between recently used tabs like undo/redo. Super handy for jumping back to "that tab I was just looking at."

## Hotkeys

Configured in `manifest.json` under `commands`. Users can customize via `chrome://extensions/shortcuts`.

| Command            | Default Key   | Action         |
|--------------------|---------------|----------------|
| `prev-used-tab`    | `Cmd+Shift+<` | prev used tab  |
| `next-used-tab`    | `Cmd+Shift+>` | next used tab  |

## How it works

- keep a history stack of activated tabs
- track current position in the stack with a pointer
- `Cmd+Shift+<` moves pointer back (older)
- `Cmd+Shift+>` moves pointer forward (newer)
- activating a new tab pushes it to the stack

**Key behavior:** if you go back in history then activate a new tab, the new tab is inserted after current position. Forward history is preserved.

## Stack visualization

```
┌─────────────────────────┐
│ [C]  <-- forward end    │
│ [B]                     │
│ [A]  <-- back end       │
│                         │
│ current: points to one  │
│ of these entries        │
└─────────────────────────┘
```

`Cmd+Shift+<` goes down (back), `Cmd+Shift+>` goes up (forward).

## Examples

### Example A: basic back/forward

1. activate tab A
2. activate tab B

```
stack after step 1:    stack after step 2:
[A] <-- current        [B] <-- current
                       [A]
```

now try the hotkeys:

```
Cmd+Shift+< (back):    Cmd+Shift+> (forward):
[B]                    [B] <-- current
[A] <-- current        [A]
```

### Example B: back then activate new tab

1. activate tab A
2. activate tab B
3. `Cmd+Shift+<` to go back to A
4. activate tab C

```
after step 2:          after step 3:          after step 4:
[B] <-- current        [B]                    [B]
[A]                    [A] <-- current        [C] <-- current
                                              [A]
```

C is inserted after A. B is still in the stack (forward history preserved).

```
Cmd+Shift+> from here:   Cmd+Shift+< from here:
[B] <-- current          [B]
[C]                      [C]
[A]                      [A] <-- current
```

## Edge cases

### at stack boundaries
- `Cmd+Shift+<` at oldest entry: do nothing
- `Cmd+Shift+>` at newest entry: do nothing

### tab gets closed
if a tab in history gets closed:
- remove it from the stack
- if it was the current entry, move current to nearest valid entry
- navigating should just skip over missing entries gracefully

### duplicate activations
if user clicks the same tab multiple times, don't spam the stack with duplicates. only push if it's different from current entry.

### extension reload / browser restart
- stack resets on extension reload (probably fine, don't need persistence)
- could persist to storage if we want history to survive restarts (next version, maybe)

### stack size limit
- keep ±25 entries around current position
- max stack size = 51 (25 back + current + 25 forward)
- only trim when adding new tab, not when navigating
- if >25 entries in back history, trim from the back end
- if >25 entries in forward history, trim from the forward end

## Open questions

- navigation via hotkeys itself should not be added to history
- no need to make any visual indicator for current position in history
- this work per-window only?
