---
created: 2026-09-21
step: 6a
status: proposed
---

# Step 6a: Per-operation writes everywhere, and much simpler mirrors

This is written before any of the code below exists, the same way steps 2
through 4 and step 6 were: what ships may end up differing from what's
proposed here if review turns up something this analysis got wrong.

Step 6b, the `TabAssociationManager` port in the sibling file
`step-6-tab-association-manager.md`, is already written against a
per-operation API for tab associations - `associate`, `deassociate`,
`reconcileWindow` - so it already stands on the shape this step argues for
everywhere else. What it doesn't stand on yet is the rest of this: its proxy
still inherits from `MirrorProxyBase`, which this step removes. Step 6b
lands on top of step 6a rather than the other way around - once this step
ships, the tab-association proxy loses its base class, and nothing about
what either of them actually does needs to change to get there.

## Why this is its own step

Sections 4, 5 and 7 of the parent decision doc each added a piece of
machinery to the proxy layer as a bug was found: the `senderId` echo guard
in step 3.5, then the pending-write counter and the drain in step 5.
Neither was designed as a whole - each is a patch for a specific race
somebody hit while building something else - so a proxy mutation today has
to reason about an echo guard, a pending-write counter, a missed-broadcast
flag, a drain, and a fallback re-read, all to cover races that the
whole-list write pattern created in the first place.

This step replaces the accumulated pieces with one rule: a manager applies
one named operation to its own list, broadcasts the resulting whole value,
and every proxy just applies whatever it receives. What makes that possible
is finishing the job section 6 of the parent doc started, by making
`SpaceManager` take per-operation writes the way `PinnedSitesManager`
already does. Once no caller rebuilds a whole list from a mirror read, the
echo guard has nothing left to protect against, and everything built to
work around it can go.

## Decisions taken before writing this plan

### 1. Writes are deltas, broadcasts are the whole value

These two rules pull in opposite directions, and the plan takes both.

A **request** from a proxy to a manager names the one change it wants -
`removeSpace(id)`, `deassociate(windowId, tabId)` - rather than a whole
replacement list, so two contexts writing at the same moment collide only
when they touch the same item, instead of whichever one lands last winning
outright. That's the read-modify-write race every case in the parent
decision doc traces back to, and naming the operation instead of the result
is the actual fix for it.

A **broadcast** from a manager back out to every proxy carries the
resulting whole value, not the operation that produced it. This half is
worth arguing for, because sending the operation instead looks tempting -
it's smaller, and it mirrors the request - and it's worse on both counts
that matter. Operations aren't idempotent, so a context applying the echo
of its own `addSpace` would end up with the space twice, which is exactly
what turns an echo guard from an optimization into something load-bearing.
And a proxy that misses one broadcast - still loading, or the message
failed to deliver - would diverge from background permanently, since
there's no whole value to recover from; fixing that would need revision
numbers, gap detection and a resync protocol, a lot more machinery than
this step is trying to remove. A whole-value broadcast doesn't have that
problem: any single one, whenever it arrives, repairs everything that came
before it.

### 2. `SpaceManager` becomes per-operation, which is what unlocks the rest

`SpaceManager` is the last manager still taking a whole-list write. Six
places in `SpacesContext` read `spaceManagerProxy.snapshot`, build a new
array by hand, and send the whole thing back - `createSpace` (~line 219),
`updateSpace` (~249), `updateSpaceFolderPaths` (~283), `deleteSpaceBase`
(~296), `moveSpace` (~302), and the two import paths, `replaceSpaces`
(~324) and `appendSpaces` (~335) - and `DeleteSpaceAction` does the same
thing twice more, once in `do()` and once in `undo()`.

This matters more than it looks like it should, because that pattern is
the **only** reason the echo guard is load-bearing today rather than just
defensive. The `CONTEXT_ID` doc comment in `messageRouting.ts` says this
directly, and it's the crux of the whole step:

> Without it, the broadcast for message 1 lands on top of message 2's write
> and Video disappears from the mirror. Anything reading the list in that
> window (`createSpace` reads it on every call) then writes the loss back
> out permanently.

The danger was never the flicker of a stale broadcast landing for a moment
- it's that a component reads the list during that flicker window and
writes the loss back out as a real, permanent change. With per-operation
writes there's no whole list being rebuilt from a possibly-stale read
anywhere, so a transiently stale mirror can't corrupt anything: the worst
it can do is show something wrong for a few milliseconds before the next
broadcast fixes it.

