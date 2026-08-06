---
created: 2026-08-01
decision: generic-immutable-collection-classes
status: rejected
---

# Generic Immutable Collection Classes for React State

**Rejected 2026-08-01.** Wrote out the actual before/after for every read/write call site as a preview before committing to the migration - the after version still has a `setX((prev) => prev.method(...))` at every call site, still needs a class + methods to maintain, and the net line-count/readability win was marginal against ~50+ call sites of mechanical churn across 2 files. Not worth it as a standalone effort. Left below for reference in case the calculus changes (e.g. if it's dragged along "for free" during the shared-storage single-writer refactor rather than done on its own).

Supersedes [[2026-07-30-tab-item-map-encapsulation]] with a broader, generic version of the same idea - see that doc's own notes for the original narrower scope.

## Background

Found while discussing the A.7 fix: `BookmarkTabsContext.tsx` uses raw `Map`/`Set` for several pieces of `useState`, each mutated with the same "clone, mutate the clone, return it" boilerplate:

```typescript
const [itemToTab, setItemToTab] = useState<Map<string, number>>(new Map());
const [tabToItem, setTabToItem] = useState<Map<number, string>>(new Map());
const [audibleTabs, setAudibleTabs] = useState<Set<number>>(new Set());
const [tabTitles, setTabTitles] = useState<Map<number, string>>(new Map());
```

Same pattern also lives in `SelectionContext.tsx`:

```typescript
const [tabSelection, setTabSelectionState] = useState<Map<string, SelectionItem>>(new Map());
const [bookmarkSelection, setBookmarkSelectionState] = useState<Map<string, SelectionItem>>(new Map());
```

This violates our own code style rule (CLAUDE.md): prefer a class with descriptive methods over raw data structures when code directly manipulates low-level primitives. Grepping actual usage:

| State | File | Call sites |
|---|---|---|
| `itemToTab`/`tabToItem` | `BookmarkTabsContext.tsx` | ~25 (2 useState + bulk rebuild write + delete-pattern + ~15 reads + several add-pattern writes) |
| `audibleTabs` | `BookmarkTabsContext.tsx` | 6 |
| `tabTitles` | `BookmarkTabsContext.tsx` | 6 |
| `tabSelection` + `bookmarkSelection` | `SelectionContext.tsx` (232 lines total) | 16 combined |

**~50+ call sites across 2 files.** Real refactor, not a quick patch.

## What can go wrong (today)

- Nothing enforces `itemToTab`/`tabToItem` stay in sync - a future edit updating one map and forgetting the other compiles fine and silently desyncs the two lookup directions.
- The clone-and-set boilerplate is copy-pasted at every write site (7+ pairs just for `itemToTab`/`tabToItem`, per the original doc's count).
- Call sites reach past the actual concept ("associate this tab with this item," "mark this tab audible") into raw `Map`/`Set` manipulation.

## Proposed solution

Two generic, immutable primitives - not a domain-specific class per state variable:

```typescript
// src/utils/immutableCollections.ts

export class ImmutableMap<K, V>
{
  constructor(private readonly map: Map<K, V> = new Map()) {}

  set(key: K, value: V): ImmutableMap<K, V>
  {
    const next = new Map(this.map);
    next.set(key, value);
    return new ImmutableMap(next);
  }

  delete(key: K): ImmutableMap<K, V>
  {
    if (!this.map.has(key)) return this;  // no-op, same instance
    const next = new Map(this.map);
    next.delete(key);
    return new ImmutableMap(next);
  }

  get(key: K): V | undefined { return this.map.get(key); }
  has(key: K): boolean { return this.map.has(key); }
  keys(): IterableIterator<K> { return this.map.keys(); }
  values(): IterableIterator<V> { return this.map.values(); }
  get size(): number { return this.map.size; }

  static fromEntries<K, V>(entries: Iterable<[K, V]>): ImmutableMap<K, V>
  {
    return new ImmutableMap(new Map(entries));
  }
}

export class ImmutableSet<T>
{
  constructor(private readonly set: Set<T> = new Set()) {}

  add(value: T): ImmutableSet<T>
  {
    if (this.set.has(value)) return this;
    const next = new Set(this.set);
    next.add(value);
    return new ImmutableSet(next);
  }

  delete(value: T): ImmutableSet<T>
  {
    if (!this.set.has(value)) return this;
    const next = new Set(this.set);
    next.delete(value);
    return new ImmutableSet(next);
  }

  has(value: T): boolean { return this.set.has(value); }
  values(): IterableIterator<T> { return this.set.values(); }
  get size(): number { return this.set.size; }
}
```

`itemToTab`/`tabToItem` specifically need atomic two-direction updates, so they get one more class built on top of `ImmutableMap` rather than being replaced by a bare one:

```typescript
// src/utils/bidirectionalMap.ts
export class BidirectionalMap<K, V>
{
  private constructor(
    private readonly forward: ImmutableMap<K, V>,
    private readonly backward: ImmutableMap<V, K>
  ) {}

  static empty<K, V>(): BidirectionalMap<K, V>
  {
    return new BidirectionalMap(new ImmutableMap<K, V>(), new ImmutableMap<V, K>());
  }

  link(key: K, value: V): BidirectionalMap<K, V>
  {
    return new BidirectionalMap(this.forward.set(key, value), this.backward.set(value, key));
  }

  unlinkByKey(key: K): BidirectionalMap<K, V>
  {
    const value = this.forward.get(key);
    if (value === undefined) return this;
    return new BidirectionalMap(this.forward.delete(key), this.backward.delete(value));
  }

  unlinkByValue(value: V): BidirectionalMap<K, V>
  {
    const key = this.backward.get(value);
    if (key === undefined) return this;
    return new BidirectionalMap(this.forward.delete(key), this.backward.delete(value));
  }

  valueForKey(key: K): V | undefined { return this.forward.get(key); }
  keyForValue(value: V): K | undefined { return this.backward.get(value); }
  hasKey(key: K): boolean { return this.forward.has(key); }
  keys(): IterableIterator<K> { return this.forward.keys(); }
  values(): IterableIterator<V> { return this.forward.values(); }
}
```

All methods return a new instance (or `this` on a no-op delete) rather than mutating in place, so `useState<ImmutableMap<...>>`/`useState<BidirectionalMap<...>>` still works with a single setter - same pattern as native `Map`/`Set` today, just wrapped.

### Migration targets

- `BookmarkTabsContext.tsx`:
  - `itemToTab` + `tabToItem` (2 `useState`s) → one `useState<BidirectionalMap<string, number>>`
  - `audibleTabs` → `useState<ImmutableSet<number>>`
  - `tabTitles` → `useState<ImmutableMap<number, string>>`
- `SelectionContext.tsx`:
  - `tabSelection` → `useState<ImmutableMap<string, SelectionItem>>`
  - `bookmarkSelection` → `useState<ImmutableMap<string, SelectionItem>>`

## Cost / scope

~50+ call sites across the 2 files listed above (see table). Recommend two passes rather than one: (1) build `ImmutableMap`/`ImmutableSet`/`BidirectionalMap`, migrate `BookmarkTabsContext.tsx`, verify it compiles and behaves correctly; (2) migrate `SelectionContext.tsx` as a follow-up once the primitives have proven out. Smaller diff to review and compile-check at each step than one combined pass.

Independent of [[2026-07-30-shared-storage-multiple-writers]] - that doc is about cross-context (background vs. sidebar) storage ownership; this one is a same-process state-shape cleanup. Can be done before or after that refactor, same reasoning as the doc this one supersedes.

## Status

Scheduled after the current manual test pass (`tab-space-association-test-cases.md`, sections A.1-F) is finished - not blocking that work, not blocked by it. (Unrelated to the `e2e/` Playwright harness, which is discontinued separately.)
