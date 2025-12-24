# CLAUDE.md

Project-specific instructions for Claude Code.

## Project Overview

Chrome sidebar extension built with React, TypeScript, and Tailwind CSS.

## Development Workflow

1. **Discuss before coding** - Present a plan and get approval before implementing changes
2. **Minimize dependencies** - Avoid adding new npm packages unless necessary; prefer native browser APIs and existing libraries
3. **Incremental changes** - Make small, focused changes that are easy to review

## Build & Test

- Build: `npm run build`
- Lint: `npm run lint`

Do not run build after making changes. Notify the user to compile and verify.

## Code Style

- Use TypeScript strict mode
- Follow existing patterns in the codebase

## Versioning

Version format: `{major}.{minor}.{build_number}` where build_number is the git commit count.

**Before running command git-commit-msg**, run:
```bash
./tools/update-version.sh
```

Commands:
- `./tools/update-version.sh` - Update build number only
- `./tools/update-version.sh minor` - Bump minor version
- `./tools/update-version.sh major` - Bump major version
- `./tools/update-version.sh 2 1` - Set specific major.minor
