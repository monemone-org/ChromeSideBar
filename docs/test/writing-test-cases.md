---
created: 2026-09-20
status: draft
---

# Writing a test case

This document gives the rules for the cases of the in-panel test runner. The cases are in `src/tests/inpanel/cases/`. Each case comes from a manual case in `docs/test/tab-space-association-test-cases.md`, and the rules apply to those manual cases too.

Some terms that this document uses:

- A pause is a step where the runner stops and waits for the tester.
- An instruction is the numbered text that a pause shows to the tester.
- An assertion is a step that tests a result and fails the case when the result is wrong.
- Background is the service worker of the extension. It keeps the main copy of shared state, such as pinned sites and spaces.
- A mirror is the copy of that state that each sidebar window keeps.

## Writing the instruction

Ask for one action in each pause, and follow the pause with its own assertion. If an instruction asks for two actions, the tester can do only one of them. The run then fails at a later step, and nobody can tell which action the tester missed.

Name the place where the action happens. Tell the tester which window, which sidebar, or which part of Chrome to look at. Several cases use two windows or a second sidebar, and each sidebar shows its own DEV panel.

Write each URL directly in the instruction. The runner shows each `http(s)://` and `chrome://` address in a pause instruction as a link, and the link opens the address in a new tab. The tester does not have to copy the address.

Let the runner open the pages that a guided step needs. A guided step is a step that a person must do. `openPageForTester` in `actions.ts` opens an address before the pause that uses it. If the step must happen away from the sidebar, the page opens in its own window. The written instruction then describes only the part that a person must do. An extension cannot control a `chrome://` page. The runner can show the Clear browsing data dialog or `chrome://extensions`. When the panel runs without the driver, the tester must make the choices inside them. For P.6, the driver makes the choices in the Clear browsing data dialog, but only on a profile that is inside `tools/tmp/` and is not signed in to any account. When the step is complete, close what the runner opened. Use `closeTesterWindow`, or close the tab.

Put an address in backticks when a link opens the page in the wrong place. The runner shows text in backticks in a monospace font, and it never makes that text a link. This is how a step asks the tester to type an address. Use backticks when the step needs the page in a different window, because a link always opens in the window that runs the test.

Write the label of a control in Chrome's own interface in `**double asterisks**`. This applies to a button, a menu item, a checkbox, or a DevTools panel that the tester must find. The runner shows that text in bold, and the tester finds the word quickly. With `click **Stop**`, the tester sees the label at once. With `click Stop`, the tester must read the line twice.

Put the explanation after a " - " in each numbered line. The runner splits each line at its first " - " and shows the text after it in grey. The action stays easy to read. If the tester must not miss a statement, put it on its own line. An example is a warning not to reload the extension. If that warning comes after the dash, the runner shows it in grey with the other explanations.

## Writing assertions

Make a failure tell the reader what to do next. Some assertions can fail for two different causes. The step must find out which cause it was and report that cause. A second source of data usually tells the two causes apart. Here are two examples:

- Compare the list in background with the mirror of this window. If they differ, a broadcast was lost. If both are unchanged, the change never happened.
- Call a fetch helper directly. A network problem then looks different from a code problem.

Test both copies of shared state. For pinned sites and spaces, assert against the mirror of this window and against the list in background. The manager and proxy layer exists to keep those two copies the same. An assertion on one copy only does not find a bug that makes the copies differ.

Assert each precondition before the main part of the case. A precondition is a state that the case needs at the start, for example a pin with no icon, or an empty history. If a case starts from the wrong state and does not report it, the case fails for a cause that is not in the code.

Limit assertions to test data. The suite runs on a real browser profile, and that profile contains the tester's own pins, bookmarks, and spaces. Filter by the test prefixes before you assert an order or a count.

Poll with a deadline. Do not sleep for a fixed time. A step that waits for a broadcast, a fetch, or a manual action must try again and again until a timeout.

Read state through the manager. Do not read it directly from `chrome.storage.local`. The bug that this layer prevents is a difference between the copy in the memory of background and the stored copy. A read from storage tests only half of that. A read through the proxy also tests the full round trip.

Use the real code path. Do not copy it into the test. If a menu item builds an action that the user can undo, the case must build the same action. If a drop handler calls a shared helper, the case must call that helper. If a case copies the behavior that it tests, the case continues to pass after the real path breaks.

## Test data and cleanup

Restore destructive changes in a `finally` block. Some cases replace the whole pin list or other real user data. Such a case must put the data back, also when an assertion in the middle throws an error.

Keep fixture data in the repository. A fixture is a file that a case imports, and its place is `src/tests/inpanel/data/`. The case imports the file directly. The runner cannot operate a file picker, and the code below the picker is the same code that the dialog uses.

Remove everything that the case created, tabs too. The runner finds test data by its tags. Test pins have the title prefix for pinned sites, and test tabs have the URL prefix for tests. The case itself must remove two kinds of item that have no tag:

- A tab that the case opened on a real site.
- An item that the tester made by hand during a pause. A pin that the tester makes through the interface has no test prefix.

For a cold-start case, stop the service worker. Do not reload the extension. A cold-start case tests what the extension restores when its service worker starts again. A reload starts the extension from nothing and clears session storage. The state that the case wants to see restored is then gone, and the case proves nothing.

