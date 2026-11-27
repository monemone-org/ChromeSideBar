---
created: 2026-09-22
decision: space-tab-manager
status: proposed
depends-on: 2026-07-30-shared-storage-multiple-writers
---

# Regroup window/space/tab state under a SpaceTabManager

## When to do this

Any time. The plan this one waited for, [[2026-07-30-shared-storage-multiple-writers]], is implemented, and the behaviour fixes that touched the same listeners are in: G1, G3 and G4 (`docs/test/issues/fixed/`) and D1.

It reverses one decision from that plan on purpose. Its message inventory says orchestration messages like `set-active-tab-and-space` "stay as direct handlers in `background.ts` and keep their current names", because no single manager owned them. That was the right call while managers were being ported one at a time. Now that every piece of state has an owner, the orchestration left behind in `background.ts` turns out to be about one thing, and this doc proposes giving that thing an owner too.

## Where things stand

### The half that is done

`SpaceTabManager` (`src/managers/impl/spaceTabManager.ts`) exists as a routed manager, `ManagerId.SPACE_TAB`. It was built first to fix the race in `2026-11-23-new-tab-grouping-two-writers.md`, and it owns everything about putting tabs into Chrome groups:

- **The grouping queue.** `GroupingQueue`, an internal class in the same file, runs grouping jobs one at a time. `processGroupingRequest`, `findGroupByName` and the `TAB_GROUP_TITLE_SET` workaround for Brave moved here from `background.ts`.
- **`PlacedTabs`**, which remembers the tabs `createTabs` has already placed, so the `chrome.tabs.onCreated` path does not group them a second time.
- **Sidebar methods** (`SpaceTabManagerApi`): `createTabs`, `assignTabToSpace` and `requestGrouping`. The raw `queue-tab-for-grouping` message is gone.
- **Background methods:** `queueNewTab` for `chrome.tabs.onCreated`, `forgetTab` for `chrome.tabs.onRemoved`, and `renameSpaceGroups`, which retitles a renamed space's group in every window (D1).

It reads the active space, the space list and the pinned check through callbacks (`SpaceTabDeps`), not by holding the other managers.

### The half that is left

These pieces answer the same two questions, which space a window shows and which space a tab belongs to, and they are still spread over two managers and `background.ts`:

- **`SpaceWindowStateManager`** (`src/managers/impl/spaceWindowStateManager.ts`) owns the per-window active space. It stores one `SpaceWindowState` (`{ activeSpaceId: string }`) per window in session storage under `spaceWindowState_{windowId}`, and the sidebar mirrors it through `spaceWindowStateProxy`.
- **`TabSpaceRegistry`** (`src/managers/impl/tabSpaceRegistry.ts`) owns a per-window map from tab id to space id, in session storage under `bg_tabSpaces`. The sidebar writes to it through `tabSpaceRegistryProxy` when it opens a bookmark tab, links an existing tab to a bookmark, moves a bookmark to another space, and when undo links a tab again. The sidebar never reads it. Since G4, it reports each registration to `TabAssociationManager.noteTabSpace`, which copies the space into the association backup, so the startup restore can register the tab again after a restart.
- **`getSpaceForTab(windowId, tabId)`** (a function in `background.ts`) works out a tab's space. It returns `undefined` for a pinned-site tab, then tries the tab's live Chrome group (matched to a space by title), then the registry, and finally returns `undefined` for an ungrouped tab, which callers treat as "All".
- **`setActiveTabAndSpace(tabId)`** (a function in `background.ts`) activates a tab, calls `getSpaceForTab`, switches the window's active space if needed, and broadcasts `tab-activated` with `explicit: true` so the sidebar scrolls.
- **The `chrome.tabs.onActivated` listener** repeats `setActiveTabAndSpace`'s "resolve the space, maybe switch" logic inline, with the extra rule that the "Follow active tab" setting can turn it off, and then broadcasts a passive `tab-activated`.
- **The group-change handler** in `chrome.tabs.onUpdated`. A bookmark tab that leaves every group is unlinked from its bookmark, decided from the link alone (G3). A tab that joins a group is unlinked when the group's space differs from the tab's registered space, which needs the registry because Chrome reports only the new group (G4).

