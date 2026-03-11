---
created: 2026-03-10
after-version: 1.0.287
status: draft
---

# News & Updates

## Purpose

Communicate with users about release changes, announcements, known issues, and workarounds. Currently there's no way to reach users between releases (e.g. to warn about a Chrome API bug and its workaround).

## Target Personas

All extension users.

## Two Mechanisms

### 1. Upgrade Changelog (Bundled)

Shows what's new after the extension updates. Content is bundled in the extension code.

- **Trigger**: On startup, compare `lastSeenVersion` (stored in local storage) against the current extension version from `chrome.runtime.getManifest().version`
- **When version changes**: Show an in-app "What's New" dialog with the release notes
- **Content**: Hardcoded per-version data in the extension (similar to the welcome dialog pattern)
- **After viewing**: Update `lastSeenVersion` to the current version
- **New installs**: If this is a fresh install (welcome dialog will be shown), skip the "What's New" dialog. Set `lastSeenVersion` to the current version so it doesn't trigger after the welcome dialog is dismissed.
- **Migration**: Convert existing `sidebar-has-seen-welcome` boolean to `lastSeenVersion`. If the boolean is `true`, set `lastSeenVersion` to current version (skip showing changelog for existing users on first migration)

#### Content per version

Each version entry includes:
- Version number
- List of changes (new features, improvements, fixes)
- Optional known issues / limitations

Not every version needs an entry. If no entry exists for the current version, skip the dialog silently.

### 2. News Announcements (Remote)

Periodic check for announcements hosted on GitHub. For communicating things that aren't tied to a specific release — Chrome bugs, workarounds, tips, feature highlights.

#### Files on GitHub

- **`docs/news/latest.version`** — contains a single integer: the current `newsVersion`. Tiny file, cheap to fetch.
- **`docs/news/news.md`** — the actual content. Rendered by GitHub's markdown viewer.

#### How it works

- **Periodic check**: Once a week, fetch `latest.version` from the GitHub raw URL
  - Track `lastNewsCheckTime` in local storage to throttle checks
- **Compare**: If the fetched newsVersion > stored `lastSeenNewsVersion`, there's new content
- **Red dot badge**: Show a red dot indicator on the config/settings button in the toolbar
- **User clicks**: Config menu shows a "News" item (with red dot). Clicking it opens `news.md` on GitHub in a new tab
- **Clear badge**: The red dot clears when the user either clicks "News" (opens the page) or hovers over the "News" menu item and then closes the menu. This lets users dismiss the notification without reading if they choose. In both cases, update `lastSeenNewsVersion` to the fetched newsVersion.

#### `docs/news/news.md` format

Reverse chronological entries. Each entry has a date and title. Content is freeform — announcements, known issues, workarounds, feature highlights.

```markdown
# SideBar News

## 2026-03-10 — Chrome Tab Group Bug Fix

Chrome's tab group API bug is scheduled to be fixed today.
Once Chrome updates, Spaces should work normally again.

## 2026-02-20 — Known Issue: Chrome Tab Group Bug

Chrome introduced a bug where creating/renaming tab groups via the API
fails. A workaround is in place but after Chrome restarts, groups may
revert to "Unnamed Group". Rename them back to the Space name to fix.
```

#### Failure handling

- If the fetch fails (no network, GitHub down), silently skip until the next weekly check
- No retry logic — just wait for the next scheduled check

## User Workflows

### After extension upgrade

1. User's Chrome auto-updates the extension
2. User opens the sidebar
3. Extension detects version changed → shows "What's New" dialog
4. User reads the notes, clicks "Got it" / closes the dialog
5. `lastSeenVersion` updates, dialog won't show again for this version

### New announcement published

1. Developer updates `docs/news/news.md` with new entry and bumps `docs/news/latest.version`
2. Developer pushes commit to GitHub (no extension release needed)
3. Within a week, the extension fetches `latest.version` and detects new newsVersion
4. Red dot appears on the config button
5. User clicks config → sees "News" with a red dot → clicks it
6. GitHub page opens with the announcement
7. Red dot clears

### Manual access

- **"What's New"** link in the About dialog — re-opens the upgrade changelog for the current version
- **"Changelog"** link in the About dialog — opens `docs/changelog.md` on GitHub at the user's installed version tag
- **"News"** item in the config menu — always available, opens `news.md` on GitHub

## Changelog File

### Move changelog out of chrome-web-store-info.md

- Move the full changelog from `docs/chrome-web-store-info.md` to `docs/changelog.md`
- Remove the changelog section from `chrome-web-store-info.md` — store listing should focus on what the extension does for new users, not version history
- Add a link to the full changelog at the current release tag: `[Full Changelog](https://github.com/monemone-org/ChromeSideBar/blob/release-{version}/docs/changelog.md)` — update the version in this link as part of each release
- `docs/changelog.md` continues to be updated with each release

### Version-tagged changelog link

The About dialog "Changelog" link points to `changelog.md` at the release tag matching the installed version:

`https://github.com/monemone-org/ChromeSideBar/blob/release-{version}/docs/changelog.md`

This way users see the changelog as it was at their installed version, not unreleased entries on `main`. The URL is built dynamically from `chrome.runtime.getManifest().version`.

## UI Elements

### Upgrade changelog dialog

Reuses the existing `Dialog` component. Similar layout to the welcome dialog — title, content list, close button. No pagination needed (single page per version).

### Red dot badge on config button

Small red circle indicator overlaid on the config/settings button in the toolbar. Visible until the user views the news.

### Config menu "News" item

New menu item in the config/settings popup menu. Shows the red dot inline when there's unread news. The red dot on the config button is inherited from this item — it appears on the config button because the "News" item has unread content.

### About dialog links

- **"What's New"** — re-opens the upgrade changelog dialog for the current version
- **"Changelog"** — opens `changelog.md` on GitHub at the `release-{version}` tag
- **"News"** — opens `news.md` on GitHub (`main` branch)

## Release Process

See `docs/prepare-release-instructions.md` for the full release prep procedure — version bump, changelog generation, link updates, and verification.

## Local Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `lastSeenVersion` | string | Last extension version the user has seen the changelog for |
| `lastSeenNewsVersion` | number | Last newsVersion the user has acknowledged |
| `lastNewsCheckTime` | number | Timestamp (ms) of last `latest.version` fetch |

## GitHub URLs

- `latest.version`: `https://raw.githubusercontent.com/monemone-org/ChromeSideBar/main/docs/news/latest.version`
- `news.md`: `https://github.com/monemone-org/ChromeSideBar/blob/main/docs/news/news.md`
- `changelog.md`: `https://github.com/monemone-org/ChromeSideBar/blob/release-{version}/docs/changelog.md`
