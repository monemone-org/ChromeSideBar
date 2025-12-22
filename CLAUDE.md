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
- Dev: `npm run dev`
- Lint: `npm run lint`

Do not run build after making changes. Notify the user to compile and verify.

## Code Style

- Use TypeScript strict mode
- Follow existing patterns in the codebase
