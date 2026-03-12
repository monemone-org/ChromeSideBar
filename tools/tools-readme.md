# Tools

## update-version.sh

- Updates version in `package.json` and `manifest.json`. Version format: `{major}.{minor}.{build_number}` where build_number is the git commit count of source-code-only commits. 

## update-news-version.sh

- Updates `docs/public/latest.version` based on the number of commits that touched `docs/news/news.md`.

## build-release.sh

Builds the extension and packages it as a zip for Chrome Web Store submission. Output goes to `releases/`.

## create-release-tag.sh

Creates a local git tag with format `release-{version}` from `package.json`.

## start-test-chrome.sh

Launches Chrome with a fresh test profile. Useful for testing the extension in isolation.

## extract-arc-icons.py

Extracts individual icon images from the Arc Browser icon picker screenshot. Used for the Arc icon picker feature (029).

## prepare-release-instructions.md

Step-by-step instructions for Claude to follow when preparing a release — version bump, changelog generation, link updates, and verification.
