---
created: 2026-09-19
status: fixed, verification pending
area: usePinnedSites icon resolver
---

# The icon resolver can drop a resolve request and never retry

Found while verifying step 5 (`step-5-pinned-sites-manager.md`) through the
in-panel test runner. This bug is pre-existing behaviour in
`src/hooks/usePinnedSites.ts` - step 5 did not introduce it, it just made a
test exist that hits it reliably. The fix described at the bottom has now been
applied, and P.9 passes when run on its own. What is still outstanding is a
full-suite run, which is the condition that was actually broken - see "What to
test".

## Parts involved

- `pinnedSites`: the array of pins that `usePinnedSites` returns. It comes
  from `pinnedSitesManagerProxy`'s mirror, so it gets a new array identity
  whenever the list changes in any way - a pin added, removed, reordered, or
  edited.
- The resolve effect: the `useEffect` at `src/hooks/usePinnedSites.ts:55`.
  React runs it after any render where `pinnedSites` has a new identity. Its
  job is to find pins showing no icon and fetch one for each - a pin with a
  `customIconName` and no favicon gets its icon fetched from the Iconify CDN
  (`iconToDataUrl`), and a pin with no icon at all gets a favicon looked up in
  Chrome's cache (`fetchFaviconAsBase64`). Results are written back through
  `pinnedSitesManagerProxy.setFavicons(patches)`.
- `isResolvingRef`: a boolean React ref, true while a resolve pass is in
  progress. The effect's first line is `if (isResolvingRef.current) return;`.
  It exists for a good reason - without it, every list change would start a
  second, overlapping batch of fetches for the same pins.

## The mechanism of the bug

The key detail is what that early `return` does NOT do: it does not record
that a resolve was wanted. The request is dropped, not queued.

After a skip, the only thing that will ever run the effect again is another
change to `pinnedSites`. Usually one arrives, because a resolve pass that
finds an icon calls `setFavicons`, which changes the list, which re-renders,
which runs the effect again, which picks up the dropped work.

But a pass that resolves nothing writes nothing - no `setFavicons` call, no
list change, no re-render, no further pass. That is the hole. If a request is
dropped while a pass is running, and that pass then writes nothing, the
dropped request is gone for good.

Passes that write nothing are common, not exotic. A pin pointing at a page
Chrome has never cached comes back as Chrome's default globe icon, which
`fetchFaviconAsBase64` filters out as "no icon". Every test pin in the
in-panel suite has exactly that shape (URLs like
`https://example.com/inpanel-test-...`, never visited), so the suite produces
a steady stream of fetch-nothing-write-nothing passes.

## Worked example: what the failing run looked like

Test case P.9 in `src/tests/inpanel/cases/sectionP.ts` imports a fixture
backup (`src/tests/inpanel/data/pinned-sites-backup.json`) containing a pin
titled "InPanelTest: P9 fixture B" that ships `customIconName: "star"` and no
favicon. The case then waits up to 15 seconds for the resolver to give it a
favicon (`assertCustomIconResolves`, `sectionP.ts:1135`).

**This timeline is a reconstruction, not a transcript.** The DEV logging did
not exist yet when P.9 failed, so there is no trace of that run. What is
observed, from the later passing run quoted below, is that skipped passes do
happen and that a pass which writes nothing produces no follow-up pass - the
log there contains exactly that sequence:

```
[PinnedSites] resolve pass: 14 pins, 0 need a custom icon [], 3 need a site favicon
[PinnedSites] resolve pass SKIPPED - an earlier resolve is still in flight
[PinnedSites] resolve pass produced NO patches - every fetch came back empty
```

In that instance the skipped pass had no icons to resolve, so nothing was
lost. The steps below are the same sequence with a skipped pass that DID have
an icon waiting, which is the inference for what the failing run hit:

1. An earlier step leaves 14 pins in the list, 3 of which need a site
   favicon. The effect runs, sets `isResolvingRef = true`, and starts 3
   fetches. Call this pass A.
2. Roughly 50 ms later the import appends the 2 fixture pins. The list
   becomes 16, React re-renders, the effect runs, sees `isResolvingRef` still
   true, and returns. Log line:
   `[PinnedSites] resolve pass SKIPPED - an earlier resolve is still in
   flight`. Nothing anywhere now remembers that fixture B is waiting for its
   star icon.
3. Pass A finishes. All 3 fetches came back as the default globe and were
   filtered out, so there are no patches. Log line: `[PinnedSites] resolve
   pass produced NO patches - every fetch came back empty`. It writes
   nothing and sets `isResolvingRef = false`.
4. The test polls for 15 seconds. Polling reads the mirror but doesn't
   change it, so nothing re-renders, so the effect never runs again. Fixture
   B still has no favicon and the step fails.

Contrast with the passing run, where no pass was in flight when the import
landed, so the effect ran normally:

```
[PinnedSites] resolve pass: 16 pins, 1 need a custom icon [InPanelTest: P9 fixture B/star], 3 need a site favicon
[PinnedSites] resolve pass writing patches: Array(1)
[PinnedSites] resolve pass: 1 of 1 patches landed
```

That is the whole difference: a race between the import and whichever pass
happens to be running. Certain: the effect resolved and wrote the icon once it
got a pass that was not skipped. Inferred: that in the failing run it never
got one. It explains why P.9 failed when run after the other
cases (lots of list churn, good odds of hitting a skip) and passed when run
with less going on. This makes the test order-dependent and flaky, which is
its own problem on top of the resolver bug itself.

