---
created: 2026-09-08
step: 3
manager: SpaceManager
status: shipped
---

# Step 3: Port `SpaceManager`

> **Shipped, then corrected.** This step landed largely as planned below, but
> the `#writeSeq` stale-ack guard described in section 4 was never the
> mechanism that survived review. A `senderId`/`CONTEXT_ID` guard (see the main
> decision doc, section 4 and step 3.5) replaced it: the ack is no longer
> applied to the mirror at all, so there is no stale ack left to guard against.
> The `#applySpaces` JSON-comparison no-op-write guard described here DID ship
> as planned and still exists. See
> `docs/decisions/2026-07-30-shared-storage-multiple-writers.md` for the full
> story and `src/managers/proxies/spaceManagerProxy.ts` for what's actually
> there. The plan below is left as originally written as a record of the
> design at the time; "Read-after-write, worked" further down is corrected to
> match the shipped code.

Implementation plan for step 3 of the migration order in
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`.

Step 1 (`TabSpaceRegistry`) proved routing; 
Step 2 (`SpaceWindowStateManager`) proved the mirror store, acks-carry-state and
`useSyncExternalStore`. 
Step 3 is the first port that **fixes a real bug**:
Case 3, the lasting divergence where `DeleteSpaceAction` writes
`chrome.storage.local['spaces']` directly and `SpaceManager`'s in-memory cache
keeps the deleted space until the service worker restarts.

It is also the first port where the mirrored value is a **list that the sidebar
mutates from many call sites**, so it is the step that actually exercises
"read your own write" (decision 4). Every `spaces` CRUD callback in
`SpacesContext` today reads a render-captured `spaces` const; after this step
they read the store snapshot at call time instead.

## What exists today

- `SpaceManager` (`src/background.ts:566`) owns `spaces` in `chrome.storage.local`.
  `load()` + `migrate()` at startup, `getSpaces()`, `update(spaces)`. No
  broadcast, no `chrome.storage.onChanged` listener.
- Two flat message actions in `src/utils/spaceMessages.ts`: `GET_SPACES` and
  `UPDATE_SPACES`, handled inline in `background.ts:1314` and `:1325`.
- Background-internal readers: `getSpaceById`, `findSpaceByName`
  (`src/background.ts:627`/`:633`) and the Space Navigator popup sizing at
  `src/background.ts:1455`. These call `spaceManager.getSpaces()` directly and
  are **untouched** by this step.
- Sidebar consumers:
  - `src/contexts/SpacesContext.tsx` - `useState<Space[]>`, filled by a
    `GET_SPACES` round trip on mount, kept in sync across windows by its own
    `chrome.storage.onChanged` listener, and written by seven CRUD callbacks
    that all funnel into `sendSpacesUpdate`.
  - `src/components/SpaceNavigatorApp.tsx` - one `GET_SPACES` fetch on mount.
  - `src/actions/deleteSpaceAction.ts` - **bypasses both**, writing
    `chrome.storage.local` directly in `do()` and reading + writing it in
    `undo()`. This is Case 3.

## Changes

### 1. New `src/managers/shared/spaceManagerApi.ts`

Mirrors `shared/spaceWindowStateApi.ts`.

```typescript
export interface SpaceManagerApi
{
  getSpaces(): Space[];
  /** Returns the resulting list, which becomes the ack payload. */
  updateSpaces(spaces: Space[]): Space[];
}

