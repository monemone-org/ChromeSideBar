# Project: Svelte Cross-Browser Sidebar Extension

## Iteration
Iteration 1

## Phase
requirements — complete

## Decisions
- Drop Safari support — APIs too limited (decided 2026-03-01)
- Use Plain Svelte + Vite (not SvelteKit) — no need for SSR/routing in an extension (decided 2026-03-01)
- New code lives in `./svelte-ver/`, original Chrome version untouched (decided 2026-03-01)
- Copy shared logic rather than symlink/monorepo (decided 2026-03-01)
- Target Chrome + Firefox with full feature parity (decided 2026-03-01)
- Stack: Svelte + Vite + TypeScript + Tailwind CSS (decided 2026-03-01)
- Use browser abstraction layer for Chrome vs Firefox API differences (decided 2026-03-01)
- Use Mozilla webextension-polyfill for namespace/promise compat (decided 2026-03-01)
- Build-time manifest generation: `npm run build:chrome` and `npm run build:firefox` (decided 2026-03-01)
- Use svelte-dnd-action for drag-and-drop (decided 2026-03-01)
- Use lucide-svelte for icons (decided 2026-03-01)

## Steps
(not yet defined — Phase 3)

## Current Step
N/A — still in Phase 1

## Open Questions
(none)

## Feedback & Limitations
(none yet)

## Completed Work
(none yet)
