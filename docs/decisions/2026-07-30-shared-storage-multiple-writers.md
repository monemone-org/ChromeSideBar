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

## Suggested solution

Move each of these to the single-owner pattern already used for `SpaceWindowState`:

1. **Background becomes the sole writer** for the underlying storage (both the live record and any backup/cache). Every create/update/remove goes through one code path, in the service worker, never concurrently from two contexts.
2. **The sidebar stops writing storage directly.** Its in-memory state (`itemToTab`/`tabToItem`/`audibleTabs`/`tabTitles` in `BookmarkTabsContext.tsx`, `spaces` in `SpacesContext.tsx`, pinned sites list) becomes a **read-only mirror**: it sends a message describing the intent ("associate this tab with this item", "delete this space", "add this pinned site") and background performs the actual write, then broadcasts the resulting state (a `STATE_CHANGED`-style message) so every open sidebar/window updates its mirror.
3. Concretely, this means:
   - `DeleteSpaceAction`, `usePinnedSites.ts`'s CRUD, `deletePinnedSiteAction.ts`, and `BookmarkTabsContext.tsx`'s `storeAssociation`/`removeLocalTabAssociation`/`rebuildAssociations` all stop calling `chrome.storage.*` directly and instead go through messages.
   - Background's `saveTabAssociationBackup`-on-navigate logic stays where it is (it was already correctly background-owned) - it's the *other* writer that needs to move, not this one.
   - `rebuildAssociations`'s job shrinks to "ask background for the current state" rather than independently reading and reconciling storage; the TOCTOU race described in Case 1 disappears because there's no longer a second writer to race against.

## Proxy client layer

Separate but related problem, also flagged during this discussion: direct `chrome.runtime.sendMessage`/`chrome.runtime.onMessage` calls scattered across components are themselves error-prone today - hand-typed action strings, no compile-time check that a payload matches what the handler expects, `chrome.runtime.lastError` checked inconsistently (or not at all) from call site to call site, and every broadcast listener independently re-filtering on `message.action`.

Proposed fix: each background-side manager gets a matching **proxy module** that UI code calls like a normal async function/service, never touching `chrome.runtime.*` directly.

- `background.ts` keeps its manager objects (`SpaceManager`, `SpaceWindowStateManager`, `TabSpaceRegistry`, a future association manager, etc.), each owning its own request ("method") messages and broadcast messages.
- A new `src/proxies/` module per manager (e.g. `spaceManagerProxy.ts`, `spaceWindowStateProxy.ts`). Each exported function marshals its parameters into the message shape, calls `chrome.runtime.sendMessage`, unmarshals/validates the response, and returns a typed value - callers just `await proxy.getSpaces()` instead of constructing a message object by hand.
- Broadcasts: each proxy defines a listener interface (e.g. `SpaceWindowStateListener { onStateChanged(state: SpaceWindowState): void }`), keeps its own `Set<Listener>`, and registers exactly **one** raw `chrome.runtime.onMessage` listener at module load that fans out to every registered listener. Components implement the interface and register/unregister through it - a small `useXxxListener` hook wrapping `addListener`/`removeListener` in a `useEffect` is the natural React ergonomic layer on top.

This also directly enforces the single-owner fix above: once storage-touching code only exists inside the proxy modules and `background.ts`, a component has no import path left to reach `chrome.storage.*` directly the way `DeleteSpaceAction` does today.

Illustrative shape, not final:

```typescript
// src/proxies/spaceManagerProxy.ts
import { SpaceMessageAction } from '../utils/spaceMessages';
import { Space } from '../contexts/SpacesContext';

export async function getSpaces(): Promise<Space[]>
{
  const response = await chrome.runtime.sendMessage({ action: SpaceMessageAction.GET_SPACES });
  return response?.spaces ?? [];
}

export async function updateSpaces(spaces: Space[]): Promise<void>
{
  await chrome.runtime.sendMessage({ action: SpaceMessageAction.UPDATE_SPACES, spaces });
}

export interface SpacesListener
{
  onSpacesChanged(spaces: Space[]): void;
}

const listeners = new Set<SpacesListener>();

export function addSpacesListener(listener: SpacesListener): () => void
{
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// One raw listener for the whole module - fans out to every registered listener
chrome.runtime.onMessage.addListener((message) =>
{
  if (message.action === SpaceMessageAction.SPACES_CHANGED)
  {
    for (const listener of listeners) listener.onSpacesChanged(message.spaces);
  }
});
```

```typescript
// src/hooks/useSpacesListener.ts
export function useSpacesListener(onChanged: (spaces: Space[]) => void): void
{
  useEffect(() =>
  {
    return addSpacesListener({ onSpacesChanged: onChanged });
  }, [onChanged]);
}
```

### Refinements to fold in

- Standardize error handling in one place: every proxy function should handle `chrome.runtime.lastError` and a missing/malformed response the same way, rather than each call site deciding independently as happens today.
- One raw `onMessage` listener per proxy module (registered once, at import time) - not one per component. Today several components each register their own listener and filter by `message.action`; the proxy replaces all of them with a single dispatch point.
- `SpaceMessageAction` (and any future per-manager equivalent) becomes effectively private to `background.ts` + its matching proxy file - nothing else needs to import the raw action strings once the proxy exists.
- Split the currently-combined `SpaceMessageAction` enum along manager boundaries as part of this: `GET_SPACES`/`UPDATE_SPACES` belong to `SpaceManager`'s proxy; `GET_WINDOW_STATE`/`SET_ACTIVE_SPACE`/`STATE_CHANGED` belong to `SpaceWindowStateManager`'s proxy. They're conflated in one enum today - the proxy split is a natural place to also separate them.
- Fire-and-forget messages (e.g. `queue-tab-for-grouping`) fit the same shape as `void`-returning async proxy functions - no special-casing needed.

This isn't extra scope layered on top of the single-owner fix above - it's the concrete mechanism for doing that fix cleanly. Implementing "sidebar sends a message, background owns the write" without this layer just means writing the same hand-rolled `sendMessage`/`onMessage` pattern three more times.

## Cost / scope

This is a real architectural change, not a quick patch - it touches most of the mutation call sites in `BookmarkTabsContext.tsx` and `SpacesContext.tsx`, plus new message handlers in `background.ts` for each mutation type, plus building out the proxy/listener layer itself. Sizing it honestly: comparable in scope to how `SpaceWindowState` is already wired, replicated across three more data types, with a shared proxy layer built alongside it (likely starting with `SpaceWindowState` itself, since it already follows the target pattern and would validate the proxy shape before porting the other three). Recommend doing it as its own dedicated pass, after the current "Follow active tab" / association fixes ship, not bundled with them.
