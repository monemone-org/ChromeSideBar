---
created: 2026-09-17
step: 5
manager: PinnedSitesManager
status: implemented, pending verification
---

# Step 5: Port `PinnedSitesManager`

Implementation plan for step 5 of the migration order in
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`.

> **Written alongside the code, not before it.** Steps 2 to 4 each had their
> plan reviewed first. This one was written in the same session as the
> implementation, so it reads as a record of what was built and why rather than
> a proposal. Both decisions in "Decisions taken" were put to the user before
> any file was touched, and both answers are what shipped.

Steps 1 to 4 ported managers that already existed in `background.ts`. This step
is the first that **creates** one, and the first where the list has a writer
that nobody asked for: background patches favicons in on its own, with no
sidebar involved. That single difference drives both design decisions below.

It fixes Case 2 in the decision doc.

## What exists today

Four independent writers of `chrome.storage.local['pinnedSites']`, each doing
its own read-modify-write of the whole array. The decision doc originally
listed three; the lazy icon resolver was found while doing this port.

- **`background.ts`'s `chrome.tabs.onUpdated` handler** ("Scenario 5",
  `src/background.ts:531`). When Chrome reports a `favIconUrl`, it reads the
  array, fills in a favicon for every pin matching the tab's hostname, and
  writes the array back. No in-memory copy, so this is a transient race rather
  than a lasting divergence like Case 3 was.
- **`usePinnedSites.ts`'s CRUD callbacks** - `addPin`, `addPins`, `removePin`,
  `updatePin`, `resetFavicon`, `movePin`, `duplicatePin`,
  `replacePinnedSites`, `appendPinnedSites`. Most build the new array from the
  `pinnedSites` value captured at render, the same stale-snapshot shape
  `SpacesContext` had before step 3. Three of them (`addPin`, `addPins`,
  `appendPinnedSites`) use a functional `setState` updater and are already safe.
- **`usePinnedSites.ts`'s lazy icon resolver**, a separate writer from the CRUD
  callbacks. It resolves missing Lucide icons through the Iconify CDN and
  missing favicons through Chrome's `_favicon` cache, both asynchronously, then
  re-reads storage and writes the whole array back. The re-read narrows the
  race and does not close it.
- **`deletePinnedSiteAction.ts`** - writes the filtered array on `do()`, and on
  `undo()` reads storage, splices the snapshots back at their recorded indices,
  and writes it again.

Plus two readers worth naming, because they constrain the API: the list is read
during render by `PinnedBar` and friends, and `src/tests/inpanel/fixtures.ts`
watches `chrome.storage.onChanged` to learn the id of a pin it just created.

## Decisions taken before writing this plan

### 1. Per-operation methods, not whole-list writes

Steps 2 and 3 send the whole new list. Copying that here would move the race
rather than fix it:

1. Background adds a favicon to its list and broadcasts.
2. Before that broadcast arrives, the sidebar sends a reorder built from its
   older mirror, which has no favicon.
3. The manager stores that list, and the favicon is gone.

So `PinnedSitesApi` names what changed - `removePins(ids)`, `movePin(...)`,
`setFavicons(patches)` - and the manager applies each operation to its own
authoritative list. Two writers now collide only when they touch the same pin.

The cost is that the same list transform has to run in two places: on the
manager's real list, and on the proxy's mirror for the optimistic write. Both
call **one** pure function from `managers/shared/pinnedSitesApi.ts`, so they
cannot disagree about what an operation means.

`replaceAll` is the one whole-list method, because replacing everything is
genuinely what import does.

### 2. A pending-write counter for broadcasts arriving mid-write

Step 3.5's `senderId` guard covers a context's own echo. A broadcast from
*elsewhere* is always applied, which is right when nothing of ours is in flight
and wrong when something is:

```
mirror [A B C D]
user unpins D          mirror [A B C], removePins([D]) sent
background patches B's favicon, broadcasts [A B* C D]
  -> applied, D is back on screen
