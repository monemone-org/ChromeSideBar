// Sidebar-side client for background.ts's TabAssociationManager.
//
// Per-window state, so this follows spaceWindowStateProxy's shape rather than
// pinnedSitesManagerProxy's: the context says which window it mirrors through
// mirrorWindow(), and broadcasts about any other window are ignored. A mirror
// holding several windows' maps at once would no longer name a single value
// the way a MirrorStore<T> is meant to.
//
// The mutations follow pinnedSitesManagerProxy instead: each one names the tab
// it touches and calls the same pure transform the manager will, so the mirror
// shows the outcome immediately and cannot disagree with what background
// stores. Background writes this state unprompted from five of its own
// listeners, so a whole-map write from here would be a race with all of them.
//
// Every broadcast about the mirrored window is applied, our own echo included
// - each one carries the window's whole resulting map, so the latest to arrive
// is the truth.

import { ManagerId, callManager, subscribeToBroadcast, Remote } from './messageRouting';
import {
  TabAssociations,
  TabAssociationsApi,
  TAB_ASSOCIATIONS_CHANGED,
  applyAssociate,
  applyDeassociate,
} from '../shared/tabAssociationsApi';
import { MirrorStore, ReadableStore } from '../../stores/mirrorStore';

/**
 * Extends the plain Remote<Api> shape with the pieces this manager has no
 * equivalent for: the local mirror, and a way to bind this context to one
 * window before relying on it.
 */
class TabAssociationsProxy implements Remote<TabAssociationsApi>
{
  // This context's mirror of one window's associations. Private so every
  // write goes through #applyForWindow; consumers read it via the store getter.
  #mirror = new MirrorStore<TabAssociations>({});

  // The window this context mirrors, set by mirrorWindow(). Broadcasts for any
  // other window are ignored - associations are per-window, so mirroring more
  // than one here would mean the store no longer names a single value.
  #mirroredWindowId: number | undefined;

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<TabAssociations>
  {
    return this.#mirror.store;
  }

  /**
   * Records which window this context mirrors, subscribes to the manager's
   * broadcasts, then fills the store. Called by BookmarkTabsContext once the
   * window id is known.
   *
   * The fill is a reconcile rather than a plain read, because this is the
   * moment the sidebar reappears and the associations may have gone stale
   * while it was gone - a tab closed, or dragged into another window, with
   * nobody watching. Background does the validating against its own map, so
   * there is no snapshot here for a concurrent change to race against.
   *
   * Safe to call more than once: React StrictMode double-invokes the mount
   * effect in dev, and subscribeToBroadcast ignores the second registration.
   */
  async mirrorWindow(windowId: number): Promise<TabAssociations>
  {
    this.#mirroredWindowId = windowId;

    subscribeToBroadcast(TAB_ASSOCIATIONS_CHANGED, (message) =>
    {
      this.#applyForWindow(message.windowId as number, message.associations as TabAssociations);
    });

    return await this.reconcileWindow(windowId);
  }

  /**
   * The single writer of the mirror. Drops maps for any window but the
   * mirrored one - a broadcast or a call about someone else's window says
   * nothing about ours. The MirrorStore drops maps equal to the one it holds.
   */
  #applyForWindow(windowId: number, associations: TabAssociations): void
  {
    if (windowId !== this.#mirroredWindowId) return;

    this.#mirror.set(associations);
  }

  /** Plain read - does NOT touch the mirror. */
  async getAssociations(windowId: number): Promise<TabAssociations>
  {
    return await callManager<TabAssociations>(
      ManagerId.TAB_ASSOCIATIONS,
      'getAssociations',
      { windowId }
    );
  }

  /**
   * Sends one mutation whose optimistic change is already on the mirror.
   *
   * The ack is NOT applied to the mirror: the broadcast the same change
   * causes does that, in order with every other broadcast. The promise still
   * resolves with the manager's reply, for callers that need the write to
   * have actually landed.
   */
  async #send(
    method: string,
    windowId: number,
    payload: Record<string, unknown>
  ): Promise<TabAssociations>
  {
    try
    {
      return await callManager<TabAssociations>(ManagerId.TAB_ASSOCIATIONS, method, { windowId, ...payload });
    }
    catch (error)
    {
      // The optimistic write is now showing a change that never happened.
      // Ask background what the truth is rather than rolling back to a
      // remembered map, which could undo a LATER write that did succeed. A
      // failed resync means the worker is gone and this page is about to be
      // torn down anyway, so there is nothing further to do.
      console.error(`[tabAssociationsProxy] ${method} failed, resyncing:`, error);
      this.getAssociations(windowId)
        .then((current) => this.#applyForWindow(windowId, current))
        .catch(() => {});
      throw error;
    }
  }

  async associate(
    windowId: number,
    tabId: number,
    itemKey: string,
    url?: string,
    tabIndex?: number
  ): Promise<TabAssociations>
  {
    this.#applyForWindow(windowId, applyAssociate(this.#mirror.snapshot, tabId, itemKey));
    return this.#send('associate', windowId, { tabId, itemKey, url, tabIndex });
  }

  async deassociate(windowId: number, tabId: number): Promise<TabAssociations>
  {
    this.#applyForWindow(windowId, applyDeassociate(this.#mirror.snapshot, tabId));
    return this.#send('deassociate', windowId, { tabId });
  }

  /**
   * Asks background to drop every entry whose tab is gone or has moved to
   * another window. Only background can say which those are, so there is
   * nothing optimistic to write first: the reply is what the mirror takes.
   *
   * The reply can land just after a broadcast describing a change background
   * made after it computed this reply, and put the mirror back to the older
   * map until the next broadcast for this window replaces it - the same way
   * any other out-of-date view gets repaired.
   */
  async reconcileWindow(windowId: number): Promise<TabAssociations>
  {
    try
    {
      const result = await callManager<TabAssociations>(
        ManagerId.TAB_ASSOCIATIONS,
        'reconcileWindow',
        { windowId }
      );
      this.#applyForWindow(windowId, result);
      return result;
    }
    catch (error)
    {
      console.error('[tabAssociationsProxy] reconcileWindow failed:', error);
      throw error;
    }
  }
}

export const tabAssociationsProxy = new TabAssociationsProxy();
