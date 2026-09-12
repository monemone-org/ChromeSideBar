// The wire contract for SpaceManager, owned by neither side.
//
// impl/spaceManager.ts implements SpaceManagerApi;
// proxies/spaceManagerProxy.ts implements Remote<SpaceManagerApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.

import { ManagerId, makeManagerActionId } from '../proxies/messageRouting';
import { Space } from '../../utils/spaceMessages';

/**
 * The subset of SpaceManager the sidebar can call.
 */
export interface SpaceManagerApi
{
  getSpaces(): Space[];
  /**
   * Returns the resulting list, which becomes the ack payload. Async because
   * the manager may need to resolve missing bookmarkFolderSegments (a fresh
   * chrome.bookmarks.getTree() walk) before it can say what the result is -
   * see impl/spaceManager.ts's resolveMissingSegments.
   */
  updateSpaces(spaces: Space[]): Promise<Space[]>;
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
