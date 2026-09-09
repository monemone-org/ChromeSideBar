---
created: 2026-09-07
step: 2
manager: SpaceWindowStateManager
status: planned
---

# Step 2: Port `SpaceWindowStateManager`

Implementation plan for step 2 of the migration order in
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`.

Step 1 (`TabSpaceRegistry`, commit `b146a3f`) proved the routing layer, the
`Remote<T>` binding and the proxy shape, but nothing else: it has no sidebar
reads and no broadcasts, so it never touched the mirror store. This step is the
first real test of design decisions 4 (acks carry state) and 5 (`ExternalStore` +
`useSyncExternalStore` instead of `useState`).

## What exists today

- `SpaceWindowStateManager` (`src/background.ts:24`) owns `spaceWindowState_{windowId}`
  in session storage. Already single-writer, already broadcasts - it is the
  pattern the whole refactor is copying, it just isn't routed through the
  manager/proxy layer yet.
- Three flat message actions in `src/utils/spaceMessages.ts`:
  `GET_WINDOW_STATE`, `SET_ACTIVE_SPACE` (sidebar to background) and
  `STATE_CHANGED` (broadcast back).
- Two consumers:
  - `src/contexts/SpacesContext.tsx` - holds the state in `useState`, refreshes
    it from a `STATE_CHANGED` listener, writes optimistically on switch.
  - `src/components/SpaceNavigatorApp.tsx` - a separate extension page with its
    own `windowId` from a URL query param. Fetches state once, sets it, closes.

## Changes

### 1. New `src/stores/externalStore.ts`

`ExternalStore<T>` exactly as specced in the decision doc, section 5:

- `#value: T`, `#listeners: Set<() => void>`
- `getSnapshot` and `subscribe` as **arrow properties**, so they can be passed
  detached to `useSyncExternalStore` without losing `this`
- `set(next)` guarded by `Object.is` - bails when the value is unchanged
- comment spelling out the stable-reference rule (returning a fresh array/object
  per `getSnapshot` call is an infinite render loop)

### 2. New `src/proxies/spaceWindowStateProxy.ts`

```typescript
export interface SpaceWindowStateApi
{
  getState(windowId: number): SpaceWindowState;
  /** Returns the resulting state, which becomes the ack payload. */
  setActiveSpace(windowId: number, spaceId: string): SpaceWindowState;
}
```

A `SpaceWindowStateProxy` class implementing `Remote<SpaceWindowStateApi>`, plus
three things that are not part of the Api because the manager has no equivalent:

- `readonly store = new ExternalStore<SpaceWindowState>(DEFAULT_WINDOW_STATE)` -
  this context's mirror.
- `mirrorWindow(windowId): Promise<SpaceWindowState>` - records which window this
  context mirrors, then fills the store via `getState`. The sidebar calls this
  once at mount. `SpaceNavigatorApp` does **not**: it is a short-lived page that
  just calls `getState`/`setActiveSpace` and uses the return values, so it needs
  no mirror and no subscription.
- a module-level `chrome.runtime.onMessage` listener for
  `SpaceWindowStateManager_msg_changed`, which applies the payload to the store
  only when `message.windowId` matches the mirrored window. Other windows'
  broadcasts are ignored here.

`setActiveSpace` applies the acked state to the store **before** resolving
(decision 4), so a read right after the `await` sees the write. It applies only
when the call's `windowId` is the mirrored one.

Each extension page loads its own module instance, so the single mirrored
`windowId` per module is not a limitation.

### 3. New `src/hooks/useSpaceWindowState.ts`

```typescript
export function useSpaceWindowState(): SpaceWindowState
{
  return useSyncExternalStore(
    spaceWindowStateProxy.store.subscribe,
    spaceWindowStateProxy.store.getSnapshot
  );
}
```

### 4. `src/proxies/messageRouting.ts`

Add `SPACE_WINDOW_STATE: 'SpaceWindowStateManager'` to `ManagerId`.

Note the exact-match lookup in the router already matters here: with
`SpaceManager` arriving in step 3, a `startsWith` scan would let `'Space'`
shadow `'SpaceWindowState'`. This is the case that motivated it.

### 5. `src/background.ts`

