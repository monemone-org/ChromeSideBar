// Sidebar-side client for background.ts's PinnedSitesManager.
//
// Same shape as spaceManagerProxy, with pinned sites having a writer the
// Space list doesn't: background patches favicons on its own.
//
// Mutations are per-operation, not "here is the whole new list". The manager
// applies each one to its own authoritative list, so a reorder sent from here
// can't wipe out a favicon background added a moment ago. Optimistic writes
// call the very same transform from shared/pinnedSitesApi that the manager
// will, so the mirror and the stored list agree.
//
// Every broadcast is applied, our own echo included - each one carries the
// manager's whole resulting list, so the latest to arrive is the truth. A
// foreign broadcast landing while one of our writes is in flight can briefly
// show the list without our change, until our own echo arrives a moment later
// and puts it back.

import { ManagerId, callManager, subscribeToBroadcast, Remote } from './messageRouting';
import {
  PinnedSite,
  PinnedSiteDropPosition,
  PinnedSiteDuplicateOverrides,
  PinnedSiteEdit,
  PinnedSiteFaviconPatch,
  PinnedSitePlacement,
  PinnedSitesApi,
  PINNED_SITES_CHANGED,
  applyAddPins,
  applyDuplicatePin,
  applyInsertPins,
  applyMovePin,
  applyRemovePins,
  applyResetFavicon,
  applySetFavicons,
  applyUpdatePin,
} from '../shared/pinnedSitesApi';
import { MirrorStore, ReadableStore } from '../../stores/mirrorStore';

/**
 * Extends the plain Remote<Api> shape with the pieces this manager has no
 * equivalent for: the local mirror, and the load() entry point that fills it.
 */
class PinnedSitesManagerProxy implements Remote<PinnedSitesApi>
{
  // This context's mirror of the pinned site list. Private so every write
  // goes through this proxy; consumers read it via the store or snapshot
  // getter.
  #mirror = new MirrorStore<readonly PinnedSite[]>([]);

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<readonly PinnedSite[]>
  {
    return this.#mirror.store;
  }

  /**
   * The pinned site list as this context sees it.
   *
   * Every mutation below applies its change here before the message goes
   * out, so a caller reading this on the next line sees its own write -
   * PinnedBar's drag handling and the fixtures depend on that.
   *
   * Returned readonly on purpose: this is the live array behind the mirror,
   * not a copy. Callers ask for a change through one of the mutations below,
   * which is the only supported way to modify this state.
   */
  get snapshot(): readonly PinnedSite[]
  {
    return this.#mirror.snapshot;
  }

  /**
   * Subscribes to the manager's broadcasts and fills the store with the
   * current list. The mirror-and-subscribe entry point, called by
   * usePinnedSites at mount.
   *
   * Safe to call more than once: React StrictMode double-invokes the mount
   * effect in dev, and subscribeToBroadcast ignores the second registration.
   */
  async load(): Promise<PinnedSite[]>
  {
    subscribeToBroadcast(PINNED_SITES_CHANGED, (message) =>
    {
      this.#mirror.set(message.sites as PinnedSite[]);
    });

    const sites = await this.getPinnedSites();
    this.#mirror.set(sites);
    return sites;
  }

  /**
   * Plain read - does NOT touch the mirror. Used by load() and the failure
   * resync, and by contexts that keep no mirror at all (the unit test in
   * tests/deletePinnedSiteActionTest.ts).
   */
  async getPinnedSites(): Promise<PinnedSite[]>
  {
    return await callManager<PinnedSite[]>(ManagerId.PINNED_SITES, 'getPinnedSites');
  }

  /**
   * Sends one mutation whose optimistic change is already on the mirror.
   *
   * The ack is NOT applied to the mirror: the broadcast the same change
   * causes does that, in order with every other broadcast. The promise still
   * resolves with the manager's reply, for callers that need the write to
   * have actually landed.
   */
  async #send(method: string, payload: Record<string, unknown>): Promise<PinnedSite[]>
  {
    try
    {
      return await callManager<PinnedSite[]>(ManagerId.PINNED_SITES, method, payload);
    }
    catch (error)
    {
      // The optimistic write is now showing a change that never happened.
      // Ask background what the truth is rather than rolling back to a
      // remembered list, which could undo a LATER write that did succeed. A
      // failed resync means the worker is gone and this page is about to be
      // torn down anyway, so there is nothing further to do.
      console.error(`[pinnedSitesManagerProxy] ${method} failed, resyncing:`, error);
      this.getPinnedSites()
        .then((current) => this.#mirror.set(current))
        .catch(() => {});
      throw error;
    }
  }

  async addPins(pins: PinnedSite[], atIndex?: number): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyAddPins(this.#mirror.snapshot, pins, atIndex));
    return this.#send('addPins', { pins, atIndex });
  }

  async removePins(ids: string[]): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyRemovePins(this.#mirror.snapshot, ids));
    return this.#send('removePins', { ids });
  }

  async insertPins(placements: PinnedSitePlacement[]): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyInsertPins(this.#mirror.snapshot, placements));
    return this.#send('insertPins', { placements });
  }

  async updatePin(id: string, edit: PinnedSiteEdit): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyUpdatePin(this.#mirror.snapshot, id, edit));
    return this.#send('updatePin', { id, edit });
  }

  async resetFavicon(id: string, favicon?: string): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyResetFavicon(this.#mirror.snapshot, id, favicon));
    return this.#send('resetFavicon', { id, favicon });
  }

  async movePin(
    activeId: string,
    overId: string,
    position: PinnedSiteDropPosition
  ): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyMovePin(this.#mirror.snapshot, activeId, overId, position));
    return this.#send('movePin', { activeId, overId, position });
  }

  async duplicatePin(
    id: string,
    newId: string,
    overrides?: PinnedSiteDuplicateOverrides
  ): Promise<PinnedSite[]>
  {
    this.#mirror.set(applyDuplicatePin(this.#mirror.snapshot, id, newId, overrides));
    return this.#send('duplicatePin', { id, newId, overrides });
  }

  async replaceAll(sites: PinnedSite[]): Promise<PinnedSite[]>
  {
    this.#mirror.set(sites);
    return this.#send('replaceAll', { sites });
  }

  async setFavicons(patches: PinnedSiteFaviconPatch[]): Promise<PinnedSite[]>
  {
    this.#mirror.set(applySetFavicons(this.#mirror.snapshot, patches));
    return this.#send('setFavicons', { patches });
  }
}

export const pinnedSitesManagerProxy = new PinnedSitesManagerProxy();
