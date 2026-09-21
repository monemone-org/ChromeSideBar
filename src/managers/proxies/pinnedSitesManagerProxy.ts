// Sidebar-side client for background.ts's PinnedSitesManager.
//
// Same shape as spaceManagerProxy (step 3), with two differences that come
// from pinned sites having a writer the Space list doesn't: background patches
// favicons on its own.
//
// 1. Mutations are per-operation, not "here is the whole new list". The
//    manager applies each one to its own authoritative list, so a reorder sent
//    from here can't wipe out a favicon background added a moment ago.
//    Optimistic writes call the very same transform from shared/pinnedSitesApi
//    that the manager will, so the mirror and the stored list agree.
//
// 2. Broadcasts that arrive while this context has writes in flight are held
//    rather than applied - see #onBroadcast.

import { ManagerId, callManager, CONTEXT_ID, Remote } from './messageRouting';
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
import { ExternalStore, ReadableStore } from '../../stores/externalStore';

/**
 * Extends the plain Remote<Api> shape with the pieces this manager has no
 * equivalent for: the local mirror, and the load() entry point that fills it.
 */
class PinnedSitesManagerProxy implements Remote<PinnedSitesApi>
{
  // This context's mirror of the pinned site list. Private so every write
  // goes through #applySites; consumers read it via the store or the snapshot
  // getter.
  #store = new ExternalStore<readonly PinnedSite[]>([]);

  // Whether the broadcast listener is already registered - see
  // #subscribeToBroadcasts.
  #subscribed = false;

  // How many of this context's mutations are waiting for their ack. Used to
  // decide whether an incoming broadcast is safe to apply - see #onBroadcast.
  #pendingWrites = 0;

  // Whether a broadcast was dropped while #pendingWrites was above zero, so
  // the drain knows it has to re-read instead of trusting its own ack.
  #missedBroadcast = false;

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<readonly PinnedSite[]>
  {
    return this.#store;
  }

  /**
   * The pinned site list as this context sees it.
   *
   * Returned readonly on purpose: this is the live array behind the mirror,
   * not a copy, so splicing it would change what every subscriber sees
   * WITHOUT notifying any of them - the store only fires listeners from
   * set(). Callers ask for a change through one of the mutations below, which
   * is the only supported way to modify this state.
   */
  get snapshot(): readonly PinnedSite[]
  {
    return this.#store.getSnapshot();
  }

  /**
   * Subscribes to the manager's broadcasts and fills the store with the
   * current list. The mirror-and-subscribe entry point, called by
   * usePinnedSites at mount.
   *
   * Safe to call more than once: React StrictMode double-invokes the mount
   * effect in dev, and re-loading must not stack listeners.
   */
  async load(): Promise<PinnedSite[]>
  {
    this.#subscribeToBroadcasts();
    const sites = await this.getPinnedSites();
    this.#applySites(sites);
    return sites;
  }

