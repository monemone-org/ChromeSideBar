---
created: 2026-07-30
decision: tab-item-association-class
status: proposed
---

# Encapsulate itemToTab/tabToItem as a Class

## Background

`BookmarkTabsContext.tsx` tracks a bidirectional mapping between bookmark/pinned items and Chrome tabs using two raw `useState<Map>` fields:

```typescript
const [itemToTab, setItemToTab] = useState<Map<string, number>>(new Map());
const [tabToItem, setTabToItem] = useState<Map<number, string>>(new Map());
```

Every mutation site clones the relevant map(s) and calls both setters manually (7 pairs of call sites: lines ~172-173, 201-206, 338, 448-454, 588-594, 607-613). ~15 more places just read from `itemToTab`/`tabToItem` directly.

This violates our own code style rule: prefer a class with descriptive methods over raw data structures when code directly manipulates low-level primitives.

## What can go wrong

- Nothing enforces that `itemToTab` and `tabToItem` stay in sync - a future edit that updates one map and forgets the other compiles fine and silently desyncs the two lookup directions.
- The clone-and-set React boilerplate (`new Map(prev)`, `.set(...)`, return) is copy-pasted 7 times.
- Call sites reach past the actual concept ("associate this tab with this item") into two independent `Map` objects.

## Proposed solution

Add a small class, e.g. `TabItemAssociations`, that owns both maps internally and exposes intent-revealing methods:

- `.link(itemKey, tabId)` - sets both directions atomically
- `.unlinkByItem(itemKey)` / `.unlinkByTab(tabId)` - removes both directions atomically
- `.tabFor(itemKey)`, `.itemFor(tabId)` - reads
- `.hasItem(itemKey)`, `.tabIds()` (for the `tabToItem.keys()` → `Set` usage at line 702), etc. as needed by existing call sites

The class should be immutable-update friendly for React: methods return a new `TabItemAssociations` instance rather than mutating in place, so `useState<TabItemAssociations>` still works with a single setter.

```typescript
const [associations, setAssociations] = useState(() => new TabItemAssociations());

setAssociations((prev) => prev.link(itemKey, tabId));
setAssociations((prev) => prev.unlinkByTab(tabId));
```

This collapses the two `useState` fields into one, removes the possibility of one-sided updates, and gives every call site a self-documenting API instead of manual Map surgery.

## Cost / scope

Touches every read (~15) and write (~7 pairs) call site of `itemToTab`/`tabToItem` in `BookmarkTabsContext.tsx`, plus any consumers of the context that destructure these two fields directly (need to check before starting - the class instance may need to expose read accessors matching current call shapes, or consumers get updated too). Self-contained to this one file's state, no cross-file/background coordination needed (unlike the shared-storage work in [[2026-07-30-shared-storage-multiple-writers]]), so this is a smaller, independent pass - can be done before or after that other refactor.
