# CLAUDE.md

Project-specific instructions for coding agent

## Project Overview

Chrome sidebar extension built with React, TypeScript, and Tailwind CSS.
Read `READEME.md` for more details about the extension.

## Development Workflow

1. **Always discuss first** - Before editing any file or executing any command, explain what you plan to do and get explicit approval. This applies in ALL modes, not just plan mode.
2. **Minimize dependencies** - Avoid adding new npm packages unless necessary; prefer native browser APIs and existing libraries
3. **Incremental changes** - Make small, focused changes that are easy to review

## Build & Test

- Build: `npm run build`

Do not run build after making changes. Notify the user to compile and verify.
Do not run `git add` or `git commit`. Notify the user to add and commit.

## Code Style

- Use TypeScript strict mode
- Follow existing patterns in the codebase

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

### Feature ID

`docs/features/next-id.txt` tracks the next available feature ID number. When creating a new feature doc, use the ID from this file as the doc's number prefix (e.g., `026-my-feature.md`), then increment the value in `next-id.txt`.

### Feature Docs Format

All feature docs in `docs/features/` must have YAML front matter:

```yaml
---
created: YYYY-MM-DD
after-version: X.X.XXX
status: draft | in-progress | completed | finalized | aborted
---
```

- `created`: Date file was first committed
- `after-version`: Extension version at time of creation (feature built after this version)
- `status`: Feature status 

## Versioning

**Before running command git-commit-msg**, update extension version number with:

```bash
./tools/update-version.sh
```

