# How the Docs Files Are Used

## whatsnew.md

Shows users what changed after an extension upgrade, displayed inside the extension itself.

- **Build**: 
  - Vite plugin (`vite-plugins/whatsnew.ts`) compiles `docs/whatsnew.md` into `whatsnew.html` substituting `{CURRENT_VERSION}` with the version from `manifest.json`. 
  - The HTML is emitted as a bundled asset in the extension build output.
- **Runtime**: `WhatsNewDialog` (`src/components/WhatsNewDialog.tsx`) loads `whatsnew.html` in an iframe. Shown automatically on first open after an upgrade, and available from the config menu's "What's New" item.

## news.md

Announcements that can arrive between releases — things like Chrome bug alerts or tips.

- **Build**: `npm run build:public-docs` (`vite-plugins/compile-docs-html.mjs`) compiles `docs/news/news.md` into `docs/public/news.html`.
- **Hosting**: `docs/public/news.html` is served via GitHub Pages at `https://monemone-org.github.io/ChromeSideBar/public/news.html`.
- **Version tracking**: `docs/public/latest.version` holds a single integer (commit count touching `news.md`). Updated by `tools/update-news-version.sh`.
- **Runtime**: The background script (`src/background.ts`) fetches `latest.version` from GitHub Pages weekly. `useNewsCheck` hook (`src/hooks/useNewsCheck.ts`) compares latest vs last-seen version and shows a red dot badge in the config menu. Clicking "News" in the config menu or the About dialog (`src/components/AboutDialog.tsx`) opens `NEWS_URL` (`src/constants/urls.ts`) — the GitHub Pages `news.html`.

## changelog.md

Full version-by-version changelog.

- **Build**: `npm run build:public-docs` compiles `docs/changelog.md` into `docs/public/changelog.html`. Only run at release time, so the HTML reflects the last published release while the markdown on `main` may have newer entries.
- **Hosting**: `docs/public/changelog.html` is served via GitHub Pages at `https://monemone-org.github.io/ChromeSideBar/public/changelog.html`.
- **Usage**: Linked from the Chrome Web Store description in `docs/chrome-web-store-info.md`. Not referenced by extension code directly.

## chrome-web-store-info.md

Reference doc for the Chrome Web Store listing — summary, description, and key features.

- **Usage**: Copy-pasted into the Chrome Web Store developer dashboard when publishing. Not used by extension code or build scripts.
