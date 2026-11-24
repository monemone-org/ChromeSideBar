// Background's side of the DEV-only test hooks - see
// shared/backgroundTestHooksApi.ts for what they are for.
//
// Every call site is wrapped in `if (import.meta.env.DEV)`, so a release build
// never stops at a gate or fails a call on purpose.

import { TestGateNameType } from '../shared/backgroundTestHooksApi';

// A gate that holds something and is not released (a case that failed half
// way) lets it through on its own this long after it arrived, so one broken
// run can't leave a listener stuck for the rest of the worker's life.
// Counted from the arrival, not from arming, because in the runner's Manual
// mode the tester can take a while to perform the action that arrives here
const GATE_AUTO_RELEASE_MS = 15000;

/**
 * One armed gate. Holds the first arrival until released; anything arriving
 * after that passes straight through, since a case only ever means to stop
 * the one call it is lining up against.
 */
class TestGate
{
  #hasArrival = false;
  #markArrived!: () => void;
  #release!: () => void;

  readonly #arrived = new Promise<void>((resolve) =>
  {
    this.#markArrived = resolve;
  });

  readonly #released = new Promise<void>((resolve) =>
  {
    this.#release = resolve;
  });

  /** Called by background at the gate's point. Waits only for the first arrival. */
  async holdFirstArrival(): Promise<void>
  {
    if (this.#hasArrival) return;

    this.#hasArrival = true;
    this.#markArrived();
    setTimeout(() => this.#release(), GATE_AUTO_RELEASE_MS);
    await this.#released;
  }

  /** Resolves true once something is held here, or false after timeoutMs. */
  waitUntilHeld(timeoutMs: number): Promise<boolean>
  {
    return Promise.race([
      this.#arrived.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  }

  release(): void
  {
    this.#release();
  }
}

class BackgroundTestHooks
{
  #gates = new Map<TestGateNameType, TestGate>();

  // "managerId.method" for each routed call that should fail once
  #failures = new Set<string>();

  armGate(name: TestGateNameType): void
  {
    this.#gates.get(name)?.release();
    this.#gates.set(name, new TestGate());
  }

  /** Background's side of a gate: returns at once unless a case armed it. */
  async passGate(name: TestGateNameType): Promise<void>
  {
    await this.#gates.get(name)?.holdFirstArrival();
  }

  async waitForGate(name: TestGateNameType, timeoutMs: number): Promise<boolean>
  {
    const gate = this.#gates.get(name);
    if (!gate) throw new Error(`gate "${name}" is not armed`);
    return gate.waitUntilHeld(timeoutMs);
  }

  releaseGate(name: TestGateNameType): void
  {
    this.#gates.get(name)?.release();
    this.#gates.delete(name);
  }

  failNextCall(managerId: string, method: string): void
  {
    this.#failures.add(`${managerId}.${method}`);
  }

  /** Throws, once, when a case armed a failure for this call. */
  throwIfFailureArmed(managerId: string, method: string): void
  {
    const key = `${managerId}.${method}`;
    if (!this.#failures.delete(key)) return;

    throw new Error(`test hook: ${key} failed on purpose`);
  }

  reset(): void
  {
    // Let anything still held at a gate carry on
    for (const gate of this.#gates.values()) gate.release();

    this.#gates.clear();
    this.#failures.clear();
  }
}

export const backgroundTestHooks = new BackgroundTestHooks();