export const SPACES_CHANGED = makeManagerActionId(ManagerId.SPACES, 'changed');
```

Note the rename: the message method is `updateSpaces`, the manager method
today is `update`. Rename the manager method to match, so the Api name and
the implementation name are the same word.

### 2. `src/managers/proxies/messageRouting.ts`

Add `SPACES: 'SpaceManager'` to `ManagerId`.

This is the pair the exact-match lookup was written for: with a `startsWith`
scan, `SpaceManager` and `SpaceWindowStateManager` do not collide, but the
shared `Space` prefix means any future `SpaceFooManager` would. Nothing to
change in the router - just confirm the startup uniqueness assert still fires
on duplicates.

### 3. New `src/managers/impl/spaceManager.ts`

Move the existing `SpaceManager` class out of `background.ts` verbatim, plus
its private helper `findFolderSegmentsByPath` (`src/background.ts:538`, used
only by `migrate`). Keep `load`, `migrate`, `getSpaces` as they are. Then:

- `class SpaceManager implements RoutedManager, SpaceManagerApi`
- `readonly managerId = ManagerId.SPACES`
- `dispatch(method, message)` handling `getSpaces` and `updateSpaces`, unknown
  method throws - same shape as the other two managers
- rename `update(spaces)` to `updateSpaces(spaces)` and return the stored list
  instead of `void`
- `updateSpaces` broadcasts `SPACES_CHANGED` with `{ spaces }` after the
  storage write, `.catch()`-swallowed like `SpaceWindowStateManager.saveState`
  does (no sidebar may be open)

`migrate()`'s startup write does **not** broadcast. It runs inside `load()`
before `stateReady` resolves, so no sidebar has asked for anything yet.

### 4. New `src/managers/proxies/spaceManagerProxy.ts`

Same shape as `spaceWindowStateProxy`, minus the per-window filtering.

- `#store = new ExternalStore<Space[]>([])`, exposed as
  `get store(): ReadableStore<Space[]>`
- `load(): Promise<Space[]>` - the mirror-and-subscribe entry point, the
  analogue of `mirrorWindow`. Registers the broadcast listener once
  (`#subscribed` guard, for StrictMode double-mount), fills the store from
  `getSpaces()`, returns the list so the caller can act on it. The sidebar
  calls this at mount; `SpaceNavigatorApp` does **not**.
- `getSpaces(): Promise<Space[]>` - plain `callManager`, does not touch the
  store. This is what `SpaceNavigatorApp` and `DeleteSpaceAction` use.
- `updateSpaces(spaces: Space[]): Promise<Space[]>` - applies `spaces` to the
  store **synchronously before the message leaves**, then applies the ack
  before resolving.
  **SUPERSEDED (step 3.5):** the shipped version does the optimistic write and
  stops there - it does not apply the ack to the store afterward. That "apply
  the ack too" step is exactly the mechanism that could clobber a newer
  optimistic write; see the main decision doc's section 4.
- `#applySpaces(spaces)` - the single writer of the store.

**Why the optimistic write is load-bearing here, unlike in step 2.**
`SpacesContext.createSpace` is synchronous and returns the new `Space` to its
caller, and `fixtures.ts` calls it twice in a row. Without applying the new
list before returning, the second call reads a snapshot that does not contain
the first space and writes it back out - a lost write, not just a stale read.

**Echo guard.** The originating context also receives its own broadcast, with
an equal-but-not-identical array, so `Object.is` misses and every space edit
costs one redundant re-render of every consumer. `spaceWindowStateProxy`
solved this by comparing the one field it holds. Here, compare with
`JSON.stringify` in `#applySpaces` and bail when equal. The list is a handful
of small flat objects, so the cost is nothing next to the render it prevents.
Comment it as such, so nobody later mistakes it for a deep-equality utility
worth generalising.

**Partially superseded (step 3.5).** The `JSON.stringify` no-op-write guard in
`#applySpaces` did ship and is still there - it is a real no-op-write check,
not just an echo guard. But the *actual* echo problem (a context receiving the
broadcast caused by its own write) is now caught earlier and more directly: a
`senderId`/`CONTEXT_ID` check in the broadcast listener skips a message from
this same context before it ever reaches `#applySpaces`. The JSON comparison
still matters for the remaining case - a broadcast from a genuinely different
context, or background, that happens to carry an unchanged list.

### 5. New `src/hooks/useSpaces.ts`

```typescript
export function useSpaces(): Space[]
{
  return useSyncExternalStore(
    spaceManagerProxy.store.subscribe,
    spaceManagerProxy.store.getSnapshot
  );
}
```

### 6. `src/background.ts`

- delete the `SpaceManager` class and `findFolderSegmentsByPath`, import the
  manager from `./managers/impl/spaceManager`
