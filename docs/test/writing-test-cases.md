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

Let the runner open the pages that a guided step needs. A guided step is a step that a person must do. `openPageForTester` in `actions.ts` opens an address before the pause that uses it. If the step must happen away from the sidebar, the page opens in its own window. The written instruction then describes only the part that a person must do. An extension cannot control a `chrome://` page. The runner can show the Clear browsing data dialog or `chrome://extensions`, but the tester must make the choices inside them. When the step is complete, close what the runner opened. Use `closeTesterWindow`, or close the tab.

Put an address in backticks when a link opens the page in the wrong place. The runner shows text in backticks in a monospace font, and it never makes that text a link. This is how a step asks the tester to type an address. Use backticks in two situations:

- The step needs the page in a different window. A link always opens in the window that runs the test.
- The tester does the step with the panel closed. The tester cannot click a link in a closed panel.

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

## Automating a pause

A pause can have a stand-in. A stand-in is code that does the tester's part of a pause when the Unattended checkbox of the panel is on. There are three kinds of stand-in. You set one through the options argument of `pause()` in `actions.ts`, and `PauseAutomation` in `types.ts` describes them. A pause has one stand-in at most.

A `confirm` question can go only with `auto`. A parked step or an external step has nobody to ask. Also, the panel comes back only after such a step is complete.

Use `auto` when the panel can do the action while it runs. `auto` is a normal step function. It gets the `TestContext` and runs inside the panel, and the banner does not appear. `auto` covers three kinds of action:

- A keyboard shortcut. The `pressShortcut` helper sends a message that exists only in development builds. The message makes background run the same command handler that a real key press reaches.
- Audio that starts and stops. In unattended mode, the audio cases open the tone page of the extension, `test-audio.html`. `playTestAudio` and `stopTestAudio` control the tone page.
- A gesture inside the sidebar, such as a press-and-hold or a drag. These go through `SimulatedMouse` in `stepHelpers.ts`.

Use `whilePanelClosed` when the action must happen while the sidebar app is not loaded. Such a step runs on the parked page. The parked page is `test-parked.html`, and `parked.ts` operates it. The panel goes to the parked page in place of its own document. This removes the React tree and each listener that the sidebar registered. For the extension, the result is the same as a closed panel. The parked page has no React context. The function gets only the saved refs, which are the string ids and number ids that the checkpoint stored. The function must use plain `chrome.*` calls. The `...WhileClosed` helpers in `actions.ts` are the examples. Each helper makes the same Chrome call as the matching action in the panel, with the same result.

Use `external` when the action needs Chrome itself. An extension cannot stop its own service worker (`'stop-service-worker'`) or reload itself (`'reload-extension'`). The panel shows such a pause in the same way as a manual pause, with the banner and the Resume button. Only the driver script, `tools/run-inpanel-tests.mjs`, acts on the pause. The driver reads the checkpoint, does the action through the Chrome DevTools Protocol, and clicks Resume.

Do not change the written instruction when you add a stand-in. The instruction is the manual alternative. A tester follows it when Unattended is off, and everybody follows it when the driver does not run. The instruction is also the only path that tests three things that the stand-ins skip:

- The tab strip of Chrome.
- A real key press that reaches the extension through the shortcut system of Chrome.
- A real close of the side panel.

Make an automated `confirm` fail in the same conditions as a person. On a `confirm` pause, `auto` replaces the judgement of the tester. The runner records its result under the confirm question, the same as an answer of Pass or Fail. The stand-in must test what the question asks, and nothing more or less. A stricter test reports failures that a tester passes. A looser test hides failures that a tester sees.

Do the action also when the test fails. A tester who answers Fail still does what the instruction says. For example, the tester still clicks the row that the instruction names. An `auto` must also do the action before it throws an error. The steps after it then run against the state that the case expects. If the stand-in does not do the action, one small failure can make each later assertion in the case fail. An example of a small failure is a broken favicon in a row of a dropdown. Use `holdHistoryButtonAndPickTopRow` as the example.

Do everything that the instruction tells the tester to do, side effects too. Assume that the instruction says "switch to a tab and play its audio". The `auto` must then make the tab active, and not only start the audio. Background adds a tab to its tab history when the tab becomes active. If the stand-in starts the audio only, the history is different from a manual run. The assertion in E.3 that Previous goes back to the audio tab then fails.

Make each step work when nobody looks at the window. People usually leave an unattended run alone. Other windows can cover the test window, and a different app can be in front of Chrome. In such a window, Chrome slows down timers and rendering. The delay is enough to break steps that depend on timing. For this reason, `tools/start-test-chrome.sh` turns that slowdown off. A step must still not need focus, and it must not need to be visible. If a step waits for something, it must poll with a deadline, as the section on assertions says.
