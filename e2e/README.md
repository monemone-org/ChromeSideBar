# E2E driver

Playwright-driven browser automation, complementing the in-app unit tests in
`src/tests/`. The in-app tests can't cover anything that requires the side
panel to be closed/reopened, span multiple windows, or check real DOM/scroll
state - they run *inside* the panel's own script, which dies the moment the
panel closes. This layer drives Chrome from the outside instead.

## Status: mechanism proven

`spike-panel-lifecycle.mjs` answers the load-bearing question behind
automating any "sidebar closed" case in
`docs/test/tab-space-association-test-cases.md`: can a driver script reliably
open, close, and reopen the side panel, and confirm its JS context truly
tears down and remounts each time? **Yes** - all three steps (open/close/
reopen) pass reliably. See "What we learned" below for the real gotchas hit
getting there; several cost significant debugging time and are worth reading
before extending this.

## Running it

```bash
npm run build:debug   # dist/ must include the heartbeat writes from src/tests/testHooks.ts
```

One-time manual setup (only needed once per profile, or again if
`tools/tmp/chrome-test-profile` is ever wiped):
1. Run `tools/start-test-chrome.sh`
2. Go to `chrome://extensions`, enable Developer mode
3. Click "Load unpacked", select the `dist/` folder
4. Close Chrome

Then:

```bash
node e2e/spike-panel-lifecycle.mjs
```

This launches real Chrome against `tools/tmp/chrome-test-profile` (the same
profile used for manual testing - the extension persists there once loaded,
so no CLI extension flags are needed on subsequent launches).

**Every time `background.ts` or `testHooks.ts` changes:** rebuild AND reload
the extension in `chrome://extensions` (click "Reload" on its card), not just
rebuild. See the stale-service-worker gotcha below - this is the single
easiest way to waste an hour thinking new code is broken when it's just not
running yet.

Read the `[open]` / `[close]` / `[reopen]` PASS/FAIL lines in the output -
whichever one fails first tells you what broke.

## What we learned

- **Real branded Google Chrome silently ignores `--load-extension` /
  `--disable-extensions-except`** (locked down circa 2024 to stop malware
  abusing them). Can't load the extension fresh via CLI flags - it has to
  already be registered in the profile from a prior manual "Load unpacked".
- **Playwright's `launchPersistentContext()` launch wrapper silently lost the
  Chrome process** shortly after start, against this Chrome build. Spawning
  Chrome ourselves with `--remote-debugging-port` and attaching via
  `chromium.connectOverCDP()` worked where `launchPersistentContext()` did
  not - see `diag-launch-chrome.mjs` for the isolated repro.
- **`tell application "Google Chrome" to activate` is ambiguous** when more
  than one Google Chrome process is running (e.g. your regular browsing
  profile alongside this test instance) - macOS may bring the wrong one
  frontmost, silently sending the keystroke to someone else's window. Target
  the spawned process by its actual unix pid instead (two SEPARATE
  `osascript` invocations for set-frontmost vs. confirm-frontmost - bundling
  both into one script read back a stale/cached value before the window
  server finished the actual focus switch).
- **The side panel doesn't reliably surface as a Playwright `page`** in
  `context.pages()`, even though the keystroke visibly opens/closes it. Don't
  try to find/evaluate the panel's own page from the driver at all - instead
  have the panel write heartbeat timestamps to `chrome.storage.session` and
  read them back through the **service worker**, which always attaches
  reliably.
- **Page-lifecycle events (`pagehide`) race with async storage writes on
  teardown** - the panel's own attempt to write "I'm closing now" can lose
  the race against its own context being destroyed. Fix: the panel opens a
  `chrome.runtime.connect({name: 'testHooksPanel'})` port on mount; the
  **background** (not the panel) writes the closed-timestamp on
  `port.onDisconnect`, since ports reliably fire disconnect even on abrupt
  teardown and the background is never the thing being torn down.
- **The big one: Chrome's service worker is a registered script cached in the
  profile.** Rebuilding `dist/background.js` does NOT make Chrome pick it up.
  Extension pages (`index.html` etc.) are re-read from disk on every load,
  but the service worker only re-registers when Chrome detects the extension
  version changed. Since `manifest.json`'s version doesn't bump on every
  `build:debug`, a plain rebuild silently keeps running the OLD background
  script - no error, no warning, it just quietly doesn't have your new code.
  This was the actual root cause behind a long stretch of "the listener just
  won't register" debugging. Fix: after any `background.ts` change, either
  bump the version (`tools/update-version.sh`) or manually click "Reload" in
  `chrome://extensions` before rerunning the driver.

## Next: real test cases

The intended shape: `src/tests/testHooks.ts` grows more functions (setup
helpers, state-dump helpers written to `chrome.storage.session` and read via
the service worker, following the pattern above) mirroring the existing
`src/tests/*Test.ts` pattern. This script's open/close/reopen plumbing
becomes reusable orchestration that real test files call into, with the
driver (not any single page's script) coordinating multi-step scenarios like
"open a bookmark tab, close the panel, move the tab's group via the
background service worker, reopen the panel, assert whether the association
went stale."
