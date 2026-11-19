---
created: 2026-11-16
status: done
---

# Plan: run the in-panel test suite unattended

## Goal

In the Test Runner panel (`src/tests/inpanel/`), 28 cases stop at a `pause` step and wait for a person. This plan removes the person from as many of those cases as possible. You can then start "Run Tests" and leave it. You can also start a run from the terminal.

The plan keeps each manual instruction. Each automated step keeps its written instruction as the manual alternative, and a checkbox in the panel selects between the two. Only the manual path tests three things: the tab strip of Chrome, the shortcut system of Chrome, and a real close of the side panel.

Some terms that this document uses:

- A pause is a step where the runner stops and waits for the tester.
- A stand-in is code that does the tester's part of a pause.
- Background is the service worker of the extension. It keeps the main copy of shared state.
- A mirror is the copy of that state that each sidebar window keeps.
- A checkpoint is the record of a paused run that the runner keeps in `chrome.storage.local`.
- The driver is the script `tools/run-inpanel-tests.mjs`, which controls Chrome from outside the extension.

## Outcome

All phases are complete. When the Unattended checkbox of the panel is on, these cases run with nobody at the keyboard, through the panel alone:

- The thirteen panel-closed cases: A.1, A.3, A.4, A.5, A.5b, A.5c, A.6, A.6b, A.6c, B.1, B.2, B.2b, and B.5b. Their action runs on the parked page.
- The shortcut cases C.2c and C.2c (same space), the four C.2e variants, and C.2f. The panel presses the shortcuts and plays the audio itself.
- The gesture cases C.2g, F.1, and P.7. In C.2g, the panel does the press-and-hold and tests the history dropdown through the DOM of the sidebar. In F.1, the panel does the drag and tests the result in the same way. In P.7, the question "did the pin get the favicon?" becomes a test that reads the stored icon of the pin. The test reads it from the list in background and from the mirror of this window.

Four cases also need the driver, because one of their pauses needs Chrome itself. E.1 needs a reload of the extension. E.3 and P.8 need a stop of the service worker. P.6 needs Chrome to clear its stored favicons. If you run these four cases from the panel alone, they stop at that pause and wait for a person.

The driver clears the browsing data for P.6 only when two conditions are true. Chrome uses a profile inside `tools/tmp/`, and that profile is not signed in to any account. If the profile is signed in with history sync, the delete also removes the history of the account on every other device. If either condition is false, P.6 stays manual. The extension itself must not ship with the `browsingData` permission, so the driver uses the **Clear browsing data** dialog of Chrome.

One case stays manual:

- P.10 needs a pin that somebody makes in the sidebar of a second window. Automation needs runner hooks in that other panel. These hooks are worth the work only if people run P.10 often.

On 2026-11-18, a run of the full suite through the driver did 74 cases in about 10.5 minutes. 66 cases passed. The six known-gap cases (A.3, A.5, A.6, A.6c, B.5, and B.5b) failed at their known steps and at no other steps. At that time the driver could not clear browsing data, so it skipped P.6 and P.10 as expected. It stopped with exit code 0.

### Known issue found during the work

Sometimes a step that opens tabs into a test space fails with the error "No group with id". This happened once in A.1 and once in C.2e. When it happens, the case fails at the step that opens the tabs, for example "Open filler tabs in space ...". Nobody has examined the cause yet. `docs/test/issues/N1-no-group-with-id-when-adding-tab-to-space.md` describes the failures, a possible cause, and the steps to reproduce it.

## Merging this branch

This worktree (`worktree-automate-test-runner`) starts from commit `4fe61f9`. When the worktree was made, the step-6 work on `2026-07-30-single-writer-shared-storage-6` was staged but not committed. That work is not in this branch. It changes `src/background.ts`, `src/contexts/BookmarkTabsContext.tsx`, and `src/tests/inpanel/cases/sectionD.ts`. This branch also changes `background.ts` in Phase 2. The person who merges the two branches must resolve a small merge in that file.

## What the pauses ask for

| Kind | Cases | Why a person was needed |
|---|---|---|
| Act while the panel is closed | A.1, A.3, A.4, A.5, A.5b, A.5c, A.6, A.6b, A.6c, B.1, B.2, B.2b, B.5b | The action is a plain `chrome.*` call. But the runner is in the panel, and it cannot run while the panel is closed. |
| Press a keyboard shortcut | C.2c, C.2c (same space) | An extension cannot press its own shortcut. |
| Start or stop audio | C.2e (four variants), C.2f, and two pauses of E.3 | Chrome blocks audio that starts with no user gesture. |
| Gesture inside the sidebar | C.2g, F.1, P.7 | A press-and-hold, a drag and drop, and questions such as "did it show?" |
| Parts of Chrome itself | E.1, E.3, P.6, P.8, P.10 | A reload of the extension, a stop of the service worker, a clear of browsing data, and a second sidebar. E.3 is in this row for its service-worker pause. Its two audio pauses are in the audio row. |

