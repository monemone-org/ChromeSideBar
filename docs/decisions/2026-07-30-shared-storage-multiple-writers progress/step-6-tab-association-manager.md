---
created: 2026-09-21
step: 6
manager: TabAssociationManager
status: shipped
---

# Step 6b: Port `TabAssociationManager`

This is the last manager in the migration order of
`docs/decisions/2026-07-30-shared-storage-multiple-writers.md`. It fixes Case 1
from that document, which is the problem that started the whole series: both
background and the sidebar write the tab associations, and each can overwrite
what the other just did.

It builds on step 6a (`step-6a-per-operation-writes-and-simple-mirrors.md`),
which has to land first. Step 6a provides `MirrorStore` and
`subscribeToBroadcast`, which the new proxy uses, and it establishes the rule
that every proxy applies every broadcast it receives, including the echo of
its own writes.

This port is bigger than the earlier ones for three reasons. The state is per
window, so the sidebar mirrors one window's map rather than a single global
list. It lives in two storage areas, session storage for the live associations
and local storage for a backup that survives a browser restart. And the
in-panel test suite exercises it directly, so a mistake here shows up as a
failing test rather than as a rare race. It is also the first step that is
expected to turn failing tests green: A.3, A.6 and A.6c all reproduce G2
(`docs/test/issues/fixed/G2-association-survives-sidebar-closed.md`), and making
background the owner of the associations is the fix that issue asks for.

## What exists before this step

### The data

A tab association says which open tab is standing in for which bookmark or
pinned site. Each one maps a tab id to an item key, which is either
`bookmark-{id}` or `pinned-{id}`. The associations are kept in two places:

- **Session storage**, under `tabAssociations_{windowId}`, holds the live map
  for each window as `tabId -> itemKey`.
- **Local storage**, under `tabAssociationsBackup_{windowId}`, holds a backup
  for each window as `itemKey -> { tabId, url, tabIndex }`. A separate key,
  `tabAssociationsBackupWindowIds`, lists which windows have a backup, because
  local storage cannot be searched by key prefix. Session storage is cleared
  when the browser quits, so at startup `restoreTabAssociationBackup()` tries
  to match each backed-up window to one of the windows Chrome restored. It
  makes three attempts, from most to least exact. First it looks for the same
  window id, which works after an extension reload because Chrome keeps the
  ids. Then it looks for a window whose tabs have the same domains at the same
  positions, which works after a browser restart where the ids change but the
  tab order doesn't. Finally it picks the window that shares the most domains
  with the backup, for the case where tabs have moved around as well.

All of this lives in `src/utils/tabAssociations.ts`, and its header comment
says it is "Used by both background.ts and BookmarkTabsContext.tsx". Neither
side owns it.

### Who writes it

Background writes from four listeners and from startup:

- `chrome.tabs.onUpdated` saves a fresh backup entry whenever a tracked tab
  changes URL, so the domain matching after a restart compares against where
  the tab actually is now.
- `chrome.tabs.onRemoved` removes the closed tab's backup entry, then updates
  the stored index of every remaining tracked tab, because closing a tab
  shifts the position of every tab after it.
- `chrome.tabs.onMoved` updates the stored indexes for the same reason.
- `chrome.windows.onRemoved` deletes the closed window's backup.
- Once the managers have loaded, startup calls `restoreTabAssociationBackup()`.

The sidebar, in `BookmarkTabsContext.tsx`, writes from three functions:

- `storeAssociation` saves the session entry and then the backup entry, as two
  separate calls.
- `removeLocalTabAssociation` removes both, again as two separate calls.
- `rebuildAssociations` runs when the sidebar opens. It reads the whole map
  for the window, then calls `chrome.tabs.get` on each tab id one at a time to
  check that the tab still exists, removes the ones that don't from its local
  copy, and finally writes that copy back over what is in storage.

The sidebar also keeps its own `itemToTab` and `tabToItem` maps in React
state, and updates them by hand from six places: the three functions above,
its own `onRemoved` and `onDetached` listeners, and a listener for the
`DEASSOCIATE_TAB` message that background sends when a tracked tab is dragged
into a different space's Chrome group.

Two background functions read the map on hot paths. `getSpaceForTab` runs on
every tab activation, and `processGroupingRequest` runs for every tab queued
for grouping. Both start with `await isPinnedManagedTab(...)`, which reads
session storage, so other events can run in the middle of either function.

### What goes wrong

All three failures come from having two writers with no owner:

