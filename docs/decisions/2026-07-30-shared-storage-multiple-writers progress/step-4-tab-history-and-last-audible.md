---
created: 2026-09-13
step: 4
manager: TabHistoryManager, LastAudibleTracker
status: implemented, pending verification
---

# Step 4: Port `TabHistoryManager` and `LastAudibleTracker`

Implementation plan for step 4 of the migration order in
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`.

Step 1 (`TabSpaceRegistry`) proved routing, step 2
(`SpaceWindowStateManager`) proved the mirror store, step 3 (`SpaceManager`)
proved read-your-own-write and fixed Case 3, and step 3.5 replaced the
acks-carry-state mechanism with a `senderId` guard.

Step 4 fixes no storage bug. Both managers already have exactly one writer -
background - and the sidebar only ever reads them. What it does buy:

- Two more flat message actions gone, so the flat handler block in
  `background.ts` shrinks toward just the four orchestration messages the
  decision doc says should stay there.
- `getAudioTabLists`, a free function that reaches into two manager
  singletons, becomes a method on the manager that owns most of it. That is
  the pattern CLAUDE.md's "prefer classes with descriptive methods" rule is
  about.
- `windowId` stops being guessed in background and is named by the caller
  instead. A cleanup rather than a user-visible fix, for the reason decision 1
  gives.

Neither manager is read during React render and neither is written by the
sidebar, so this step needs **no `ExternalStore`, no broadcasts, and no
`useSyncExternalStore` hook**. It is the `TabSpaceRegistry` shape from step 1,
plus return values. That makes it the cheapest remaining step, which is why it
comes before the two new managers in steps 5 and 6.

## What exists today

### `TabHistoryManager` (`src/background.ts:37`)

Owns `bg_windowTabHistory` in `chrome.storage.session`: a
`Map<windowId, { stack: HistoryEntry[]; index: number }>` plus a separate
in-memory `#navigatingWindows` map that is deliberately not persisted.

Sidebar-facing today, through four flat actions handled at
`src/background.ts:1246`, `:1259` and `:1278`:

| Action | Calls |
| --- | --- |
| `prev-used-tab` | `historyManager.navigate(windowId, -1)` |
| `next-used-tab` | `historyManager.navigate(windowId, +1)` |
| `get-tab-history` | `historyManager.getHistoryDetails(windowId)` |
| `navigate-to-history-index` | `historyManager.navigateToIndex(windowId, index)` |

Background-internal and **untouched by this step**: `isNavigating`,
`setNavigating`, `unsetNavigating`, `push`, `remove`, `removeWindow`,
`getHistory`, `getActivationOrder`, `load`. The `chrome.commands.onCommand`
handler (`src/background.ts:1327`) also calls `navigate` directly for the
keyboard shortcuts, and keeps doing so.

Sidebar consumers: `src/components/Toolbar.tsx` only -
`handlePrevUsedTab`, `handleNextUsedTab`, `fetchTabHistory`,
`handleHistoryItemClick`.

### `LastAudibleTracker` (`src/background.ts:410`)

Owns `bg_lastAudibleTabIds` in `chrome.storage.session`: a most-recent-first
list of at most five tab ids.

One flat action, `get-last-audible-tab` (`src/background.ts:1303`). It does
**not** call a tracker method. It queries the window's tabs and hands them to
the free function `getAudioTabLists` (`src/background.ts:1130`), which reads
two manager singletons:

```
src/background.ts:1135   const lastAudibleIds = lastAudibleTracker.getLastAudibleTabIds();
src/background.ts:1156   const activationOrder = historyManager.getActivationOrder(windowId);
```

The split is lopsided. `LastAudibleTracker` supplies the candidate ids, which
the function partitions into `playingTabIds` and `historyTabIds` by checking
each against the live `audible` flag on the tabs it was passed.
`TabHistoryManager` contributes one sort key, used only to rank the
non-playing half by how recently each tab was activated.

Background-internal: `setLastAudibleTabId`, `clearIfMatches`, `load`.

Sidebar consumers: `src/App.tsx` (`handleJumpToAudioTab`,
`handleOpenAudioDialog`), plus three in-panel test helpers.

## Decisions taken before writing this plan

Four questions came out of reading the code rather than the decision doc.
Recording the answers here so the plan below reads as settled rather than
provisional.

