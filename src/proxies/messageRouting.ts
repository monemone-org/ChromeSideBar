// Shared vocabulary for manager <-> proxy messages. Imported by BOTH sides
// (background.ts's managers and src/proxies/*), so an action string is never
// spelled out by hand in two places and cannot drift.
//
// See docs/decisions/2026-07-30-shared-storage-multiple-writers.md, "Two-level
// routing, per manager": background.ts knows managers, each manager knows its
// own methods, neither knows the other's half.
//
//   "TabSpaceRegistry_msg_register"
//    └── managerId ──┘     └ method ┘

const SEPARATOR = '_msg_';

/**
 * Every manager that owns messages. The string is the routing key AND the
 * human-readable prefix that shows up in logs, so keep it the class name.
 */
export const ManagerId = {
  TAB_SPACE_REGISTRY: 'TabSpaceRegistry',
} as const;

export type ManagerIdType = typeof ManagerId[keyof typeof ManagerId];

/** Builds the wire action string for one of a manager's methods. */
export function makeManagerActionId(managerId: ManagerIdType, method: string): string
{
  return `${managerId}${SEPARATOR}${method}`;
}

export interface ParsedManagerAction
{
  managerId: string;
  method: string;
}

/**
 * Splits a wire action back into its manager and method halves, or returns
 * undefined if this isn't a manager-routed message at all (orchestration
 * messages like 'set-active-tab-and-space' keep their flat names and are
 * handled directly in background.ts).
 *
 * Splits on the FIRST separator only, so a method name containing the
 * separator can't shift the boundary.
 */
export function parseManagerActionId(action: unknown): ParsedManagerAction | undefined
{
  if (typeof action !== 'string') return undefined;

  const index = action.indexOf(SEPARATOR);
  if (index <= 0) return undefined;

  const method = action.slice(index + SEPARATOR.length);
  if (!method) return undefined;

  return { managerId: action.slice(0, index), method };
}

/**
 * Turns a manager's synchronous method signatures into their proxy
 * equivalents: same parameters, but every return value becomes a Promise
 * because it now crosses the message boundary.
 *
 * A manager implements its own Api interface; its proxy implements
 * Remote<Api>. If either side adds or changes a method without the other
 * following, that's a compile error rather than a runtime mismatch.
 */
export type Remote<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never
};

/**
 * Implemented by every message-owning manager in background.ts. dispatch()
 * receives only the method half of the action - the router has already
 * resolved which manager the message belongs to.
 */
export interface RoutedManager
{
  readonly managerId: ManagerIdType;
  dispatch(method: string, message: Record<string, unknown>): Promise<unknown>;
}
