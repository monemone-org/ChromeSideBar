// The wire contract for background's DEV-only test hooks, shared by
// background.ts (which answers them) and the in-panel test runner (which sends
// them, see src/tests/inpanel/backgroundHooks.ts).
//
// Some bugs only show when two things happen in one particular order: a call
// landing while another is still awaiting, a reply failing, a broadcast
// arriving late. Real Chrome won't line those up on demand, so a case uses
// these hooks to hold background at a named point, fail one call, or send a
// broadcast of its choosing. Background only answers them in a debug build.

/** The action every hook message carries. */
export const BACKGROUND_TEST_HOOK_ACTION = 'background-test-hook';

/**
 * Named points where background can be held by a case. Each name is passed
 * at exactly one place in background code, so a case can tell from the name
 * alone where background will stop.
 */
export const TestGateName = {
  // TabAssociationManager.refreshBackupIndices, after chrome.tabs.query
  // returns and before the index updates are queued
  REFRESH_BACKUP_INDICES_AFTER_TAB_QUERY: 'TabAssociationManager.refreshBackupIndices.afterTabQuery',
  // SpaceTabManager's processing of a grouping request, after it has read the
  // tab and found it still needs grouping, and before it looks the space's
  // group up
  GROUPING_AFTER_TAB_READ: 'SpaceTabManager.processGroupingRequest.afterTabRead',
} as const;

export type TestGateNameType = typeof TestGateName[keyof typeof TestGateName];

/** Every operation a hook message can ask for. */
export type BackgroundTestHookRequest =
  // Hold the next arrival at a gate until released
  | { op: 'armGate'; gate: TestGateNameType }
  // Reply once the gate holds something, or with false after timeoutMs
  | { op: 'waitForGate'; gate: TestGateNameType; timeoutMs: number }
  | { op: 'releaseGate'; gate: TestGateNameType }
  // Make the next routed call to managerId.method fail as if it had thrown
  | { op: 'failNextCall'; managerId: string; method: string }
  // Send an arbitrary message to every extension context, as background
  | { op: 'broadcast'; message: Record<string, unknown> }
  // Drop one window's live associations without touching the backup, the way
  // a browser restart clears session storage but leaves local storage alone.
  // Also empties the window's tab-space registry, which is session state too
  | { op: 'forgetTabAssociationSession'; windowId: number }
  // Run the startup restore now, without restarting the service worker
  | { op: 'runTabAssociationRestore' }
  // One window's backup, read once every backup write queued before it is done
  | { op: 'readTabAssociationBackup'; windowId: number }
  // Whether anything listens on chrome.commands.onCommand, i.e. whether a
  // real key press would reach handleCommand
  | { op: 'hasShortcutListener' }
  // Release every gate and forget every armed failure
  | { op: 'reset' };

/** What background replies with: the operation's result, or why it failed. */
export type BackgroundTestHookResponse =
  | { ok: true; value?: unknown }
  | { ok: false; error: string };