### 1. `windowId` crosses the wire

All five handlers resolve their target window in background, with
`chrome.tabs.query({ active: true, currentWindow: true })` (or
`{ currentWindow: true }` for the audio one). In an MV3 service worker
`currentWindow` means **the last focused window**, not the window whose
sidebar sent the message, so background is inferring the caller's identity
rather than being told it.

The sidebar already knows its own window id, so the fix is to stop
re-deriving it: every `Api` method takes `windowId` as its first parameter,
matching the manager's own existing signatures, and the `chrome.tabs.query`
disappears from the message path entirely.

This is a behaviour change, and the decision doc puts behaviour fixes in a
separate pass. Taken here anyway because the alternative is keeping a query
inside `dispatch` purely to re-derive something the caller already has, which
is exactly the shape this refactor exists to remove.

It is worth being clear about what this does **not** fix, since the inference
looks like a multi-window bug and isn't one. Every sidebar caller here is a
click, and clicking a background window's side panel focuses that window
before the message is sent, so background's guess was already landing on the
right answer. The win is a cleanup, plus the ability for a harness to target a
window it is not running in. There is no user-visible symptom, and so no test
case - see "No case for the windowId change" under Verification.

The `chrome.commands.onCommand` handler keeps its query. A keyboard shortcut
genuinely targets the focused window, so `currentWindow` is the right answer
there, not a stand-in for a caller's identity.

### 2. `getAudioTabLists` becomes a `LastAudibleTracker` method

Given the lopsided split described above, the tracker is the real owner and
the history manager is a collaborator. So `getAudioTabLists` moves onto
`LastAudibleTracker`, which holds a `TabHistoryManager` reference.

Manager-to-manager dependencies are fine as long as they are not circular.
This one runs `LastAudibleTracker -> TabHistoryManager` and nothing points
back, so there is no cycle.

The alternative - leaving `get-last-audible-tab` flat as a fifth
orchestration message - was rejected. It would be defensible by the decision
doc's own "coordinates several managers" rule, but it leaves a free function
reaching into two singletons' internals, which is the thing CLAUDE.md's class
rule names directly.

### 3. `TabHistoryManager` takes its `background.ts` dependencies by injection

`navigate` and `navigateToIndex` call `setActiveTabAndSpace`
(`src/background.ts:616`); `getHistoryDetails` calls `getSpaceForTab`
(`src/background.ts:574`). Both are free functions in `background.ts`, and
both are orchestration in the decision doc's sense - `setActiveTabAndSpace`
touches `SpaceWindowStateManager`, `getSpaceForTab` touches `TabSpaceRegistry`
and `SpaceManager`. An import from `impl/tabHistoryManager.ts` back into
`background.ts` would be the circular case.

So `background.ts` passes them in at construction:

```typescript
const historyManager = new TabHistoryManager({
  setActiveTabAndSpace,
  getSpaceForTab,
});
const lastAudibleTracker = new LastAudibleTracker(historyManager);
```

The alternative - extracting the two functions into their own module - was
rejected as too big for this step. They read the `spaceStateManager`,
`tabSpaceRegistry` and `spaceManager` singletons, so extracting them means
moving the singletons out of `background.ts` too, and that risks a cycle
between the singleton module and the manager classes.

### 4. Navigation acks after the tab actually activates

`navigate` and `navigateToIndex` send no response today, so `Toolbar` fires
and forgets. Routed through `callManager` they become round trips regardless,
so the only question is what the ack means. `dispatch` awaits
`setActiveTabAndSpace` before responding.

That makes the in-panel `navigateTabHistory` and `selectTabFromHistoryDropdown`
steps deterministic instead of racing whatever implicit timing they get now.
Callers that do not care - both toolbar buttons - ignore the returned promise.

## Changes

### 1. `src/managers/proxies/messageRouting.ts`

Add to `ManagerId`:

```typescript
TAB_HISTORY: 'TabHistoryManager',
LAST_AUDIBLE: 'LastAudibleTracker',
```

Nothing else in the router changes. Neither new id is a prefix of an existing
one, and the exact-match lookup plus the startup uniqueness assert already
handle the general case.

### 2. New `src/managers/shared/tabHistoryManagerApi.ts`