background handles the remove, broadcasts [A B* C] with OUR senderId
  -> dropped as our own echo
D stays on screen until some unrelated later broadcast
```

Storage is correct and this one window is wrong, which is exactly the failure
the `senderId` guard exists to prevent, arriving from the other side. It needs
a favicon update and a pin edit within milliseconds of each other, which is
rare - but background generates favicon updates unprompted, so "rare" here is
not "never" the way it is for Spaces.

The proxy counts its in-flight writes. A foreign broadcast arriving while that
count is above zero is dropped and the fact recorded; when the last write
returns, the proxy re-reads the list and applies that. The re-read only happens
when something was actually dropped, so the normal path costs no extra round
trip.

**The same hole exists in `spaceManagerProxy`** and was deliberately left
there. Recorded in the decision doc, section 7, and in its follow-up list.

### 3. `PinnedSite` moves out of the hook

`background.ts` needs the type now that the manager lives there, and the
service worker must not import a React module. `PinnedSite` and
`PINNED_SITES_STORAGE_KEY` move to `managers/shared/pinnedSitesApi.ts`, and the
hook re-exports both, so the roughly fifteen files importing them from the hook
are untouched.

### 4. The list becomes `readonly PinnedSite[]`

Same reasoning as `spaceManagerProxy.snapshot`: what consumers hold is the live
array behind the mirror, not a copy, so splicing it would change what every
subscriber sees without notifying any of them. Six prop and parameter
annotations take `readonly`, and the two places that put the list into a backup
object copy it (`[...pinnedSites]`), since the backup owns what it holds.

### 5. Favicon patches carry their provenance

Both resolvers are asynchronous, and both end up writing the same `favicon`
field, so a patch can arrive for a pin the user has since changed. Each patch
records what it was resolved **for**:

- no `forCustomIconName`: a site favicon, applied only while the pin still has
  no icon of any kind.
- `forCustomIconName` set: a Lucide icon rendered to a data URL, applied only
  while the pin still asks for that same icon name.

The manager re-checks this rather than trusting the caller, so a patch for an
icon the user swapped out mid-fetch is dropped instead of overwriting the new
one. The old code checked eligibility in the caller, before the fetch, and
applied the result unconditionally after it.

## Changes

### 1. `src/managers/proxies/messageRouting.ts`

One line: `PINNED_SITES: 'PinnedSitesManager'` in `ManagerId`.

### 2. New `src/managers/shared/pinnedSitesApi.ts`

The wire contract, and the largest of the shared files so far because it also
holds the transforms.

- `PinnedSite`, `PINNED_SITES_STORAGE_KEY` (moved from the hook).
- Supporting types: `PinnedSitePlacement` (a pin plus the index to restore it
  at), `PinnedSiteEdit`, `PinnedSiteDropPosition`,
  `PinnedSiteDuplicateOverrides`, `PinnedSiteFaviconPatch`.
- `PinnedSitesApi` - ten methods. Every mutation returns the resulting list,
  which becomes the ack payload the proxy's drain falls back on.
- `PINNED_SITES_CHANGED`, the broadcast action.
- One pure transform per mutation: `applyAddPins`, `applyRemovePins`,
  `applyInsertPins`, `applyUpdatePin`, `applyResetFavicon`, `applyMovePin`,
  `applyDuplicatePin`, `applySetFavicons`. Each takes a `readonly` list and
  returns a new one.

`PinnedSiteEdit` is worth one note: its three icon fields are replaced as a
set, so whatever is absent is cleared on the stored pin - picking an emoji has
to remove a custom icon and vice versa. `favicon` is the exception, where
absent means "leave the stored one alone". That asymmetry is not new, it is
what `updatePin` already did inline; naming the type is what makes it visible.

### 3. New `src/managers/impl/pinnedSitesManager.ts`

Implements `RoutedManager` and `PinnedSitesApi`. `load()` reads storage once at
startup. `dispatch` pulls `senderId` out once at the top and passes it to every
mutation as `originId`.

Each mutation is one line: hand the matching transform its current list, pass
the result to a private `#commit`, which stores it in memory, writes storage,
broadcasts with the `originId` echoed back, and returns it. One persist, one
broadcast, one implementation.

