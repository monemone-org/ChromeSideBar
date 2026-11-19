---
created: 2026-09-22
decision: space-tab-manager
status: proposed
depends-on: 2026-07-30-shared-storage-multiple-writers
---

# Regroup window/space/tab state under a SpaceTabManager

## When to do this

Not yet. This refactor starts after [[2026-07-30-shared-storage-multiple-writers]] is finished, which means step 6 (`TabAssociationManager`), the behaviour-fix pass that plan defers to a second step, and the in-flight broadcast counter it wants ported to `spaceManagerProxy`. Doing it earlier would put two refactors on the same `background.ts` listeners at the same time, and step 6 is already rewriting `onRemoved`, `onDetached`, `onUpdated` and `windows.onRemoved`.

It also reverses one decision from that plan on purpose. Its message inventory says orchestration messages like `set-active-tab-and-space` "stay as direct handlers in `background.ts` and keep their current names", because no single manager owned them. That was the right call while managers were being ported one at a time, but once every piece of state has an owner, the orchestration left behind in `background.ts` turns out to be about one thing, and this doc proposes giving that thing an owner too.

## Background

Four separate pieces of code today answer the same two questions: which space is this window showing, and which space does this tab belong to?

- `SpaceWindowStateManager` (class, `src/managers/impl/spaceWindowStateManager.ts`) owns the per-window active space. It stores one `SpaceWindowState` (`{ activeSpaceId: string }`) per window id in session storage under `spaceWindowState_{windowId}`, and the sidebar mirrors it through `spaceWindowStateProxy`.
- `TabSpaceRegistry` (class, `src/managers/impl/tabSpaceRegistry.ts`) owns a per-window map from tab id to space id, stored in session storage under `bg_tabSpaces`. The sidebar writes to it when it opens a tab from a bookmark, so background knows the tab's home space before Chrome has grouped it. The sidebar never reads it.
- `getSpaceForTab(windowId, tabId)` (function in `background.ts`, returns `Promise<string | undefined>`) works out a tab's space. It returns `undefined` for pinned-site tabs, then tries the tab's live Chrome group (matched to a space by group title), then falls back to the registry, and finally returns `undefined` for an ungrouped tab, which callers treat as "All".
- `setActiveTabAndSpace(tabId)` (function in `background.ts`, returns `Promise<{ success: boolean; error?: string }>`) activates a tab, calls `getSpaceForTab`, switches the window's active space if needed, and broadcasts `tab-activated` with `explicit: true` so the sidebar scrolls.

Two more pieces of `background.ts` belong to the same idea even though they are not named that way:

- The `chrome.tabs.onActivated` listener repeats `setActiveTabAndSpace`'s "resolve the space, maybe switch" logic inline, with the extra rule that the "Follow active tab" setting can turn it off, and then broadcasts a passive `tab-activated`.
- The grouping queue (`queueTabForGrouping`, `processGroupingQueue`, `processGroupingRequest`, plus the `findGroupByName` helper) is what actually puts a tab into its space's Chrome group. It reads the window's active space and asks `TabAssociationManager.isPinnedManagedTab` whether to keep the tab ungrouped.

Because the two orchestration functions live in `background.ts` rather than on a manager, `TabHistoryManager` cannot import them (`background.ts` already imports it, so that would be circular). It works around this with `TabHistoryDeps`, an interface of those two functions that `background.ts` passes in at construction.

The sidebar also talks to this orchestration through raw messages that bypass the manager/proxy layer:

| Raw message | Direction | Senders / receivers |
|---|---|---|
| `set-active-tab-and-space` | sidebar → background, request/reply | `useFollowActiveTab.ts:81`, `AudioTabsDropdown.tsx:29`, `App.tsx:866`, `tests/inpanel/actions.ts:64,101,126` |
| `queue-tab-for-grouping` | sidebar → background, fire-and-forget | `BookmarkTabsContext.tsx:344,470,539`, `tabOperations.ts:146` |
| `tab-activated` (`SpaceMessageAction.TAB_ACTIVATED`) | background → every context | received by `useFollowActiveTab.ts:116` |
| `TAB_GROUP_TITLE_SET` (uses `type`, not `action`) | background → every context | received by `useTabGroups.ts:53` |