- **The backup writes can overwrite each other.** Each backup function reads
  a window's whole backup, changes one entry and writes the whole thing back.
  If background and the sidebar do this at nearly the same moment, which is
  normal right after a bookmark opens in a new tab, the second write puts back
  the entries as they were before the first write, and the first write's
  change is lost.
- **The sidebar's rebuild can bring back an association background removed.**
  The rebuild reads the map, spends a noticeable amount of time checking tabs
  one by one, then writes its copy back. If background removes an association
  during that loop, the write at the end restores it.
- **Some changes are missed entirely while the sidebar is closed.** Only the
  sidebar listens for `chrome.tabs.onDetached`, so a tracked tab dragged into
  another window keeps its association. `DEASSOCIATE_TAB` is sent with nobody
  guaranteed to receive it, so a tab dragged into another space's group keeps
  its association too. Reopening the sidebar doesn't repair either case,
  because the rebuild only checks that the tab still exists. A tab that moved
  to another window still exists, so the rebuild keeps it.

## Decisions

### 1. One manager owns both storage keys, and callers never see the backup

The backup exists only to rebuild the associations after a restart, so it
should change whenever an association changes and never otherwise. Today the
caller is responsible for that: every function that stores an association
also has to save a backup entry, and every function that removes one also has
to remove the backup entry. The manager does both inside one method, so the
sidebar asks to associate a tab with an item and never mentions the backup.

### 2. Mutations name a single tab, and the sidebar mirrors one window

Section 6 of the decision doc explains why a mutation should name the one
change it makes rather than send a whole replacement value. The argument is
stronger here than it was for pinned sites, because background changes the
associations from several listeners without being asked. If the sidebar sent
a whole map, it could overwrite a removal that background made a moment
earlier. So the sidebar calls "associate this tab" or "deassociate that tab",
and the manager applies each one to its own map.

The proxy mirrors one window, the same way `spaceWindowStateProxy` does. The
context tells it which window through `mirrorWindow(windowId)`, and from then
on it ignores broadcasts about any other window.

### 3. Background does the reconciling, and it checks the window id

The sidebar's `rebuildAssociations` becomes a manager method,
`reconcileWindow(windowId)`. Running it in background means it no longer
depends on the sidebar, and it works on the manager's own map rather than on a
copy the sidebar read earlier.

The check itself also changes. A tab is kept only if `chrome.tabs.get`
succeeds and the tab is still in the window being reconciled. Without the
second condition, a tab dragged into another window while the sidebar was
closed keeps its association forever, which is the A.6 failure.

The lookups run in parallel, and they take time. When they finish, the method
reads the current map again and removes only the tab ids that failed the
check. It does not write back the map it started with, because background may
have associated or deassociated a tab while the lookups were running, and
writing back the starting map would undo that change.

### 4. Background listens for `chrome.tabs.onDetached`

Case 1 in the decision doc names this listener specifically, because it is
easy to forget. Background already handles `onRemoved`, `onMoved` and
`onUpdated` for the same data, and the detach event carries the
`oldWindowId`, so the listener calls `deassociate(oldWindowId, tabId)` and
then refreshes that window's backup indexes. Together with decision 3, this
covers both situations: a detach that happens while background is running is
handled immediately, and one that was somehow missed is cleaned up the next
time the window is reconciled.

### 5. The `DEASSOCIATE_TAB` message is removed

Background sends this message when a tracked tab moves into a different
space's Chrome group, asking the sidebar to drop the association. It is sent
without a guaranteed receiver, because the sidebar might be closed. Once the
manager owns the associations, background calls `deassociate` directly, and
the manager's normal `TAB_ASSOCIATIONS_CHANGED` broadcast tells any open
sidebar. The decision doc's message inventory already lists `deassociate-tab`
as temporary until this step, so `SpaceMessageAction.DEASSOCIATE_TAB` and the
sidebar's listener for it are both deleted.

### 6. Step 6a comes first

Step 6a removes the machinery that proxies used to protect their mirrors (the
`senderId` echo check, the pending-write counter and the resync after a
dropped broadcast), because once every write names a single change and every
broadcast carries the whole resulting value, applying each broadcast in order
is always correct. This step relies on that. Its proxy holds a `MirrorStore`,
registers for its broadcast with `subscribeToBroadcast`, and applies every
broadcast about its window. The manager still puts `senderId` on its
broadcasts, but only as a label that says whether a sidebar or background
caused the change. No proxy reads it.

