// The in-panel runner's side of background's DEV-only test hooks - see
// src/managers/shared/backgroundTestHooksApi.ts for what they are and why.
// Each function sends one hook message and turns a failed reply into a throw,
// so a step that uses one fails with background's own reason.

import {
  BACKGROUND_TEST_HOOK_ACTION,
  BackgroundTestHookRequest,
  BackgroundTestHookResponse,
  TestGateNameType,
} from '../../managers/shared/backgroundTestHooksApi';
import { WindowAssociationBackup } from '../../managers/shared/tabAssociationsApi';

async function sendHook(request: BackgroundTestHookRequest): Promise<unknown>
{
  const response = await chrome.runtime.sendMessage({
    action: BACKGROUND_TEST_HOOK_ACTION,
    request,
  }) as BackgroundTestHookResponse | undefined;

  if (!response) throw new Error(`test hook "${request.op}" got no reply - is this a debug build?`);
  if (!response.ok) throw new Error(`test hook "${request.op}" failed: ${response.error}`);
  return response.value;
}

/** Make background hold the next arrival at `gate` until releaseGate. */
export async function armGate(gate: TestGateNameType): Promise<void>
{
  await sendHook({ op: 'armGate', gate });
}

/** Wait until background is held at `gate`; throws if nothing arrives in time. */
export async function waitForGate(gate: TestGateNameType, timeoutMs: number): Promise<void>
{
  const held = await sendHook({ op: 'waitForGate', gate, timeoutMs });
  if (held !== true) throw new Error(`background never reached gate "${gate}" within ${timeoutMs}ms`);
}

export async function releaseGate(gate: TestGateNameType): Promise<void>
{
  await sendHook({ op: 'releaseGate', gate });
}

/** Make the next routed call to managerId.method fail as if the manager had thrown. */
export async function failNextCall(managerId: string, method: string): Promise<void>
{
  await sendHook({ op: 'failNextCall', managerId, method });
}

/**
 * Have background send `message` to every extension context. A sidebar's own
 * sendMessage never reaches its own listeners, so a case that needs this panel
 * to receive a particular broadcast has to ask background to send it.
 */
export async function broadcastFromBackground(message: Record<string, unknown>): Promise<void>
{
  await sendHook({ op: 'broadcast', message });
}

/** Empty one window's live associations but keep its backup, as a browser restart would. */
export async function forgetTabAssociationSession(windowId: number): Promise<void>
{
  await sendHook({ op: 'forgetTabAssociationSession', windowId });
}

/** Run TabAssociationManager's startup restore now, and wait for it to finish. */
export async function runTabAssociationRestore(): Promise<void>
{
  await sendHook({ op: 'runTabAssociationRestore' });
}

/** One window's association backup, after every backup write queued before this call. */
export async function readTabAssociationBackup(windowId: number): Promise<WindowAssociationBackup>
{
  return await sendHook({ op: 'readTabAssociationBackup', windowId }) as WindowAssociationBackup;
}

/** Release every gate and drop every armed failure, so one case can't leak into the next. */
export async function resetBackgroundTestHooks(): Promise<void>
{
  await sendHook({ op: 'reset' });
}
