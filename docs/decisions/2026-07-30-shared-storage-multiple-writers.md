---
created: 2026-07-30
decision: single-writer-shared-storage
status: proposed
---

# Multiple Writers to Shared Storage

## Background

Found while auditing tab/bookmark/space association handling for the "Follow active tab" feature. `background.ts` (service worker) and the sidebar (React, mainly `BookmarkTabsContext.tsx`/`SpacesContext.tsx`) both have direct access to `chrome.storage.session` and `chrome.storage.local` - contrary to the assumption that session storage is "sidebar-only." Chrome's default access level (`TRUSTED_CONTEXTS`) covers the service worker and all extension pages; it only excludes content scripts unless explicitly widened.

Because both contexts can reach the same storage keys, three places ended up with **two independent writers** to the same key, instead of one owner. This doc records where, what can go wrong, and the general fix - to be addressed as a deliberate refactor later, not folded into a bugfix.

For comparison, `SpaceWindowState` (`chrome.storage.session`, per-window active space) already does this correctly: background owns all writes; the sidebar only sends `GET_WINDOW_STATE`/`SET_ACTIVE_SPACE` messages and reacts to `STATE_CHANGED` broadcasts. That pattern is the target shape for the three cases below.

## Case 1: Tab associations (`tabAssociations_{windowId}` session storage + `tabAssociationsBackup_*` local storage)

**Where** (`src/utils/tabAssociations.ts`, explicitly shared - "Used by both background.ts and BookmarkTabsContext.tsx"):

- `background.ts`'s `chrome.tabs.onUpdated` handler calls `saveTabAssociationBackup` on every URL change of a tracked tab, to keep the backup's URL/index fresh for post-restart domain matching.
- `BookmarkTabsContext.tsx`'s `storeAssociation` (create), `removeLocalTabAssociation` (remove), and `rebuildAssociations` (init/rebuild) all read/write the same session-storage record and backup directly.

**What can go wrong**:

- `saveTabAssociationBackup`/`removeTabAssociationBackup`/`removeTabAssociation` are all read-whole-object → mutate one key → write-whole-object-back. Two near-simultaneous callers (e.g. sidebar's creation-time write right as background's navigation-triggered write lands, which commonly happens within milliseconds of a new bookmark tab being created) can clobber each other's *other* entries - not the shared key they're both touching (that converges fine), but any third entry that changed in the gap between one caller's read and the other's write.
- `rebuildAssociations` reads storage once, then validates each tracked tab **sequentially** (`await chrome.tabs.get` in a loop - can take a real, non-trivial amount of time with many tracked tabs), then does one blind bulk write-back of its locally-mutated copy at the end. Any write from elsewhere (e.g. background breaking a stale association) landing mid-loop gets silently overwritten/resurrected by that final write.
- If the sidebar is closed when a change needs to happen (e.g. a tracked tab dragged into another space's Chrome group), there is nothing to receive a "please update your state" message - the write has to happen somewhere that doesn't depend on the sidebar being open. Fire-and-forget messages to a possibly-absent sidebar are not a substitute for an owner that can always write.
- `chrome.tabs.onDetached` (a tracked tab dragged to a different window) is *only* listened to in `BookmarkTabsContext.tsx` - `background.ts` has no equivalent listener at all, unlike `onRemoved`/`onUpdated` which it does own. Sidebar closed at detach time means nothing calls `removeLocalTabAssociation`, and the gap doesn't self-heal on reopen either: `rebuildAssociations` only checks `chrome.tabs.get(tabId)` succeeding, never that the tab's *current* `windowId` still matches the window being rebuilt - a detached tab still exists, just in another window, so it gets silently kept and written back as if nothing happened (confirmed via A.6 step 6 in `docs/test/tab-space-association-test-cases.md`). Same underlying failure as the bullet above, different trigger event.

**Scope note for the fix below**: the "single owner" fix has to include an explicit new `chrome.tabs.onDetached` listener in `background.ts` (mirroring the existing `onRemoved`/`onUpdated` pattern - background already has the correct `windowId` on detach events). It's easy to implement the rest of Case 1's fix (group-change deassociation, `storeAssociation`, `rebuildAssociations`) without touching `onDetached` since nothing else in this doc names it - don't let that one slip through.

## Case 2: Pinned sites (`pinnedSites`, local storage)

**Where** - four writers, not the three this doc originally listed (the lazy icon resolver was found while doing the port):

- `background.ts`'s `chrome.tabs.onUpdated` handler ("Scenario 5") reads the whole `pinnedSites` array, patches in a favicon for sites matching the tab's domain, writes the whole array back.
- `src/hooks/usePinnedSites.ts` (sidebar CRUD - add/remove/reorder/edit) and `src/actions/deletePinnedSiteAction.ts` (undo support) do their own independent read-modify-writes to the same key.
- `usePinnedSites.ts`'s lazy icon resolver, a separate writer from the CRUD callbacks above: it fetches missing favicons and Lucide icons asynchronously, then re-reads storage and writes the whole array back. Re-reading first narrows the race but doesn't close it.

**What can go wrong**: same read-modify-write race shape as Case 1's backup writes. No persistent in-memory cache on the background side, so this is a transient race rather than a lasting divergence - but still capable of dropping a concurrent CRUD change (e.g. a reorder or edit) if it lands in the same narrow window as a favicon update.

## Case 3: Space definitions (`spaces`, local storage)

**Where**:

- `background.ts`'s `SpaceManager` class is the intended owner: loads once at startup (`load()`), and is otherwise only mutated via its `update()` method, called from the `UPDATE_SPACES` message handler. It has no `chrome.storage.onChanged` listener of its own.
- `src/actions/deleteSpaceAction.ts` (`DeleteSpaceAction`, run from the sidebar) writes `chrome.storage.local[spaces]` **directly** and never sends `UPDATE_SPACES`.

**What can go wrong** - this one is a confirmed, lasting divergence, not just a race: after a space is deleted via `DeleteSpaceAction`, `SpaceManager`'s in-memory list still contains the deleted space until either the service worker restarts, or some unrelated later edit happens to trigger `UPDATE_SPACES` (which sends the sidebar's - by then correct - full list and overwrites the stale cache as a side effect). The sidebar's own `spaces` React state stays correct throughout, but only because `SpacesContext.tsx` has a *separate* `chrome.storage.onChanged` listener watching this key - a different sync mechanism than the message-based one, which happens to paper over the gap for the UI but does nothing for `SpaceManager`.


## Inventory

Taken from the code as of 2026-08-11, so the migration below has a fixed target rather than a moving one.

### Manager classes in `background.ts`

| Class | Storage key | Area | Sidebar-facing today |
| --- | --- | --- | --- |
| `SpaceWindowStateManager` | `spaceWindowState_{windowId}` | session | yes - already the target pattern |
| `SpaceManager` | `spaces` | local | yes - but `DeleteSpaceAction` bypasses it (Case 3) |
| `TabHistoryManager` | `bg_windowTabHistory` | session | yes |
| `TabSpaceRegistry` | `bg_tabSpaces` | session | yes - `register` only |
| `LastAudibleTracker` | `bg_lastAudibleTabIds` | session | yes - read only |
| `TabGroupTracker` | `bg_windowActiveGroups` | session | no - background-internal |
| `NewsVersionChecker` | `sidebar-news-latest-version`, `sidebar-last-news-check-time` | local | no - writes only these two; the sidebar's `useNewsCheck` writes a *different* key (last-seen), so no shared writer |

Two managers do not exist yet and are the actual point of Cases 1 and 2:

- **`TabAssociationManager`** - owner of `tabAssociations_{windowId}` (session) and `tabAssociationsBackup_*` (local). Written today by both `background.ts` and `BookmarkTabsContext.tsx` through the explicitly-shared `src/utils/tabAssociations.ts`.
- **`PinnedSitesManager`** - owner of `pinnedSites` (local). Written today by `background.ts` (favicon patching), `usePinnedSites.ts` (CRUD *and* its lazy icon resolver, two separate writers), and `deletePinnedSiteAction.ts` (undo). Built in step 5.

### Messages

Manager-owned. These become `<Manager>_msg_<method>` and route per the scheme below:

| Message | Owner |
| --- | --- |
| `register-tab-space` | `TabSpaceRegistry` |
| `get-spaces`, `update-spaces` | `SpaceManager` |
| `get-window-state`, `set-active-space`, `state-changed` | `SpaceWindowStateManager` |
| `prev-used-tab`, `next-used-tab`, `get-tab-history`, `navigate-to-history-index` | `TabHistoryManager` |
| `get-last-audible-tab` | `LastAudibleTracker` |

Orchestration. No single manager owns these - they coordinate several, so they stay as direct handlers in `background.ts` and keep their current names:

| Message | Why it has no owner |
| --- | --- |
| `set-active-tab-and-space` | activates a tab, resolves its space via `TabSpaceRegistry` + `SpaceManager`, switches `SpaceWindowStateManager`, then broadcasts. The backbone of every C.2 case. |
| `queue-tab-for-grouping` | calls the free function `queueTabForGrouping`, not a manager method |
| `tab-activated` (broadcast) | emitted from two unrelated places: the `onActivated` listener and `setActiveTabAndSpace` |
| `deassociate-tab` (broadcast) | emitted from group-change detection; moves to `TabAssociationManager` once that exists |

Four total, and `deassociate-tab` is temporary. Small enough that leaving them direct costs little.

### Explicitly out of scope

Single-writer already, sidebar-only UI state. Listing them so the refactor does not expand to swallow them:

- `BookmarkTree.tsx` folder expand state, `TabList.tsx` group expand state, `App.tsx` per-space scroll positions
- `useChromeLocalStorage` settings, including `sidebar-follow-active-tab`. Background *reads* that one but never writes it, so there is still exactly one writer.
- `useNewsCheck`'s last-seen key

## Design

### Shape

```
┌─ sidebar ──────────────────┐         ┌─ background.ts ───────────────┐
│                            │         │                               │
│  component                 │         │   routeMessage(action)        │
│     │ calls                │         │      │ split on "_msg_"       │
│     ▼                      │         │      ▼                        │
│  proxy.register(...)  ─────┼─msg────►│   Map<managerId, manager>     │
│     │                      │         │      │                        │
│     │ reads (sync)         │         │      ▼                        │
│     ▼                      │         │   manager.dispatch(method)    │
│  local mirror  ◄───────────┼─bcast───┤      │                        │
│                            │         │      ▼                        │
└────────────────────────────┘         │   in-memory + chrome.storage  │
                                       └───────────────────────────────┘
```

### 1. Reads never leave the sidebar

Only mutations go through messages. Queries are served synchronously from a local read-only mirror kept current by broadcasts.

This is not a preference - it is forced. `isBookmarkLoaded(id)` and friends are called *during React render*, and message passing is async, so a proxy call there is impossible without restructuring every consumer. The proxy is therefore **not** a 1:1 mirror of the manager: it exposes every mutation, plus a snapshot/subscribe API, and no per-item getters.

### 2. Two-level routing, per manager

`background.ts` knows managers. Each manager knows its own methods. Neither knows the other's half.

```
"TabSpaceRegistry_msg_register"
 └── managerId ──┘     └ method ┘
```

- Split on the `_msg_` separator and look the manager segment up by **exact match**. Not `startsWith`, which mis-routes when one prefix is a prefix of another.
- Assert managerId uniqueness at startup, so a collision fails loudly at load instead of silently stealing another manager's messages.
- `await stateReady` and `chrome.runtime.lastError` handling live in the router and the proxy base, once each, rather than being repeated per method as they are today.

### 3. Manager and proxy types are bound together