The new `SpaceManagerApi`, worked out from the real call sites above:

| Method | Returns | Replaces |
| --- | --- | --- |
| `addSpace(space, atIndex?)` | `Space[]` | `createSpace` (no index), `DeleteSpaceAction.undo` (its recorded index) |
| `addSpaces(spaces)` | `Promise<Space[]>` | import, append option |
| `updateSpace(id, edit)` | `Space[]` | `updateSpace` |
| `updateSpaceFolderPaths(updates)` | `Space[]` | the batch folder-rename path |
| `removeSpace(id)` | `Space[]` | `deleteSpaceBase`, `DeleteSpaceAction.do` |
| `moveSpace(activeId, overId)` | `Space[]` | `moveSpace` |
| `replaceAll(spaces)` | `Promise<Space[]>` | import, replace option |

`addSpace` picking up an optional `atIndex` isn't in the six `SpacesContext`
call sites - it comes from `DeleteSpaceAction.undo()`, which today reads
the current list, splices the snapshotted space back in at its recorded
index, and writes the whole thing back so the restored space lands where it
used to sit. Giving `addSpace` the same optional-index shape
`PinnedSitesApi.addPins` already uses means `undo()` no longer has to read
the list first at all: `addSpace(this.snapshot.space, this.snapshot.index)`
is the whole call.

One pure transform per method lives in `shared/spaceManagerApi.ts`, the way
`pinnedSitesApi.ts` already does it, so the manager's real list and the
proxy's optimistic mirror write cannot disagree about what an operation
means. `updateSpace(id, edit)` is a plain partial merge (`{ ...space,
...edit }`) rather than the set-replacement `PinnedSiteEdit` uses for icon
fields - `Space` has no mutually-exclusive fields the way a pin's emoji and
custom icon do.