```typescript
/** One entry as the toolbar's history dropdown renders it. */
export interface TabHistoryItem
{
  tabId: number;
  spaceId: string;
  index: number;
  title: string;
  url: string;
  favIconUrl: string;
}

export interface TabHistoryDetails
{
  before: TabHistoryItem[];
  after: TabHistoryItem[];
  currentIndex: number;
}

export interface TabHistoryManagerApi
{
  /** direction is -1 for previous, +1 for next. Resolves once the tab is active. */
  navigate(windowId: number, direction: number): void;
  navigateToIndex(windowId: number, index: number): void;
  getHistoryDetails(windowId: number): TabHistoryDetails;
}
```

No `*_CHANGED` constant - this manager broadcasts nothing.

`TabHistoryItem` and `TabHistoryDetails` are new names for an anonymous shape
that is currently written out three times: twice inside
`getHistoryDetails`'s own signature and once as `Toolbar.tsx:89`'s local
`HistoryItem`. Naming it once in the shared contract is the point of the
file.

`HistoryEntry` and `TabHistory` (`src/background.ts:26`/`:31`) stay private
to the impl file. They are the persisted stack shape, not the wire shape.

### 3. New `src/managers/shared/lastAudibleTrackerApi.ts`

```typescript
export interface AudioTabLists
{
  /** Currently audible, in the order playback started. */
  playingTabIds: number[];
  /** Recently audible but silent now, most recently activated first. */
  historyTabIds: number[];
}

export interface LastAudibleTrackerApi
{
  getAudioTabLists(windowId: number): AudioTabLists;
}
```

### 4. New `src/managers/impl/tabHistoryManager.ts`

Move the class out of `background.ts` along with the `HistoryEntry` and
`TabHistory` interfaces. Then:

- `class TabHistoryManager implements RoutedManager, TabHistoryManagerApi`
- `readonly managerId = ManagerId.TAB_HISTORY`
- constructor takes `{ setActiveTabAndSpace, getSpaceForTab }` and stores it
  as a private field, per decision 3 above. Type the parameter as a named
  `TabHistoryDeps` interface in this file, with a comment saying why the
  dependency is inverted rather than imported.
- `dispatch(method, message)` handling `navigate`, `navigateToIndex` and
  `getHistoryDetails`; unknown method throws, same as the other three
  managers.
- `navigate` and `navigateToIndex` keep their existing bodies and their
  `await setActiveTabAndSpace(...)`, so `dispatch` awaiting them is decision 4
  with no extra code.
- `getHistoryDetails`'s return type becomes the named `TabHistoryDetails`.
- the commented-out `dump` helper stays as it is. It is debugging scaffolding,
  not dead code to clean up in a port.

### 5. New `src/managers/impl/lastAudibleTracker.ts`

Move the class out of `background.ts`, and move `getAudioTabLists`
(`src/background.ts:1130`) onto it as a method. Then:

- `class LastAudibleTracker implements RoutedManager, LastAudibleTrackerApi`
- `readonly managerId = ManagerId.LAST_AUDIBLE`
- constructor takes the `TabHistoryManager` instance, per decision 2
- `dispatch(method, message)` handling `getAudioTabLists` only
- `getAudioTabLists(windowId)` becomes `async` and does its own
  `chrome.tabs.query({ windowId })` rather than being handed the tab list.
  That is what lets the old handler's `{ currentWindow: true }` query go away,
  and it also retires the `allTabs[0]?.windowId` guess the free function used
  to recover the window id from its argument.
- `getLastAudibleTabIds` stays public - the method above is now its only
  caller, but it is the accessor that keeps `#lastAudibleTabIds` private.

### 6. New `src/managers/proxies/tabHistoryManagerProxy.ts`

Plain object, same shape as `tabSpaceRegistryProxy` - no store, no broadcast
listener, no class. Header comment should say *why* there is no mirror here:
the sidebar reads this manager only on an explicit user gesture (press-and-hold
on a toolbar button), never during render, so there is nothing for a mirror to
keep warm.

```typescript
export const tabHistoryManagerProxy: Remote<TabHistoryManagerApi> = {
  async navigate(windowId, direction) { ... },
  async navigateToIndex(windowId, index) { ... },
  async getHistoryDetails(windowId) { ... },
};
```

### 7. New `src/managers/proxies/lastAudibleTrackerProxy.ts`

