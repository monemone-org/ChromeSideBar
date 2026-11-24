---
created: 2026-11-23
status: implemented, not verified
decision: 2026-11-23-new-tab-grouping-two-writers
---

# Implementation plan: one writer for new-tab placement

## What this plan does

The decision doc, `2026-11-23-new-tab-grouping-two-writers.md`, explains the race: when the sidebar creates a tab and then groups it itself, background's `chrome.tabs.onCreated` handling groups the same tab into the active space at the same time. The outcome is either `No group with id` (issue N1) or a tab that silently lands in the wrong group.

This plan removes the race by giving background the whole job. The sidebar asks background to create the tab and say where it goes, and background creates it and places it as one job in its grouping queue. The queue runs one job at a time, so by the time background gets to its own `onCreated` request for that tab, the tab is already where it belongs, and the request leaves it alone.

To keep the change small, the plan creates `SpaceTabManager` from `2026-09-22-space-tab-manager.md`, but only its grouping part. The grouping queue moves into it, the raw `queue-tab-for-grouping` message becomes two of its methods, and it gets one new method, `createTabs`. `TabSpaceRegistry`, `SpaceWindowStateManager`, `getSpaceForTab` and `setActiveTabAndSpace` stay exactly where they are. The rest of the SpaceTabManager proposal can follow later as its own step, and nothing here gets in its way.

## Decisions

### 1. Creation and placement are one queue job

Background could simply call `chrome.tabs.create()` and then group the tab, but its own `onCreated` listener would still queue a separate request for the active space, and that request could run first. So `createTabs` runs as a job inside the grouping queue: the job creates the tabs, places them, and only then lets the queue move on. `onCreated` fires while the job is running, so its request is queued behind the job and runs after the tab has been placed.

```
 Sidebar                          SpaceTabManager (background)                Chrome
 1. createTabs(url, space B) ───▶ queue: [J: create + place]
                                  J runs:
                                    tabs.create(url) ──────────────────────────▶ tab T, no group
                                    onCreated(T) ◀──────────────────────────────
                                      → queue: [R1: T → active space, not forced]  (waits behind J)
                                    group of B found, or created with T
                                    tabs.group([T], group of B) ───────────────▶ T in B's group
                                    reply { tabIds: [T] } ─▶ sidebar
                                  R1 runs:
                                    T was placed by a job → skip
```

### 2. Background remembers the tabs a job has placed

Checking "is the tab already in a group?" is not enough for R1 to skip. A job can deliberately leave a tab ungrouped, for the "All" space or for a pinned tab, and R1 would then see an ungrouped tab and pull it into the active space. So `SpaceTabManager` keeps a set of the tab ids that a job has placed. A request that is not forced skips any tab in that set and removes it from the set. Because the job adds the id before the queue reaches R1, the id is always there in time. `chrome.tabs.onRemoved` also removes the id, so a tab whose `onCreated` request never comes does not stay in the set forever.

### 3. The placement says where the tabs go, in three kinds

The sidebar paths that race want three different things, so the request carries one of three placements:

```ts
type TabPlacement =
  // The space's Chrome group, found by title or created if the space has
  // none. 'all' means no group.
  | { kind: 'space'; spaceId: string }
  // A particular group. groupId is used if that group still exists;
  // otherwise a new group is made from newGroup; with neither, no group.
  | { kind: 'group'; groupId?: number; newGroup?: { title: string; color: chrome.tabGroups.ColorEnum } }
  // No group, and background must not group the tabs later either.
  | { kind: 'none' };

interface NewTab
{
  url: string;
  index?: number;
  active?: boolean;
  pinned?: boolean;
}

// On SpaceTabManagerApi. All tabs of one call get the same placement and
// end up in the same group, which is what "open all in group" and the
// undo paths need. The reply says which tabs and which group, so a caller
// can restore associations or put later tabs in the same group.
createTabs(windowId: number, tabs: NewTab[], placement: TabPlacement): { tabIds: number[]; groupId?: number };
```

The `group` kind folds in the "use the original group if it still exists, else recreate it" logic that the close-tab undo does today, so that check happens inside the job and cannot go stale between the sidebar's check and the grouping.

### 4. Only the racing paths change

A sidebar path that creates a tab and leaves its grouping to background already has one writer and does not change. That covers opening a bookmark (`createItemTab`), Cmd+T, and `createTabsFromDragUrls` in `TabList.tsx`. Moving tabs that already exist (`moveTabToSpace`, the drags) does not race either, because background never groups an existing tab unless asked, so it does not change.

### 5. The raw grouping message becomes two routed methods