Three of the `set-active-tab-and-space` senders still pass a `skipHistory: false` field that background has not read for a long time, which is a small sign of what happens to hand-written message shapes nobody type-checks.

## What is wrong with the current layout

None of this is broken, so this is a tidy-up rather than a bug fix. The cost is in how hard the code is to follow and change.

- **The logic is spread out.** Deciding "which space should this window show now that this tab is active" lives in two copies (the `onActivated` listener and `setActiveTabAndSpace`), while the state they read and write lives in two other classes. Anyone changing the rule has to find all four places.
- **The sidebar uses two calling styles for one concept.** `tabSpaceRegistryProxy.register(...)` goes through a typed proxy, but the `queue-tab-for-grouping` message that almost always follows it on the next line is a hand-built object. The pair shows up three times (`BookmarkTabsContext.tsx:337/344`, `:467/470`, `tabOperations.ts:145/146`).
- **`TabHistoryDeps` works around a structural problem.** The circular-import explanation in `tabHistoryManager.ts` only exists because the functions have no home.
- **`SpaceMessageAction` is down to one entry.** `src/utils/spaceMessages.ts` has a whole enum, plus a long comment explaining where everything else went, just to hold `TAB_ACTIVATED`.

## Proposal

Add one routed manager, `SpaceTabManager`, that owns "window → active space" and "tab → space" together, along with every operation that reads or changes them. It takes over `SpaceWindowStateManager` and `TabSpaceRegistry`, the two orchestration functions, the `onActivated` follow logic, and the grouping queue. `TabAssociationManager` stays separate, because it owns a different relation (tab ↔ bookmark or pinned item) with its own backup and restore machinery, and `SpaceTabManager` uses it rather than absorbing it.

### Structure

Absorbing the two managers doesn't mean pasting all their code into one file. Their storage code stays in small internal classes that `SpaceTabManager` holds, so each storage key still has exactly one class that reads and writes it. Only `SpaceTabManager` is routed, so the sidebar sees one manager id and one proxy.

```
┌─ SpaceTabManager (routed, ManagerId.SPACE_TAB) ─────────────────────┐
│                                                                     │
│  sidebar-callable (SpaceTabManagerApi)                              │
│    getState / setActiveSpace          (was SpaceWindowStateManager) │
│    setActiveTabAndSpace               (was background.ts function)  │
│    registerTab                        (was TabSpaceRegistry)        │
│    assignTabToSpace / requestGrouping (was queue-tab-for-grouping)  │
│                                                                     │
│  background-internal                                                │
│    getSpaceForTab, getActiveSpace, handleTabActivated,              │
│    queueNewTab, onTabRemoved, onTabGroupChanged, removeWindow, load │
│                                                                     │
│  ┌─ WindowActiveSpaces ──┐ ┌─ TabSpaceRegistry ─┐ ┌─ GroupingQueue ─┐│
│  │ windowId -> state     │ │ windowId ->        │ │ sequential      ││
│  │ spaceWindowState_{id} │ │  tabId -> spaceId  │ │ tab grouping    ││
│  │ (session storage)     │ │ bg_tabSpaces       │ │ (no storage)    ││
│  └───────────────────────┘ └────────────────────┘ └─────────────────┘│
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ constructor dependency       │ constructor dependency
               ▼                              ▼
     TabAssociationManager               SpaceManager
     (isPinnedManagedTab, deassociate)   (spaces by id / by name)

     TabHistoryManager ── constructor dependency ──▶ SpaceTabManager
     LastAudibleTracker ── constructor dependency ─▶ TabHistoryManager
```

The three internal classes, all in `src/managers/impl/`:

- `WindowActiveSpaces` (class, new file `windowActiveSpaces.ts`) is the storage half of today's `SpaceWindowStateManager`: the `Map<windowId, SpaceWindowState>`, `get`, `set`, `removeWindow` and `load`. It doesn't broadcast. `SpaceTabManager` broadcasts after each write, since it's the class that knows the `originId` and owns the action names.
- `TabSpaceRegistry` (class, existing file) stays mostly as it is, minus `RoutedManager` and `dispatch`. It becomes a plain store again.
- `GroupingQueue` (class, new file `tabGroupingQueue.ts`) is the queue and `processGroupingRequest` moved out of `background.ts`, including the `ISSUE_52949_WORKAROUND` send of `TAB_GROUP_TITLE_SET`. It needs the pinned check, the space lookup and the active space, and gets them through a small callback object from `SpaceTabManager` rather than holding references to the other managers itself.

