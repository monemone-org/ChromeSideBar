# How the Docs Files Are Used

## changelog.ts (`src/data/changelog.ts`)

Shows users what changed after an extension upgrade, displayed inside the extension itself.

- **Data**: `CHANGELOG` is a `Record<string, string[]>` mapping version numbers to lists of user-facing feature descriptions. Versions with only bug fixes are simply omitted - no entry means no dialog for that upgrade.
- **Runtime**: On launch, `getWhatsNewSince(lastSeenVersion)` collects all feature items from versions newer than the user's last seen version. `WhatsNewDialog` (`src/components/WhatsNewDialog.tsx`) renders them as a flat bullet list. Shown automatically on first open after an upgrade with new features, and available from the config menu's "What's New" item.
- **To add entries**: When releasing a version with notable features, add a new key to `CHANGELOG` with the new version number and a list of short feature strings.

## news.md

Announcements that can arrive between releases — things like Chrome bug alerts or tips.

- **Build**: `npm run build:public-docs` (`vite-plugins/compile-docs-html.mjs`) compiles `docs/news/news.md` into `docs/public/news.html`.
- **Hosting**: `docs/public/news.html` is served via GitHub Pages at `https://monemone-org.github.io/ChromeSideBar/public/news.html`.
- **Version tracking**: `docs/public/latest.version` holds a single integer (commit count touching `news.md`). Updated by `tools/update-news-version.sh`.
- **Runtime**: The background script (`src/background.ts`) fetches `latest.version` from GitHub Pages weekly. `useNewsCheck` hook (`src/hooks/useNewsCheck.ts`) compares latest vs last-seen version and shows a red dot badge in the config menu. Clicking "News" in the config menu or the About dialog (`src/components/AboutDialog.tsx`) opens `NEWS_URL` (`src/constants/urls.ts`) — the GitHub Pages `news.html`.