The grouping queue moves into `SpaceTabManager`, so the message that feeds it moves too. Keeping `queue-tab-for-grouping` raw would leave background forwarding a hand-built message to the manager, and the sidebar would use two calling styles for one queue. The message has two meanings today, and each becomes its own method, as the SpaceTabManager proposal describes:

```ts
// On SpaceTabManagerApi.

// Moves the tab into the space's group even if it is in another group
// (today: queue-tab-for-grouping with a spaceId).
assignTabToSpace(windowId: number, tabId: number, spaceId: string): void;

// Groups the tab into the window's active space, only if it still has no
// group by the time the queue reaches it (today: queue-tab-for-grouping
// without a spaceId).
requestGrouping(windowId: number, tabId: number): void;
```

`TabSpaceRegistry` stays a separate routed manager for now, so the paths that call `tabSpaceRegistryProxy.register()` and then ask for grouping keep making two calls. Folding the registry in, and merging those two calls into one, belongs to the later SpaceTabManager step.

## Steps

The steps go test first, the same way as the step-6b review fixes: the new case should fail before the fix and pass after it.

### Step 1: a test that shows the race in a product path

Add a gate to `processGroupingRequest()` in `src/background.ts`, right after it reads the tab and finds no group: `TestGateName.GROUPING_AFTER_TAB_READ` in `backgroundTestHooksApi.ts`. Then add T.6 to `src/tests/inpanel/cases/sectionT.ts`, "A bookmark dragged onto another space's icon opens in that space":

1. Set up spaces A and B, with A active and neither space holding a tab, so neither has a group.
2. Arm the gate.
3. Call `createTabInSpace(url, spaceB, …)`, the function the space bar calls when a bookmark or pinned site is dropped on a space icon. Background's `onCreated` request reads the new tab while it has no group and stops at the gate. The sidebar meanwhile creates B's group with the tab.
4. Release the gate. Background finds no group for A, creates one and takes the tab, which empties B's group.
5. Assert that the tab is in space B. This fails before the fix, which shows the silent wrong-space outcome on demand.

The `No group with id` variant needs background to land between two of the sidebar's calls, which one gate cannot arrange, so T.6 covers the root cause through the other outcome. A.1 and C.2e remain the cases where N1 itself showed up.

### Step 2: `SpaceTabManager` with the grouping queue

New files, following the pattern of the other managers:

- `src/managers/shared/spaceTabManagerApi.ts` holds `SpaceTabManagerApi` with `createTabs`, `assignTabToSpace` and `requestGrouping`, plus `TabPlacement` and `NewTab`.
- `src/managers/impl/spaceTabManager.ts` holds `SpaceTabManager implements RoutedManager, SpaceTabManagerApi`.
- `src/managers/proxies/spaceTabManagerProxy.ts` holds the proxy, `Remote<SpaceTabManagerApi>`.
- `ManagerId.SPACE_TAB` goes in `messageRouting.ts`, and `background.ts` registers the manager.

What moves out of `background.ts` into `spaceTabManager.ts`:

- `groupingQueue`, `processGroupingQueue`, `processGroupingRequest`, `findGroupByName`, and the `ISSUE_52949_WORKAROUND` send of `TAB_GROUP_TITLE_SET`.
- The queue becomes a queue of jobs instead of a queue of `TabGroupingRequest` items. A grouping request is one kind of job, and `createTabs` is the other. A small class that the file does not export, `GroupingQueue`, owns the array and the "one at a time" loop, the same way `TabAssociationBackupStore` sits inside `tabAssociationManager.ts`.
- The set of placed tab ids from decision 2.

`SpaceTabManager` needs three things it does not own: the active space of a window, a space by id, and the pinned check. It gets them through a callback object passed to its constructor, as the SpaceTabManager proposal describes for `GroupingQueue`, so it holds no references to the other managers:

```ts
interface SpaceTabDeps
{
  getActiveSpace(windowId: number): string | undefined;   // spaceStateManager
  getSpace(spaceId: string): Space | undefined;            // spaceManager
  isPinnedManagedTab(windowId: number, tabId: number): boolean;  // tabAssociationManager
}
```

What changes in `background.ts`:

- The `onCreated` listener calls `spaceTabManager.queueNewTab(tab)` instead of `queueTabForGrouping(tab)`.
- The raw `queue-tab-for-grouping` handler is deleted.
- The `onRemoved` listener also tells `spaceTabManager` to forget the tab id.

The four senders of `queue-tab-for-grouping` move to the proxy in the same step, so the message never has two forms at once:

| Sender | Becomes |
|---|---|
| `createItemTab`, `BookmarkTabsContext.tsx:346` | `spaceTabManagerProxy.requestGrouping(windowId, tabId)` |
| `associateExistingTab`, `BookmarkTabsContext.tsx:505` | `spaceTabManagerProxy.assignTabToSpace(windowId, tabId, spaceId)` |
| `deassociatePinnedTab`, `BookmarkTabsContext.tsx:616` | `spaceTabManagerProxy.requestGrouping(windowId, tabId)` |
| `regroupAssociatedTab`, `tabOperations.ts:146` | `spaceTabManagerProxy.assignTabToSpace(windowId, tabId, spaceId)` |

`deassociatePinnedTab` awaits the deassociate before it asks for grouping, so that the pinned check in the queue no longer sees the tab as pinned. That order stays the same.

Grouping behaves exactly as before after this step, so the whole suite should give the same results as before. T.6 still fails.

### Step 3: move the racing sidebar paths to `createTabs`

Each path from the decision doc's table moves to `spaceTabManagerProxy.createTabs`:

| Path | Placement |
|---|---|
| `createTabInSpace()` in `tabOperations.ts`, used when a bookmark or pinned site is dropped on a space icon | `{ kind: 'space', spaceId }` |
| Link dropped next to a grouped tab, `TabList.tsx:1359` | `{ kind: 'group', groupId }`, with the computed `index` |
| Multi-drop onto a group, `TabList.tsx:1978`, for items with no live tab | `{ kind: 'group', groupId: targetGroupId }`. The existing tabs in the same drop still move and group from the sidebar, because they do not race |
| "Open all in group", `BookmarkTree.tsx:945` | One call with every tab and `{ kind: 'group', newGroup: { title: folderName, color } }`. The first returned tab id is then activated as today |
| Undo of closed tabs, `closeTabAction.ts:147` | One call per tab, in index order. The first tab of a snapshot group uses `{ kind: 'group', groupId: snapshot.groupId, newGroup: { title, color } }`, and later tabs of that group use the `groupId` the first reply returned. This replaces the `groupMap` logic |
| Undo of a deleted space, `deleteSpaceAction.ts:165` | One call with every tab and `{ kind: 'group', newGroup: { title: space.name, color } }`. Associations are restored afterwards from the returned tab ids |
| Importing tab groups, `backupRestore.ts:159` | One call per backed-up group with `{ kind: 'group', newGroup: { title, color } }` |

After this step T.6 passes, because that drop now goes through `createTabs`.

### Step 4: the test helpers use the product path

`openTabInSpace()` and the filler-tab helper in `src/tests/inpanel/actions.ts` call `spaceTabManagerProxy.createTabs(windowId, [{ url, active: false }], { kind: 'space', spaceId })` and take the tab id from the reply. `groupNewTabThroughBackground()` goes away. The helpers then drive the same code a user's drop on a space icon does, as `writing-test-cases.md` asks, and the short-lived extra group described in the decision doc no longer appears, because R1 skips a tab a job has placed.

### Step 5: docs

- The decision doc: status `accepted`, and the open question points to this plan as the chosen direction.
- N1: status stays "fixed, not verified" until a run shows A.1, C.2e and T.6 passing, and its "Who can see it" section notes that the product paths are fixed.
- `2026-09-22-space-tab-manager.md`: the grouping queue, `createTabs`, `assignTabToSpace` and `requestGrouping` are already in `SpaceTabManager`, so its migration covers only the orchestration functions, the active-space state and the registry.
- `docs/state-reference.md`, if it lists the grouping queue's owner.

## Verification

- T.6 fails after step 1 and passes after step 3.
- The suite stays at the same results after step 2, apart from T.6 still failing, because step 2 changes no behavior.
- After step 4, run A.1, C.2c, C.2e and T.6 several times through the driver, as the N1 doc describes, and look for `No group with id` in the summaries.
- By hand, because no case covers them: drag a bookmark onto a space icon whose space has no tabs, use "open all in group" on a folder while another space is active, close a grouped tab and undo, and delete a space with tabs and undo. In each case the tabs should end up in the expected group, and the console should show no `[processGroupingRequest] Failed` line.

## Cost and risk

The new manager is mostly code that moves out of `background.ts`, about 120 lines of grouping queue, plus `createTabs` and the placed-tab set. Eleven call sites in the sidebar change, each in a small way: the four senders of `queue-tab-for-grouping` and the seven racing paths. The main risk is the undo paths, which today interleave tab creation, association restore and grouping. Their order changes slightly, since each tab is now created and grouped in one call before its association is restored. The undo cases in Section B and the delete-space cases in Section D cover them.