## Why it matters outside the tests

Importing an Arc backup, or any backup with many pins, is precisely the
scenario where heavy list churn meets icons that need resolving. Today some
of those icons can stay unresolved indefinitely, until the user happens to
edit the pin list and trigger a fresh pass. Severity is moderate - no data is
lost, it's a missing icon rather than a broken pin, but the failure is silent
and can persist for the whole session.

## How it was diagnosed

The failing assertion originally said only "either the resolver did not run,
or the Iconify fetch failed", which is ambiguous - those two causes look
identical from outside and only one of them means the extension has a bug. A
diagnostic was added to the test step, `diagnoseUnresolvedIcon` in
`sectionP.ts:1109`: on timeout it re-checks the pin's eligibility, checks
`navigator.onLine`, and then calls `iconToDataUrl` directly. That call
succeeded, which ruled out the network and pointed at the resolver.

DEV-only logging was then added to the effect in `usePinnedSites.ts` - a line
when a pass is deferred, a line per pass showing what it sees, and lines
showing the patches written and how many landed - which produced the trace
above. Those logs were kept rather than removed afterwards, since they are the
first thing to look at if an icon fails to appear again.

## The fix, as applied

Remember the dropped request instead of discarding it. `resolveRequestedRef`
(`usePinnedSites.ts:67`) is a second boolean ref, set to true by the effect
whenever it finds a pass already in flight. The pass checks it in its `finally`
(`usePinnedSites.ts:167`) and, if set, clears it and runs once more. The guard
keeps doing its real job of preventing overlapping fetch batches, without
losing work.

The retry deliberately runs against `pinnedSitesManagerProxy.snapshot`, the
list as it stands at that moment, rather than the list captured when the
deferred change happened. The captured one is by definition out of date.

Two structural changes came with it:

- The pass moved out of its inline async IIFE into `runResolvePass`
  (`usePinnedSites.ts:71`), since the retry needs to call it again. The pin
  filtering moved inside, so a retry re-filters the current list instead of
  reusing the old one. The effect is now just "defer, or run".
- `runResolvePass` carries an explicit type annotation because its body refers
  to itself for the retry, and TypeScript cannot infer a type for a recursive
  arrow function on its own.

The two `Promise.all` batches were also merged into one while the code was
open. The custom icons come from the Iconify CDN and the favicons from
Chrome's local cache, so neither group had any reason to wait on the other.
That is a small speedup in its own right, and it shortens the window in which
a change can be deferred at all - though it does not fix anything by itself,
which is why the retry is still the real change.

### Why this cannot loop

Worth stating, because a retry that re-fetches things that just failed looks
like it should.

`resolveRequestedRef` is set in exactly one place: the effect body. The effect
only runs when React re-renders, and a retry is not a render, so a retry can
never set the flag for itself. The flag is also cleared before the retry
starts. So each deferred change buys exactly one extra pass, and the chain
continues only if more real list changes keep arriving.

The case that looks riskiest - every fetch failing - is the safest: a pass that
resolves nothing never calls `setFavicons`, so it writes nothing and triggers
no render. And if the manager drops every patch as stale, the proxy's
`#applySites` compares with `JSON.stringify` and skips the store write, so no
listener fires there either.

What IS true, and predates this fix: a pin whose favicon can never resolve gets
re-fetched on every list change, forever. Site favicon lookups are local and
cheap, so this has not been worth addressing. A per-session "tried and failed"
set of pin ids would stop the churn, but it needs care - the whole reason to
retry a site favicon is that it fails until the user visits the page, and then
starts working.

## What to test

P.9 passing on its own proves less than it looks: it passed on its own before
the fix too. The run that matters is the one where the failure originally
showed up.

1. **The full in-panel suite, sections A through P, in one sweep.** This is the
   real regression check. P.9 only failed when list churn from the earlier
   cases overlapped its import, so a full run is the condition that was broken.
   It also covers the step 5 wiring outside Section P - the new `TestContext`
   fields and the six files that took `readonly` - which nothing else
   exercises. The sweep runs unattended until the first guided case.
2. **The guided cases**, if they have not been run since: P.7, P.8 and P.10 in
   this section, plus E.3 and C.2g. P.8 is the one least worth skipping - it is
   the only check that `PinnedSitesManager.load()` finishes before a mutation is
   handled, and a mistake there wipes the whole pin list rather than losing an
   icon.
3. **"Unit Test Do/Undo Delete Pinned Sites"** from the DEV dropdown. P.3 covers
   the same ground now, but this one seeds a known list and checks exact
   indices. It rewrites the whole pin list as setup, so run it with pins you can
   afford to lose.
4. **A short manual pass on what nothing automates**: the edit dialog itself
   (P.1 drives `updatePin` directly, not the dialog), drag-to-reorder in the
   pinned bar (P.1 calls `movePin`), and the Export dialog's file picker.

### Watching the resolver itself

The retry is new behaviour rather than a test, so it is worth one direct look.
Open the sidebar with several pins that have no favicon and watch the console.
Expect a pass, possibly a `DEFERRED` line, and then a re-run that settles. A
console that keeps printing passes while nothing is being touched means the
retry is firing more often than intended, and is worth reporting.

The DEV-only logs that found this bug are still in place
(`usePinnedSites.ts`, guarded by `import.meta.env.DEV`), now described as
resolver diagnostics rather than temporary tracing. They are chatty: every list
change prints a line. If that gets tiresome during normal work, the per-pass
line is the one to cut, keeping `DEFERRED` and the patches-landed line.
