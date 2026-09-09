// Sidebar-side client for background.ts's SpaceWindowStateManager.
//
// Unlike TabSpaceRegistry (step 1), the sidebar both reads AND is broadcast
// to for this manager, so this is the first proxy with a real mirror store:
// see docs/decisions/2026-07-30-shared-storage-multiple-writers.md, section 5
// ("The mirror is a plain store, not React state").

import { ManagerId, callManager, Remote } from './messageRouting';
import { SpaceWindowStateApi, SPACE_WINDOW_STATE_CHANGED } from '../shared/spaceWindowStateApi';
import { ExternalStore, ReadableStore } from '../../stores/externalStore';
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
  #store = new ExternalStore<SpaceWindowState>(DEFAULT_WINDOW_STATE);

  // The window this context mirrors, set by mirrorWindow(). Broadcasts for
  // any other window are ignored - state is per-window, so mirroring more
  // than one here would mean the store no longer names a single value.
  #mirroredWindowId: number | undefined;

  // Whether the broadcast listener is already registered - see
  // #subscribeToBroadcasts.
  #subscribed = false;

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<SpaceWindowState>
  {
    return this.#store;
  }

  /**
   * Records which window this context mirrors, subscribes to the manager's
   * broadcasts, then fills the store with the window's current state. Called
   * by the sidebar at mount. SpaceNavigatorApp does NOT call this - it's a
   * short-lived page that only calls getState/setActiveSpace and uses the
   * return values directly, so it needs no mirror and pays for no listener.
   *
   * Safe to call more than once: React StrictMode double-invokes the mount
   * effect in dev, and re-mirroring the same window must not stack listeners.
   */
  async mirrorWindow(windowId: number): Promise<void>
  {
    this.#mirroredWindowId = windowId;
    this.#subscribeToBroadcasts();
    this.#applyState(windowId, await this.getState(windowId));
  }

  /**
   * Subscribes to the manager's "changed" broadcasts, at most once for the
   * life of this context. Deliberately never unsubscribed - the proxy is a
   * module singleton that outlives every component that mirrors through it.
   *
   * Registered on first mirrorWindow() rather than at module scope so a
   * context that never mirrors (SpaceNavigatorApp) doesn't wake up for
   * broadcasts it would only discard.
   */
  #subscribeToBroadcasts(): void
  {
    if (this.#subscribed) return;
    this.#subscribed = true;

    // The broadcast's real job is the OTHER windows' writes - this window's
    // own are already applied optimistically and from the ack, well before
    // the broadcast arrives.
    chrome.runtime.onMessage.addListener((message) =>
    {
      if (message?.action === SPACE_WINDOW_STATE_CHANGED)
      {
        this.#applyState(message.windowId, message.state);
      }
    });
  }

  /**
   * The single writer of the mirror. Drops states for any window but the
   * mirrored one, and drops states that match what the store already holds -
   * one space switch produces three identical states (optimistic, ack, then
   * broadcast), and without this guard each would re-render every consumer.
   */
  #applyState(windowId: number, state: SpaceWindowState): void
  {
    if (windowId !== this.#mirroredWindowId) return;
    if (state.activeSpaceId === this.#store.getSnapshot().activeSpaceId) return;

    this.#store.set(state);
  }

  async getState(windowId: number): Promise<SpaceWindowState>
  {
    return await callManager<SpaceWindowState>(ManagerId.SPACE_WINDOW_STATE, 'getState', { windowId });
  }

  /**
   * Switches the window's active space. The mirror is updated optimistically
   * before the message goes out, so the UI responds without waiting for a
   * round trip, and again from the ack BEFORE this resolves, so the caller's
   * next read sees its own write (decision 4).
   */
  async setActiveSpace(windowId: number, spaceId: string): Promise<SpaceWindowState>
  {
    this.#applyState(windowId, { ...this.#store.getSnapshot(), activeSpaceId: spaceId });

    const state = await callManager<SpaceWindowState>(
      ManagerId.SPACE_WINDOW_STATE,
      'setActiveSpace',
      { windowId, spaceId }
    );

    this.#applyState(windowId, state);
    return state;
  }
}

export const spaceWindowStateProxy = new SpaceWindowStateProxy();