The storage keys don't change, so a service worker restart mid-session reads back exactly what the old code wrote.

### API

```typescript
// shared/spaceTabManagerApi.ts - what the sidebar can call
interface SpaceTabManagerApi
{
  getState(windowId: number): SpaceWindowState;
  setActiveSpace(windowId: number, spaceId: string): SpaceWindowState;

  // Activate the tab and switch its window to the tab's space. Throws on
  // failure instead of returning { success, error }: the router already turns
  // a throw into { error }, and callManager turns that back into a rejection.
  setActiveTabAndSpace(tabId: number): void;

  // Record a tab's home space only - no grouping.
  registerTab(windowId: number, tabId: number, spaceId: string): void;

  // Record the tab's home space AND move it into that space's Chrome group,
  // even if it is already in another group (today: register + queue with spaceId).
  assignTabToSpace(windowId: number, tabId: number, spaceId: string): void;

  // Group the tab into the window's active space if it is still ungrouped
  // (today: queue-tab-for-grouping without spaceId).
  requestGrouping(windowId: number, tabId: number): void;
}

// Broadcasts, both built with makeManagerActionId(ManagerId.SPACE_TAB, ...)
SPACE_TAB_STATE_CHANGED   // { windowId, state: SpaceWindowState, senderId? }  (was SpaceWindowStateManager_msg_changed)
SPACE_TAB_TAB_ACTIVATED   // { windowId, tabId, spaceSwitched, explicit? }     (was 'tab-activated')
```

The reason there are three grouping-related calls instead of one is that today's call sites mean three different things, and merging them would change behaviour:

