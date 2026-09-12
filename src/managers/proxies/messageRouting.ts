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
  SPACE_WINDOW_STATE: 'SpaceWindowStateManager',
  SPACES: 'SpaceManager',
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
 * Identifies THIS extension context (one sidebar, one popup, the service
 * worker) for the life of the page. callManager stamps it on every outgoing
 * message, and a manager echoes it back on the broadcast that the message
 * caused.
 *
 * That lets a proxy tell its own broadcast apart from another window's, which
 * is what keeps an echo from overwriting a newer local write:
 *
 *   updateSpaces([Work])          mirror [Work],        message 1 sent
 *   updateSpaces([Work, Video])   mirror [Work, Video], message 2 sent
 *   broadcast for message 1       ours, ignored
 *   broadcast for message 2       ours, ignored
 *
 * Without it, the broadcast for message 1 lands on top of message 2's write
 * and Video disappears from the mirror. Anything reading the list in that
 * window (createSpace reads it on every call) then writes the loss back out
 * permanently.
 *
 * A broadcast with no senderId, or with somebody else's, is always applied -
 * that's either another window's write or a background-internal change, and
 * both are news to us.
 */
export const CONTEXT_ID = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

/**
 * Calls one method on one manager and returns its ack payload.
 *
 * Every proxy method goes through here rather than building its own
 * sendMessage envelope, so the action string, the failure handling, and the
 * response type all have exactly one implementation. The router answers a
 * failed dispatch with `{ error }` (see background.ts) - that comes back as a
 * resolved response, not a rejection, so it has to be turned back into a
 * throw here or callers would treat the error envelope as the result.
 */
export async function callManager<R>(
  managerId: ManagerIdType,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<R>
{
  const response = await chrome.runtime.sendMessage({
    action: makeManagerActionId(managerId, method),
    senderId: CONTEXT_ID,
    ...payload,
  });

  if (response && typeof response === 'object' && 'error' in response)
  {
    throw new Error(`${managerId}.${method} failed: ${(response as { error: string }).error}`);
  }

  return response as R;
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
 * Implemented by every message-owning manager in background.ts.
 */
export interface RoutedManager
{
  readonly managerId: ManagerIdType;

  /**
   * Routes one of this manager's messages to the matching method. Only the
   * method half of the action arrives here - the router has already resolved
   * which manager the message belongs to. Unknown methods must throw rather
   * than be ignored: a silent no-op would look exactly like a working call
   * from the proxy side.
   */
  dispatch(method: string, message: Record<string, unknown>): Promise<unknown>;
}