Phases 1 to 3 cover the first four rows from inside the extension. Phase 4 is a spike, which is a short test to find out what is possible. It finds out how much of the last row a program outside the extension can do.

## Design

### Stand-ins on pause steps

The pause variant of `TestStep` gets two optional fields. A pause has one of them at most.

- `auto` is a normal step function that gets the `TestContext`. It is for pauses whose action the panel can do while it runs: shortcuts, audio, and gestures in the sidebar. On a `confirm` pause, `auto` replaces the judgement of the tester. It throws an error when the answer is Fail. The runner records its result under the confirm question, the same as a manual answer.
- `whilePanelClosed` is a function that gets only the saved refs. The saved refs are the string ids and number ids in `ResumeState`. The function uses plain `chrome.*` calls. It is for the first row of the table. It runs on the parked page, which has no React context.

Each result from a stand-in has a note that says so. A downloaded results file then shows which results came from a person.

### Unattended mode

Unattended mode is a checkbox in the panel. The panel keeps its value in `chrome.storage.local` under `testRunnerUnattended`, so the value stays when the panel loads again. When the checkbox is on:

- `runFrom` runs a pause that has `auto` as a normal action step. It records the result and continues, with no checkpoint.
- A pause that has `whilePanelClosed` still writes its `ResumeState` checkpoint. The panel then goes to the parked page and does not show the banner.
- When the panel loads, `TestRunnerPanel` looks for a checkpoint that the parked page completed. If it finds one, it claims the checkpoint and continues the run by itself, with no click.
- A pause with neither field works as before. The run stops and waits. While unattended mode is on, the ✋ badge in the list of cases shows only on cases that still have such a pause.

### The parked page

`test-parked.html` is a second page in the extension with no application code. The panel replaces its own document with this page. This removes the React tree and each message listener that the sidebar registered. For the extension, this is the state that the panel-closed cases test. Background has no sidebar to send a live update to, and the sidebar must reconcile its state when it comes back. `background.ts` does not track the panel through ports or `getContexts`. Background therefore cannot tell a parked panel from a closed panel.

The parked page reads the checkpoint and finds the case and the step in `ALL_CASES`. It calls `whilePanelClosed(refs)` for that step, waits for the settle delay, and goes back to `index.html`. If the call throws an error, the page writes the error into the checkpoint. The run that continues then records a failed step and does not continue as if the action happened.

The parked page does not test a real close of the panel by Chrome. The panel stays open on the screen the whole time. To test a real close, run the same cases with unattended mode off.

Vite adds the page to `rollupOptions.input` only in development mode. A release build does not contain the page.

The parked page loads the cases (`cases/index.ts`) with a dynamic import. That import also loads `actions.ts`, `fixtures.ts`, and, through them, modules written for the panel. We examined those modules for side effects at import time. None of them registers a message listener when it loads. Each listener is registered later, or inside a React effect. The parked page therefore does not listen for messages, and it can use the same cases as the panel.

## Phases

Each phase ended with a build and a run in the test Chrome.

### Phase 1: unattended mode and the panel-closed cases

1. In `types.ts`, add `auto` and `whilePanelClosed` to the pause step. Add an optional `parkedError` to `ResumeState`.
2. In `actions.ts`, let `pause()` accept the new fields. Add the helpers that the thirteen panel-closed cases need. The helpers move a tab into the group of a test space, remove a tab from its group, and move a tab to a new window. They also close a tab and remove a bookmark.
3. In `runner.ts`, read and write the unattended setting. When the setting is on, run `auto` pauses inline.
4. Add `test-parked.html` and `src/tests/inpanel/parked.ts`, and add the conditional entry in `vite.config.ts`.
5. In `TestRunnerPanel.tsx`, add the checkbox, the move to the parked page, the automatic continue when the panel loads, and the changed ✋ badge.
6. In `sectionA.ts` and `sectionB.ts`, give each of the thirteen pauses its `whilePanelClosed`.

Result to get: with unattended on, sections A and B run to the completion popup with no input. Their results are the same as a manual run, which includes the assertions that are expected to fail for known gap G2. With unattended off, nothing changes.

