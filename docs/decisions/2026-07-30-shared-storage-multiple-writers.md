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

**Where**:

- `background.ts`'s `chrome.tabs.onUpdated` handler ("Scenario 5") reads the whole `pinnedSites` array, patches in a favicon for sites matching the tab's domain, writes the whole array back.
- `src/hooks/usePinnedSites.ts` (sidebar CRUD - add/remove/reorder/edit) and `src/actions/deletePinnedSiteAction.ts` (undo support) do their own independent read-modify-writes to the same key.

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
- **`PinnedSitesManager`** - owner of `pinnedSites` (local). Written today by `background.ts` (favicon patching), `usePinnedSites.ts` (CRUD), and `deletePinnedSiteAction.ts` (undo).

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

### 4. Mutation acks carry the resulting state

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

**Decision:** the response payload carries the resulting state, and the proxy applies it to the local mirror before resolving. Read-after-write is then consistent in the calling context with no waiting and no correlation, and the broadcast keeps its real job of updating *other* windows.

This is not hypothetical: D.2 in the in-panel suite deletes a space and asserts it is gone on the very next step.

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

```typescript
// src/proxies/spaceManagerProxy.ts
const PREFIX = 'SpaceManager_msg_';

export const spacesStore = new ExternalStore<Space[]>([]);

export async function updateSpaces(spaces: Space[]): Promise<void>
{
  const response = await chrome.runtime.sendMessage({
    action: `${PREFIX}updateSpaces`,
    spaces,
  }) as { spaces: Space[] };

  // Apply the acked state BEFORE resolving, so the caller's next read sees
  // its own write. This is the whole point of the ack carrying state.
  spacesStore.set(response.spaces);
}

// One raw listener for the module. Its real job is the OTHER windows, whose
// stores nobody just wrote to.
chrome.runtime.onMessage.addListener((message) =>
{
  if (message.action === `${PREFIX}changed`)
  {
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

Worked example - three spaces (Work, Video, Music), deleting Video:

```
t0  spacesStore.getSnapshot()  ->  [Work, Video, Music]     3 spaces
t1  await deleteSpace('video-id')   sendMessage leaves
t2  background removes it, writes storage, responds { spaces: [Work, Music] }
t3  proxy runs spacesStore.set([Work, Music])               synchronous
t4  await returns
t5  spacesStore.getSnapshot()  ->  [Work, Music]            2 spaces  correct
t6  React re-renders subscribers with 2 spaces
t7  broadcast reaches the OTHER window, its store set to [Work, Music]
```

With `useState`, t5 reads the const captured at render and still returns 3 spaces.

Gotchas:

- `getSnapshot` must return a stable reference. Returning `[...this.#value]` or a `.map()` per call causes an infinite render loop. This is the most common way to get this API wrong.
- The originating window also receives its own broadcast at t7. The payload is an equal-but-not-identical array, so the `Object.is` guard misses and it costs one redundant re-render. Harmless; avoidable with a revision number in the payload.
- `getServerSnapshot` (third argument) is SSR-only and not needed here.

Consumers barely change: `SpacesContext` keeps its public API and swaps `useState` for `useSpaces()` internally, so everything calling `useSpacesContext()` is untouched.

## Migration order

One manager end to end before porting the rest, so the layer is proven on something small.

1. **`TabSpaceRegistry`** - smallest surface. Three methods, one sidebar caller (`register`), no broadcasts, and the sidebar never reads it. Proves routing, the `Remote<T>` binding, and the proxy base. Note what it does *not* prove: with no reads and no broadcasts it never touches the store or `useSyncExternalStore`, so the pattern is only half validated after this step.
2. **`SpaceWindowStateManager`** - already has working broadcasts and a sidebar-side mirror. The first real test of section 5: store, subscribe, and read-after-write. Treat this as the step that decides whether the design holds.
3. **`SpaceManager`** - fixes Case 3 (a confirmed lasting divergence) as a side effect, by removing `DeleteSpaceAction`'s direct storage write.
4. **`TabHistoryManager`**, **`LastAudibleTracker`** - mechanical once the pattern is set.
5. **`PinnedSitesManager`** (new) - fixes Case 2.
6. **`TabAssociationManager`** (new) - fixes Case 1. Largest, most invasive, most protected by existing tests. Do it last.

Behaviour fixes (`chrome.tabs.onDetached`, and the `docs/test/issues/**` items G1/G2/D1) are a deliberate **second step**, after the routing is in place. Two things not to lose track of:

- Case 3 gets fixed for free by step 3 above, so it needs no separate work.
- The `onDetached` listener called out in Case 1's scope note is easy to skip, because nothing else in this doc names it. It belongs to step 6 or the follow-up pass, not to neither.

## Verification

The in-panel test runner (`src/tests/inpanel/`, sidebar DEV dropdown) covers exactly the association behaviour this refactor can break - Sections A, B, C, D, E of `docs/test/tab-space-association-test-cases.md`. Run it green before starting to establish a baseline, then after each manager port. Several cases carry known-gap assertions that already fail (G1/G2/G3), so record which ones are red at baseline rather than assuming a red result is new.

## Cost / scope

A real architectural change, not a quick patch. It touches most mutation call sites in `BookmarkTabsContext.tsx` and `SpacesContext.tsx`, adds a manager plus proxy per data type, and builds the routing and mirror layers themselves. Sized honestly: comparable to how `SpaceWindowState` is already wired, replicated across five more data types, with the shared layer built alongside. Do it as its own pass, not folded into a bugfix.
