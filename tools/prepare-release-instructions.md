# Prepare Release Instructions

Steps for Claude to follow when the user says "prepare release".

## Steps

### 1. Bump version

Run `./tools/update-version.sh` to update the version in `package.json` and `manifest.json`. Note the new version number from the output.

### 2. Generate changelog entry

- Read `docs/changelog.md` to find the latest version entry
- Run `git log` to get commits since the tag `release-{latest_changelog_version}` (e.g. `git log release-1.0.287..HEAD --oneline`)
- Draft a new changelog entry at the top of `docs/changelog.md` (below the `# Changelog` heading) using the new version number
- Focus on user-facing changes: new features, improvements, bug fixes
- Skip internal/build-only commits (version bumps, CI changes, doc-only updates)
- Follow the existing format in `docs/changelog.md`

### 3. Update chrome-web-store-info.md

- Update the changelog link in `docs/chrome-web-store-info.md` to point to the new version tag:
  `https://github.com/monemone-org/ChromeSideBar/blob/release-{new_version}/docs/changelog.md`
- Update the "What's New" section if present to reflect the latest release highlights

### 4. Verify changelog URL references in code

- Search the codebase for any hardcoded references to `changelog.md` or `release-` tags
- Confirm they use the version dynamically (e.g. from `chrome.runtime.getManifest().version`) rather than a hardcoded version string
- Flag any hardcoded version references that need updating

### 5. Present summary

Show the user:
- The new version number
- The generated changelog entry (for review)
- Any changes made to `chrome-web-store-info.md`
- Any flagged hardcoded version references
- Remind the user to review, build, and test before committing