### Phase 2: shortcuts and audio

1. In `background.ts`, move the body of the `chrome.commands.onCommand` listener into a named function. Add a message that exists only in development builds and calls that function with a command name. The four pauses of C.2c get an `auto` that sends that message.
2. Add `test-audio.html`, an extension page that exists only in development builds. It plays a tone through Web Audio and stops on request. In unattended mode, the audio cases open this page in place of YouTube. `isTestUrl` in `fixtures.ts` knows the page, so cleanup still finds the tab.
3. In `tools/start-test-chrome.sh`, add `--autoplay-policy=no-user-gesture-required`. The audio cases passed with this flag on. Nobody tested whether the tone page plays without it. If the audio does not start, the `auto` step fails with a message that says so, and you can run the case manually.
4. In `sectionC.ts` and `sectionE.ts`, add `auto` to the pauses that start and stop the audio.

Result to get: C.2c, the C.2e variants, and C.2f run unattended in the profile of the test Chrome. E.3 gets to its service-worker pause and waits there.

### Phase 3: gestures inside the sidebar

1. In `stepHelpers.ts`, add helpers that send pointer events for a press-and-hold and for a drag from one element to another.
2. In C.2g, hold the Previous button. Then replace the four Pass or Fail questions with assertions on the DOM of the dropdown. Each row must be present and must have a title, and either a favicon or the grey fallback square.
3. In F.1, drag the tab row onto the icon of the space. The pointer sensor of dnd-kit needs a minimum movement and move events between the start and the end, and the simulated drag sends both.
4. In P.7, open the race URL and call the same unpin path that the menu item uses. Then replace the question "did pin A get the favicon?" with a test of the stored icon of the pin.

Result to get: those three cases run unattended. The drag in F.1 passed in each unattended run.

### Phase 4: a spike on control of Chrome from outside

`tools/start-test-chrome.sh` already starts Chrome with `--remote-debugging-port=9333`. A short Node script answers three questions. It uses the built-in WebSocket of Node 22, so the project gets no new package. The script is not kept.

1. Does the side panel show in the CDP list of targets? A target is a page, a worker, or another item that Chrome lets CDP control. `types.ts` records that Playwright never showed the panel. But Playwright filters the target types, and raw CDP possibly does not.
2. Does `chrome.sidePanel.open()` work in the service worker with the simulated user gesture of CDP?
3. Can CDP stop the service worker?

The answers tell us if a driver outside the extension can do four things:

- Open the panel.
- Start a run.
- Stop the service worker and reload the extension for E.1, E.3, and P.8.
- Write the results to disk.

The answers showed that such a driver is possible. Phase 4b describes it.

P.6 needs the `browsingData` permission, and the extension must not ship with it. For this reason, the panel cannot do P.6 alone. Phase 4b later gave P.6 to the driver, which uses the Clear browsing data dialog. P.10 needs a second sidebar. Phase 4b explains why P.10 also stays manual.

#### Spike results (2026-11-18)

The answer to questions 1 and 3 was yes. The answer to question 2 was no, but there is a workaround:

1. Yes. The side panel is a `page` target in the CDP list. A script can use its DOM, its storage, and its `chrome.*` APIs through `Runtime.evaluate`.
2. No. The service worker refuses `chrome.sidePanel.open()`, also with the simulated user gesture of CDP. The call works in an extension page that is open in a tab, for example the inert page `icon.png`. This way, a script can open the panel in any window.
3. Yes. When a script closes the target of the service worker (`Target.closeTarget`), the worker stops. The result is the same as the **Stop** button in DevTools. E.3 then continued and passed to the end, and background restored its tab history from session storage.

The spike also showed two other facts:

- Chrome slows down a covered window or a window in the background. The delay is enough to break steps that depend on timing. For this reason, `start-test-chrome.sh` now gives Chrome the flags `--disable-backgrounding-occluded-windows`, `--disable-background-timer-throttling`, and `--disable-renderer-backgrounding`.
- The test profile has pages and service workers of other extensions. These are the component extensions that are built into Chrome, and Google Docs Offline, which Chrome installs by default. The profile was never signed in, so Chrome sync installed nothing. A script that looks for a target must therefore match the id of this extension. It must never match only `background.js` or `index.html`.

The spike also made `tools/cdp.mjs`, a small CDP client. The phases above were tested with it. Its connection code is now in `tools/cdp-client.mjs`, and both `cdp.mjs` and the driver use that file.