Say in the title when a case needs something unusual. Examples are the network, a cleared cache, a second window, or a stopped service worker. The runner shows the title in its list of cases.

## Steps that replace a person

Use a pause only for an action that nothing inside the extension can do. Write every other action as a step that the runner does itself. The runner has three kinds of step for actions that a person did before:

- An action step or an assert step from `actionStep()` or `assertStep()` in `actions.ts`, for an action that the panel can do while it runs.
- A closed-panel step from `closedPanelStep()`, for an action that must happen while the sidebar app is not loaded.
- A pause with `external`, for an action that needs Chrome itself.

Use an action step when the panel can do the action itself. The step gets the `TestContext` and runs inside the panel. It covers three kinds of action:

- A keyboard shortcut. The `pressShortcut` helper sends a message that exists only in development builds. The message makes background run the same command handler that a real key press reaches. `assertCommandShortcutBound` makes sure that the key is bound, and `assertShortcutListenerRegistered` makes sure that background listens for the command.
- Audio that starts and stops. The audio cases open the tone page of the extension, `test-audio.html`. `playTestAudio` and `stopTestAudio` control the tone page. The tone page plays only in a Chrome that `tools/start-test-chrome.sh` started, because that script lets a page play audio with no click.
- A gesture inside the sidebar, such as a press-and-hold or a drag. These go through `SimulatedMouse` in `stepHelpers.ts`. `SimulatedMouse` finds its target with `elementFromPoint`, so an overlay stops it as it stops a real mouse.

Use an assert step when the gesture also checks a result, for example that a dropdown opens with a title in every row. A failed assert step does not stop the case, so the steps after it still run.

Use a closed-panel step when the action must happen while the sidebar app is not loaded. Such a step runs on the parked page. The parked page is `test-parked.html`, and `parked.ts` operates it. The panel goes to the parked page in place of its own document. This removes the React tree and each listener that the sidebar registered. For the extension, the result is the same as a closed panel. The parked page has no React context. The function gets only the saved refs, which are the string ids and number ids that the checkpoint stored. The function must use plain `chrome.*` calls. The `...WhileClosed` helpers in `actions.ts` are the examples. Each helper makes the same Chrome call as the matching action in the panel. Chrome reports the same events to background for that call as for the matching gesture in its own tab strip or bookmark manager.

Use a pause with `external` when the action needs Chrome itself. An extension cannot stop its own service worker (`'stop-service-worker'`) or reload itself (`'reload-extension'`). It also must not clear browsing data, because that needs the `browsingData` permission (`'clear-browsing-data'`). The driver does that action only when Chrome uses a profile that is inside `tools/tmp/` and is not signed in to any account. The panel shows such a pause in the same way as any other pause, with the banner and the Resume button. Only the driver script, `tools/run-inpanel-tests.mjs`, acts on the pause. The driver reads the checkpoint, does the action through the Chrome DevTools Protocol, and clicks Resume. When the driver does not run, a person follows the written instruction.

The steps above do not test two things:

- A real close of the side panel. Background does not track whether the panel is open, so a parked panel and a closed panel are the same for it. If background starts to track the panel, the closed-panel cases must be examined again.
- The delivery of a real key press by Chrome to the extension.

## Manual mode

The Test Runner has a "Manual" checkbox, which is off by default. When it is on, each step whose automated version differs from real use becomes a pause, and you do the step yourself with real input. You close the side panel for real, press the real keys, use the real mouse, and click the real buttons. The automated run is good enough for regression, and Manual mode is for a run that is fully real. The driver always runs with Manual mode off, and it puts your setting back at the end.

Give a step a manual version when its automated version differs from what a user does. Pass a `ManualStep` as the last argument of `actionStep()`, `assertStep()` or `closedPanelStep()`. The `steps` are the instruction that the banner shows, in the same style as a pause. Add `confirm` when the automated version checks something that the tester must judge in Manual mode, for example whether a dropdown showed a title in each row. The runner then records the tester's Pass or Fail under that question. A step that the tester does without a question gets a passed result with a note that says a person did it.

Keep the checks automated in both modes. Setup, the assert steps, and the background test gates do not change in Manual mode. A case that arms a gate before a gesture still holds background while you do the gesture for real. The gate lets go on its own 15 seconds after background arrives at it, so take your time before the gesture, but click Resume soon after it.

Do the action also when a check fails. An assert step that performs a gesture must do the gesture before it throws an error. The steps after it then run against the state that the case expects. If the step does not do the action, one small failure can make each later assertion in the case fail. An example of a small failure is a broken favicon in a row of a dropdown. Use `holdHistoryButtonAndPickTopRow` as the example.

Do everything that a person would do, side effects too. Assume that a person would switch to a tab and play its audio. The step must then make the tab active, and not only start the audio. Background adds a tab to its tab history when the tab becomes active. If the step starts the audio only, the history is different. The assertion in E.3 that Previous goes back to the audio tab then fails.

Make each step work when nobody looks at the window. People usually leave a run alone. Other windows can cover the test window, and a different app can be in front of Chrome. In such a window, Chrome slows down timers and rendering. The delay is enough to break steps that depend on timing. For this reason, `tools/start-test-chrome.sh` turns that slowdown off. A step must still not need focus, and it must not need to be visible. If a step waits for something, it must poll with a deadline, as the section on assertions says.