  /**
   * Subscribes to the manager's "changed" broadcasts, at most once for the
   * life of this context. Deliberately never unsubscribed - the proxy is a
   * module singleton that outlives every component that loads through it.
   */
  #subscribeToBroadcasts(): void
  {
    if (this.#subscribed) return;
    this.#subscribed = true;

    chrome.runtime.onMessage.addListener((message) =>
    {
      if (message?.action === PINNED_SITES_CHANGED)
      {
        this.#onBroadcast(message.sites as PinnedSite[], message.senderId as string | undefined);
      }
    });
  }

  /**
   * Decides what to do with one incoming "the list changed" broadcast.
   *
   * Our own echo is always dropped: it describes the list at the time our
   * message was handled, which a newer local write may already have moved
   * past. See CONTEXT_ID in messageRouting.ts for the worked example.
   *
   * Someone else's broadcast (another window, or background's favicon
   * patching) is news - but only safe to apply when nothing of ours is in
   * flight. Otherwise it describes a list background built BEFORE it saw our
   * pending change, and applying it would undo that change in this window
   * only:
   *
   *   mirror [A B C D]
   *   user unpins D        mirror [A B C], removePins([D]) sent
   *   background patches B's favicon and broadcasts [A B* C D]
   *     -> applied, D is back on screen
   *   background handles the remove, broadcasts [A B* C] with OUR senderId
   *     -> dropped as our own echo
   *   D stays on screen until some unrelated later broadcast
   *
   * So it is dropped and the fact recorded; #mutate resyncs once the last
   * in-flight write returns.
   */
  #onBroadcast(sites: PinnedSite[], senderId: string | undefined): void
  {
    if (senderId === CONTEXT_ID) return;

    if (this.#pendingWrites > 0)
    {
      this.#missedBroadcast = true;
      return;
    }

    this.#applySites(sites);
  }

  /**
   * The single writer of the mirror. Skips a list equal to the one already
   * held, so a no-op write doesn't re-render every consumer.
   *
   * The JSON comparison is deliberate and scoped to this use: these are
   * short, flat, JSON-derived objects that just came off the message channel.
   * It is not a general deep-equality utility.
   */
  #applySites(sites: readonly PinnedSite[]): void
  {
    if (JSON.stringify(sites) === JSON.stringify(this.#store.getSnapshot())) return;

    this.#store.set(sites);
  }

  /**
   * Runs one mutation: apply it to the mirror now, then ask background to
   * apply it to the real list.
   *
   * `optimistic` is the same pure transform the manager will run, so the
   * mirror shows the outcome immediately and a caller reading snapshot on the
   * next line sees its own write - PinnedBar's drag handling and the
   * fixtures depend on that. The ack is NOT applied on top of it in the
   * normal case: we already know the result, and a reply that a newer write
   * has superseded would only move the mirror backwards.
   *
   * The exception is the drain. If a foreign broadcast was dropped while our
   * writes were in flight (see #onBroadcast), the mirror is missing whatever
   * that broadcast carried, and our own ack may not include it either -
   * background could have sent the reply before that other change landed.
   * So the last write out re-reads the list rather than guessing.
   */
  async #mutate(
    method: string,
    payload: Record<string, unknown>,
    optimistic: (sites: readonly PinnedSite[]) => PinnedSite[]
  ): Promise<PinnedSite[]>
  {
    this.#applySites(optimistic(this.snapshot));
    this.#pendingWrites++;

    try
    {
      const result = await callManager<PinnedSite[]>(ManagerId.PINNED_SITES, method, payload);
      this.#pendingWrites--;
      await this.#drain(result);
      return result;
    }
    catch (error)
    {
      // The optimistic write above is now showing a change that never
      // happened. Ask background what the truth is rather than rolling back
      // to a remembered list, which could undo a LATER write that did
      // succeed. A failed resync means the worker is gone and this page is
      // about to be torn down anyway, so there is nothing further to do.
      this.#pendingWrites--;
      console.error(`[pinnedSitesManagerProxy] ${method} failed, resyncing:`, error);
      this.getPinnedSites()
        .then((current) => { if (this.#pendingWrites === 0) this.#applySites(current); })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Called as each write returns. Does nothing while other writes of ours are
   * still out - the last one to come back is the one that can safely settle
   * the mirror.
   */
  async #drain(ack: PinnedSite[]): Promise<void>
  {
    if (this.#pendingWrites > 0) return;

    if (!this.#missedBroadcast)
    {
      // Nothing was dropped, so the mirror already holds what this ack says.
      return;
    }

    this.#missedBroadcast = false;

    try
    {
      const current = await this.getPinnedSites();

      // A write started while the re-read was in flight, and its optimistic
      // write is newer than what came back. Leave the mirror to that write's
      // own drain.
      if (this.#pendingWrites > 0) return;

      this.#applySites(current);
    }
    catch
    {
      // Re-reading failed, so fall back to the ack. It is at worst missing
      // the change we know we dropped, which the next broadcast will bring.
      if (this.#pendingWrites === 0) this.#applySites(ack);
    }
  }

  /**
   * Plain read - does NOT touch the mirror. Used by load() and the drain, and
   * by contexts that keep no mirror at all (the unit test in
   * tests/deletePinnedSiteActionTest.ts).
   */
  async getPinnedSites(): Promise<PinnedSite[]>
  {
    return await callManager<PinnedSite[]>(ManagerId.PINNED_SITES, 'getPinnedSites');
  }

  async addPins(pins: PinnedSite[], atIndex?: number): Promise<PinnedSite[]>
  {
    return this.#mutate('addPins', { pins, atIndex }, sites => applyAddPins(sites, pins, atIndex));
  }

  async removePins(ids: string[]): Promise<PinnedSite[]>
  {
    return this.#mutate('removePins', { ids }, sites => applyRemovePins(sites, ids));
  }

  async insertPins(placements: PinnedSitePlacement[]): Promise<PinnedSite[]>
  {
    return this.#mutate('insertPins', { placements }, sites => applyInsertPins(sites, placements));
  }

  async updatePin(id: string, edit: PinnedSiteEdit): Promise<PinnedSite[]>
  {
    return this.#mutate('updatePin', { id, edit }, sites => applyUpdatePin(sites, id, edit));
  }

  async resetFavicon(id: string, favicon?: string): Promise<PinnedSite[]>
  {
    return this.#mutate('resetFavicon', { id, favicon }, sites => applyResetFavicon(sites, id, favicon));
  }

  async movePin(
    activeId: string,
    overId: string,
    position: PinnedSiteDropPosition
  ): Promise<PinnedSite[]>
  {
    return this.#mutate(
      'movePin',
      { activeId, overId, position },
      sites => applyMovePin(sites, activeId, overId, position)
    );
  }

  async duplicatePin(
    id: string,
    newId: string,
    overrides?: PinnedSiteDuplicateOverrides
  ): Promise<PinnedSite[]>
  {
    return this.#mutate(
      'duplicatePin',
      { id, newId, overrides },
      sites => applyDuplicatePin(sites, id, newId, overrides)
    );
  }

  async replaceAll(sites: PinnedSite[]): Promise<PinnedSite[]>
  {
    return this.#mutate('replaceAll', { sites }, () => sites);
  }

  async setFavicons(patches: PinnedSiteFaviconPatch[]): Promise<PinnedSite[]>
  {
    return this.#mutate('setFavicons', { patches }, sites => applySetFavicons(sites, patches));
  }
}

export const pinnedSitesManagerProxy = new PinnedSitesManagerProxy();
