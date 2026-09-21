---
created: 2026-09-20
status: draft
---

# Writing a test case

Conventions for the in-panel test runner's cases (`src/tests/inpanel/cases/`)
and for the manual cases they are written from, which live in
`docs/test/tab-space-association-test-cases.md`.

**One action per pause.** A guided step asks the tester for exactly one thing
and is followed by its own check. An instruction that asks for two actions can
be half-completed, and the run then fails somewhere further down with no way to
tell which half was missed.

**Say where the action happens.** Name the window, the sidebar, or the Chrome
surface the tester should be looking at. Several cases involve two windows or a
second sidebar, and the DEV panel is mounted in every one of them.

**Write URLs inline and let the runner link them.** Any `http(s)://` or
`chrome://` address in a pause instruction is rendered as a clickable link that
opens it in a new tab, so there is no need to tell the tester to copy anything.

**Let the runner open the pages a guided step needs.** `openPageForTester` in
`actions.ts` opens an address before the pause that uses it, in its own window
when the step has to happen away from the sidebar, and the written instruction
then covers only the part a human has to do. A `chrome://` page cannot be
scripted by an extension, so the runner can put the Clear browsing data dialog
or `chrome://extensions` on screen but the choices inside them stay manual.
Close what was opened once the step is done, with `closeTesterWindow` or by
closing the tab.

**Put an address in backticks when the link would be the wrong thing to
click.** A backticked span renders as plain monospace text and is never linked,
which is how a step asks for an address to be typed. Two situations call for
it: the step needs the page in a different window, because a link always opens
in the window running the test; and the step is carried out with the panel
closed, because the tester cannot click anything then.

**Use bold for labels in Chrome's own UI.** A button, menu item, checkbox or
DevTools panel the tester has to find is written in `**double asterisks**`, so
it stands out from the surrounding sentence. Writing `click **Stop**` rather
than `click Stop` is the difference between scanning for a word and reading the
line twice.

**Put the explanation after a " - " so it renders grey.** Each numbered line is
split on its first " - ", and everything after that is dimmed, which keeps the
action itself readable at a glance. Anything the tester must not miss, such as
a warning not to reload the extension, belongs on its own line instead, because
after the dash it would be greyed out with the rest of the commentary.

**Make a failure say what to do next.** When an assertion can fail for two
different reasons, the step should work out which one it was and report it,
rather than reporting only that something did not happen. Reading a second
source of truth is usually enough: background's own list against this window's
mirror separates a lost broadcast from a change that was never made, and
calling a fetch helper directly separates a network problem from a code one.

**Check both copies of shared state.** For pinned sites and spaces, assert
against this window's mirror and against background's own list. A bug that
leaves those two disagreeing is what the manager and proxy layer exists to
prevent, so a check on one copy alone will miss it.

**Assert preconditions instead of assuming them.** If a case needs a pin with
no icon, or an empty history, check that before the interesting part. A case
that quietly starts from the wrong state reports a failure that has nothing to
do with the code.

**Scope assertions to test-tagged data.** The suite runs against a real profile
with the tester's own pins, bookmarks and spaces in it, so filter by the test
prefixes before asserting on order or counts.

**Poll with a deadline instead of sleeping.** Anything waiting on a broadcast, a
fetch or a manual action should retry until a timeout rather than sleep for a
fixed period.

**Restore anything destructive in a `finally`.** A case that replaces the whole
pin list, or any other real user data, has to put it back even when the
assertion in the middle throws.

**Read state through the manager, not out of storage.** Asking
`chrome.storage.local` directly checks only half of what matters, because the
bug this layer guards against is background's in-memory copy drifting from what
was stored. Going through the proxy exercises the round trip as well.

**Drive the real code path rather than a copy of it.** Where a menu item builds
an undoable action, the case should build the same action; where a drop handler
calls a shared helper, the case should call that helper. A case that
reimplements the behaviour it is checking will keep passing after the real path
breaks.

**Ship fixture data in the repo.** Anything a case needs to import belongs in
`src/tests/inpanel/data/` and is imported directly. A file picker cannot be
driven by the runner, and everything underneath it is the same code the dialog
uses anyway.

**Clean up what the case created, including tabs.** Artifacts are found by tag,
so test pins take the pinned-site title prefix and test tabs take the test URL
prefix. Two things fall outside that scheme and the case has to remove them
itself: a tab it opened on a real site, and anything the tester made by hand
during a pause, since a pin created through the UI carries no test prefix.

**For cold-start cases, stop the service worker, never reload the extension.**
A reload is a fresh extension load that clears session storage, so the state
the case wants to see restored is gone and the case proves nothing either way.

**Say in the title when a case needs something unusual**, such as the network, a
cleared cache, a second window, or a stopped service worker. The title is what
the runner shows in its list.
