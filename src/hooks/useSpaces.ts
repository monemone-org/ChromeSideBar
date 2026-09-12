import { useSyncExternalStore } from 'react';
import { spaceManagerProxy } from '../managers/proxies/spaceManagerProxy';
import { Space } from '../utils/spaceMessages';

/**
 * Reads the current Space list from spaceManagerProxy's mirror. Re-renders on
 * this context's own writes, which are applied optimistically before the
 * message goes out, and on the manager's "changed" broadcasts from OTHER
 * contexts. Our own broadcast echo is skipped - see CONTEXT_ID in
 * proxies/messageRouting.ts.
 *
 * The list is readonly because it is the live array behind the mirror, not a
 * copy. Change it through the SpacesContext mutators, never in place.
 */
export function useSpaces(): readonly Space[]
{
  return useSyncExternalStore(
    spaceManagerProxy.store.subscribe,
    spaceManagerProxy.store.getSnapshot
  );
}
