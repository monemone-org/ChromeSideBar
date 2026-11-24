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
  TAB_HISTORY: 'TabHistoryManager',
  LAST_AUDIBLE: 'LastAudibleTracker',
  PINNED_SITES: 'PinnedSitesManager',
  TAB_ASSOCIATIONS: 'TabAssociationManager',
  SPACE_TAB: 'SpaceTabManager',
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
 * message as `senderId`, and a manager copies it onto the broadcast that the
 * message caused.
 *
 * It is a provenance label, nothing more: a broadcast with a senderId was
 * caused by some sidebar's request, and one without was a change background
 * made on its own (favicon patching, a tab listener). No proxy reads it -
 * every proxy applies every broadcast, its own echo included, since each
 * broadcast carries the manager's whole resulting value and the latest one to
 * arrive is always the truth. The in-panel tests use the label to tell the
 * two kinds of change apart (see watchForBackgroundFaviconBroadcast in
 * tests/inpanel/cases/sectionP.ts).
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

// Every broadcast action this context already listens for - see
// subscribeToBroadcast.
const registeredActions = new Set<string>();

/**
 * Registers `handler` for one manager's broadcast action, at most once per
 * action for the life of this context. A second registration for the same
 * action is ignored, so a proxy can call this from its mount entry point
 * (load(), mirrorWindow()) and React StrictMode double-invoking that mount
 * effect doesn't stack listeners.
 *
 * Deliberately never unsubscribed - proxies are module singletons that
 * outlive every component that mirrors through them. Registered from those
 * entry points rather than at module scope, so a context that never mirrors
 * (SpaceNavigatorApp) doesn't wake up for broadcasts it would only discard.
 */
export function subscribeToBroadcast(
  action: string,
  handler: (message: Record<string, unknown>) => void
): void
{
  if (registeredActions.has(action)) return;
  registeredActions.add(action);

  chrome.runtime.onMessage.addListener((message) =>
  {
    if (message?.action === action) handler(message as Record<string, unknown>);
  });
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