Because the two orchestration functions live in `background.ts` and not on a manager, `TabHistoryManager` cannot import them (`background.ts` already imports it, so that would be circular). It works around this with `TabHistoryDeps`, an interface of those two functions that `background.ts` passes in at construction.

The sidebar still reaches this orchestration through raw messages that bypass the manager and proxy layer:

| Raw message | Direction | Senders and receivers |
|---|---|---|
| `set-active-tab-and-space` | sidebar to background, request and reply | sent by `useFollowActiveTab.ts`, `AudioTabsDropdown.tsx`, `App.tsx` and three in-panel test actions in `tests/inpanel/actions.ts` |
| `tab-activated` (`SpaceMessageAction.TAB_ACTIVATED`) | background to every context | received by `useFollowActiveTab.ts` |
| `TAB_GROUP_TITLE_SET` (uses `type`, not `action`) | `SpaceTabManager` to every context | received by `useTabGroups.ts` |

`AudioTabsDropdown`, `App` and one test action still pass a `skipHistory: false` field that background has not read for a long time, which is a small sign of what happens to hand-written message shapes nobody type-checks.

## What is wrong with the current layout

None of this is broken, so this is a tidy-up and not a bug fix. The cost is in how hard the code is to follow and change.

- **The logic is spread out.** Deciding "which space should this window show now that this tab is active" lives in two copies (the `onActivated` listener and `setActiveTabAndSpace`), while the state they read and write lives in two other classes. Anyone changing the rule has to find all four places.
- **The sidebar uses two proxies for one concept.** `tabSpaceRegistryProxy.register(...)` is almost always followed on the next line by `spaceTabManagerProxy.assignTabToSpace(...)` or `requestGrouping(...)`. The pair shows up in `createItemTab` and `associateExistingTab` in `BookmarkTabsContext.tsx`, and in `regroupAssociatedTab` in `tabOperations.ts`.
- **The registry and the association manager are wired to each other in `background.ts`.** G4 added `TabSpaceRegistryDeps.onRegistered` and `TabAssociationDeps.getTabSpace` and `registerTabSpace`, which `background.ts` connects with forward references. That wiring belongs to whoever owns the registry.
- **`TabHistoryDeps` works around a structural problem.** The circular-import explanation in `tabHistoryManager.ts` only exists because the functions have no home.
- **`SpaceMessageAction` is down to one entry.** `src/utils/spaceMessages.ts` has a whole enum, plus a long comment explaining where everything else went, just to hold `TAB_ACTIVATED`.

## Proposal

Make `SpaceTabManager` own "window to active space" and "tab to space" together, along with every operation that reads or changes them. It takes over `SpaceWindowStateManager` and `TabSpaceRegistry`, the two orchestration functions, the `onActivated` follow logic and the group-change handler. `TabAssociationManager` stays separate, because it owns a different relation (tab to bookmark or pinned item) with its own backup and restore machinery. `SpaceTabManager` uses it and does not absorb it.

### Structure

Absorbing the two managers does not mean pasting all their code into one file. Their storage code stays in small internal classes that `SpaceTabManager` holds, so each storage key still has exactly one class that reads and writes it. Only `SpaceTabManager` is routed, so the sidebar sees one manager id and one proxy.