Same, with the single `getAudioTabLists` method.

### 8. `src/background.ts`

- delete the `TabHistoryManager` class, the `LastAudibleTracker` class, the
  `HistoryEntry`/`TabHistory` interfaces, and the `getAudioTabLists` free
  function; import the two managers from `./managers/impl/`
- construct them with their dependencies, as in decision 3's snippet. Order
  matters now: `historyManager` before `lastAudibleTracker`.
- `registerManager(historyManager)` and `registerManager(lastAudibleTracker)`
  next to the existing three
- delete the flat `prev-used-tab`, `next-used-tab`, `get-tab-history`,
  `navigate-to-history-index` and `get-last-audible-tab` handlers. `await
  stateReady` for all five now happens once in the router.
- the `chrome.commands.onCommand` handler and every other internal call site
  (`src/background.ts:692`, `:694`, `:716`, `:726`, `:809`, `:810`, `:839`,
  `:860`) are unchanged - they hold the instances directly and never went
  through messages.

After this, the flat handler block holds exactly the four orchestration
messages the decision doc's inventory says belong there.

### 9. `src/components/Toolbar.tsx`

- add `windowId` to the existing context read, or add
  `const { windowId } = useSpacesContext()` if the component has none yet.
  `Toolbar` renders at `src/App.tsx:1011`, inside the `SpacesProvider` that
  opens at `:930`, so the context is available.
- `handlePrevUsedTab` / `handleNextUsedTab` call
  `tabHistoryManagerProxy.navigate(windowId, -1 | +1)`; both guard on
  `windowId` being non-null and add it to their `useCallback` deps
- `fetchTabHistory` awaits `getHistoryDetails(windowId)` instead of taking a
  `sendMessage` callback
- `handleHistoryItemClick` calls `navigateToIndex(windowId, index)`
- delete the local `interface HistoryItem` at `:89` and import
  `TabHistoryItem` from the shared contract, so the dropdown's row type and
  the manager's return type are the same declaration

### 10. `src/App.tsx`

`handleJumpToAudioTab` (`:846`) and `handleOpenAudioDialog` (`:870`) live in
`App()` itself, which sits **outside** `SpacesProvider` - the same reason
`handleJumpToAudioTab`'s existing comment gives for routing its scroll through
background. So there is no context `windowId` to read here.

Both handlers are already `async`, so each resolves its own window inline:

```typescript
const { id: windowId } = await chrome.windows.getCurrent();
if (windowId === undefined) return;
const { playingTabIds, historyTabIds } = await lastAudibleTrackerProxy.getAudioTabLists(windowId);
```

One extra round trip per user click, on a click that already does at least
one. Not worth a hook or a piece of state for two call sites; revisit if a
third appears.

The `set-active-tab-and-space` call that follows in `handleJumpToAudioTab` is
orchestration and stays a flat `sendMessage`.

### 11. `src/tests/inpanel/actions.ts` and `assertions.ts`

Four call sites, all of which already have `ctx.windowId`:

- `navigateTabHistory` (`actions.ts:75`) -> `tabHistoryManagerProxy.navigate`
- `audioQuickJump` (`actions.ts:94`) -> `lastAudibleTrackerProxy.getAudioTabLists`
- `selectAudioTabFromDropdown` (`actions.ts:122`) -> same
- `selectTabFromHistoryDropdown` (`actions.ts:151`) -> `getHistoryDetails`,
  then `navigateToIndex`
- `assertAudioListIncludes` (`assertions.ts:301`) -> `getAudioTabLists`

The local response-shape casts in each of these go away - the proxy already
returns `TabHistoryDetails` and `AudioTabLists`. That is a small but real
win: those hand-written casts are a second copy of the wire shape that
nothing was checking against the first.

Each helper's doc comment names the flat action it stands in for
(`actions.ts:82`, `:138`); update those to name the proxy method instead.

## What this step does not do

- No `ExternalStore`, no `useSyncExternalStore` hook, no broadcast for either
  manager. Adding a mirror "for consistency" would be pure cost: nothing reads
  either manager during render, and neither has a second writer to sync.
- `TabGroupTracker` and `NewsVersionChecker` stay in `background.ts`. Both are
  background-internal with no sidebar-facing messages, so they have nothing to
  route.
