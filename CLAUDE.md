# CLAUDE.md

Project-specific instructions for coding agent

## Project Overview

Read `READEME.md` for more details about the extension.

## Development Workflow

<Important>
1. **Always discuss first** - Before editing any file or executing any command, explain what you plan to do and get explicit approval. This applies in ALL modes, not just plan mode.
</Important>
2. **Minimize dependencies** - Avoid adding new npm packages unless necessary; prefer native browser APIs and existing libraries

## Build & Test

Do not run build after making changes. Notify the user to compile and verify.
Do not run `git add` or `git commit`. Notify the user to add and commit.

## Design Assumptions

- A bookmark folder belongs to at most one Space. Not enforced in the UI, but code that resolves a bookmark to its Space (e.g. tab/space association logic) assumes this and picks the first matching Space if a folder is somehow shared by more than one.

## Code Style

- Before loops and sizable `if` blocks, add a short comment explaining what the loop/block is for
- Prefer classes with descriptive methods over raw data structures (Records, Maps, plain objects). If code skips a high-level concept and directly manipulates low-level primitives (e.g. `Object.entries(x).filter(...)`, `map.get(key)!.field`), wrap it in a class that expresses the intent

## Shared Utilities

### Chrome API Error Handling

Use `createChromeErrorHandler` from `src/utils/chromeError.ts` for handling Chrome API errors in hooks:

```typescript
import { createChromeErrorHandler } from '../utils/chromeError';

const [error, setError] = useState<string | null>(null);
const handleError = useCallback(
  createChromeErrorHandler('YourContext', setError),
  []
);
```

This provides consistent error logging and state management across all Chrome API calls.

### Local Storage

Use `chrome.storage.local` (via `useChromeLocalStorage` hook) for new persistent state. Legacy code uses `localStorage` (`useLocalStorage` hook) — don't migrate existing keys, but all new keys should use `chrome.storage.local` for consistency and cross-window sync.

### debug log with console.log

Only enable logging in debug build:
```typescript
  if (import.meta.env.DEV)
  {
      console.log(...);
  }
```

## Documentation

- `docs/chrome-web-store-info.md` - Chrome Web Store listing (summary, description, key features, change logs)
- `docs/features/` - Feature specs
- `docs/state-reference.md` - Extension state reference

## Versioning

**Before running command git-commit-msg**, update extension version number with:

```bash
./tools/update-version.sh
```