```
┌─ SpaceTabManager (routed, ManagerId.SPACE_TAB) ──────────────────────┐
│                                                                      │
│  sidebar-callable (SpaceTabManagerApi)                               │
│    createTabs / assignTabToSpace / requestGrouping       (exist)     │
│    getState / setActiveSpace       (from SpaceWindowStateManager)    │
│    setActiveTabAndSpace            (from background.ts)              │
│    registerTab                     (from TabSpaceRegistry)           │
│                                                                      │
│  background-internal                                                 │
│    queueNewTab, forgetTab, renameSpaceGroups             (exist)     │
│    getSpaceForTab, getActiveSpace, handleTabActivated,               │
│    onTabGroupChanged, getTabSpace, removeWindow, load                │
│                                                                      │
│  ┌─ WindowActiveSpaces ──┐ ┌─ TabSpaceRegistry ─┐ ┌─ GroupingQueue ─┐ │
│  │ windowId -> state     │ │ windowId ->        │ │ PlacedTabs      │ │
│  │ spaceWindowState_{id} │ │  tabId -> spaceId  │ │ (no storage,    │ │
│  │ (session storage)     │ │ bg_tabSpaces       │ │  exist)         │ │
│  └───────────────────────┘ └────────────────────┘ └─────────────────┘ │
└──────────────┬───────────────────────────────┬───────────────────────┘
               │ constructor dependency        │ constructor dependency
               ▼                               ▼
     TabAssociationManager                SpaceManager
     (isPinnedManagedTab,                 (spaces by id and by name)
      isBookmarkManagedTab,
      deassociate, noteTabSpace)
               │
               │ callbacks: getTabSpace, registerTabSpace
               ▼
     SpaceTabManager

     TabHistoryManager ── constructor dependency ──▶ SpaceTabManager
     LastAudibleTracker ── constructor dependency ─▶ TabHistoryManager
```

The internal classes, all in `src/managers/impl/`:

- **`WindowActiveSpaces`** (new file `windowActiveSpaces.ts`) is the storage half of today's `SpaceWindowStateManager`: the `Map<windowId, SpaceWindowState>`, `get`, `set`, `removeWindow` and `load`. It does not broadcast. `SpaceTabManager` broadcasts after each write, since it knows the `originId` and owns the action names.
- **`TabSpaceRegistry`** (existing file) stays mostly as it is, minus `RoutedManager` and `dispatch`, and becomes a plain store again. Its `onRegistered` hook stays, and `SpaceTabManager` connects it to `TabAssociationManager.noteTabSpace`.
- **`GroupingQueue` and `PlacedTabs`** already exist inside `spaceTabManager.ts`. They can move to their own file if that file gets too long, but nothing in this plan needs it.

The storage keys do not change, so a service worker restart mid-session reads back exactly what the old code wrote.

`TabAssociationManager` and `SpaceTabManager` need each other: `SpaceTabManager` asks whether a tab is pinned or a bookmark tab and calls `deassociate`, and the association manager reads and registers a tab's space for its backup (G4). The second direction stays a pair of callbacks, `getTabSpace` and `registerTabSpace`, now pointing at `SpaceTabManager`, the same forward-reference wiring `background.ts` uses today.

### API

```typescript
// shared/spaceTabManagerApi.ts - what the sidebar can call
interface SpaceTabManagerApi
{
  // Already there
  createTabs(windowId: number, tabs: NewTab[], placement: TabPlacement): Promise<CreatedTabs>;
  assignTabToSpace(windowId: number, tabId: number, spaceId: string): void;
  requestGrouping(windowId: number, tabId: number): void;

  // New
  getState(windowId: number): SpaceWindowState;
  setActiveSpace(windowId: number, spaceId: string): SpaceWindowState;

  // Activate the tab and switch its window to the tab's space. Throws on
  // failure instead of returning { success, error }: the router already turns
  // a throw into { error }, and callManager turns that back into a rejection.
  setActiveTabAndSpace(tabId: number): void;

  // Record a tab's home space only - no grouping.
  registerTab(windowId: number, tabId: number, spaceId: string): void;
}

// Broadcasts, both built with makeManagerActionId(ManagerId.SPACE_TAB, ...)
SPACE_TAB_STATE_CHANGED   // { windowId, state: SpaceWindowState, senderId? }  (was SpaceWindowStateManager_msg_changed)
SPACE_TAB_TAB_ACTIVATED   // { windowId, tabId, spaceSwitched, explicit? }     (was 'tab-activated')
```

