// The wire contract for PinnedSitesManager, owned by neither side.
//
// impl/pinnedSitesManager.ts implements PinnedSitesApi;
// proxies/pinnedSitesManagerProxy.ts implements Remote<PinnedSitesApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.
//
// This file also owns the PinnedSite type itself. It used to live in
// hooks/usePinnedSites.ts, but background.ts needs it now that the manager is
// there, and the service worker must not import a React hook module. The hook
// re-exports it, so existing importers are unaffected.

import { ManagerId, makeManagerActionId } from '../proxies/messageRouting';

export interface PinnedSite
{
  id: string;
  url: string;
  title: string;
  favicon?: string;
  customIconName?: string;  // Lucide icon name when using custom icon
  iconColor?: string;       // Custom icon color (hex, e.g., "#ef4444")
  emoji?: string;           // Emoji character (e.g., "😀")
}

export const PINNED_SITES_STORAGE_KEY = 'pinnedSites';

/**
 * One pin plus where it sat in the list, for restoring a deleted pin at its
 * original position (DeletePinnedSiteAction's undo).
 */
export interface PinnedSitePlacement
{
  pin: PinnedSite;
  index: number;
}

/**
 * The new title/url/icon of a pin being edited.
 *
 * The three icon fields are replaced as a set: whatever is absent here is
 * cleared on the stored pin, because picking an emoji has to remove a custom
 * icon and vice versa. `favicon` is the exception - absent means "leave the
 * stored one alone", since most edits don't touch it.
 */
export interface PinnedSiteEdit
{
  title: string;
  url: string;
  favicon?: string;
  customIconName?: string;
  iconColor?: string;
  emoji?: string;
}

/** Where a dragged pin lands relative to the pin it was dropped on. */
export type PinnedSiteDropPosition = 'before' | 'after';

/** The fields a duplicated pin takes from the live tab, when it has one. */
export interface PinnedSiteDuplicateOverrides
{
  url?: string;
  title?: string;
  favicon?: string;
}

/**
 * A resolved icon waiting to be stored on one pin.
 *
 * Both kinds of resolution end up in the same `favicon` field, so the patch
 * has to say which kind it is - the pin may have changed while the resolving
 * fetch was in flight, and what counts as "still needs this" differs:
 *
 * - no forCustomIconName: a site favicon, for a pin showing no icon at all.
 *   Only applied while the pin still has no icon of any kind.
 * - forCustomIconName set: a Lucide icon rendered to a data URL. Only applied
 *   while the pin still asks for that same icon name, so a patch for an icon
 *   the user has since swapped out is dropped instead of overwriting the new
 *   one.
 */
export interface PinnedSiteFaviconPatch
{
  id: string;
  favicon: string;
  forCustomIconName?: string;
}

/**
 * The subset of PinnedSitesManager the sidebar can call.
 *
 * Every mutation names the pins it touches instead of handing over a whole
 * replacement list (the one exception being replaceAll, where replacing
 * everything IS the intent). That is what keeps background's favicon patching
 * and the sidebar's CRUD from overwriting each other: two writers now only
 * collide when they change the same pin, rather than every time they overlap
 * in time. See docs/decisions/2026-07-30-shared-storage-multiple-writers.md,
 * Case 2.
 *
 * Every method returns the resulting list, which becomes the ack payload the
 * proxy uses to resync once its in-flight writes drain.
 */
export interface PinnedSitesApi
{
  getPinnedSites(): PinnedSite[];
  addPins(pins: PinnedSite[], atIndex?: number): PinnedSite[];
  removePins(ids: string[]): PinnedSite[];
  insertPins(placements: PinnedSitePlacement[]): PinnedSite[];
  updatePin(id: string, edit: PinnedSiteEdit): PinnedSite[];
  resetFavicon(id: string, favicon?: string): PinnedSite[];
  movePin(activeId: string, overId: string, position: PinnedSiteDropPosition): PinnedSite[];
  duplicatePin(id: string, newId: string, overrides?: PinnedSiteDuplicateOverrides): PinnedSite[];
  replaceAll(sites: PinnedSite[]): PinnedSite[];
  setFavicons(patches: PinnedSiteFaviconPatch[]): PinnedSite[];
}

/**
 * Broadcast to every listening context when the pinned site list changes - a
 * manager -> everyone message, rather than a reply to one caller.
 *
 * It lives here with the rest of this manager's contract so the 'changed'
 * method name is spelled exactly once. A typo in a second hand-written copy
 * would silently stop all cross-window sync with no compile error.
 */
export const PINNED_SITES_CHANGED = makeManagerActionId(ManagerId.PINNED_SITES, 'changed');

// =============================================================================
// Pure list transforms
//
// Each mutation in PinnedSitesApi has its transform here, and both sides call
// it: the manager to change the authoritative list, the proxy to apply the
// same change to its mirror optimistically. One implementation, so an
// optimistic write can't disagree with what background ends up storing.
//
// All of them take a readonly list and return a new one - nothing is mutated
// in place, since the input is the live array behind a store or the manager's
// own state.
// =============================================================================

/** Inserts pins at `atIndex`, or appends them when it is out of range. */
export function applyAddPins(
  sites: readonly PinnedSite[],
  pins: PinnedSite[],
  atIndex?: number
): PinnedSite[]
{
  if (atIndex !== undefined && atIndex >= 0 && atIndex < sites.length)
  {
    return [...sites.slice(0, atIndex), ...pins, ...sites.slice(atIndex)];
  }
  return [...sites, ...pins];
}

