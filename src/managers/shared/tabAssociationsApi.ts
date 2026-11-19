// The wire contract for TabAssociationManager, owned by neither side.
//
// impl/tabAssociationManager.ts implements TabAssociationsApi;
// proxies/tabAssociationsProxy.ts implements Remote<TabAssociationsApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.
//
// This file also owns the backup entry types, which used to live in
// src/utils/tabAssociations.ts. That file is gone: the manager and this
// contract are what it became - see the step-6 plan under
// docs/decisions/2026-07-30-shared-storage-multiple-writers progress/.

import { ManagerId, makeManagerActionId } from '../proxies/messageRouting';

/**
 * One window's live associations: tab id -> itemKey, where itemKey is
 * "bookmark-{id}" or "pinned-{id}".
 *
 * Crossing the message channel turns the numeric keys into strings, the same
 * way storing them as JSON already did, so reads index it with a number and
 * let JS coerce - exactly what the storage-backed version did before.
 */
export type TabAssociations = Record<number, string>;

/** Where one associated tab was last seen, for matching it again after a restart. */
export interface TabAssociationBackupEntry
{
  tabId: number;
  url: string;
  tabIndex: number;
}

// itemKey → { tabId, url, tabIndex } for one window
export type WindowAssociationBackup = Record<string, TabAssociationBackupEntry>;

/** itemKey prefix for a tab standing in for a pinned site rather than a bookmark. */
export const PINNED_ITEM_KEY_PREFIX = 'pinned-';

/** Whether an itemKey names a pinned site rather than a bookmark. */
export function isPinnedItemKey(itemKey: string | undefined): boolean
{
  return itemKey !== undefined && itemKey.startsWith(PINNED_ITEM_KEY_PREFIX);
}

/**
 * The subset of TabAssociationManager the sidebar can call.
 *
 * Every mutation names the one tab it touches rather than handing over a whole
 * replacement map, because background writes this state unprompted from five
 * of its own listeners: a whole-map write from the sidebar would overwrite
 * whatever background changed in between. See section 6 of
 * docs/decisions/2026-07-30-shared-storage-multiple-writers.md, and decision 2
 * of the step-6 plan.
 *
 * The backup in local storage is deliberately absent from this interface. It
 * is bookkeeping derived from the associations, and the manager keeps both
 * halves in step itself, so a caller can no longer store one without the
 * other.
 *
 * Every method returns the resulting map for that window, which becomes the
 * ack payload - a caller that needs to know its write landed reads the return
 * value instead of racing the broadcast.
 */
export interface TabAssociationsApi
{
  getAssociations(windowId: number): TabAssociations;
  associate(
    windowId: number,
    tabId: number,
    itemKey: string,
    url?: string,
    tabIndex?: number
  ): TabAssociations;
  deassociate(windowId: number, tabId: number): TabAssociations;
  reconcileWindow(windowId: number): Promise<TabAssociations>;
}

/**
 * Broadcast to every listening context when one window's associations change -
 * a manager -> everyone message, rather than a reply to one caller.
 *
 * Payload: { windowId, associations, senderId }. The windowId is what lets a
 * mirror bound to one window ignore a broadcast about a different one outright.
 *
 * It lives here with the rest of this manager's contract so the 'changed'
 * method name is spelled exactly once. A typo in a second hand-written copy
 * would silently stop all cross-window sync with no compile error.
 */
export const TAB_ASSOCIATIONS_CHANGED = makeManagerActionId(ManagerId.TAB_ASSOCIATIONS, 'changed');

// =============================================================================
// Pure map transforms
//
// Each mutation in TabAssociationsApi has its transform here, and both sides
// call it: the manager to change the authoritative map, the proxy to apply the
// same change to its mirror optimistically. One implementation, so an
// optimistic write can't disagree with what background ends up storing.
//
// All of them take a map and return a new one - nothing is mutated in place,
// since the input is the live object behind a store or the manager's own
// state.
// =============================================================================

/**
 * Points one item at one tab.
 *
 * Any other tab the same item was pointing at is dropped on the way: an item
 * has exactly one tab, so leaving the old entry behind would put two tab ids
 * in the map claiming the same itemKey, and whichever one the reader happened
 * to visit last would win.
 */
export function applyAssociate(
  associations: TabAssociations,
  tabId: number,
  itemKey: string
): TabAssociations
{
  const next: TabAssociations = {};

  // Copy every entry except the ones this item already had
  for (const [id, key] of Object.entries(associations))
  {
    if (key === itemKey) continue;
    next[Number(id)] = key;
  }

  next[tabId] = itemKey;
  return next;
}

/** Drops one tab's association. An unknown tab id is a no-op. */
export function applyDeassociate(associations: TabAssociations, tabId: number): TabAssociations
{
  const next = { ...associations };
  delete next[tabId];
  return next;
}

/** Keeps only the listed tab ids - what reconcileWindow does once it knows which tabs survived. */
export function applyKeepTabs(associations: TabAssociations, keepTabIds: Set<number>): TabAssociations
{
  const next: TabAssociations = {};

  // Copy through only the entries whose tab is still valid for this window
  for (const [id, key] of Object.entries(associations))
  {
    if (keepTabIds.has(Number(id))) next[Number(id)] = key;
  }

  return next;
}