- Removing `FIXTURE_TICK_MS` from `src/tests/inpanel/fixtures.ts` and the
  `ctxRef`-per-render workaround in `TestRunnerPanel.tsx`. Step 3 deferred
  these to after step 5, and nothing here changes that.
- Steps 5 and 6 (`PinnedSitesManager`, `TabAssociationManager`) and the
  behaviour fixes (`chrome.tabs.onDetached`, G1/G2/D1).

## Verification

### Three passes, cheapest first

**1. Compile.** `npm run build:debug`, then reload the extension. The port is
type-driven, so most of what could be wrong shows up here rather than at
runtime: an `Api` and its `Remote<Api>` proxy drifting apart, or a `dispatch`
case name that no proxy call matches. The debug build is also what puts the
DEV dropdown and the test runner in the sidebar.

**2. The unattended sweep.** Run the whole in-panel suite, all sections. This
matters more than the usual "run the tests" line because `background.ts` lost
roughly 500 lines in this step, and the suite is the only net that catches
anything that went with them. G1, G2 and G3 come back red as always, so
compare against a previous run's results file rather than judging reds fresh.
The sweep parks itself at the first guided case, so it is unattended only up
to that point.

**3. The guided cases.** These are the ones that actually exercise the five
messages this step moved. Each pauses, tells the tester what to do, and checks
the result itself.

| Case | What the tester does |
| --- | --- |
| C.2b | Nothing, runs clean |
| C.2c | Presses the previous and next used tab shortcuts |
| C.2d | Nothing, runs clean |
| C.2e | Presses play on one tab |
| C.2f | Presses play on two tabs |
| C.2g | Five press-and-hold and click gestures on the history buttons |
| E.3 | Plays then stops audio, then stops the service worker from DevTools |

C.2b and C.2d cover `navigate`, `getHistoryDetails` and `navigateToIndex`
through the proxy. The three audio cases cover `getAudioTabLists`. C.2c is the
one that proves the injected `setActiveTabAndSpace` still works from the
`onCommand` path, which never touches the proxy at all, and its
`assertCommandShortcutBound` steps catch the keyboard commands being caught up
in the handler deletion.

### Two cases written for this step

Both are new, so neither has ever run. A failure on the first run is at least
as likely to be a bug in the case as in the port.

- **C.2g** (`cases/sectionC.ts`) - the press-and-hold gesture. C.2d reaches
  the same dropdown by calling the proxy directly, so everything on the
  `Toolbar.tsx` side is what C.2g adds: the hold timer, the
  quick-click-versus-hold branch, the dropdown rendering, and the row click
  wiring. It also covers `getHistoryDetails` end to end, including the
  injected `getSpaceForTab` that resolves each row's Space.
- **E.3** (`cases/sectionE.ts`) - the cold start. The only time `load()` runs
  on either manager, and so the only time a mistake in the new construction
  order (the tracker now has to be built after the history manager, since it
  holds one) can show itself.

Two things make E.3 prove something rather than pass vacuously, and both are
easy to get wrong:

- Playback has to be **stopped** before the restart. `getAudioTabLists`
  rebuilds its playing list from each tab's live `audible` flag, so a
  still-playing tab appears even if the tracker lost everything. Only a silent
  tab can show up purely because `load()` restored the list.
- The worker has to be **stopped, not the extension reloaded**. A reload is a
  fresh extension load and clears `chrome.storage.session` with it, leaving
  nothing to repopulate. E.1's own comment in `cases/sectionE.ts` records this
  as confirmed by running it, which is why the runner's resume checkpoint
  lives in local storage. If history comes back empty after the resume, that
  is the signal the tester reloaded instead of stopping.

### No case for the windowId change

Decision 1 above changed `windowId` from something background guessed to
something the caller names. There is deliberately no case for it, because
there is no behaviour to observe.

Every sidebar entry point to these calls is a click: both history buttons, the
dropdown rows, the audio button, and the audio dropdown. Clicking a background
window's side panel focuses that window as part of the click, so background's
guess was already correct by the time the message arrived. The keyboard
shortcuts never went through the sidebar and still resolve the window
themselves.

The change is still worth keeping - it removes a re-derivation of something
the caller already knows, and it is what lets a harness target a window it is
not running in - but it fixes nothing a user could hit, so testing it would be
testing the implementation rather than a behaviour.