Whether each method is sync or async comes out of a real constraint:
`SpaceManager.updateSpaces` currently resolves missing
`bookmarkFolderSegments` before storing (`resolveMissingSegments`, a fresh
`chrome.bookmarks.getTree()` walk), which is why it's async today. The only
two paths that can hand the manager a space with `bookmarkFolderPath` set
and no `bookmarkFolderSegments` are Arc import and a legacy backup, both
through `replaceSpaces`/`appendSpaces` - so `replaceAll` and `addSpaces`
are the only methods that still need the resolution and stay async. Every
real caller of `updateSpace` (`SpaceDialogs.tsx`'s edit form,
`BookmarkTree.tsx`'s folder-path sync) either sends no folder path or sends
path and segments together, so the other five methods can all be plain
synchronous transforms, matching how `PinnedSitesApi`'s equivalents work.

### 3. Apply every broadcast, and keep senderId as a label

Once no caller anywhere rebuilds a whole list from a mirror read, applying
every broadcast in arrival order is always correct, because background is
the single writer for every one of these keys and its broadcasts are
therefore totally ordered. There's no longer a case where applying one can
corrupt something, since nothing downstream of the mirror ever turns a
stale read into a fresh write.

An optimistic write can still be visibly reverted for one round trip by a
foreign broadcast already in flight when the write started, the same way it
can today. What changes is what happens next: this context's own echo
arrives a moment later carrying the truth, including its own change, and
the mirror settles on the right value without needing to have held anything
back in the meantime to get there.

`CONTEXT_ID`, the `senderId` field `callManager` stamps on every outgoing
request, and the `originId` parameter threaded through every manager
mutation all stay exactly as they are today. What changes is their job:
`senderId` stops being an echo guard and becomes a plain provenance label,
saying who caused the change - a sidebar context, if `senderId` is set, or
background itself, if it's absent. The proxies stop reading it entirely -
they apply every broadcast, their own echo included, which is what makes
the rest of the guard machinery unnecessary. The label earns its keep
because `watchForBackgroundFaviconBroadcast` in `sectionP.ts` (line 766,
`if (message.senderId !== undefined) return;`) relies on it to tell a
favicon broadcast background produced on its own apart from one triggered
by a sidebar request - the test that proves Scenario 5, where background
patches a favicon unasked and pushes it to a sidebar that never requested
it, and the sidebar has its own favicon resolver writing the same field, so
without the label the test has no way to tell which side did the work.
Keeping the label is also the smaller change.

The pending-write counter, the missed-broadcast flag, the drain,
`fetchCurrent`, `callAndApply`, and the `migrated` special case in
`spaceManagerProxy` all go, though. `migrated` is worth tracing through
rather than just deleting: it exists today only to force an echo of our own
write past a guard that would otherwise skip it, for the one case where
what background actually stored differs from what we optimistically wrote
(import handing `SpaceManager` a legacy space that gets its segments filled
in before it's saved). Once the proxy applies its own echo the same way it
applies everyone else's, that correction just happens on its own: our own
`replaceAll`/`addSpaces` broadcast arrives like any other, and since it
differs from what the mirror already holds, it's applied - no flag, no
exception. Decision 2's per-operation work is what makes this true, which
is the sense in which it unlocks decision 3: the `migrated` case isn't
replaced with something else, it stops needing to exist.

The cost to accept deliberately here is flicker: a foreign write landing
within a few milliseconds of a local one can briefly revert what the user
just did on screen, for the one round trip until the local echo arrives and
corrects it. That's a real, visible trade, worth saying plainly rather than
burying in the mechanics above. Sections C and D of the in-panel suite are
what will show whether it's noticeable, since they exercise Spaces hardest,
and the by-hand two-window check at the end of this doc is aimed at exactly
this.

### 4. No base class, composition instead

Asked directly whether `MirrorProxyBase` is still worth keeping once it's
this small, the answer is no. What's left to share once the pending-write
counter, the echo guard and the drain are gone is the JSON no-op check
before writing the mirror, and registering a broadcast listener at most
once - neither justifies inheritance, and inheritance is what forced the
awkward `protected abstract fetchCurrent()` shape onto every subclass in
the first place, whether or not that subclass's mutations actually needed
it. It also never fit `spaceWindowStateProxy`, which is per-window and
wrote its own version of all of this by hand rather than extending the base
- composition was already the pattern the working proxy in this codebase
used; the base class was the odd one out.

Instead:

- A small `MirrorStore<T>` in `src/stores/`, which takes the place of
  `ExternalStore<T>`. It keeps everything that class did (the
  `ReadableStore<T>` interface, a stable `getSnapshot` reference, and
  `subscribe`), and its `set` skips any value whose JSON matches the one
  already held. That check is what stops our own broadcast echo from
  re-rendering every consumer once the echo guard is gone. Every mirror in
  the sidebar is a proxy's mirror, so there is no other user left for a
  plain store without the check, and one class is simpler than a store
  wrapped in another. Each proxy holds one as a field rather than
  inheriting it:

  ```typescript
  // src/stores/mirrorStore.ts
  export class MirrorStore<T> implements ReadableStore<T>
  {
    #value: T;
    #listeners = new Set<() => void>();
    constructor(initial: T) { this.#value = initial; }

    get store(): ReadableStore<T> { return this; }
    get snapshot(): T { return this.#value; }
    getSnapshot = (): T => this.#value;
    subscribe = (onChange: () => void) => { ... };

    // Scoped to short, flat, JSON-derived values off the message channel -
    // not a general deep-equality utility. Same reasoning as
    // MirrorProxyBase.applyValue today, carried over rather than reinvented.
    set(value: T): void
    {
      if (JSON.stringify(value) === JSON.stringify(this.#value)) return;
      this.#value = value;
      for (const listener of this.#listeners) listener();
    }
  }
  ```

- A `subscribeToBroadcast(action, handler)` helper next to `callManager` in
  `messageRouting.ts`, keyed on the action string rather than an instance
  flag, so calling it twice for the same broadcast (React StrictMode
  double-invoking a mount effect) is a no-op the second time:

  ```typescript
  const registeredActions = new Set<string>();

  export function subscribeToBroadcast(action: string, handler: (m: Record<string, unknown>) => void): void
  {
    if (registeredActions.has(action)) return;
    registeredActions.add(action);
    chrome.runtime.onMessage.addListener((message) => { if (message?.action === action) handler(message); });
  }
  ```

- `src/managers/proxies/mirrorProxyBase.ts` is deleted.

Each proxy then reads as a flat list of methods, where a mutation is two
lines - apply the transform to the mirror, send the request - plus a catch
block that resyncs from background if the send fails, since that behavior
is worth keeping even without a shared `mutate()` to hold it:

```typescript
async removePins(ids: string[]): Promise<PinnedSite[]>
{
  this.#mirror.set(applyRemovePins(this.#mirror.snapshot, ids));
  try
  {
    return await callManager<PinnedSite[]>(ManagerId.PINNED_SITES, 'removePins', { ids });
  }
  catch (error)
  {
    console.error('[pinnedSitesManagerProxy] removePins failed, resyncing:', error);
    this.getPinnedSites().then(sites => this.#mirror.set(sites)).catch(() => {});
    throw error;
  }
}
```

This is smaller than today's version even with the repeated catch block,
since there's no pending-write counter to decrement and no drain to defer
to - just "ask background what's true, apply it." A call like
`tabAssociationsProxy.reconcileWindow`, which today needs `callAndApply`
because there's nothing optimistic to write before the reply arrives, needs
no special method any more: it's a normal call that skips the first line
and applies the reply straight to the mirror instead.

## Changes

### 1. `src/managers/shared/spaceManagerApi.ts` and `src/managers/impl/spaceManager.ts`

The api file is rewritten to the table in decision 2: seven methods instead
of one, plus one pure transform per method (`applyAddSpace`,
`applyUpdateSpace`, `applyUpdateSpaceFolderPaths`, `applyRemoveSpace`,
`applyMoveSpace`), the way `pinnedSitesApi.ts`'s transforms already work.
`addSpaces` and `replaceAll` stay async and keep calling the
segment-resolution logic; everything else becomes a plain synchronous
transform. In the manager, `dispatch` grows five more cases, `updateSpaces`
as a method is gone, and `#commit(spaces)` becomes the one place that
writes storage and broadcasts, called by all seven public methods, each
still taking `originId` and passing it through to the broadcast the same
way every other manager does. `resolveMissingSegments` itself is unchanged
- only `addSpaces` and `replaceAll` still call it.

### 2. `src/managers/proxies/spaceManagerProxy.ts`

Moves onto `MirrorStore`, loses `MirrorProxyBase`, gains the six new
methods in the flat shape from decision 4. `#subscribeToBroadcasts` and its
`migrated` special case are gone - `subscribeToBroadcast(SPACES_CHANGED,
...)` just applies whatever arrives.

### 3. `src/contexts/SpacesContext.tsx`

The six call sites stop reading `spaceManagerProxy.snapshot` and building a
new array by hand, which was the point of decision 2 - each becomes a
direct call on the matching proxy method (`addSpace`, `updateSpace`,
`updateSpaceFolderPaths`, `removeSpace`, `moveSpace`, and `replaceAll`/
`addSpaces` for the two import paths). The import paths still `await` their
call, for the same reason as today: import needs the segment self-heal to
have landed before it reports itself done. The `writeSpaces` helper that
wrapped `updateSpaces` and swallowed its rejection goes away, since every
call site now calls its own proxy method directly.

### 4. `src/actions/deleteSpaceAction.ts`

`do()` calls `spaceManagerProxy.removeSpace(this.spaceId)` instead of
filtering the list itself. `undo()` calls `spaceManagerProxy.addSpace
(this.snapshot.space, this.snapshot.index)` instead of reading the current
list, splicing into it by hand, and writing the whole thing back - the
`atIndex` parameter decision 2 adds for this call site means `undo()` no
longer needs the `getSpaces()` round trip in front of it either.

### 5. Store and routing plumbing

New `src/stores/mirrorStore.ts` holds the `MirrorStore<T>` class from
decision 4 and the `ReadableStore<T>` interface, and
`src/stores/externalStore.ts` is deleted. `src/managers/proxies/messageRouting.ts` gains
`subscribeToBroadcast`, and its `CONTEXT_ID` doc comment is rewritten to
describe `senderId`'s new job as a provenance label instead of arguing for
an echo guard - `callManager` keeps stamping `senderId` on every outgoing
request exactly as it does today. `src/managers/proxies/
mirrorProxyBase.ts` is deleted outright.

### 6. The other three mirroring proxies

`spaceWindowStateProxy.ts`, `pinnedSitesManagerProxy.ts` and
`tabAssociationsProxy.ts` all move onto `MirrorStore` and
`subscribeToBroadcast`, in the flat shape decision 4 shows. The two
per-window proxies keep their own "is this broadcast about my window" check
in their broadcast handler, since that filtering was never something the
base class did for them - `spaceWindowStateProxy` already wrote its own
version by hand, and `tabAssociationsProxy` inherits the shape from
`spaceWindowStateProxy` rather than from `MirrorProxyBase` for exactly this
reason.

### 7. The manager impls are otherwise unchanged

`spaceManager.ts` changes the way item 1 above describes, but
`pinnedSitesManager.ts`, `tabAssociationManager.ts` and
`spaceWindowStateManager.ts` keep their `originId` parameter on every
mutation and their `senderId: originId` line on every broadcast exactly as
they are today - decision 3 changes what the proxies do with that field,
not what the managers send.

### 8. `src/tests/inpanel/cases/sectionD.ts`

D.4's `stripSegmentsAndWrite` currently builds a whole list by hand from
`spaceManagerProxy.snapshot` and calls `spaceManagerProxy.updateSpaces
(nextList)`, which no longer exists. The closest real equivalent is
`spaceManagerProxy.replaceAll(nextList)`, since that's the method import's
own replace path calls and it's the one that still runs the segment
self-heal - swapping the call is enough, the rest of the flow needs no
other change. `assertSegmentsRestored`'s doc comment explaining the
`migrated` flag becomes a description of a mechanism that no longer exists,
since decision 3 means the correction now arrives through the ordinary
broadcast with no flag involved - the comment needs to say that instead.

## What this step does not do

- **The tab association port itself.** That's step 6b, in the sibling file,
  and it's already written against a per-operation API for tab
  associations. It's waiting on this step for its proxy's base class, not
  on any new design work.
- **Moving the "active space was deleted" fallback into background.**
  `SpacesContext.tsx` has an effect that switches the window to "All" when
  the active space's id is not in the mirrored list. Because mirrors now
  apply every broadcast, that list can briefly go backwards, and the effect
  can act on it. For example, with the list at [Work], window B adds Music
  and background broadcasts [Work, Music]. Before that broadcast reaches
  window A, the user in A adds Video and switches to it. The broadcast then
  arrives, A's mirror becomes [Work, Music], Video is missing, and the effect
  switches A to "All" for real. A moment later background handles A's
  `addSpace(Video)` and Video reappears, but nothing puts A back on Video,
  because that broadcast is about the list and not about which space is
  active. It needs two windows changing spaces within a few milliseconds of
  each other, so it is left as is. If it ever matters, the fix is for
  background to reset any window whose active space it removes, as part of
  the removal itself, and delete the sidebar effect, since background
  already owns both the list and each window's active space.

## Verification

### 1. Compile

`npm run build:debug`, then reload. Deleting `mirrorProxyBase.ts` outright
and reshaping `SpaceManagerApi` to the per-operation table in decision 2 is
entirely type-driven - a `dispatch` case with no matching proxy call, a
`SpaceManagerApi` method missing its `Remote` counterpart, or a stray
import of something deleted all fail the build rather than fail silently at
runtime. Same reasoning steps 5 and 6 both lean on for their own
compile-first verification, and it applies here at least as strongly, since
this step touches more call sites than either of them did alone.

### 2. The in-panel suite

Baseline is `tools/tmp/test-results-2026-09-21T00-17-13-481Z.json`: 71
cases, 6 failing - A.3, A.5, A.6, A.6c, B.5, B.5b. This step is a refactor
of how writes travel, not of what they do, so it should change nothing
about which cases pass. Any movement at all, in either direction, is worth
stopping on: a newly-red case is a regression, and a newly-green one means
something about the old failure was accidentally tied to the machinery
this step removes, worth understanding before moving on rather than just
taking the win.

Sections C and D exercise Spaces hardest, and D.4 specifically exercises
the self-heal path decision 3 changes the mechanism of. Section P covers
the pinned-site proxy paths this step also touches by moving
`pinnedSitesManagerProxy` onto `MirrorStore`, even though pinned sites keep
the same per-operation API they've had since step 5 - only the mirror
underneath changes shape.

### 3. By hand

Two windows, sidebar open in both. Create, rename, reorder and delete
spaces in one while watching the other, since that's the path where the
flicker named in decision 3 would show up if it's going to. Nothing here
should be surprising if sections C and D come back clean, but the suite
runs single-window and can't see cross-window timing the way watching two
side by side can.