### 7. The map is kept in memory, so the pinned check is synchronous

The manager loads every window's map from session storage once when the
service worker starts, and keeps it in memory from then on, the same way
`PinnedSitesManager` keeps its list. `isPinnedManagedTab` becomes a plain
lookup in that map. `getSpaceForTab` and `processGroupingRequest` then no
longer pause at the start, so nothing else can run between the pinned check
and what each function does next.

## The API

### What the sidebar can call

These are on `TabAssociationsApi` in `src/managers/shared/tabAssociationsApi.ts`.
`TabAssociations` is the per-window map, `Record<number, string>`.

| Method | Returns | What it does |
| --- | --- | --- |
| `getAssociations(windowId)` | `TabAssociations` | Returns one window's map. The proxy's version does not touch the mirror. |
| `associate(windowId, tabId, itemKey, url?, tabIndex?)` | `TabAssociations` | Points one item at one tab, and saves the matching backup entry. |
| `deassociate(windowId, tabId)` | `TabAssociations` | Removes one tab's association and its backup entry. Does nothing for an untracked tab. |
| `reconcileWindow(windowId)` | `Promise<TabAssociations>` | Removes every association whose tab is gone or is now in another window. |

Each mutation returns the window's resulting map. That is what the proxy's
promise resolves with, so a caller that needs to know a write has landed can
wait for it instead of waiting for a broadcast.

`url` and `tabIndex` on `associate` are optional. They are what the backup
entry needs to find the tab again after a restart. A caller that has just
created the tab already has them and passes them in. When they are missing,
the manager looks the tab up itself.

`associate` and `deassociate` reply as soon as the in-memory map and session
storage are updated, without waiting for the backup write. The backup write
goes into the queue described below before the reply is sent, so the next
request's backup write still runs after it. A failed backup write is logged.

An item points at only one tab. If `associate` is called for an item that is
already associated with a different tab, the old tab's entry is dropped. The
reverse also happens: if the tab was standing in for a different item, that
item's backup entry is removed, so a restart can't bring the old association
back. The
transform that does this, `applyAssociate`, lives in the shared api file
together with `applyDeassociate` and `applyKeepTabs`. The manager uses them to
change its map, and the proxy uses the same functions to update its mirror
before the request goes out, so the two always agree on what an operation
does.

The broadcast is `TAB_ASSOCIATIONS_CHANGED`, with the payload
`{ windowId, associations, senderId }`. A proxy compares `windowId` with the
window it mirrors and ignores the broadcast if they differ.

### What only background calls

These methods are on the manager but not on the API, because the sidebar has
no use for them:

- `load()` reads every window's map from session storage at startup.
- `isPinnedManagedTab(windowId, tabId)` is the synchronous check from
  decision 7.
- `noteTabNavigated(windowId, tabId, url, tabIndex)` refreshes a tracked tab's
  backup entry after it changes URL.
- `refreshBackupIndices(windowId)` updates the stored index of every tracked
  tab in a window after a tab is moved, closed or detached.
- `removeWindow(windowId)` forgets a closed window's map, its session storage
  key and its backup.
- `restoreFromBackup()` runs the three-step window matching at startup.

### The backup queue

Every backup write goes through a small `TabAssociationBackupStore` class
inside the manager, which runs them one at a time in a single queue. Each
backup write reads a key, changes one entry and writes the key back, so two
writes that overlap can still lose a change, even with a single owner. This
really happens: `chrome.tabs.remove()` accepts an array of tabs, several call
sites pass one, and background's `onRemoved` then fires once for each tab, one
straight after the other. A lost removal leaves a backup entry for a closed
tab, and the next restart would bring that association back.

There is one queue for all windows rather than one per window, because saving
and removing both rewrite `tabAssociationsBackupWindowIds`, which is a single
key shared by every window. `restoreFromBackup` runs inside the queue as one
operation, so no other backup write can change a key between the moment it
reads the backup and the moment it writes its result.

The restore runs on every service worker start, not only after a browser
restart, and the event that woke the worker may already have associated a tab
by the time it runs. So the restore merges what it finds into the window's
existing map instead of replacing it, and skips any restored entry whose item
or tab is already in use, because the live association is newer than the
backup.

When `associate` doesn't receive `url` and `tabIndex`, it looks the tab up
inside the queue rather than before queueing the save. Otherwise a
`deassociate` arriving during the lookup could queue its removal first, and
the save would then put back a backup entry for an association that no longer
exists.

## Changes