/** Drops every pin whose id is listed. Unknown ids are ignored. */
export function applyRemovePins(sites: readonly PinnedSite[], ids: string[]): PinnedSite[]
{
  const idSet = new Set(ids);
  return sites.filter(site => !idSet.has(site.id));
}

/**
 * Puts previously removed pins back where they were. Placements are applied
 * in ascending index order, so each splice sees the list the earlier ones
 * already grew - the same order the deletion snapshot recorded them in.
 */
export function applyInsertPins(
  sites: readonly PinnedSite[],
  placements: PinnedSitePlacement[]
): PinnedSite[]
{
  const next = [...sites];
  const sorted = [...placements].sort((a, b) => a.index - b.index);
  for (const placement of sorted)
  {
    next.splice(Math.min(placement.index, next.length), 0, placement.pin);
  }
  return next;
}

/** Applies an edit to one pin, leaving every other pin untouched. */
export function applyUpdatePin(
  sites: readonly PinnedSite[],
  id: string,
  edit: PinnedSiteEdit
): PinnedSite[]
{
  return sites.map(site =>
    site.id === id
      ? {
          ...site,
          title: edit.title,
          url: edit.url,
          ...(edit.favicon !== undefined && { favicon: edit.favicon }),
          // emoji and customIconName are mutually exclusive
          customIconName: edit.emoji ? undefined : edit.customIconName,
          iconColor: edit.emoji ? undefined : (edit.customIconName ? edit.iconColor : undefined),
          emoji: edit.customIconName ? undefined : edit.emoji,
        }
      : site
  );
}

/**
 * Puts one pin back on the site's own favicon, dropping whatever custom icon
 * or emoji it carried. An undefined favicon is stored as-is: Chrome had
 * nothing cached for the site, and the pin falls back to its letter tile.
 */
export function applyResetFavicon(
  sites: readonly PinnedSite[],
  id: string,
  favicon?: string
): PinnedSite[]
{
  return sites.map(site =>
    site.id === id
      ? { ...site, favicon, customIconName: undefined, iconColor: undefined, emoji: undefined }
      : site
  );
}

/**
 * Moves one pin next to another. Returns the list unchanged when either id is
 * unknown or the move is a no-op, so the caller doesn't have to pre-check.
 */
export function applyMovePin(
  sites: readonly PinnedSite[],
  activeId: string,
  overId: string,
  position: PinnedSiteDropPosition
): PinnedSite[]
{
  const oldIndex = sites.findIndex(s => s.id === activeId);
  const overIndex = sites.findIndex(s => s.id === overId);
  if (oldIndex === -1 || overIndex === -1 || oldIndex === overIndex) return [...sites];

  // Target position in the original array
  let targetIndex = position === 'after' ? overIndex + 1 : overIndex;

  // Adjust for the removal: moving from before the target means the target
  // shifts down by one once the pin is taken out
  if (oldIndex < targetIndex)
  {
    targetIndex -= 1;
  }

  if (oldIndex === targetIndex) return [...sites];

  const next = [...sites];
  const [removed] = next.splice(oldIndex, 1);
  next.splice(targetIndex, 0, removed);
  return next;
}

/**
 * Copies one pin in just after itself, under a caller-supplied id.
 *
 * The overrides come from the pin's live tab, which may have navigated away
 * from the pinned URL. The favicon override only applies to a pin that
 * actually shows a favicon - a custom icon or emoji is the user's explicit
 * choice and survives duplication.
 */
export function applyDuplicatePin(
  sites: readonly PinnedSite[],
  id: string,
  newId: string,
  overrides: PinnedSiteDuplicateOverrides = {}
): PinnedSite[]
{
  const index = sites.findIndex(s => s.id === id);
  if (index === -1) return [...sites];

  const original = sites[index];
  const duplicate: PinnedSite = {
    ...original,
    id: newId,
    url: overrides.url || original.url,
    title: overrides.title || original.title,
  };

  if (!original.customIconName && !original.emoji && overrides.favicon)
  {
    duplicate.favicon = overrides.favicon;
  }

  const next = [...sites];
  next.splice(index + 1, 0, duplicate);
  return next;
}

/**
 * Stores resolved icons on the pins that still want them.
 *
 * Eligibility is re-checked here rather than trusted from the caller, because
 * every caller resolves icons asynchronously: in the time a fetch took, the
 * user can have given the pin an emoji or a different custom icon, or another
 * context can have resolved its favicon already. A pin that no longer matches
 * what the patch was resolved for keeps what it has. See
 * PinnedSiteFaviconPatch for the two kinds.
 */
export function applySetFavicons(
  sites: readonly PinnedSite[],
  patches: PinnedSiteFaviconPatch[]
): PinnedSite[]
{
  const byId = new Map(patches.map(patch => [patch.id, patch]));

  return sites.map(site =>
  {
    const patch = byId.get(site.id);
    if (!patch) return site;

    // Already showing something, or waiting on an emoji - either way this
    // patch is stale.
    if (site.favicon || site.emoji) return site;

    const wanted = patch.forCustomIconName
      ? site.customIconName === patch.forCustomIconName
      : !site.customIconName;
    if (!wanted) return site;

    return { ...site, favicon: patch.favicon };
  });
}
