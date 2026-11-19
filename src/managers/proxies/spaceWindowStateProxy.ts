// Sidebar-side client for background.ts's SpaceWindowStateManager.
//
// Unlike TabSpaceRegistry (step 1), the sidebar both reads AND is broadcast
// to for this manager, so this is the first proxy with a real mirror store:
// see docs/decisions/2026-07-30-shared-storage-multiple-writers.md, section 5
// ("The mirror is a plain store, not React state").

import { ManagerId, callManager, subscribeToBroadcast, Remote } from './messageRouting';
import { SpaceWindowStateApi, SPACE_WINDOW_STATE_CHANGED } from '../shared/spaceWindowStateApi';
import { MirrorStore, ReadableStore } from '../../stores/mirrorStore';
import { SpaceWindowState, DEFAULT_WINDOW_STATE } from '../../utils/spaceMessages';

/**
 * Extends the plain Remote<Api> shape with the pieces this manager has no
 * equivalent for: the local mirror, and a way to bind this context to one
 * window before relying on it.
 */
class SpaceWindowStateProxy implements Remote<SpaceWindowStateApi>
{
  // This context's mirror of one window's SpaceWindowState. Private so every
  // write goes through #applyState; consumers read it via the store getter.
  #mirror = new MirrorStore<SpaceWindowState>(DEFAULT_WINDOW_STATE);

  // The window this context mirrors, set by mirrorWindow(). Broadcasts for
  // any other window are ignored - state is per-window, so mirroring more
  // than one here would mean the store no longer names a single value.
  #mirroredWindowId: number | undefined;

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<SpaceWindowState>
  {
    return this.#mirror.store;
  }

  /**
   * Records which window this context mirrors, subscribes to the manager's
   * broadcasts, then fills the store with the window's current state. Called
   * by the sidebar at mount. SpaceNavigatorApp does NOT call this - it's a
   * short-lived page that only calls getState/setActiveSpace and uses the
   * return values directly, so it needs no mirror and pays for no listener.
   *
   * Safe to call more than once: React StrictMode double-invokes the mount
   * effect in dev, and subscribeToBroadcast ignores the second registration.
   *
   * Every broadcast about the mirrored window is applied, our own echo
   * included - each one carries the window's whole resulting state, so the
   * latest to arrive is the truth.
   */
  async mirrorWindow(windowId: number): Promise<void>
  {
    this.#mirroredWindowId = windowId;

    subscribeToBroadcast(SPACE_WINDOW_STATE_CHANGED, (message) =>
    {
      this.#applyState(message.windowId as number, message.state as SpaceWindowState);
    });

    this.#applyState(windowId, await this.getState(windowId));
  }

  /**
   * The single writer of the mirror. Drops states for any window but the
   * mirrored one; the MirrorStore drops states that match what it already
   * holds, so a no-op write doesn't re-render every consumer.
   */
  #applyState(windowId: number, state: SpaceWindowState): void
  {
    if (windowId !== this.#mirroredWindowId) return;

    this.#mirror.set(state);
  }

  async getState(windowId: number): Promise<SpaceWindowState>
  {
    return await callManager<SpaceWindowState>(ManagerId.SPACE_WINDOW_STATE, 'getState', { windowId });
  }

  /**
   * Switches the window's active space.
   *
   * The mirror is updated before the message goes out, so the UI responds
   * without waiting for a round trip and a read on the next line sees the
   * write. The ack is NOT applied to the mirror: the broadcast the same
   * switch causes does that, in order with every other broadcast.
   *
   * The promise still resolves with the manager's reply, for callers that
   * need the switch to have actually landed - SpaceNavigatorApp waits on it
   * before closing itself. Callers that just want the UI updated can ignore
   * it.
   */
  async setActiveSpace(windowId: number, spaceId: string): Promise<SpaceWindowState>
  {
    this.#applyState(windowId, { ...this.#mirror.snapshot, activeSpaceId: spaceId });

    try
    {
      return await callManager<SpaceWindowState>(
        ManagerId.SPACE_WINDOW_STATE,
        'setActiveSpace',
        { windowId, spaceId }
      );
    }
    catch (error)
    {
      // The optimistic write above is now showing a switch that never
      // happened. Ask background what the truth is rather than rolling back
      // to a remembered value, which could undo a LATER switch that did
      // succeed. A failed resync means the worker is gone and this page is
      // about to be torn down anyway, so there is nothing further to do.
      console.error('[spaceWindowStateProxy] setActiveSpace failed, resyncing:', error);
      this.getState(windowId)
        .then((state) => this.#applyState(windowId, state))
        .catch(() => {});
      throw error;
    }
  }
}

export const spaceWindowStateProxy = new SpaceWindowStateProxy();