### `src/managers/shared/tabAssociationsApi.ts` (new)

The wire contract: the four methods above, the `TAB_ASSOCIATIONS_CHANGED`
constant, the three pure transforms, the `PINNED_ITEM_KEY_PREFIX` constant
with `isPinnedItemKey`, and the backup entry types
`TabAssociationBackupEntry` and `WindowAssociationBackup`, which move here
from `src/utils/tabAssociations.ts`.

### `src/managers/impl/tabAssociationManager.ts` (new)

The manager, implementing both `RoutedManager` and `TabAssociationsApi`, plus
the background-only methods. It also contains the backup storage functions,
the `TabAssociationBackupStore` queue, and the three window-matching passes
(`matchDirect`, `matchByIndexAndDomain`, `matchByDomainOverlap`), which move
over from `src/utils/tabAssociations.ts` unchanged. They only read data and
return a match, so becoming part of a manager doesn't affect them.

Every change to a window's map goes through one private method, `#commit`,
which updates the in-memory map, writes session storage and sends the
broadcast.

### `src/managers/proxies/tabAssociationsProxy.ts` (new)

Implements `Remote<TabAssociationsApi>` using a `MirrorStore` and
`subscribeToBroadcast`. `mirrorWindow(windowId)` remembers the window,
registers the broadcast listener, and fills the mirror by calling
`reconcileWindow`. It reconciles rather than just reading the map because it
runs when the sidebar opens, which is when associations are most likely to
have gone stale while nobody was watching.

`associate` and `deassociate` apply their transform to the mirror first, then
send the request. If the request fails, the proxy asks background for the
current map and puts that in the mirror, rather than undoing its own change,
because undoing could also wipe out a later write that did succeed.
`reconcileWindow` has nothing to apply in advance, since only background knows
which tabs are gone, so it puts the reply into the mirror when it arrives.

### `src/managers/proxies/messageRouting.ts`

Adds `TAB_ASSOCIATIONS: 'TabAssociationManager'` to `ManagerId`.

### `src/background.ts`

- Creates the manager, loads it with the other managers before `stateReady`
  resolves, registers it with the router, and calls `restoreFromBackup()`
  once `stateReady` has resolved.
- `onRemoved` calls `deassociate` and then `refreshBackupIndices`. It now
  removes the session entry as well as the backup entry. Before this step the
  sidebar removed the session entry from its own `onRemoved` listener, which
  only ran while the sidebar was open.
- The new `onDetached` listener from decision 4.
- `onMoved` calls `refreshBackupIndices`.
- `onUpdated` calls `noteTabNavigated` when a tab's URL changes. When a
  tracked tab moves into a different space's group, it calls `deassociate`
  instead of sending `DEASSOCIATE_TAB`.
- `windows.onRemoved` calls `removeWindow`.
- `getSpaceForTab` and `processGroupingRequest` call the synchronous
  `isPinnedManagedTab`.
- The local `refreshBackupIndices` helper moves into the manager.

### `src/contexts/BookmarkTabsContext.tsx`

This file changes the most. The context reads the mirror with
`useSyncExternalStore` and derives `itemToTab` and `tabToItem` from it with
`useMemo`, so the two maps can never disagree with the mirror or with each
other. That makes `rebuildAssociations`, `removeLocalTabAssociation`, the
`onRemoved` and `onDetached` listeners, the `DEASSOCIATE_TAB` listener and all
the hand updates of the two maps unnecessary, so they are deleted.
`storeAssociation` becomes one call to `tabAssociationsProxy.associate`.

When the window id is known, the context calls `mirrorWindow` and then
`seedLiveTabState`. That function reads the window's tabs once and records the
title and audible state of the tracked ones, because `chrome.tabs.onUpdated`
only reports future changes and the sidebar would otherwise show bookmark
names until each tab reloaded.

The `onUpdated` listener for titles needs to know whether a tab is tracked,
but it is registered once and should not be recreated every time the mirror
changes, so it reads `tabToItem` through a ref.

