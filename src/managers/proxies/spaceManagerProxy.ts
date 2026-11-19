// Sidebar-side client for background.ts's SpaceManager.
//
// Same shape as spaceWindowStateProxy (step 2), minus the per-window
// filtering: the Space list is not scoped to a window, so there is exactly
// one mirror per context instead of one per mirrored window.
//
// Mutations are per-operation, the same way pinnedSitesManagerProxy's are:
// each one names the Space it touches and applies the same pure transform
// from shared/spaceManagerApi that the manager will, so the mirror shows the
// outcome immediately and cannot disagree with what background stores. No
// caller rebuilds the whole list from this mirror and sends it back, which is
// what makes it safe to apply every broadcast, our own echo included - see
// docs/decisions/2026-07-30-shared-storage-multiple-writers progress/step-6a-per-operation-writes-and-simple-mirrors.md.

import { ManagerId, callManager, subscribeToBroadcast, Remote } from './messageRouting';
import {
  SpaceEdit,
  SpaceFolderPathUpdate,
  SpaceManagerApi,
  SPACES_CHANGED,
  applyAddSpace,
  applyAddSpaces,
  applyMoveSpace,
  applyRemoveSpace,
  applyUpdateSpace,
  applyUpdateSpaceFolderPaths,
} from '../shared/spaceManagerApi';
import { MirrorStore, ReadableStore } from '../../stores/mirrorStore';
import { Space } from '../../utils/spaceMessages';

/**
 * Extends the plain Remote<Api> shape with the pieces this manager has no
 * equivalent for: the local mirror, and the load() entry point that fills it.
 */
class SpaceManagerProxy implements Remote<SpaceManagerApi>
{
  // This context's mirror of the Space list. Private so every write goes
  // through this proxy; consumers read it via the store or snapshot getter.
  #mirror = new MirrorStore<readonly Space[]>([]);

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<readonly Space[]>
  {
    return this.#mirror.store;
  }

  /**
   * The current Space list as this context sees it.
   *
   * Returned readonly on purpose. This is the live array behind the mirror,
   * not a copy, so pushing or splicing it would change what every subscriber
   * sees WITHOUT notifying any of them - the store only fires listeners from
   * set(). Callers ask for a change through one of the mutations below, which
   * is the only supported way to change this state.
   */
  get snapshot(): readonly Space[]
  {
    return this.#mirror.snapshot;
  }

  /**
   * Subscribes to the manager's broadcasts and fills the store with the
   * current Space list. The mirror-and-subscribe entry point, the analogue
   * of mirrorWindow() - called by the sidebar at mount. SpaceNavigatorApp
   * does NOT call this - it's a short-lived popup that only calls
   * getSpaces() and uses the return value directly, so it needs no mirror
   * and pays for no listener.
   *
   * Safe to call more than once: React StrictMode double-invokes the mount
   * effect in dev, and subscribeToBroadcast ignores the second registration.
   *
   * Every broadcast is applied, including the echo of our own writes. That
   * is also how an import's segment self-heal reaches this mirror: the
   * manager may store an imported Space with bookmarkFolderSegments filled
   * in that this context's optimistic write didn't have, and the broadcast
   * carrying it differs from the mirror, so it lands like any other.
   */
  async load(): Promise<Space[]>
  {
    subscribeToBroadcast(SPACES_CHANGED, (message) =>
    {
      this.#mirror.set(message.spaces as Space[]);
    });

    const spaces = await this.getSpaces();
    this.#mirror.set(spaces);
    return spaces;
  }

  /**
   * Plain read - does NOT touch the mirror. This is what SpaceNavigatorApp
   * and the failure resync use, since the first keeps no mirror and the
   * second must not trust it.
   */
  async getSpaces(): Promise<Space[]>
  {
    return await callManager<Space[]>(ManagerId.SPACES, 'getSpaces');
  }

  /**
   * Sends one mutation whose optimistic change is already on the mirror.
   *
   * The ack is NOT applied to the mirror: the broadcast the same change
   * causes does that, in order with every other broadcast. The promise still
   * resolves with the manager's reply, for callers that need the write to
   * have actually landed - DeleteSpaceAction and the import paths wait on it.
   */
  async #send(method: string, payload: Record<string, unknown>): Promise<Space[]>
  {
    try
    {
      return await callManager<Space[]>(ManagerId.SPACES, method, payload);
    }
    catch (error)
    {
      // The optimistic write is now showing a change that never happened.
      // Ask background what the truth is rather than rolling back to a
      // remembered list, which could undo a LATER write that did succeed. A
      // failed resync means the worker is gone and this page is about to be
      // torn down anyway, so there is nothing further to do.
      console.error(`[spaceManagerProxy] ${method} failed, resyncing:`, error);
      this.getSpaces()
        .then((current) => this.#mirror.set(current))
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Adds one Space, at `atIndex` when given. The mirror is updated before
   * the message goes out, so SpacesContext.createSpace can hand the new
   * Space back to its caller immediately and a read on the next line sees it.
   */
  async addSpace(space: Space, atIndex?: number): Promise<Space[]>
  {
    this.#mirror.set(applyAddSpace(this.#mirror.snapshot, space, atIndex));
    return this.#send('addSpace', { space, atIndex });
  }

  /**
   * Appends imported Spaces. The optimistic write shows them as sent; any
   * segments the manager resolves arrive with the broadcast.
   */
  async addSpaces(spaces: Space[]): Promise<Space[]>
  {
    this.#mirror.set(applyAddSpaces(this.#mirror.snapshot, spaces));
    return this.#send('addSpaces', { spaces });
  }

  async updateSpace(id: string, edit: SpaceEdit): Promise<Space[]>
  {
    this.#mirror.set(applyUpdateSpace(this.#mirror.snapshot, id, edit));
    return this.#send('updateSpace', { id, edit });
  }

  async updateSpaceFolderPaths(updates: SpaceFolderPathUpdate[]): Promise<Space[]>
  {
    this.#mirror.set(applyUpdateSpaceFolderPaths(this.#mirror.snapshot, updates));
    return this.#send('updateSpaceFolderPaths', { updates });
  }

  async removeSpace(id: string): Promise<Space[]>
  {
    this.#mirror.set(applyRemoveSpace(this.#mirror.snapshot, id));
    return this.#send('removeSpace', { id });
  }

  async moveSpace(activeId: string, overId: string): Promise<Space[]>
  {
    this.#mirror.set(applyMoveSpace(this.#mirror.snapshot, activeId, overId));
    return this.#send('moveSpace', { activeId, overId });
  }

  /**
   * Replaces the whole list from an import. The optimistic write shows it as
   * sent; any segments the manager resolves arrive with the broadcast.
   */
  async replaceAll(spaces: Space[]): Promise<Space[]>
  {
    this.#mirror.set(spaces);
    return this.#send('replaceAll', { spaces });
  }
}

export const spaceManagerProxy = new SpaceManagerProxy();
