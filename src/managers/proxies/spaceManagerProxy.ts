// Sidebar-side client for background.ts's SpaceManager.
//
// Same shape as spaceWindowStateProxy (step 2), minus the per-window
// filtering: the Space list is not scoped to a window, so there is exactly
// one mirror per context instead of one per mirrored window.

import { ManagerId, callManager, CONTEXT_ID, Remote } from './messageRouting';
import { SpaceManagerApi, SPACES_CHANGED } from '../shared/spaceManagerApi';
import { ExternalStore, ReadableStore } from '../../stores/externalStore';
import { Space } from '../../utils/spaceMessages';

/**
 * Extends the plain Remote<Api> shape with the pieces this manager has no
 * equivalent for: the local mirror, and the load() entry point that fills it.
 */
class SpaceManagerProxy implements Remote<SpaceManagerApi>
{
  // This context's mirror of the Space list. Private so every write goes
  // through #applySpaces; consumers read it via the store or snapshot getter.
  #store = new ExternalStore<readonly Space[]>([]);

  // Whether the broadcast listener is already registered - see
  // #subscribeToBroadcasts.
  #subscribed = false;

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<readonly Space[]>
  {
    return this.#store;
  }

  /**
   * The current Space list as this context sees it.
   *
   * Every mutation reads this at call time rather than a value captured
   * during render, which is what lets two back-to-back calls each see the
   * one before. Reading a render-captured list instead would make the second
   * call overwrite the first.
   *
   * Returned readonly on purpose. This is the live array behind the mirror,
   * not a copy, so pushing or splicing it would change what every subscriber
   * sees WITHOUT notifying any of them - the store only fires listeners from
   * set(). Callers build a new list (spread, map, filter) and hand it to
   * updateSpaces, which is the only supported way to change this state.
   */
  get snapshot(): readonly Space[]
  {
    return this.#store.getSnapshot();
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
   * effect in dev, and re-loading must not stack listeners.
   */
  async load(): Promise<Space[]>
  {
    this.#subscribeToBroadcasts();
    const spaces = await this.getSpaces();
    this.#applySpaces(spaces);
    return spaces;
  }

  /**
   * Subscribes to the manager's "changed" broadcasts, at most once for the
   * life of this context. Deliberately never unsubscribed - the proxy is a
   * module singleton that outlives every component that loads through it.
   *
   * Registered on first load() rather than at module scope so a context that
   * never loads (SpaceNavigatorApp) doesn't wake up for broadcasts it would
   * only discard.
   */
  #subscribeToBroadcasts(): void
  {
    if (this.#subscribed) return;
    this.#subscribed = true;

    // The broadcast's real job is the OTHER windows' writes. Our own come
    // back here too, and must be skipped: an echo describes the list at the
    // time its message was handled, which a newer local write may already
    // have moved past. See CONTEXT_ID in messageRouting.ts for the worked
    // example.
    //
    // `migrated` is the one deliberate exception: SpaceManager.updateSpaces()
    // sets it when it resolved missing bookmarkFolderSegments before storing,
    // meaning what got stored differs from what THIS context optimistically
    // wrote (see #applySpaces call in updateSpaces() below). Applying it
    // despite the matching senderId is safe only because the sole caller
    // that can hit this - spaces import - awaits the write before the UI
    // allows another space edit in this window, so there is no newer
    // optimistic write here for it to clobber. See the shared-storage
    // decision doc, section 4.
    chrome.runtime.onMessage.addListener((message) =>
    {
      if (message?.action === SPACES_CHANGED && (message.senderId !== CONTEXT_ID || message.migrated === true))
      {
        this.#applySpaces(message.spaces);
      }
    });
  }

  /**
   * The single writer of the mirror. Skips a list equal to the one already
   * held, so a no-op write doesn't re-render every consumer.
   *
   * The JSON comparison is deliberate and scoped to this use: these are
   * short, flat, JSON-derived objects that just came off the message
   * channel. It is not a general deep-equality utility.
   */
  #applySpaces(spaces: Space[]): void
  {
    if (JSON.stringify(spaces) === JSON.stringify(this.#store.getSnapshot())) return;

    this.#store.set(spaces);
  }

  /**
   * Plain read - does NOT touch the mirror. This is what SpaceNavigatorApp
   * and DeleteSpaceAction use, since neither keeps one.
   */
  async getSpaces(): Promise<Space[]>
  {
    return await callManager<Space[]>(ManagerId.SPACES, 'getSpaces');
  }

  /**
   * Writes the full Space list.
   *
   * The mirror is updated before the message goes out, so a synchronous
   * caller sees its own write - SpacesContext.createSpace depends on this,
   * since it hands the new Space back to its caller immediately. The ack is
   * NOT applied to the mirror: we already know the resulting list because we
   * chose it, and applying a reply that a newer write may have superseded
   * would only move the mirror backwards. The one exception is when
   * background resolved missing bookmarkFolderSegments we didn't send - the
   * mirror gets corrected for that via the broadcast's `migrated` flag (see
   * #subscribeToBroadcasts), not via this method applying its own ack.
   *
   * The promise still resolves with the manager's reply, for callers that
   * need the write to have actually landed - DeleteSpaceAction waits on it,
   * because an undo straight afterwards reads the list back from background.
   * The seven CRUD callbacks in SpacesContext ignore it.
   */
  async updateSpaces(spaces: Space[]): Promise<Space[]>
  {
    this.#applySpaces(spaces);

    try
    {
      return await callManager<Space[]>(ManagerId.SPACES, 'updateSpaces', { spaces });
    }
    catch (error)
    {
      // The optimistic write above is now showing a change that never
      // happened. Ask background what the truth is rather than rolling back
      // to a remembered list, which could undo a LATER write that did
      // succeed. A failed resync means the worker is gone and this page is
      // about to be torn down anyway, so there is nothing further to do.
      console.error('[spaceManagerProxy] updateSpaces failed, resyncing:', error);
      this.getSpaces()
        .then((current) => this.#applySpaces(current))
        .catch(() => {});
      throw error;
    }
  }
}

export const spaceManagerProxy = new SpaceManagerProxy();