`tabTitles` and `audibleTabs` are kept in this context, because they are
display state for this panel and have nothing to do with background. Both are
keyed by tab id, and an entry should go away when its tab stops being tracked.
Background can now remove an association for many reasons (the tab closed,
moved to another window or another space's group, or failed a reconcile), and
none of them pass through code in this context. So a single effect watches
`tabToItem` and removes entries for tab ids that are no longer in it.
`activeTabId` is not pruned, because it records the window's active tab,
whether or not that tab is tracked.

The context's public interface stays the same, so `TabList`, `BookmarkTree`,
`PinnedBar` and the other consumers don't change.

The comment on `deassociatePinnedTab` is updated. It awaits `deassociate`
before asking background to group the tab. By the time that call returns, the
manager has already removed the tab from the in-memory map that
`isPinnedManagedTab` reads, so the grouping code no longer treats the tab as
pinned and puts it into the active space.

### `src/utils/spaceMessages.ts`

`DEASSOCIATE_TAB` is removed from `SpaceMessageAction` (decision 5).

### `src/utils/tabAssociations.ts`

Deleted. Its contents are now in the manager and the shared api file.

### `docs/state-reference.md`

`tabAssociations_${windowId}` now lists `TabAssociationManager` as its owner
and the context's mirror as its consumer. Entries are added for
`tabAssociationsBackup_${windowId}` and `tabAssociationsBackupWindowIds`.

## Example: a drag while the sidebar is reconciling

The sidebar opens and calls `reconcileWindow` for its window. While background
is still waiting on the `chrome.tabs.get` lookups, the user drags a tracked
bookmark tab into a Chrome group that belongs to another space.

1. Background's `onUpdated` sees the group change, finds that the new group
   belongs to a different space from the one the tab is registered to, and
   calls `deassociate(windowId, tabId)`.
2. The manager removes the tab from its map, writes session storage, removes
   the backup entry and broadcasts the new map for that window.
3. The lookups for `reconcileWindow` finish. The dragged tab still exists and
   is still in the same window, so it passes the check. The method reads the
   current map, which no longer contains the tab, removes any tabs that failed
   the check, and commits the result.
4. The broadcast from step 2, the broadcast from step 3 and the reply to the
   sidebar's call all describe a map without the dragged tab, so the sidebar
   shows the bookmark as not loaded.

Before this step, the sidebar's rebuild loop would have read the map before
step 1, kept checking tabs while background removed the association, and then
written its old copy back, which would have restored the association.

## What this step does not do

- **It doesn't fix G1 or G3.** G1
  (`docs/test/issues/G1-native-bookmark-delete-orphans-tab.md`) is that
  deleting a bookmark in Chrome's own bookmark manager leaves its tab
  associated, because nothing listens for `chrome.bookmarks.onRemoved`. It
  happens whether the sidebar is open or not, so a single owner doesn't fix
  it. G3 is that Chrome's own "Remove from group" leaves the association in
  place, because background's group-change check ignores a tab leaving a
  group and only reacts to a tab joining a different one. Changing that check
  is a behaviour decision that belongs in its own change. So A.5 (G3), B.5 and
  B.5b (G1) should still fail after this step.
- **It doesn't remove the `FIXTURE_TICK_MS` sleeps or the per-render `ctxRef`
  in the in-panel fixtures.** The association callbacks no longer need them,
  but the Spaces callbacks still do, so they will be removed together in one
  separate change.

## Verification

### 1. Compile

Run `npm run build:debug`. Deleting `src/utils/tabAssociations.ts` and moving
its types means the compiler will find every caller that still imports it. If
the manager and proxy disagree on a method, or a `dispatch` case has no
matching proxy method, the build fails.

### 2. The in-panel suite

The baseline is `tools/tmp/test-results-2026-09-21T00-17-13-481Z.json`, with
71 cases of which 6 fail: A.3, A.5, A.6, A.6c, B.5 and B.5b.

A.3, A.6 and A.6c should pass after this step. All three reproduce G2, and the
fix that issue proposes is decisions 4 and 5. A.3 is the group-change case,
which decision 5 fixes. A.6 and A.6c are the cross-window cases, which
decisions 3 and 4 fix. If any of the three still fails, background is not
really the owner yet.

A.5, B.5 and B.5b should still fail, for the reasons in the previous section.
Any case that passed in the baseline and fails now is a regression from this
step.

### 3. By hand

These are things the suite can't do:

- Quit Chrome with tracked tabs open and start it again, to test the backup
  restore after a real restart.
- With the sidebar closed, drag a tracked tab into another window. Then open
  the sidebar in both windows and check that each one shows the right state.
- With the sidebar closed, drag a tracked bookmark tab into another space's
  Chrome group. Then open the sidebar and check that the bookmark shows as not
  loaded.

### 4. Two windows with the sidebar open in both

Open a bookmark in one window and check that it doesn't show as loaded in the
other. Associations are per window, and each proxy ignores broadcasts about
other windows.
