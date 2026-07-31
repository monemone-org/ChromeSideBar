# E2E driver

Playwright-driven browser automation, complementing the in-app unit tests in
`src/tests/`. The in-app tests can't cover anything that requires the side
panel to be closed/reopened, span multiple windows, or check real DOM/scroll
state - they run *inside* the panel's own script, which dies the moment the
panel closes. This layer drives Chrome from the outside instead.

## Status: real test cases running

`spike-panel-lifecycle.mjs` proved the load-bearing mechanism: a driver
script can reliably open, close, and reopen the side panel, confirming its
JS context truly tears down and remounts each time. That plumbing now lives
in `lib/chromeDriver.mjs` and backs `run-test-cases.mjs`, a runner that
executes test cases written as YAML files (`test-cases/*.yaml`) instead of
JavaScript, translating cases from
`docs/test/tab-space-association-test-cases.md`.

Test cases don't simulate UI clicks/drags (right-click menus, drag-and-drop,
toolbar buttons) - they call `chrome.*` APIs directly (create tabs, move
groups, remove bookmarks). The background reacts to the same underlying
Chrome events either way, so this exercises the real `background.ts` logic
without needing the panel's own page to be scriptable (which we proved it
isn't, reliably, via Playwright).

## Running it

```bash
npm run build:debug
node e2e/run-test-cases.mjs                    # runs every e2e/test-cases/*.yaml
node e2e/run-test-cases.mjs e2e/test-cases/A.1.yaml   # or just one

# run one case with narration + a brief pause between steps so you can watch it
node e2e/run-test-cases.mjs --watch e2e/test-cases/A.1.yaml

# same, but pause and wait for you to press Enter between each step
node e2e/run-test-cases.mjs --step e2e/test-cases/A.1.yaml
```

One-time manual setup (only needed once per profile, or again if
`tools/tmp/chrome-test-profile` is ever wiped):
1. Run `tools/start-test-chrome.sh`
2. Go to `chrome://extensions`, enable Developer mode
3. Click "Load unpacked", select the `dist/` folder
4. Close Chrome

**Every time `background.ts` or `testHooks.ts` changes:** rebuild AND reload
the extension in `chrome://extensions` (click "Reload" on its card), not just
rebuild. See the stale-service-worker gotcha below - this is the single
easiest way to waste an hour thinking new code is broken when it's just not
running yet.

## Writing a test case

```yaml
id: A.1
title: Regular tab moved to another space, sidebar open
section: Section A - Tab moved between spaces
initial_sidebar: open           # required - "open" or "closed", never assumed

fixture:
  spaces:
    - name: Work
    - name: Video
      # bookmarks: [{ title, url, as: refName }]  - creates a folder under
      # "Other Bookmarks" named after the space, with these bookmarks in it
  # pinnedSites: [{ title, url, as: refName }]

steps:
  - action: open_regular_tab
    url: https://example.com/regular-a
    space: Work
    as: tab1                    # symbolic ref, used by later steps

  - assert: tab_in_space
    tab: tab1
    space: Work
```

`initial_sidebar` is required and enforced by the runner (`ensureSidebarState()`
in `lib/chromeDriver.mjs`, using the same open/closed heartbeat mechanism as
the panel-lifecycle proof) - it's never left to whatever state Chrome or a
previous test case happened to leave the panel in. Use `open_sidebar`/
`close_sidebar` steps mid-test for any state changes after that.

`fixture` is seeded fresh before every test case (`lib/fixtures.mjs` resets
state first: closes all tabs, wipes the bookmark tree, clears
spaces/pinned sites). See `lib/actions.mjs` for the full list of available
`action`/`assert` names and their parameters - `open_regular_tab`,
`open_bookmark_tab`, `open_pinned_tab`, `move_tab_to_group`, `ungroup_tab`,
`close_tab`, `delete_bookmark`, `close_sidebar`, `open_sidebar`, `wait` /
`tab_in_space`, `tab_ungrouped`, `bookmark_loaded`, `pinned_loaded`. Add more
of either as new test cases need them - both are plain functions keyed by
name, no framework magic.

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
- **`chrome.runtime.sendMessage()` called from inside the service worker
  doesn't loop back to its own `onMessage` listener** - there's no other
  context receiving it, so it fails with "Could not establish connection."
  Setup code that needs to invoke background-only logic (like registering a
  tab's space in `TabSpaceRegistry`) can't reuse the real message action the
  same way a real sidebar would trigger it.
- **`TabSpaceRegistry` keeps an in-memory `Map` that's only loaded from
  `chrome.storage.session` once at service worker startup** - writing to that
  storage key directly from setup code would NOT affect the actually-running
  instance's behavior, since nothing re-reads storage after startup. Fix for
  both of the above: a small DEV-only `globalThis.__testHooks.registerTabSpace()`
  bridge in `background.ts` that calls the real `tabSpaceRegistry.register()`
  method directly, rather than trying to fake either the message or the
  storage write from outside.

## Extending this

Translate more cases from `docs/test/tab-space-association-test-cases.md`
into `test-cases/*.yaml`. Most of Section A/B/D should be straightforward -
they're pure `chrome.*` API mechanics. Section C ("Follow active tab" modes)
will need new assertions that read real DOM/scroll state, which means finally
solving the "can't reliably attach to the panel's page" problem, or finding
another storage-bridge workaround like the heartbeat/registry ones above.
