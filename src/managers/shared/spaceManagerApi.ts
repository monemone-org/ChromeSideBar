// The wire contract for SpaceManager, owned by neither side.
//
// impl/spaceManager.ts implements SpaceManagerApi;
// proxies/spaceManagerProxy.ts implements Remote<SpaceManagerApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.

import { ManagerId, makeManagerActionId } from '../proxies/messageRouting';
import { Space } from '../../utils/spaceMessages';

/**
 * The fields of one Space being edited. Merged over the stored Space as a
 * plain partial: whatever is absent here is left alone. Space has no
 * mutually-exclusive fields the way a pinned site's icon fields are, so there
 * is nothing to clear as a set.
 */
export type SpaceEdit = Partial<Omit<Space, 'id'>>;

/** The new bookmark folder location of one Space, e.g. after a folder rename. */
export interface SpaceFolderPathUpdate
{
  id: string;
  bookmarkFolderPath: string;
  bookmarkFolderSegments: string[];
}

/**
 * The subset of SpaceManager the sidebar can call.
 *
 * Every mutation names the change it wants instead of handing over a whole
 * replacement list (the one exception being replaceAll, where replacing
 * everything IS the intent). Two contexts writing at the same moment then
 * only collide when they touch the same Space, rather than whichever write
 * lands last winning outright. See
 * docs/decisions/2026-07-30-shared-storage-multiple-writers.md.
 *
 * Every mutation returns the resulting list, which becomes the ack payload.
 */
export interface SpaceManagerApi
{
  getSpaces(): Space[];

  /** Inserts one Space at `atIndex`, or appends it when absent or out of range. */
  addSpace(space: Space, atIndex?: number): Space[];

  /**
   * Appends Spaces from an import. Async because an imported Space may
   * carry bookmarkFolderPath without bookmarkFolderSegments, and the manager
   * resolves those (a fresh chrome.bookmarks.getTree() walk) before storing -
   * see impl/spaceManager.ts's resolveMissingSegments.
   */
  addSpaces(spaces: Space[]): Promise<Space[]>;

  updateSpace(id: string, edit: SpaceEdit): Space[];
  updateSpaceFolderPaths(updates: SpaceFolderPathUpdate[]): Space[];
  removeSpace(id: string): Space[];
  moveSpace(activeId: string, overId: string): Space[];

  /** Replaces the whole list from an import. Async for the same reason as addSpaces. */
  replaceAll(spaces: Space[]): Promise<Space[]>;
}

/**
 * Broadcast to every listening context when the Space list changes - a
 * manager -> everyone message, rather than a reply to one caller.
 *
 * It lives here with the rest of this manager's contract so the 'changed'
 * method name is spelled exactly once. A typo in a second hand-written copy
 * would silently stop all cross-window sync with no compile error.
 */
export const SPACES_CHANGED = makeManagerActionId(ManagerId.SPACES, 'changed');

// =============================================================================
// Pure list transforms
//
// Each synchronous mutation in SpaceManagerApi has its transform here, and
// both sides call it: the manager to change the authoritative list, the proxy
// to apply the same change to its mirror optimistically. One implementation,
// so an optimistic write can't disagree with what background ends up storing.
//
// All of them take a readonly list and return a new one - nothing is mutated
// in place, since the input is the live array behind a store or the manager's
// own state.
// =============================================================================

/** Inserts Spaces at `atIndex`, or appends them when it is absent or out of range. */
export function applyAddSpaces(
  spaces: readonly Space[],
  added: Space[],
  atIndex?: number
): Space[]
{
  if (atIndex !== undefined && atIndex >= 0 && atIndex < spaces.length)
  {
    return [...spaces.slice(0, atIndex), ...added, ...spaces.slice(atIndex)];
  }
  return [...spaces, ...added];
}

/** Inserts one Space at `atIndex`, or appends it when it is absent or out of range. */
export function applyAddSpace(
  spaces: readonly Space[],
  space: Space,
  atIndex?: number
): Space[]
{
  return applyAddSpaces(spaces, [space], atIndex);
}

/** Merges an edit into one Space, leaving every other Space untouched. */
export function applyUpdateSpace(
  spaces: readonly Space[],
  id: string,
  edit: SpaceEdit
): Space[]
{
  return spaces.map(space => space.id === id ? { ...space, ...edit } : space);
}

/** Moves each listed Space to its new bookmark folder. Unknown ids are ignored. */
export function applyUpdateSpaceFolderPaths(
  spaces: readonly Space[],
  updates: SpaceFolderPathUpdate[]
): Space[]
{
  const byId = new Map(updates.map(update => [update.id, update]));

  return spaces.map(space =>
  {
    const update = byId.get(space.id);
    return update
      ? { ...space, bookmarkFolderPath: update.bookmarkFolderPath, bookmarkFolderSegments: update.bookmarkFolderSegments }
      : space;
  });
}

/** Drops one Space. An unknown id leaves the list as it was. */
export function applyRemoveSpace(spaces: readonly Space[], id: string): Space[]
{
  return spaces.filter(space => space.id !== id);
}

/**
 * Moves one Space into the position another one holds. Returns the list
 * unchanged when either id is unknown or the move is a no-op, so the caller
 * doesn't have to pre-check.
 */
export function applyMoveSpace(
  spaces: readonly Space[],
  activeId: string,
  overId: string
): Space[]
{
  const oldIndex = spaces.findIndex(s => s.id === activeId);
  const newIndex = spaces.findIndex(s => s.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return [...spaces];

  const next = [...spaces];
  const [removed] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, removed);
  return next;
}
