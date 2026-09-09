import { useSyncExternalStore } from 'react';
import { spaceWindowStateProxy } from '../managers/proxies/spaceWindowStateProxy';
import { SpaceWindowState } from '../utils/spaceMessages';

/**
 * Reads the current window's SpaceWindowState from spaceWindowStateProxy's
 * mirror. Re-renders on both this window's own writes (applied
 * optimistically, then confirmed by the ack) and the manager's "changed"
 * broadcasts for this window.
 */
export function useSpaceWindowState(): SpaceWindowState
{
  return useSyncExternalStore(
    spaceWindowStateProxy.store.subscribe,
    spaceWindowStateProxy.store.getSnapshot
  );
}