- `BookmarkTabsContext.tsx:467` (associate an existing tab with a bookmark) and `tabOperations.ts:145` (a bookmark moved to another space's folder) both register and then queue with an explicit `spaceId`, which forces the move. Both become `assignTabToSpace`.
- `BookmarkTabsContext.tsx:337/344` (a tab just opened from a bookmark) registers the bookmark's space but queues **without** a `spaceId`, so the tab goes into the active space, and not at all when the active space is "All". That becomes `registerTab` followed by `requestGrouping`. See open question 2.
- `BookmarkTabsContext.tsx:539` (a pinned tab being released) only queues. It becomes `requestGrouping`.

Background-internal methods, called directly on the instance by `background.ts` listeners and other managers:

- `getSpaceForTab(windowId, tabId): Promise<string | undefined>` has the same rules as today, reading the registry and `SpaceManager` directly.
- `getActiveSpace(windowId): string` is the same as today's `SpaceWindowStateManager.getActiveSpace`.
- `handleTabActivated(windowId, tabId): Promise<void>` is the body of today's `onActivated` listener after the history push: resolve the space, read the follow mode from `chrome.storage.local`, switch if allowed, and broadcast a passive `SPACE_TAB_TAB_ACTIVATED`.
- `queueNewTab(tab)` is what `chrome.tabs.onCreated` calls for an ungrouped new tab, today's `queueTabForGrouping(tab)` with no space.
- `onTabRemoved(windowId, tabId)` drops the registry entry.
- `onTabGroupChanged(windowId, tabId, groupId): Promise<void>` is today's `onUpdated` block: if the tab has a registered space and the new group belongs to a different space, drop the registry entry and call `tabAssociationManager.deassociate`.
- `removeWindow(windowId)` and `load()` forward to the internal stores.

### The proxy

`spaceTabManagerProxy` replaces both `spaceWindowStateProxy` and `tabSpaceRegistryProxy`. It keeps the mirror store, `mirrorWindow(windowId)` and the optimistic `setActiveSpace` exactly as `spaceWindowStateProxy` has them today, and adds the new methods as plain `callManager` wrappers.

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

The two flat branches in `chrome.runtime.onMessage` go away completely, so every message the service worker receives goes through `routedManagers`. The construction order becomes `spaceManager`, `tabAssociationManager`, `spaceTabManager`, `historyManager`, `lastAudibleTracker`, because each of these takes the previous ones in its constructor.

`TabHistoryManager` gets `spaceTabManager` in place of the `{ setActiveTabAndSpace, getSpaceForTab }` object. `TabHistoryDeps` can stay as the parameter type, narrowed to those two methods, because it clearly documents what history actually uses. The circular-import explanation above it goes away, though, since there's no cycle any more: `SpaceTabManager` never needs history. The `result.success` checks in `navigate` and `navigateToIndex` are only used for DEV logs, so they turn into a `try`/`catch` around the call.

### Message inventory, before and after

| Today | After |
|---|---|
| `SpaceWindowStateManager_msg_getState` / `_setActiveSpace` | `SpaceTabManager_msg_getState` / `_setActiveSpace` |
| `SpaceWindowStateManager_msg_changed` | `SpaceTabManager_msg_stateChanged` |
| `TabSpaceRegistry_msg_register` | `SpaceTabManager_msg_registerTab` |
| `set-active-tab-and-space` (raw) | `SpaceTabManager_msg_setActiveTabAndSpace` |
| `queue-tab-for-grouping` (raw) | `SpaceTabManager_msg_assignTabToSpace` / `_requestGrouping` |
| `tab-activated` (raw) | `SpaceTabManager_msg_tabActivated` |
| `TAB_GROUP_TITLE_SET` (raw) | unchanged, see "Out of scope" |

`ManagerId.SPACE_WINDOW_STATE` and `ManagerId.TAB_SPACE_REGISTRY` are removed and `ManagerId.SPACE_TAB = 'SpaceTabManager'` is added. `SpaceMessageAction` and `SpaceMessageActionType` then have no entries left, so they're deleted, and `spaceMessages.ts` is left holding just the `Space` and `SpaceWindowState` types. Renaming that file is a separate cleanup.

## Worked example

Say window `7` is showing the "Work" space (`activeSpaceId: 'sp_work'`), and a tab `412` is playing music inside a Chrome group titled "Music", which matches the space `sp_music`. The user clicks that tab in the audio dropdown.

1. `AudioTabsDropdown` calls `spaceTabManagerProxy.setActiveTabAndSpace(412)`, which sends `SpaceTabManager_msg_setActiveTabAndSpace { tabId: 412 }`.
2. `SpaceTabManager.setActiveTabAndSpace(412)` calls `chrome.tabs.update(412, { active: true })`, which returns a tab with `windowId: 7`.
3. It calls `getSpaceForTab(7, 412)`. `isPinnedManagedTab(7, 412)` is false. The tab's `groupId` is `88`, `chrome.tabGroups.get(88).title` is `"Music"`, and `SpaceManager` finds `sp_music` by that name, so the destination is `'sp_music'`.
4. The current space is `'sp_work'`, which is neither `'all'` nor the destination, so it writes `{ activeSpaceId: 'sp_music' }` to `WindowActiveSpaces` for window 7 and broadcasts `SpaceTabManager_msg_stateChanged { windowId: 7, state: { activeSpaceId: 'sp_music' } }`. Every sidebar mirroring window 7 switches to Music.
5. It broadcasts `SpaceTabManager_msg_tabActivated { windowId: 7, tabId: 412, spaceSwitched: true, explicit: true }`. The sidebar's `onTabActivated` listener scrolls tab 412 into view no matter what the follow mode is.
6. Because the active tab actually changed in step 2, Chrome also fires `onActivated`. `background.ts` pushes 412 onto window 7's history and calls `handleTabActivated(7, 412)`. That resolves `sp_music` again, sees the window is already on it, and broadcasts a passive `tabActivated` with `spaceSwitched: false`. This is the same double event that happens today, so nothing changes here.

For the registry fallback, say the user opens a bookmark from the Work space's folder as a new tab `415`. The sidebar calls `registerTab(7, 415, 'sp_work')` and then `requestGrouping(7, 415)`. If the user switches tabs before the grouping queue gets to 415, `getSpaceForTab(7, 415)` finds no group (`groupId` is `-1`), so it falls back to the registry and gets `'sp_work'`. Once the queue has grouped the tab into "Work", the live group answers first and the registry entry is never needed again.

## Out of scope

- **`TabAssociationManager`.** It stays its own manager. `SpaceTabManager` depends on it, not the other way round.
- **`TAB_GROUP_TITLE_SET`.** This is a workaround for a Brave bug (brave-browser#52949) that tells the sidebar a new group's real title and color. It's about Chrome groups, not spaces, and it should go away once Brave fixes the bug, so it stays a raw message. It does move into `GroupingQueue` along with the code that sends it.
- **`TabGroupTracker`.** It sits behind `ENABLE_AUTO_GROUP_NEW_TABS = false`, so it stays in `background.ts` untouched.
- **Behaviour changes.** The rules for resolving a tab's space, following the active tab and grouping are carried over as they are. The one intended wire-level change is that `setActiveTabAndSpace` failures reject the proxy promise instead of resolving `{ success: false }`, and no caller reads that result today.

## Open questions

1. **Name.** `SpaceTabManager` is the working name. `WindowSpaceManager` would describe the "window shows a space, tabs belong to a space" split a bit more precisely, but either works.
2. **Should a tab opened from a bookmark be grouped into its bookmark's space?** Today it's registered to the bookmark's space but grouped into the active space, and not grouped at all in "All". This doc keeps that behaviour (`registerTab` + `requestGrouping`). If the right behaviour is "always group into the bookmark's space", that call site becomes a single `assignTabToSpace`, but it's a behaviour change and should be decided separately.
3. **Does `TabSpaceRegistry` need to exist at all?** It overlaps with `TabAssociationManager`, since a bookmark tab's home space could live on its association entry or be derived from the bookmark's folder. This is a guess I haven't checked: `regroupAssociatedTab` updates the registry separately when a bookmark moves, so it's probably not a clean merge. Worth another look once both managers sit next to each other.

## Migration steps

Each step leaves the extension working, and the in-panel test runner should be run after each one.

1. **Move the orchestration into `SpaceTabManager`, background only.** Create the class with `getSpaceForTab`, `setActiveTabAndSpace`, `handleTabActivated` and the grouping queue, holding the existing `SpaceWindowStateManager` and `TabSpaceRegistry` instances. Those two stay routed for now. Switch `TabHistoryManager` to the new instance and slim down the `background.ts` listeners. Nothing changes on the wire yet, and the two raw message handlers in `background.ts` just forward to the new class.
2. **Route the orchestration messages.** Add `ManagerId.SPACE_TAB`, `SpaceTabManagerApi`, the proxy methods `setActiveTabAndSpace`, `assignTabToSpace`, `requestGrouping` and `onTabActivated`, and the `tabActivated` broadcast. Move every raw sender and receiver in the table above over to them (including the in-panel test actions), then delete the flat handlers and `SpaceMessageAction`.
3. **Absorb the two managers.** Turn `SpaceWindowStateManager` into `WindowActiveSpaces` and remove routing from `TabSpaceRegistry`, then move `getState`, `setActiveSpace` and `registerTab` onto `SpaceTabManager` and the mirror onto `spaceTabManagerProxy`. Update `SpacesContext`, `useSpaceWindowState`, `SpaceNavigatorApp`, `BookmarkTabsContext` and `tabOperations`, then delete the two old proxies, their `shared/*Api.ts` files and their `ManagerId` entries. This step touches the most working code, so if it runs into trouble, stopping after step 2 still leaves a sensible layout.

## Verification

The in-panel test runner covers this area heavily. Section C is built on `set-active-tab-and-space` (every C.2 case) and follow-active-tab, and Section A exercises the registry and grouping. Record which cases are red before starting, as the shared-storage plan does, so that a known failure isn't mistaken for a new one. Things to check by hand, because the tests don't cover them:

- The keyboard history shortcuts (`prev-used-tab` / `next-used-tab`) still switch space and scroll with the sidebar both open and closed.
- The Space Navigator popup still switches space and closes, since it calls `getState` / `setActiveSpace` without mirroring.
- With two windows open, switching the space in one sidebar doesn't move the other window's sidebar.

## Cost / scope

This is medium-sized and mostly mechanical. Roughly 150 lines of orchestration and 120 lines of grouping queue move out of `background.ts`, two small managers turn into internal stores, one proxy replaces two, and about a dozen sidebar call sites switch from raw messages or old proxies to the new one. No storage format changes, and apart from the failure-reporting tweak above, no behaviour changes either.
