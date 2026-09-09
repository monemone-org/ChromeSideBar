// The wire contract for SpaceWindowStateManager, owned by neither side.
//
// impl/spaceWindowStateManager.ts implements SpaceWindowStateApi;
// proxies/spaceWindowStateProxy.ts implements Remote<SpaceWindowStateApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.

import { ManagerId, makeManagerActionId } from '../proxies/messageRouting';
import { SpaceWindowState } from '../../utils/spaceMessages';

/**
 * The subset of SpaceWindowStateManager the sidebar can call.
 */
export interface SpaceWindowStateApi
{
  getState(windowId: number): SpaceWindowState;
  /** Returns the resulting state, which becomes the ack payload. */
  setActiveSpace(windowId: number, spaceId: string): SpaceWindowState;
}

/**
 * Broadcast to every listening context when a window's state changes - a
 * manager -> everyone message, rather than a reply to one caller.
 *
 * It lives here with the rest of this manager's contract so the 'changed'
 * method name is spelled exactly once. A typo in a second hand-written copy
 * would silently stop all cross-window sync with no compile error.
 */
export const SPACE_WINDOW_STATE_CHANGED = makeManagerActionId(ManagerId.SPACE_WINDOW_STATE, 'changed');