- `class SpaceWindowStateManager implements RoutedManager, SpaceWindowStateApi`
- add `readonly managerId = ManagerId.SPACE_WINDOW_STATE`
- add `dispatch(method, message)` handling `getState` and `setActiveSpace`;
  unknown methods throw, same shape as `TabSpaceRegistry.dispatch`
- `setActiveSpace` returns the new `SpaceWindowState` instead of `void`.
  Background-internal callers ignore the return value, so they are untouched.
- `saveState` broadcasts under
  `makeManagerActionId(ManagerId.SPACE_WINDOW_STATE, 'changed')` instead of
  `SpaceMessageAction.STATE_CHANGED`
- `registerManager(spaceStateManager)` next to the existing
  `registerManager(tabSpaceRegistry)`
- delete the flat `GET_WINDOW_STATE` and `SET_ACTIVE_SPACE` handlers from the
  `onMessage` listener. `await stateReady` for these now happens once in the
  router.

`getState`, `removeWindow` and `load` stay as they are for background-internal
callers; only `getState` is additionally exposed through `dispatch`.

### 6. `src/contexts/SpacesContext.tsx`

- drop `const [windowState, setWindowState] = useState(...)` and the whole
  `STATE_CHANGED` listener effect (the proxy owns that listener now)
- read with `const windowState = useSpaceWindowState()`
- mount effect: `chrome.windows.getCurrent` then
  `await spaceWindowStateProxy.mirrorWindow(window.id)` then
  `setIsInitialized(true)`
- `setActiveSpaceId` and `switchToSpace` call
  `spaceWindowStateProxy.setActiveSpace(windowId, spaceId)`

Public context value is unchanged, so every `useSpacesContext()` consumer is
untouched.

**Optimistic write:** keep it, translated from `setWindowState(...)` to a direct
`store.set(...)` before the message goes out. The ack overwrites it with the
same value a round-trip later. Purer would be ack-only, but that puts a message
round-trip in front of every space switch for no correctness gain.

### 7. `src/components/SpaceNavigatorApp.tsx`

Swap the two raw `chrome.runtime.sendMessage` calls for
`spaceWindowStateProxy.getState(windowId)` and
`.setActiveSpace(windowId, spaceId)`. The select handler keeps closing the
window in the promise's `then`.

### 8. `src/utils/spaceMessages.ts`

Remove `GET_WINDOW_STATE`, `SET_ACTIVE_SPACE` and `STATE_CHANGED` from
`SpaceMessageAction`, and update the "Communication flow" header comment.
`GET_SPACES`/`UPDATE_SPACES` stay until step 3; `TAB_ACTIVATED` and
`DEASSOCIATE_TAB` are orchestration broadcasts and stay flat per the decision
doc's inventory.

## Read-after-write, worked

Window 12 is on space `all`, user clicks `Work` (`space_work`):

```
t0  store.getSnapshot().activeSpaceId          -> 'all'
t1  store.set({ activeSpaceId: 'space_work' })    optimistic, synchronous
t2  React re-renders subscribers with 'space_work'
t3  sendMessage 'SpaceWindowStateManager_msg_setActiveSpace' leaves
t4  background mutates + writes session storage,
    responds { activeSpaceId: 'space_work' }
t5  proxy applies the ack to the store - Object.is misses (new object),
    so one redundant re-render with an identical value
t6  await resolves; any read here is correct
t7  broadcast reaches OTHER windows mirroring window 12 (there are none;
    the state is per-window), and this window ignores it as its own echo
```

With `useState`, a read at t6 inside the same function would still see the
`windowState` const captured at render time, i.e. `'all'`.

## Verification

Baseline first: run the in-panel suite (sidebar DEV dropdown) before touching
anything and record which cases are already red (G1/G2/G3 known gaps), then
re-run after the port. Sections C and D exercise space switching directly, so
they are the ones that would catch a broken mirror.

Manual checks the suite does not cover:

- space switch from the Space Navigator popup (`SpaceNavigatorApp`) still
  switches the sidebar
- two windows open, switch space in one - the other's sidebar must not follow
  (state is per-window; this checks the broadcast's windowId filter)
- close and reopen the sidebar - active space is restored from session storage

## Not in this step

Steps 3-6 (`SpaceManager`, `TabHistoryManager`/`LastAudibleTracker`,
`PinnedSitesManager`, `TabAssociationManager`) and the behaviour fixes
(`chrome.tabs.onDetached`, G1/G2/D1) stay untouched.
