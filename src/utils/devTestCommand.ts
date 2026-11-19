// The DEV-only message the in-panel test runner sends background to stand in
// for a keyboard shortcut press (see handleCommand in background.ts and
// pressShortcut in src/tests/inpanel/actions.ts). Release builds never
// register a listener for it.

export const DEV_TEST_RUN_COMMAND_ACTION = 'dev-test-run-command';

export interface DevTestRunCommandMessage
{
  action: typeof DEV_TEST_RUN_COMMAND_ACTION;
  command: string;
  windowId: number;
}

/** `ok` once the command has finished; `error` when it was rejected or did nothing. */
export type DevTestRunCommandReply = { ok: true } | { ok?: undefined; error: string };
