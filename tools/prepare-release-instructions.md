# Prepare Release Instructions

Steps for Claude Code to help user prepare for a new release.

## Steps

### 1. Study what's changed 
- Find the git tag for the latest released version `release-{latest_released_version}`
- Run `git log` to get commits since the tag `release-{latest_released_version}` (e.g. `git log release-1.0.287..HEAD --oneline`)
- Study the commits to understand what's changed since the last release 


### 2. Update `docs/changelog.md`
- Draft a new changelog entry at the top of `docs/changelog.md` (below the `# Changelog` heading) using `## Latest Version` as the heading. If a `## Latest Version` section already exists, append new features to the list.
- Focus on user-facing changes: new features, UX improvements and serious bug fixes.
- Skip internal/build-only commits (version bumps, CI changes, doc-only updates) and minor fixes.
- Follow the existing format in `docs/changelog.md`
- Even if there are no user-facing changes, ensure there is still an empty section for this version


### 3. Update `docs/whatsnew.md`
- Update `whatsnew.md` to list what user needs to know to help them adopt the new features and the new improvements in this release, 


### 4. Update `docs/chrome-web-store-info.md`
- Update the `Key Features` section if there is any big new key feature added to this release. 
- Read the existing `Key Features` list to help decide if the new changes are qualified. Confirm with developer if unsure


### 5. Verify doc URL references in code
- Search the codebase for any hardcoded references to version number, `release-` tags
- Confirm they use the version dynamically (e.g. from `chrome.runtime.getManifest().version`) rather than a hardcoded version string
- Flag any hardcoded version references that need updating


### 6. Bump extension version
Run `./tools/update-version.sh` to update the extension version in `package.json`, `manifest.json`.


### 7. Compile `docs/public/` documents (only if news changed)
- Only needed when `docs/news/news.md` has been updated
- `docs/public/` is served in Github Pages
- run `npm run build:public-docs` to compile
  - `docs/news/news.md` -> `docs/public/news.html`
    - check in `news.md` changes. It's required for `./tools/update-news-version.sh` to update the news version number.
- run `./tools/update-news-version.sh` to update `docs/public/latest.version`


### 8. Present summary

Show the user:
- The new version number
- The generated changelog entry (for review)
- Any changes made to any `docs/*.md`
- Any flagged hardcoded version references
- Remind the user to:
  1. Review and check in the changes
  2. Run `tools/build-release.sh` to build the release
  3. Submit to the Chrome Web Store