So the two cannot drift when someone adds a method:

```typescript
interface TabSpaceRegistryApi
{
  register(windowId: number, tabId: number, spaceId: string): void;
}

// every method becomes async across the message boundary
type Remote<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
};

// manager implements TabSpaceRegistryApi
// proxy   implements Remote<TabSpaceRegistryApi>
```

### 4. Mutation acks carry the resulting state (superseded, see step 3.5)

**This section is what step 2 and the original step 3 plan built. It shipped, turned out to have a real bug, and was replaced. Kept here so the history of the decision reads honestly - see the correction at the bottom of this section and step 3.5 in the migration order below for what actually ships now.**

A mutation completes twice: when background responds, and later when its broadcast reaches every sidebar. If the proxy resolves on the response alone, the calling context's own mirror is briefly stale:

```typescript
await proxy.deleteSpace(id);
spacesMirror.get();   // may still contain the deleted space
```

The `await` cannot help here, because it is synchronizing a different channel than the one that updates the mirror:

```
proxy.deleteSpace(id)
  └─ sendMessage ─────────► background
                               │ mutate + write storage
                               ├─ sendResponse ──────► resolves the await   (channel 1)
                               └─ broadcast ─────────► onMessage listener   (channel 2)
                                                          │
                                                          ▼
                                                      mirror updated
```

Chrome gives no ordering guarantee between the two, and the promise knows nothing about the broadcast. Waiting for the broadcast instead would mean correlating a global message back to one specific call, plus a timeout for when it never arrives.

**Original decision:** the response payload carries the resulting state, and the proxy applies it to the local mirror before resolving. Read-after-write is then consistent in the calling context with no waiting and no correlation, and the broadcast keeps its real job of updating *other* windows.

This is not hypothetical: D.2 in the in-panel suite deletes a space and asserts it is gone on the very next step.

