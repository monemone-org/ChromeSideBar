// Plain observable store used by proxy-owned mirrors, outside React state.
//
// See docs/decisions/2026-07-30-shared-storage-multiple-writers.md, "The
// mirror is a plain store, not React state": read-after-write (decision 4)
// only works if the mirror can be written and read back in the same tick.
// React state cannot do that - setSpaces(next) schedules a re-render, it does
// not change the const a running function captured at render time. So each
// proxy owns one of these, and components read it with useSyncExternalStore
// instead of useState.

/**
 * The half of a store that consumers get: enough for useSyncExternalStore,
 * and no set(). Proxies expose their mirror as this so "the proxy is the only
 * writer" is enforced by the type rather than only documented.
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
export class ExternalStore<T> implements ReadableStore<T>
{
  #value: T;
  #listeners = new Set<() => void>();

  constructor(initial: T)
  {
    this.#value = initial;
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

  set(next: T): void
  {
    // Object.is guard: bail when the value hasn't actually changed, so
    // subscribers don't re-render for a no-op write.
    if (Object.is(next, this.#value)) return;
    this.#value = next;

    // Notify every subscriber that the snapshot changed.
    for (const listener of this.#listeners) listener();
  }
}