### 4. New `src/managers/proxies/pinnedSitesManagerProxy.ts`

Implements `Remote<PinnedSitesApi>`, plus the mirror pieces the API has no
equivalent for: `store`, `snapshot`, `load()`.

- `#applySites` is the single writer of the mirror, with the same JSON no-op
  comparison `spaceManagerProxy` uses.
- `#onBroadcast` holds decision 2: own echo dropped, foreign broadcast dropped
  and flagged while writes are in flight, applied otherwise.
- `#mutate` is what every mutation calls: apply the transform to the mirror,
  increment the counter, send, decrement, drain. On failure it re-reads from
  background rather than rolling back to a remembered list, which could undo a
  later write that did succeed - the same reasoning as step 3.5.
- `#drain` does nothing while other writes are out. When the last one returns
  and a broadcast was dropped, it re-reads; if that re-read itself fails, it
  falls back to the ack, which is at worst missing the one change we know we
  dropped.

### 5. `src/hooks/usePinnedSites.ts`

Same public API, so `App.tsx` and everything below it is unchanged apart from
`readonly`.

- `useState` plus the `chrome.storage.onChanged` listener become
  `useSyncExternalStore` over the proxy's mirror.
- Every callback names its operation instead of building a full array.
  `duplicatePin` generates the new id here rather than in the manager, so this
  context's optimistic copy and the stored one are the same pin.
- The lazy resolver builds `PinnedSiteFaviconPatch[]` and no longer re-reads
  storage before writing: `setFavicons` patches only the pins it names, so a
  pin added or removed during the fetch is unaffected.
- `createChromeErrorHandler` is gone, since the hook makes no direct Chrome
  calls any more. A local `reportFailure` keeps the `error` field the hook has
  always returned.

### 6. `src/background.ts`

Construction, `load()` in the `stateReady` batch, `registerManager`. Scenario 5
reads `pinnedSitesManager.getPinnedSites()` instead of storage and calls
`setFavicons` with a patch per matching pin. No `originId`: the change started
here, so every sidebar needs to hear about it.

### 7. `src/actions/deletePinnedSiteAction.ts` - the Case 2 fix

`do()` calls `removePins(this.pinnedIds)`; `undo()` calls `insertPins` with the
snapshots. Both storage writes are gone, and `getCurrentPins` takes `readonly`.

Naming the ids rather than sending a filtered list is what makes the delete
safe: a favicon background resolved between the snapshot and the delete
survives it now.

### 8. `src/tests/deletePinnedSiteActionTest.ts`

Seeds with `replaceAll` and reads with `getPinnedSites` instead of touching
storage directly. The read change is worth something on its own: the assertions
now check the manager's in-memory list, so a divergence between it and storage
would fail the test rather than passing silently.

### 9. `readonly` annotations and two copies

`App.tsx`, `ExportDialog.tsx`, `PinnedBar.tsx`, `backupRestore.ts`,
`tests/inpanel/types.ts`, `tests/inpanel/TestRunnerPanel.tsx`. The two copies
are `exportFullBackup`'s literal and `ExportDialog`'s `backup.pinnedSites`
assignment.

### 10. Comments that this step made untrue

`TestRunnerPanel.tsx` (why the panel takes the list as a prop),
`fixtures.ts` (`FIXTURE_TICK_MS`, `createTestPinnedSite`, `resetTestData`) and
`tests/inpanel/types.ts` all described the pin callbacks as `useState`-backed
and snapshot-writing. Updated to say what is actually true now: the pin
callbacks write the proxy's mirror, so back-to-back calls cannot lose each
other's write, while the Spaces callbacks still need a fresh ctx between calls.

Passing the list down to `TestRunnerPanel` rather than calling the hook twice
is still right, but for a different reason: the list itself is now shared, but
the hook also runs the icon resolver, and a second instance would fetch the
same icons again in parallel.