- `registerManager(spaceManager)` next to the existing two
- delete the flat `GET_SPACES` and `UPDATE_SPACES` handlers. `await stateReady`
  for these now happens once in the router.
- `spaceManager.load()` stays in the `stateReady` promise as-is

### 7. `src/contexts/SpacesContext.tsx`

The public context value is unchanged, so no `useSpacesContext()` consumer is
touched.

- drop `const [spaces, setSpaces] = useState<Space[]>([])`, `sendSpacesUpdate`,
  and the whole mount effect including its `chrome.storage.onChanged`
  listener. Cross-window sync is the `SPACES_CHANGED` broadcast now - that
  listener was the "different sync mechanism" the decision doc calls out.
- read with `const spaces = useSpaces()`
- fold the spaces load into the existing mount effect so `isInitialized` means
  both mirrors are ready:

```
chrome.windows.getCurrent -> setWindowId
  await Promise.all([ spaceManagerProxy.load(), proxy.mirrorWindow(id) ])
  seed debug spaces if the loaded list is empty (dev only, unchanged logic)
  setIsInitialized(true)
```

- **the important part:** all seven CRUD callbacks (`createSpace`,
  `updateSpace`, `updateSpaceFolderPaths`, `deleteSpaceBase`, `moveSpace`,
  `replaceSpaces`, `appendSpaces`) must read
  `spaceManagerProxy.store.getSnapshot()` at call time instead of the
  render-captured `spaces` const, and write via
  `spaceManagerProxy.updateSpaces(next)`. Drop `spaces` from their
  `useCallback` dep arrays. Reading the closure const here would keep exactly
  the staleness this refactor exists to remove, and it compiles fine either
  way - this is the single most likely thing to get wrong in this step.
- `getSpaceById` still reads the rendered `spaces` (it feeds `activeSpace` and
  other memos, so it should track renders), and keeps `spaces` in its deps.

### 8. `src/actions/deleteSpaceAction.ts` - the Case 3 fix

- delete the local `const SPACES_STORAGE_KEY = 'spaces'`
- `do()`: replace `chrome.storage.local.set({ spaces: remaining })` with
  `await spaceManagerProxy.updateSpaces(remaining)`
- `undo()`: replace the `chrome.storage.local.get` + `set` pair with
  `await spaceManagerProxy.getSpaces()`, splice, then
  `await spaceManagerProxy.updateSpaces(next)`

Use `getSpaces()` (a round trip) rather than the store snapshot in `undo()`:
`src/tests/deleteSpaceActionTest.ts` drives the action with a synthetic space
list and no mounted `SpacesContext`, so there is no populated mirror there.
The round trip is correct in both contexts and undo is not hot.

Leave the `getSpaces` constructor parameter alone. `do()` keeps using it to
find the space and its index, and the unit test depends on being able to
inject a list.

### 9. `src/components/SpaceNavigatorApp.tsx`

Swap the `GET_SPACES` `sendMessage` for `spaceManagerProxy.getSpaces()`, same
`.then`/`.catch` shape as the `getState` call right below it. Do not call
`load()` - the popup is short-lived and never needs to re-render on a change.

### 10. `src/utils/spaceMessages.ts`

Remove `GET_SPACES` and `UPDATE_SPACES` from `SpaceMessageAction` and update
the header comment: the "sidebar to background" flow line goes away entirely,
leaving only the two orchestration broadcasts `TAB_ACTIVATED` and
`DEASSOCIATE_TAB`, which stay flat per the decision doc's inventory.

`SPACES_STORAGE_KEY` stays exported - `impl/spaceManager.ts` still uses it.

## Read-after-write, worked

**Corrected to match the shipped code (step 3.5).** The plan below reached for
a `#writeSeq` stale-ack guard to survive the hazard at t3. That guard was never
built - it was replaced by a simpler fix once the review found this same
clobbering could happen even for a *first* write, not just a stale-ack race:
the ack is not applied to the store at all, so there is nothing left for a seq
number to guard against. Kept below for the record, then corrected.

`fixtures.ts:createTestSpace` called twice in a row, starting from an empty
list, creating `Work` then `Video`:

```
t0  store.getSnapshot()                        -> []
t1  createSpace('Work', ...)
      reads snapshot []                           at call time, not from render
      store.set([Work])                           optimistic, synchronous
      sendMessage(..., senderId: CONTEXT_ID) 'SpaceManager_msg_updateSpaces' leaves
      returns Work                                caller has the id immediately
t2  createSpace('Video', ...)                     may run before t1's ack
      reads snapshot [Work]                       correct
      store.set([Work, Video])
t3  ack for t1 arrives with [Work] - NOT applied to the store at all
      (originally planned: apply it, JSON compare vs [Work, Video] differs,
      so it WOULD clobber - see below for why this line was scrapped)
t4  ack for t2 arrives with [Work, Video] - also not applied; already correct
t5  the broadcasts for t1 and t2 each separately reach this same context;
      both carry senderId === CONTEXT_ID, so both are skipped as echoes
t6  store.getSnapshot() -> [Work, Video]         correct throughout, no guard needed
```

**What the original plan proposed for t3**, before the ack-applies-to-mirror
mechanism itself was dropped: ignore an ack whose payload is older than the
last optimistic write, via a monotonically incrementing `#writeSeq` captured
in `updateSpaces` before sending, dropping the ack if `#writeSeq` had moved on
since. Broadcasts from other windows would carry no seq and always apply.

This was superseded rather than built, because the same clobbering the seq
guard was meant to catch turned out to happen for the *broadcast* channel too
(not just the ack), and a `senderId` check at the broadcast listener catches
both at once - it does not need to know about "old" vs "new," it only needs to
know "mine" vs "not mine." See the main decision doc's section 4 for the full
argument, and `#applySpaces`/`updateSpaces` in
`src/managers/proxies/spaceManagerProxy.ts` for what actually ships.

## Verification

Baseline first: run the in-panel suite (sidebar DEV dropdown), record which
cases are already red (G1/G2/G3 known gaps), then re-run after the port.

- **Section D** is the one that matters. D.2 deletes a space via
  `DeleteSpaceAction` and asserts it is gone on the very next step - the exact
  case decision 4 was written for - and D.2's undo exercises the new
  `getSpaces` + `updateSpaces` path.
- Section B and C touch space creation and switching through the fixtures, so
  they cover the back-to-back-writes path above.
- `src/tests/deleteSpaceActionTest.ts` ("Unit Test Do/Undo Delete Space" menu
  item) must still pass. It now writes through background rather than straight
  to storage; the observable storage result should be identical.

Manual checks the suite does not cover:

- two windows open, create/rename/delete a space in one - the other's space
  bar must update. This is the broadcast replacing the old
  `chrome.storage.onChanged` listener, and it is the check that would catch
  forgetting to broadcast in `updateSpaces`.
- delete a space, then immediately open the Space Navigator popup (which reads
  through `getSpaces`, hitting `SpaceManager`'s in-memory cache) - the deleted
  space must be gone. This is Case 3 itself: before this step, the popup would
  still list it.
- import spaces with both "Replace" and "Add" (`replaceSpaces`/`appendSpaces`)
- restart the service worker (toggle the extension) with spaces that have no
  `bookmarkFolderSegments`, to confirm `migrate()` still runs and writes

## Not in this step

- Removing the `FIXTURE_TICK_MS` sleeps from `src/tests/inpanel/fixtures.ts`
  and the `ctxRef`-per-render workaround in `TestRunnerPanel.tsx`. The decision
  doc names both as things this refactor retires, but `ctx.spaces` is still
  read through a React render for assertions, so they cannot all go until
  more of the surface is ported. Revisit after step 5.
- Steps 4-6 (`TabHistoryManager`/`LastAudibleTracker`, `PinnedSitesManager`,
  `TabAssociationManager`) and the behaviour fixes (`chrome.tabs.onDetached`,
  G1/G2/D1).

(Written when this doc was "planned." As it actually played out: a review of
this step found the ack-applies-to-mirror flaw described above, and step 3.5
followed immediately after to fix it here and retro-fix step 2's proxy too.
See the main decision doc for the full account.)