**Why this was wrong.** The mutation already writes the mirror optimistically, before the message even goes out (see section 5's worked example) - that's what makes read-after-write true. The ack was a second write to the same mirror, arriving later, over an unrelated channel. Two mutations fired back to back without awaiting (which is the normal case - the CRUD callbacks below don't await) put two messages in flight at once. The ack for the FIRST one can arrive after the SECOND optimistic write, and applying it clobbers the newer local state with older data. Concretely: `updateSpaces([Work])` then `updateSpaces([Work, Video])` fired in succession, then the ack for the first call lands carrying `[Work]` and gets applied on top of `[Work, Video]` - Video vanishes from the mirror. Because the next mutation reads the mirror to build its new list, the loss is not just a flicker, it gets written back out and becomes permanent.

**What replaced it, in one line:** the optimistic write already gives read-after-write, with no round trip needed to prove it. The ack's payload is no longer applied to the mirror at all - the proxy resolves with it (some callers still need to know the write landed), but nothing touches the store on the way through. The actual fix for cross-context echoes is a sender id, not the ack: see step 3.5 below.

### 5. The mirror is a plain store, not React state

Point 4 only works if the mirror can be written and read in the same tick. React state cannot: `setSpaces(next)` schedules a re-render, it does not change the `spaces` const the running function captured at render time. Applying an acked state into `useState` puts us right back where we started.

So each proxy owns a plain observable value outside React, and components subscribe to it with `useSyncExternalStore` (React 18 is already a dependency).

This retires a class of bug we already pay for. The snapshot-based `createSpace`/`deleteSpace`/`removePin` writes are why `src/tests/inpanel/fixtures.ts` needs `FIXTURE_TICK_MS` sleeps between consecutive calls, and why `TestRunnerPanel` rebuilds `ctxRef` on every render. Both exist to work around mutations being routed through React state.

```typescript
// src/stores/externalStore.ts

/**
 * One manager's mirrored state in this context. The matching proxy is the
 * only thing that writes it.
 */
export class ExternalStore<T>
{
  #value: T;
  #listeners = new Set<() => void>();

  constructor(initial: T)
  {
    this.#value = initial;
  }

  /**
   * The current value. Returns the SAME object reference until set() stores a
   * different one - useSyncExternalStore compares snapshots by identity and
   * will re-render forever if a fresh object comes back on every call.
   * Declared as an arrow property so it can be passed detached without losing
   * `this`.
   */
  getSnapshot = (): T =>
  {
    return this.#value;
  };

  subscribe = (onChange: () => void): (() => void) =>
  {
    this.#listeners.add(onChange);
    return () => this.#listeners.delete(onChange);
  };

  set(next: T): void
  {
    if (Object.is(next, this.#value)) return;
    this.#value = next;
    for (const listener of this.#listeners) listener();
  }
}
```

This is the code as originally planned (see the correction in section 4 above - the actual shipped version drops the `spacesStore.set(response.spaces)` line entirely and adds a sender-id guard to the broadcast listener; see `src/managers/proxies/spaceManagerProxy.ts` for what's really there):

```typescript
// src/proxies/spaceManagerProxy.ts  (as originally planned - superseded)
const PREFIX = 'SpaceManager_msg_';

export const spacesStore = new ExternalStore<Space[]>([]);

export async function updateSpaces(spaces: Space[]): Promise<void>
{
  // Optimistic write - already there in the original plan too, this part
  // did not change.
  spacesStore.set(spaces);

  const response = await chrome.runtime.sendMessage({
    action: `${PREFIX}updateSpaces`,
    spaces,
  }) as { spaces: Space[] };

  // Apply the acked state BEFORE resolving, so the caller's next read sees
  // its own write. This is the whole point of the ack carrying state.
  //
  // SUPERSEDED - this line is what step 3.5 removed. The optimistic write
  // two lines up already gives read-after-write; applying the ack on top of
  // it is what let an in-flight ack clobber a newer optimistic write. See
  // section 4.
  spacesStore.set(response.spaces);
}

// One raw listener for the module. Its real job is the OTHER windows, whose
// stores nobody just wrote to.
chrome.runtime.onMessage.addListener((message) =>
{
  if (message.action === `${PREFIX}changed`)
  {
    // SUPERSEDED - step 3.5 adds `&& message.senderId !== CONTEXT_ID` here,
    // so a context's own echo of its own write is skipped instead of
    // applied.
    spacesStore.set(message.spaces);
  }
});
```

```typescript
// src/hooks/useSpaces.ts
export function useSpaces(): Space[]
{
  return useSyncExternalStore(spacesStore.subscribe, spacesStore.getSnapshot);
}
```

Worked example - three spaces (Work, Video, Music), deleting Video. This traces what actually ships (optimistic write, no ack applied, sender id skipped on echo):

```
t0  spacesStore.getSnapshot()  ->  [Work, Video, Music]     3 spaces
t1  spacesStore.set([Work, Music])                          optimistic, synchronous
t2  spacesStore.getSnapshot()  ->  [Work, Music]            2 spaces  correct, no await needed
t3  React re-renders subscribers with 2 spaces
t4  sendMessage(..., senderId: CONTEXT_ID) leaves
t5  background removes it, writes storage, responds { spaces: [Work, Music] },
    and separately broadcasts { spaces: [Work, Music], senderId: CONTEXT_ID }
t6  await deleteSpace('video-id') returns - the ack is NOT applied to the store,
    it was already correct since t1
t7  the broadcast from t5 reaches this same context; senderId matches
    CONTEXT_ID, so it's skipped instead of applied
t8  broadcast reaches the OTHER window (a different CONTEXT_ID), applied there,
    its store set to [Work, Music]
```

With `useState`, a read right after t1 would still read the const captured at render and return 3 spaces - the plain store is what makes t2 correct.

Gotchas:

- `getSnapshot` must return a stable reference. Returning `[...this.#value]` or a `.map()` per call causes an infinite render loop. This is the most common way to get this API wrong.
- The originating window also receives its own broadcast (t7 above). Originally this cost one redundant re-render, since the payload is an equal-but-not-identical array and the `Object.is` guard misses. Step 3.5 actually solved this, and better than a revision number would have: `CONTEXT_ID` (a random id per extension context) is stamped as `senderId` on every outgoing message and echoed back on the broadcast it causes, so the proxy's listener recognises and skips its own echo outright - no redundant re-render, and no dependence on `Object.is` at all for this case.
- `getServerSnapshot` (third argument) is SSR-only and not needed here.

Consumers barely change: `SpacesContext` keeps its public API and swaps `useState` for `useSpaces()` internally, so everything calling `useSpacesContext()` is untouched.

### 6. Whole-list writes vs per-operation writes (added by step 5)

Steps 2 and 3 send the whole new list (`updateSpaces(spaces)`). That works for Spaces because only sidebars write them, so the loser of a race is always a window that had the stale list on screen anyway.

Pinned sites broke that assumption: background writes them on its own, patching in favicons. A whole-list write would move the race rather than remove it:

1. Background adds a favicon to its list and broadcasts.
2. Before that broadcast arrives, the sidebar sends a reorder built from its older mirror, which has no favicon.
3. The manager stores that list, and the favicon is gone.

So `PinnedSitesApi` names what changed instead - `removePins(ids)`, `movePin(...)`, `setFavicons(patches)` and so on - and the manager applies each operation to its own authoritative list. Two writers now only collide when they touch the same pin.

Each operation's list transform is a pure function in `managers/shared/pinnedSitesApi.ts`, called by both sides: the manager to change the real list, the proxy to apply the same change to its mirror optimistically. One implementation, so an optimistic write cannot disagree with what gets stored.

`setFavicons` is the one operation whose patches can go stale, because every caller resolved its icons asynchronously. Each patch records what it was resolved *for* - a site favicon, or one specific `customIconName` - and the manager re-checks that against the pin before applying it, so a patch for an icon the user has since replaced is dropped instead of overwriting the new one.

### 7. Broadcasts that arrive mid-write (added by step 5)

The sender-id guard from step 3.5 only covers a context's own echo. A broadcast from *elsewhere* is always applied, which is correct when nothing of ours is in flight and wrong when something is:

```
mirror [A B C D]
user unpins D          mirror [A B C], removePins([D]) sent
background patches B's favicon, broadcasts [A B* C D]
  -> applied - D is back on screen
background handles the remove, broadcasts [A B* C] with OUR senderId
  -> dropped as our own echo
D stays on screen until some unrelated later broadcast
```

Storage is right and this one window is wrong, which is the bug the sender-id guard was meant to prevent, arriving from the other side.

`pinnedSitesManagerProxy` counts its in-flight writes. A foreign broadcast arriving while that count is above zero is dropped and the fact recorded; when the last write returns, the proxy re-reads the list and applies that. The re-read only happens when something was actually dropped, so the normal path still costs no extra round trip.

**This same hole exists in `spaceManagerProxy`** and is deliberately left there for now. It needs another window writing spaces in the same few milliseconds, which is rare and self-heals on the next space edit, whereas pins have background writing them unprompted. Worth fixing when that proxy is next touched - the counter is about fifteen lines and would move to a shared base rather than being written twice.

## Migration order

One manager end to end before porting the rest, so the layer is proven on something small.

1. **`TabSpaceRegistry`** - done (commit `b146a3f`). Smallest surface. Three methods, one sidebar caller (`register`), no broadcasts, and the sidebar never reads it. Proves routing, the `Remote<T>` binding, and the proxy base. Note what it does *not* prove: with no reads and no broadcasts it never touches the store or `useSyncExternalStore`, so the pattern is only half validated after this step.
2. **`SpaceWindowStateManager`** - done. Already had working broadcasts and a sidebar-side mirror. The first real test of section 5: store, subscribe, and read-after-write. Shipped with the acks-carry-state mechanism from the original section 4 - see step 3.5, which retro-fixed this step once the flaw was found.
3. **`SpaceManager`** - done. Fixes Case 3 (a confirmed lasting divergence) as a side effect, by removing `DeleteSpaceAction`'s direct storage write. Also shipped with the original section 4 mechanism, in the same review pass that caught it.
3.5. **Correction pass** - done. Review of step 3 found the flaw described in section 4: applying a mutation's ack to the mirror can clobber a newer optimistic write when two mutations are in flight without an `await` between them, which is the normal case for the CRUD callbacks in `SpacesContext`. This also affected step 2, which shipped with the same ack-applies-to-mirror mechanism, so step 3.5 retro-fixed both proxies together, not just the new one. The fix, replacing section 4's original mechanism:
   - `CONTEXT_ID` (`src/managers/proxies/messageRouting.ts`) - a random id generated once per extension context (each sidebar, each popup). `callManager` stamps it on every outgoing message as `senderId`.
   - Each manager echoes the `senderId` it received back onto the broadcast it sends (`originId` parameter on `updateSpaces` / `setActiveSpace` / `saveState`, absent for background-internal callers).
   - Each proxy's broadcast listener skips a broadcast whose `senderId` matches its own `CONTEXT_ID` - the actual fix, since an echo of your own write can never tell you anything you don't already know.
   - The ack is no longer applied to the mirror at all. The optimistic write already gives read-after-write with no round trip, which is what makes the sender-id guard sufficient without needing any sequence counter.
   - A failed write re-reads true state from background to repair the mirror, rather than rolling back to a remembered value - a rollback could undo a later write that did succeed.
   - `spaceManagerProxy` exposes its mirror as a `readonly Space[]` `snapshot` getter, read by the CRUD callbacks at call time instead of a render-captured value.
4. **`TabHistoryManager`**, **`LastAudibleTracker`** - done (commit `11ffa97`). Mechanical, as expected.
5. **`PinnedSitesManager`** (new) - done, fixes Case 2. The first manager whose API is per-operation rather than whole-list, and the first with a writer in background that nobody asked for - see sections 6 and 7 above for both, and for the `spaceManagerProxy` follow-up this leaves behind. `PinnedSite` moved from `hooks/usePinnedSites.ts` to `managers/shared/pinnedSitesApi.ts`, since the service worker needs the type and must not import a React module; the hook re-exports it. The hook keeps its public API, so `App.tsx` and the components below it are unchanged apart from the list now being `readonly`.
6. **`TabAssociationManager`** (new) - fixes Case 1. Largest, most invasive, most protected by existing tests. Do it last.

Behaviour fixes (`chrome.tabs.onDetached`, and the `docs/test/issues/**` items G1/G2/D1) are a deliberate **second step**, after the routing is in place. Two things not to lose track of:

- Case 3 gets fixed for free by step 3 above, so it needs no separate work.
- The in-flight-broadcast counter from section 7 wants porting to `spaceManagerProxy`, ideally as a shared proxy base rather than a second copy.
- The `onDetached` listener called out in Case 1's scope note is easy to skip, because nothing else in this doc names it. It belongs to step 6 or the follow-up pass, not to neither.

## Verification

The in-panel test runner (`src/tests/inpanel/`, sidebar DEV dropdown) covers exactly the association behaviour this refactor can break - Sections A, B, C, D, E of `docs/test/tab-space-association-test-cases.md`. Run it green before starting to establish a baseline, then after each manager port. Several cases carry known-gap assertions that already fail (G1/G2/G3), so record which ones are red at baseline rather than assuming a red result is new.

## Cost / scope

A real architectural change, not a quick patch. It touches most mutation call sites in `BookmarkTabsContext.tsx` and `SpacesContext.tsx`, adds a manager plus proxy per data type, and builds the routing and mirror layers themselves. Sized honestly: comparable to how `SpaceWindowState` is already wired, replicated across five more data types, with the shared layer built alongside. Do it as its own pass, not folded into a bugfix.