## Worked trace: unpin while background is patching a favicon

Two pins, A and B. B has no favicon yet. The user unpins B at the same moment
Chrome reports a favicon for a tab whose hostname matches A.

```
t0  mirror [A B]                         both contexts agree
t1  user unpins B
    optimistic: mirror [A]               synchronous, PinnedBar re-renders
    pendingWrites 1, removePins([B]) sent
t2  background finishes fetching A's favicon, calls setFavicons
    its list becomes [A* B], stores, broadcasts [A* B] with no senderId
t3  that broadcast reaches the sidebar; pendingWrites is 1
    -> dropped, missedBroadcast = true
t4  background handles removePins([B]) against ITS list [A* B]
    -> [A*], stores, broadcasts with our senderId, acks [A*]
t5  ack arrives, pendingWrites 0, missedBroadcast set
    -> re-read: getPinnedSites() returns [A*]
t6  mirror [A*]                          favicon kept, unpin kept
```

The favicon survives because the sidebar never sent a list that lacked it, only
the instruction "remove B". The unpin survives because the stale broadcast at
t3 was held rather than applied. Under the whole-list API of steps 2 and 3, t4
would have stored the sidebar's favicon-less array and lost A's favicon.

## What this step does not do

- **`spaceManagerProxy`'s copy of the mid-write broadcast hole.** Decision 2
  above. Recorded in the decision doc for whenever that proxy is next touched,
  preferably as a shared proxy base rather than a second copy of the counter.
- **Removing `FIXTURE_TICK_MS` and the `ctxRef`-per-render workaround.** Steps
  3 and 4 both deferred these to "after step 5". They are now unnecessary for
  pins and still necessary for Spaces' CRUD callbacks, so the cleanup wants
  doing once, deliberately, rather than half here. The comments are corrected
  in the meantime so they no longer claim something false.
- **Step 6** (`TabAssociationManager`, Case 1) and the behaviour fixes
  (`chrome.tabs.onDetached`, G1/G2/D1).

## Verification

### 1. Compile

`npm run build:debug`, then reload. Most of what can be wrong is type-driven -
`PinnedSitesApi` and its `Remote` proxy drifting, a `dispatch` case no proxy
call matches, a `readonly` array reaching a mutable slot. The `readonly` change
in particular touches files that have nothing to do with this refactor, and the
compiler is the only thing that finds them all.

### 2. The unit test

"Unit Test Do/Undo Delete Pinned Sites" in the DEV dropdown. It is the only
automated coverage of `insertPins`, and the only test that checks pins come
back at their **original indices** rather than merely coming back.

It rewrites the whole pin list as part of its setup and clears it afterwards,
so run it with pins you can afford to lose. That was true before this step too.

### 3. The in-panel suite

Sections A to E. No case asserts on pinned sites directly, but fixtures across
all five sections create pins through `addPin` and open tabs against them, so a
broken add or a broken id round trip fails a lot of cases at once. G1, G2 and
G3 are red as always - compare against a previous results file.

`createTestPinnedSite` waits on `chrome.storage.onChanged`, which still fires,
because the manager writes the same key. If that wait times out, the manager is
not persisting.

### 4. By hand, because nothing above covers most of the surface

Nine of the ten API methods have no automated coverage at all. Worth walking
once, in one window: add a pin, edit its title, give it an emoji, swap that for
a custom Lucide icon, reset it to the site icon, duplicate it, drag it to
reorder, unpin it, undo the unpin (it should come back where it was), then
export and re-import a backup.

Then the two things that are specific to this step:

- **Scenario 5, the reason for all of it.** Add a pin for a site you have never
  visited, so it has no favicon, then visit it in a tab. The favicon should
  appear without a reload. That is background writing through the manager and
  broadcasting to a sidebar that did not ask.
- **Two windows.** Open the sidebar in both, add and remove pins in one, and
  watch the other follow. This is the broadcast path, which the old
  `storage.onChanged` listener used to provide for free.
