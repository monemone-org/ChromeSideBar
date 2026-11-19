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

This script starts Chrome with a separate test profile in `tools/tmp/chrome-test-profile`. You can then test the extension away from your usual profile. The profile stays between launches. The script gives Chrome these flags:

- `--remote-debugging-port=9333` opens the Chrome DevTools Protocol (CDP) on port 9333. CDP is the protocol that lets a program control Chrome. `cdp.mjs` and `run-inpanel-tests.mjs` use it.
- `--no-default-browser-check` and `--no-first-run` stop the prompts that Chrome shows when it starts.
- `--autoplay-policy=no-user-gesture-required` lets a page play audio with no click. In unattended mode, the audio cases of the in-panel test runner play the tone page, `test-audio.html`. The audio cases passed with this flag on. Nobody tested them without it.
- `--disable-backgrounding-occluded-windows`, `--disable-background-timer-throttling`, and `--disable-renderer-backgrounding` stop Chrome from slowing down a window that is covered or not in front. Without these flags, Chrome slows down an unattended run in the background. The delay is enough to break steps that depend on timing. With the flags, a run does the same thing when somebody watches it and when nobody does.

The tools below need the extension loaded unpacked in this Chrome. To load it, turn on Developer mode in `chrome://extensions` and click **Load unpacked**. Build the extension with `npm run build:debug` first. The test runner, the tone page, the parked page, and the shortcut message are only in a development build.

The driver looks for the extension in the `dist` folder of the checkout that you run the driver from. If you run it in this worktree, it uses the `dist` folder of the worktree. If you run it in the main checkout, it uses the `dist` folder of the repository. To use a different extension, give its id as `extensionId` in the configuration file.

## run-inpanel-tests.mjs

This script, the driver, runs the in-panel test suite (`src/tests/inpanel/`) in the test Chrome with nobody at the keyboard. It also does the pause steps that only a program outside the extension can do. It stops the service worker for E.3 and P.8, and it reloads the extension for E.1. For P.6, it clears the browsing history of Chrome, but only when Chrome uses a profile that is inside `tools/tmp/` and is not signed in to any account. The section "P.6 and the profile guard" below gives the details. The driver uses only the built-in `fetch` and `WebSocket` of Node, through `cdp-client.mjs`. It needs Node 22 or later and no npm package.

To run the driver:

1. Start the test Chrome with `start-test-chrome.sh`.
2. Run this exact command:

```bash
node tools/run-inpanel-tests.mjs
```

The command takes no arguments. The sandbox of Claude Code lets this one exact command run outside the sandbox. An argument makes it a different command, and the sandbox blocks that command. For this reason, the driver reads its configuration from the file `tools/tmp/run-inpanel-tests.json`. If the file does not exist, every case runs. A full line that starts with `//` is a comment. Each key is optional:

```jsonc
{
  // Which cases to run, by section letter or by case id. If both are given, a case runs
  // when it matches either. If neither is given, every case runs.
  "sections": ["E", "P"],
  "cases": ["A.1", "C.2g"],
  // Give up after this many minutes (default 45)
  "timeoutMinutes": 45,
  // Only needed if finding the extension by its dist folder does not work
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  // Leave the test and helper windows open at the end, for a look around
  "keepWindows": false,
  // The DevTools port start-test-chrome.sh opened (default 9333)
  "cdpPort": 9333
}
```

The driver does these steps:

1. It finds the unpacked build of this worktree in `chrome://extensions`. If the extension is disabled, the driver enables it.
2. It opens two windows of its own. The first window holds a helper tab, which is an extension page that gives the driver the `chrome.*` API outside the panel. The second window is a new test window with the side panel open.
3. It opens the Test Runner, selects the cases, turns on **Unattended**, and clicks **Run Tests**.
4. During the run, it reads the state of the runner in `chrome.storage.local`. When a pause has the `external` mark, the driver does the action and clicks Resume.
5. At the end, it closes the windows that it opened. It also closes new windows that the run left open, but only when every tab in them is a test page or an extension page. It never closes a window that was open before the run started.
6. It puts back your own Test Runner settings: the cases that you ticked, and the state of the Unattended checkbox. A later manual run then starts the way that you left it.

The driver writes the results to `tools/tmp/test-results-<timestamp>.json`. The file has the same format as the **Download Results** file of the panel, plus a `driver` section. The `driver` section lists the skipped cases and the cases that gave no result. It also lists the external actions that the driver did, and the errors in the driver itself. The driver also prints a summary in the terminal.

If you stop the run with Ctrl-C, the driver still writes the results and cleans up. It has a 30-second grace period for this. If you press Ctrl-C a second time, the driver stops at once and does not write results or clean up.

The exit code tells you the result of the run:

- 0 means that each case that ran passed, failed only at its known-gap step, or was skipped as expected.
- 1 means anything else. Examples are a selected case that gave no result, and an error in the driver itself.
- 130 or 143 means that SIGINT or SIGTERM stopped the driver.

Two lists near the top of the script tell the driver which results are expected:

- `EXPECTED_MANUAL_CASE_IDS` contains P.10. P.10 has a pause that no driver can do: it needs a pin that somebody makes in the sidebar of a second window. When the driver gets to a pause that needs a person, it discards the run of that case and records the case as skipped. It then starts the remaining cases of the batch again. A skip of P.10 is expected. A skip of P.6 is expected only when the profile guard refused to clear browsing data. A skip of any other case fails the run.
- `KNOWN_GAP_FAILING_STEPS` gives the exact names of the steps that are expected to fail, for each case with a documented known gap. Today these cases are A.3, A.5, A.6, A.6c, B.5, and B.5b. A failure at one of those steps does not fail the run. A failure at any other step of the same case fails the run. When a known-gap case starts to pass, the summary tells you. When a gap is fixed, remove its case from this list. When a new gap is documented, add it.

### P.6 and the profile guard

P.6 needs Chrome to have no stored favicon for its test site. Its pause asks a person to delete the browsing history of Chrome for all time. The driver can do this step, but the delete removes data from the profile that Chrome uses. If the profile is signed in to a Google account with history sync, the delete also removes the history of that account on every other device. For these reasons, the driver clears history only on a profile that is inside `tools/tmp/` and is not signed in to any account.

At the start of the run, a guard checks both conditions. It opens `chrome://version` and `chrome://sync-internals` in windows of its own:

- It reads the profile path in `chrome://version`. It compares the real path of the profile with the real path of the `tools/tmp/` folder next to the script. `start-test-chrome.sh` puts its profile in that folder.
- It reads the About section of `chrome://sync-internals`. The **Username** value must be empty, and the **Disable Reasons** value must contain "Not signed in". A profile that is signed in with sync off fails this check too.

If both checks pass, the guard allows the clear. When P.6 gets to its pause, the driver reads both pages again. If a check fails at the start or at the pause, or the driver cannot read a page, the guard refuses. The driver then discards the run of P.6 and records it as skipped. The reason is "profile not in <path of tools/tmp>", "profile is signed in to <account>", or "sign-in state unknown". This skip is expected. The driver writes its decision, the paths, and the sign-in values in the log.

The driver also reads both pages a third time, just before it opens the dialog. A refusal at that point means that the profile changed in the few seconds after the check at the pause. The driver reports this as an error, and the run fails.

When the guard allows the clear, the driver opens `chrome://settings/clearBrowserData` in a window of its own. It ticks only **Browsing history** and clears the other checkboxes. It sets the time range to **All time**. Right before the click on the delete button, the driver reads the checkboxes and the time range again in the same step. If anything is different, it does not click. After the click, it waits until the delete starts and then until the dialog closes or the confirmation toast shows. It then puts back the checkboxes and the time range of the dialog, and it closes its window. If you stop the run while the delete can still be in progress, the driver does not put back the choices. The dialog then keeps only **Browsing history** and **All time**.

If a control of the dialog is missing, the error names that control. This makes a change in the Chrome UI easy to find. When the clear fails, the driver records the error, discards the run of P.6, and continues with the next case.

## cdp.mjs

This script is a small CDP client for the test Chrome. It uses `cdp-client.mjs`, which has the same connection code as the driver. Use it to examine or change the extension from a script. It can list targets, run an expression in the side panel or the service worker, or send one raw protocol method. A target is a page, a worker, or another item that Chrome lets CDP control.

The request is one JSON object. If the first argument is JSON text or the path to a JSON file, the script reads the request from there. If there is no argument, it reads `tools/tmp/cdp-request.json`. The port is 9333 unless you set `CDP_PORT`. There are three operations:

- `{ "op": "targets" }` lists each target that Chrome knows. The list includes tabs, the side panel, and the service worker of the extension.
- `{ "op": "eval", "target": "index.html", "expr": "document.title" }` runs an expression in a target. The value of `target` is a target id, or text that the script compares with the URL, title, and type of each target. The script uses the first match. It waits for a promise to finish, and the call counts as a user gesture. There are three optional keys:
  - `type` also requires a target type, such as `service_worker`.
  - `timeoutMs` sets the timeout. The default is 30000.
  - `exprFile` replaces `expr`. The script reads the expression from that file in `tools/tmp/`. With a file, you do not have to escape each quote of a long script inside a JSON string.
- `{ "op": "cdp", "target": "background.js", "method": "Runtime.enable", "params": {} }` sends one raw protocol method to a target. If you leave out `target`, the method goes to the browser.

The script prints `{ "ok": true, "result": ... }` or `{ "ok": false, "error": "..." }`. The exit code is 0 only when `ok` is true.

The test profile also has pages and service workers of other extensions. These are the component extensions that are built into Chrome, and Google Docs Offline, which Chrome installs by default. A short `target` such as `background.js` or `index.html` can match a page of another extension. Put the id of this extension in the match, or use the target id from a `targets` list.

`chrome.sidePanel.open()` does not work in the service worker, also with the simulated user gesture. It works in an extension page that is open in a tab, such as `chrome-extension://<id>/icon.png`.

## extract-arc-icons.py

Extracts individual icon images from the Arc Browser icon picker screenshot. Used for the Arc icon picker feature (029).

## prepare-release-instructions.md

Step-by-step instructions for Claude to follow when preparing a release — version bump, changelog generation, link updates, and verification.
