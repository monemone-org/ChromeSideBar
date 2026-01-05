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

## Versioning

**Before running command git-commit-msg**, update extension version number with:
```bash
./tools/update-version.sh
```