#### Phase 4b: the driver script

The driver is `tools/run-inpanel-tests.mjs`. It uses `tools/cdp-client.mjs` and only the built-in `fetch` and `WebSocket` of Node 22. `tools/tools-readme.md` tells you how to run it. The driver does these steps:

1. It reads its configuration from `tools/tmp/run-inpanel-tests.json`: which cases or sections to run. By default, it runs every case. The configuration comes from a file because the sandbox exclusion allows only the exact command. An argument makes it a different command.
2. It finds the unpacked build of this worktree in `chrome://extensions`. It opens a helper tab, which is an extension page, in a window of its own, and it opens a new test window. It opens the side panel in the test window and opens the Test Runner. It selects the cases, turns on Unattended, and clicks **Run Tests**.
3. It reads the state of the run in `chrome.storage.local` through the helper tab. When a case stops at a pause that is marked for the driver, the driver does the action and clicks Resume:
   - For E.3 and P.8, it stops the service worker with `Target.closeTarget`.
   - For E.1, it reloads the extension, opens the panel again, and continues. The checkpoint stays through the reload, because the runner keeps its state in `chrome.storage.local`.
   - For P.6, it deletes the browsing history of Chrome for all time in the Clear browsing data dialog. It does this only when Chrome uses a profile inside `tools/tmp/` of this checkout, and that profile is not signed in to any account. At the start of the run, the driver reads the profile path in `chrome://version` and compares the real paths. It also reads `chrome://sync-internals`. The **Username** value must be empty, and **Disable Reasons** must contain "Not signed in". Right before the clear, it reads both pages again. If a check fails, or a page cannot be read, the driver does not clear anything. It then treats the pause as a pause that needs a person.

   Some pauses still need a person. At such a pause, the driver discards the run of that case and records the case as skipped. It then starts the remaining cases of the batch again.
4. It writes the results to `tools/tmp/` in the same format as the **Download Results** file of the panel, and it prints a summary. The exit code is not zero in each of these conditions:
   - A case fails at a step that is not in its list of known-gap failures. The list is `KNOWN_GAP_FAILING_STEPS`, and today it covers A.3, A.5, A.6, A.6c, B.5, and B.5b.
   - The driver skips a case other than P.10. A skip of P.6 is expected only when the profile guard refused to clear browsing data.
   - A case gives no result.
   - The driver itself gets an error.
5. It closes the windows that it opened. It puts back the Test Runner settings of the tester: the ticked cases and the Unattended checkbox.

The driver must know which pauses it controls. For this reason, the pause step has a third optional stand-in field, `external: 'stop-service-worker' | 'reload-extension' | 'clear-browsing-data'`. The runner writes this field into the checkpoint. In the panel, a pause with `external` works the same as a manual pause. Only the driver acts on it.

P.6 (clear the stored favicons of Chrome) runs through the driver when the profile is inside `tools/tmp/` and is not signed in to any account. Otherwise P.6 stays manual.

This case stays manual:

- P.10 (a pin made in the sidebar of a second window). A second panel can do this, but it needs runner hooks in that other panel. The work is worth it only if people run P.10 often.

This plan does not use a real close of the panel for sections A and B. The results with the parked page were the same as the manual results. A real close and open of the panel also adds a slow cycle to thirteen cases.

### Phase 5: documentation

- `docs/test/writing-test-cases.md` has a section on stand-ins for a pause. It tells you when a pause gets `auto`, `whilePanelClosed`, or `external`. It tells you why the written instruction always stays, and how an automated `confirm` must work. It also tells you why a stand-in must do everything that the instruction asks, side effects too.
- `tools/tools-readme.md` describes the flags of `start-test-chrome.sh` and the reason for each flag. It tells you how to run the driver and how to read its results and its exit code. It also gives the request format of `cdp.mjs`.
- This document describes what the work did and which cases stayed manual. See the Outcome section.

## Decisions

- The parked page is the accepted replacement for a closed panel in unattended runs. On 2026-11-17, an unattended run of sections A and B gave the same pass or fail for each case as the manual run of 2026-09-21. The failing steps were also the same. The manual results are in `tools/tmp/test-results-2026-09-21T00-17-13-481Z.json` in the main checkout. To test a real close of the panel, run those cases with Unattended off.
- Unattended mode is off by default. It is a setting for each tester, kept in `chrome.storage.local`. A tester who opens the Test Runner sees the manual instructions until the tester turns the setting on. The driver turns the setting on for its own run, and it puts back the value of the tester at the end.
