// One proxy's mirror of a manager's value: a plain observable store, outside
// React state, with a no-op check on write.
//
// See docs/decisions/2026-07-30-shared-storage-multiple-writers.md, "The
// mirror is a plain store, not React state": read-after-write (decision 4)
// only works if the mirror can be written and read back in the same tick.
// React state cannot do that - setSpaces(next) schedules a re-render, it does
// not change the const a running function captured at render time. So each
// proxy owns one of these, and components read it with useSyncExternalStore
// instead of useState.
//
// Each mirroring proxy holds one of these as a field rather than inheriting
// it. What a proxy writes into it (an optimistic transform, a broadcast, a
// reply) and which broadcasts it listens to stay in the proxy itself.

/**
 * The half of a store that consumers get: enough for useSyncExternalStore,
 * and no set(). Proxies expose their mirror as this so "the proxy is the only
 * writer" is enforced by the type rather than only documented.
 *
 * The VALUE handed back by getSnapshot must be treated as immutable too.
 * It is the live object, not a copy, so mutating it in place changes what
 * every subscriber sees without firing a single listener, since only set()
 * notifies. Build a new value and route it through the owning proxy instead.
 */
export interface ReadableStore<T>
{
  getSnapshot: () => T;
  subscribe: (onChange: () => void) => (() => void);
}

/**
 * One manager's mirrored state in this context. The matching proxy is the
 * only thing that writes it.
 */
export class MirrorStore<T> implements ReadableStore<T>
{
  #value: T;
  #listeners = new Set<() => void>();

  constructor(initial: T)
  {
    this.#value = initial;
  }

  /** Read-only handle on the mirror, for useSyncExternalStore. */
  get store(): ReadableStore<T>
  {
    return this;
  }

  /**
   * The mirrored value as this context sees it. Same value as getSnapshot(),
   * for proxy code that reads it inline.
   *
   * Treat what comes back as immutable: it is the live value behind the
   * mirror, not a copy, so changing it in place would change what every
   * subscriber sees WITHOUT notifying any of them - the store only fires
   * listeners from set().
   */
  get snapshot(): T
  {
    return this.#value;
  }

  /**
   * The current value. Returns the SAME object reference until set() stores a
   * different one - useSyncExternalStore compares snapshots by identity and
   * will re-render forever if a fresh object comes back on every call.
   * Declared as an arrow property so it can be passed detached (e.g. straight
   * into useSyncExternalStore) without losing `this`.
   */
  getSnapshot = (): T =>
  {
    return this.#value;
  };

  /**
   * Registers a listener for value changes and returns an unsubscribe
   * function. Also an arrow property, for the same detached-reference reason
   * as getSnapshot.
   */
  subscribe = (onChange: () => void): (() => void) =>
  {
    this.#listeners.add(onChange);
    return () => this.#listeners.delete(onChange);
  };

  /**
   * The single writer of the mirror. Skips a value equal to the one already
   * held, so a no-op write (a broadcast carrying what an optimistic write
   * already showed, say) doesn't re-render every consumer.
   *
   * The JSON comparison is deliberate and scoped to this use: these are short,
   * flat, JSON-derived values that just came off the message channel. It is
   * not a general deep-equality utility.
   */
  set(value: T): void
  {
    if (JSON.stringify(value) === JSON.stringify(this.#value)) return;
    this.#value = value;

    // Notify every subscriber that the snapshot changed.
    for (const listener of this.#listeners) listener();
  }
}
