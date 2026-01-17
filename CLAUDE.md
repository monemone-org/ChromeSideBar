# CLAUDE.md

Project-specific instructions for coding agent

## Project Overview

Chrome sidebar extension built with React, TypeScript, and Tailwind CSS.
Read `READEME.md` for more details about the extension.

## Development Workflow

1. **Discuss before coding** - Present a plan and get approval before implementing changes
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

## Documentation

- `docs/chrome-web-store-info.md` - Chrome Web Store listing (summary, description, key features, change logs)
- `docs/features/` - Feature specs
- `docs/state-reference.md` - Extension state reference

### Feature Docs Format

All feature docs in `docs/features/` must have YAML front matter:

```yaml
---
created: YYYY-MM-DD
after-version: X.X.XXX
status: draft | in-progress | completed | finalized
---
```

- `created`: Date file was first committed
- `after-version`: Extension version at time of creation (feature built after this version)
- `status`: status 

## Versioning

**Before running command git-commit-msg**, update extension version number with:

```bash
./tools/update-version.sh
```