`registerTab` stays separate from `assignTabToSpace` because the call sites mean different things, and merging them would change behaviour:

- **`associateExistingTab`** (link an existing tab to a bookmark) and **`regroupAssociatedTab`** (a bookmark moved to another space's folder) register the space and then force the tab into that space's group. They call `registerTab` and `assignTabToSpace` today through two proxies, and `assignTabToSpace` can register the space itself once both live in one manager.
- **`createItemTab`** (a tab just opened from a bookmark) registers the active space and then calls `requestGrouping`, so the tab goes into the active space, and is not grouped at all when the active space is "All". That stays `registerTab` followed by `requestGrouping`. See the open question below.
- **`restoreItemAssociation`** (undo links a tab again) only registers. It becomes `registerTab`.

Background-internal methods, called directly on the instance by `background.ts` listeners and other managers:

- `getSpaceForTab(windowId, tabId): Promise<string | undefined>` has the same rules as today, reading the registry and `SpaceManager` directly.
- `getActiveSpace(windowId): string` is today's `SpaceWindowStateManager.getActiveSpace`.
- `handleTabActivated(windowId, tabId): Promise<void>` is the body of today's `onActivated` listener after the history push: resolve the space, read the follow mode from `chrome.storage.local`, switch if allowed, and broadcast a passive `SPACE_TAB_TAB_ACTIVATED`.
- `onTabGroupChanged(windowId, tabId, groupId): Promise<void>` is today's group-change block in `onUpdated`, with both branches as they are: leaving every group unlinks a bookmark tab through `TabAssociationManager` alone, and joining a group compares against the registry.
- `getTabSpace(windowId, tabId)` reads the registry, for the association manager's backup.
- `forgetTab` already exists for `onRemoved`. It also drops the tab's registry entry.
- `removeWindow(windowId)` and `load()` forward to the internal stores.

### The proxy

`spaceTabManagerProxy` already exists for the grouping methods. It takes over from `spaceWindowStateProxy` and `tabSpaceRegistryProxy`: it gains the mirror store, `mirrorWindow(windowId)` and the optimistic `setActiveSpace` exactly as `spaceWindowStateProxy` has them today, and `registerTab` and `setActiveTabAndSpace` as plain `callManager` wrappers.

One new piece is `onTabActivated(listener): () => void`, which returns an unsubscribe function. It needs its own listener set, because `subscribeToBroadcast` registers at most one handler per action and never unsubscribes (it was built for mirrors that live as long as the page). `useFollowActiveTab` adds and removes its handler as `mode` and `windowId` change, so the proxy subscribes to the broadcast once and forwards each message to whatever listeners are currently in the set.

### What background.ts looks like afterwards

The listeners get thin:

```typescript
chrome.tabs.onActivated.addListener(async (activeInfo) =>
{
  await stateReady;
  await newsVersionChecker.checkIfDue();
  if (!historyManager.isNavigating(activeInfo.windowId))
  {
    historyManager.push(activeInfo.windowId, activeInfo.tabId);
  }
  await spaceTabManager.handleTabActivated(activeInfo.windowId, activeInfo.tabId);
  // ...auto-group tracking stays here, still behind ENABLE_AUTO_GROUP_NEW_TABS
});
```

The flat `set-active-tab-and-space` branch in `chrome.runtime.onMessage` goes away, so every message the service worker receives goes through `routedManagers`. The construction order becomes `spaceManager`, `tabAssociationManager`, `spaceTabManager`, `historyManager`, `lastAudibleTracker`, because each takes the previous ones in its constructor.

`TabHistoryManager` gets `spaceTabManager` in place of the `{ setActiveTabAndSpace, getSpaceForTab }` object. `TabHistoryDeps` can stay as the parameter type, narrowed to those two methods, because it clearly documents what history actually uses. The circular-import explanation above it goes away, since there is no cycle any more: `SpaceTabManager` never needs history. The `result.success` checks in `navigate` and `navigateToIndex` are only used for DEV logs, so they turn into a `try`/`catch` around the call.

### Message inventory, before and after

| Today | After |
|---|---|
| `SpaceWindowStateManager_msg_getState` / `_setActiveSpace` | `SpaceTabManager_msg_getState` / `_setActiveSpace` |
| `SpaceWindowStateManager_msg_changed` | `SpaceTabManager_msg_stateChanged` |
| `TabSpaceRegistry_msg_register` | `SpaceTabManager_msg_registerTab` |
| `set-active-tab-and-space` (raw) | `SpaceTabManager_msg_setActiveTabAndSpace` |
| `tab-activated` (raw) | `SpaceTabManager_msg_tabActivated` |
| `TAB_GROUP_TITLE_SET` (raw) | unchanged, see "Out of scope" |

`ManagerId.SPACE_WINDOW_STATE` and `ManagerId.TAB_SPACE_REGISTRY` are removed. `SpaceMessageAction` and `SpaceMessageActionType` then have no entries left, so they are deleted, and `spaceMessages.ts` is left holding just the `Space` and `SpaceWindowState` types. Renaming that file is a separate cleanup.

## Worked example

Say window `7` is showing the "Work" space (`activeSpaceId: 'sp_work'`), and a tab `412` is playing music inside a Chrome group titled "Music", which matches the space `sp_music`. The user clicks that tab in the audio dropdown.

1. `AudioTabsDropdown` calls `spaceTabManagerProxy.setActiveTabAndSpace(412)`, which sends `SpaceTabManager_msg_setActiveTabAndSpace { tabId: 412 }`.
2. `SpaceTabManager.setActiveTabAndSpace(412)` calls `chrome.tabs.update(412, { active: true })`, which returns a tab with `windowId: 7`.
3. It calls `getSpaceForTab(7, 412)`. `isPinnedManagedTab(7, 412)` is false. The tab's `groupId` is `88`, `chrome.tabGroups.get(88).title` is `"Music"`, and `SpaceManager` finds `sp_music` by that name, so the destination is `'sp_music'`.
4. The current space is `'sp_work'`, which is neither `'all'` nor the destination, so it writes `{ activeSpaceId: 'sp_music' }` to `WindowActiveSpaces` for window 7 and broadcasts `SpaceTabManager_msg_stateChanged { windowId: 7, state: { activeSpaceId: 'sp_music' } }`. Every sidebar mirroring window 7 switches to Music.
5. It broadcasts `SpaceTabManager_msg_tabActivated { windowId: 7, tabId: 412, spaceSwitched: true, explicit: true }`. The sidebar's `onTabActivated` listener scrolls tab 412 into view whatever the follow mode is.
6. Because the active tab actually changed in step 2, Chrome also fires `onActivated`. `background.ts` pushes 412 onto window 7's history and calls `handleTabActivated(7, 412)`. That resolves `sp_music` again, sees the window is already on it, and broadcasts a passive `tabActivated` with `spaceSwitched: false`. This is the same double event that happens today, so nothing changes here.

For the registry fallback, say the user opens a bookmark from the Work space's folder as a new tab `415`. The sidebar calls `registerTab(7, 415, 'sp_work')` and then `requestGrouping(7, 415)`. If the user switches tabs before the grouping queue gets to 415, `getSpaceForTab(7, 415)` finds no group (`groupId` is `-1`), so it falls back to the registry and gets `'sp_work'`. Once the queue has grouped the tab into "Work", the live group answers first. The registry entry stays, because the group-change handler needs it if the tab later moves into another space's group.

## Out of scope

- **`TabAssociationManager`.** It stays its own manager. `SpaceTabManager` depends on it, and it reaches back only through the two callbacks above.
- **`TAB_GROUP_TITLE_SET`.** This is a workaround for a Brave bug (brave-browser#52949) that tells the sidebar a new group's real title and color. It is about Chrome groups, not spaces, and it should go away once Brave fixes the bug, so it stays a raw message. It already moved into `SpaceTabManager` with the grouping queue.
- **`TabGroupTracker`.** It sits behind `ENABLE_AUTO_GROUP_NEW_TABS = false`, so it stays in `background.ts` untouched.
- **Behaviour changes.** The rules for resolving a tab's space, following the active tab, grouping and unlinking are carried over as they are. The one intended wire-level change is that `setActiveTabAndSpace` failures reject the proxy promise instead of resolving `{ success: false }`, and no caller reads that result today.

## Settled questions

- **The name.** `SpaceTabManager` is the class that exists, so it stays.
- **Whether `TabSpaceRegistry` needs to exist.** G3 and G4 answered it. Leaving a group needs only the bookmark link. Joining a group needs the tab's registered space, because Chrome reports only the new group. The space cannot be worked out from the bookmark's folder either, because a bookmark tab opens into the active space, and T.6 drops a bookmark onto another space's icon. So the registry stays, as an internal store.

## Open question

**Should a tab opened from a bookmark be grouped into its bookmark's space?** Today it is registered to the active space and grouped into it, and not grouped at all in "All". This doc keeps that behaviour (`registerTab` plus `requestGrouping`). If the right behaviour is "always group into the bookmark's space", that call site becomes a single `assignTabToSpace`, but it is a behaviour change and should be decided separately.

## Migration steps

Each step leaves the extension working. Run the in-panel test runner after each one.

1. **Move the orchestration into `SpaceTabManager`, background only.** Add `getSpaceForTab`, `setActiveTabAndSpace`, `handleTabActivated` and `onTabGroupChanged`, holding the existing `SpaceWindowStateManager` and `TabSpaceRegistry` instances, which stay routed for now. Switch `TabHistoryManager` to the new instance and slim down the `background.ts` listeners. Nothing changes on the wire yet, and the raw `set-active-tab-and-space` handler just forwards to the new class.
2. **Route the orchestration messages.** Add the proxy methods `setActiveTabAndSpace` and `onTabActivated` and the `tabActivated` broadcast. Move every raw sender and receiver in the table above over to them, including the in-panel test actions, then delete the flat handler and `SpaceMessageAction`.
3. **Absorb the two managers.** Turn `SpaceWindowStateManager` into `WindowActiveSpaces` and remove routing from `TabSpaceRegistry`. Move `getState`, `setActiveSpace` and `registerTab` onto `SpaceTabManager`, the mirror onto `spaceTabManagerProxy`, and the registry and association callbacks onto `SpaceTabManager`. Update `SpacesContext`, `useSpaceWindowState`, `SpaceNavigatorApp`, `AudioTabsDropdown`, `BookmarkTabsContext` and `tabOperations`, then delete the two old proxies, their `shared/*Api.ts` files and their `ManagerId` entries. This step touches the most working code, so if it runs into trouble, stopping after step 2 still leaves a sensible layout.

## Verification

The in-panel test runner covers this area heavily. Section C is built on `set-active-tab-and-space` (every C.2 case) and follow-active-tab, Section A exercises the registry and grouping, and B.3b to B.3d, D.2b, D.2c and T.7 to T.8f cover the group-change handler and the registry's restore and undo paths. All 79 cases passed on 2026-11-27, which is the baseline: a red case after a step is new. Things to check by hand, because the tests do not cover them:

- The keyboard history shortcuts (`prev-used-tab` and `next-used-tab`) still switch space and scroll, with the sidebar both open and closed.
- The Space Navigator popup still switches space and closes, since it calls `getState` and `setActiveSpace` without mirroring.
- With two windows open, switching the space in one sidebar does not move the other window's sidebar.

## Cost and scope

Medium-sized and mostly mechanical, and smaller than first planned, since the grouping queue has already moved. Roughly 150 lines of orchestration and the group-change handler move out of `background.ts`, two small managers turn into internal stores, one proxy replaces two, and about a dozen sidebar call sites switch from raw messages or old proxies to `spaceTabManagerProxy`. No storage format changes, and apart from the failure-reporting tweak above, no behaviour changes either.
