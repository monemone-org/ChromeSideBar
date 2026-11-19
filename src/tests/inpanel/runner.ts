// Executes a TestCase's steps in order, persisting a checkpoint to
// chrome.storage.local when it hits a pause or closedPanel step so a later
// panel mount can resume where it left off. Local storage and not session storage,
// because chrome.storage.session does not survive a "Reload" from
// chrome://extensions (E.1's own manual step) - so every case's
// resume/results/batch-queue state lives there, not just E.1's. See types.ts
// for the step shapes and TestRunnerPanel.tsx for how this is driven from
// the UI.

import { ResumeState, TestCase, TestContext, TestResult, TestStep } from './types';
import { sleep } from './stepHelpers';

export const RESUME_STORAGE_KEY = 'testRunnerResumeState';
export const CASE_RESULTS_STORAGE_KEY = 'testRunnerCaseResults';
export const BATCH_QUEUE_STORAGE_KEY = 'testRunnerBatchQueue';
export const BATCH_CASE_IDS_STORAGE_KEY = 'testRunnerBatchCaseIds';

// The note every closedPanel step's result carries, so a downloaded results
// file says the step ran on the parked page rather than in the panel.
const PARKED_STEP_NOTE = 'Run on the parked page with the sidebar app unloaded.';

/** Whether a result is a parked step's own, recorded by resumedStart - lets the panel's banner tell a tester the step's action is already done. */
export function isParkedStepResult(result: TestResult): boolean
{
  return result.note === PARKED_STEP_NOTE;
}

/**
 * What the banner says for a closedPanel step the parked page has not run.
 * The panel parks itself for such a step and never shows this, unless it
 * could not open the parked page or was closed before the page finished.
 */
export const PARK_PENDING_INSTRUCTION = 'This step runs with the sidebar unloaded, on the parked page (test-parked.html), and it has not run yet. Click Resume to open the parked page and run it. If the page does not open, rebuild with npm run build:debug and reload the extension.';

export interface RunOutcome
{
  results: TestResult[];
  pausedAt?: { stepIndex: number; instruction: string };
}

// Keyed by case id (not a single "last run") - persisted whenever a run
// finishes (pass or fail, not paused) so every case's own last result
// survives the panel closing, not just whichever case happened to run most
// recently. Without this, a completed run only ever lived in
// TestRunnerPanel's React state, which the panel unmounting destroys, and a
// single-slot "last result" would still lose every other case's history the
// moment a different case ran.
export type CaseResultsMap = Record<string, TestResult[]>;

// 500ms matches SETTLE_MS in src/tests/closeTabActionTest.ts - the established
// delay for this codebase's tab/bookmark association state to catch up after
// a chrome.* call, before the next step reads it. Exported for the parked
// page, which waits the same delay after its own chrome.* call.
export const STEP_SETTLE_MS = 500;

/**
 * What a resumed case starts from. A checkpoint the parked page has run adds
 * that pause's own result, since the run restarts at the step after it and
 * never revisits it. `stopCase` is set when the parked action failed: the
 * pause stood for an action, so the case ends there the way runFrom stops on
 * a failed action step, rather than asserting on an action that never
 * happened.
 */
export function resumedStart(testCase: TestCase, state: ResumeState): { results: TestResult[]; stopCase: boolean }
{
  const step = testCase.steps[state.stepIndex];
  const name = step?.label ?? `step ${state.stepIndex + 1}`;

  // The parked action threw - record it as the failed step it is.
  if (state.parkedError !== undefined)
  {
    const failed: TestResult = { name, passed: false, error: `Parked-page action failed: ${state.parkedError}`, note: PARKED_STEP_NOTE };
    return { results: [...state.results, failed], stopCase: true };
  }

  // The parked action succeeded - record it as passed, then run on.
  if (state.parkedCompleted)
  {
    return { results: [...state.results, { name, passed: true, note: PARKED_STEP_NOTE }], stopCase: false };
  }

  return { results: state.results, stopCase: false };
}

/**
 * Takes over a checkpoint the parked page has run, for the panel's automatic
 * resume, so that it cannot fire a second time. Without this the parked flags
 * would stay in storage until the case finished, and a resumed run that
 * errored, or a sidebar closed mid-run, would have the next sidebar open
 * quietly resume again from the step after the pause.
 *
 * - Parked action succeeded: the checkpoint is rewritten with the parked
 *   result folded into `results` and no parked flags. It is then an ordinary
 *   checkpoint, so if this resume never finishes, the banner's manual Resume
 *   continues from the step after the pause without recording that step
 *   twice or losing it.
 * - Parked action failed: the case is over (see resumedStart), so it is
 *   finished here - its results saved and the checkpoint cleared - leaving
 *   nothing that could continue as though the action had happened.
 *
 * Returns the checkpoint to resume from, or undefined when the case has been
 * finished and only a batch (if any) is left to continue.
 */
export async function claimParkedCheckpoint(testCase: TestCase, state: ResumeState): Promise<ResumeState | undefined>
{
  const start = resumedStart(testCase, state);

  // Failed parked action: finish the case now, with the failure recorded.
  if (start.stopCase)
  {
    await writeCaseResult(testCase.id, start.results);
    await clearResumeState();
    return undefined;
  }

  // Spread rather than rebuilt, so any later ResumeState field survives the
  // claim; only the parked flags go.
  const claimed: ResumeState = { ...state, results: start.results, parkedCompleted: undefined, parkedError: undefined };
  await chrome.storage.local.set({ [RESUME_STORAGE_KEY]: claimed });
  return claimed;
}

async function runStep(step: Extract<TestStep, { kind: 'action' | 'assert' }>, getCtx: () => TestContext): Promise<TestResult>
{
  try
  {
    await step.run(getCtx());
    return { name: step.label, passed: true };
  }
  catch (err)
  {
    return { name: step.label, passed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run a case's steps starting at `fromIndex`. Stops (without error) either
 * when all steps finish or when a 'pause' or 'closedPanel' step is reached,
 * with a checkpoint written for it - the caller decides what to do next
 * (park the panel for a closedPanel step, show the instruction for a pause). Steps are separated by a short sleep() so React state from a
 * chrome.* side effect (e.g. a bookmark association update) has landed
 * before the next assertion reads it.
 */
export async function runFrom(
  testCase: TestCase,
  fromIndex: number,
  priorResults: TestResult[],
  getCtx: () => TestContext,
  onStep?: (result: TestResult) => void
): Promise<RunOutcome>
{
  const results = [...priorResults];

  for (let i = fromIndex; i < testCase.steps.length; i++)
  {
    const step = testCase.steps[i];

    // Both stop the run here: a closedPanel step runs on the parked page and
    // a pause waits for the tester or the driver
    if (step.kind === 'pause' || step.kind === 'closedPanel')
    {
      const refs: Record<string, string | number> = {};
      for (const [key, value] of getCtx().refs.entries())
      {
        if (typeof value === 'string' || typeof value === 'number') refs[key] = value;
      }

      const checkpoint: ResumeState = { caseId: testCase.id, stepIndex: i, results, refs };
      // A pause the driver script performs from outside says so on the
      // checkpoint, which is all the driver reads (see ResumeState.external)
      if (step.kind === 'pause' && step.external)
      {
        checkpoint.external = step.external;
      }

      await chrome.storage.local.set({ [RESUME_STORAGE_KEY]: checkpoint });
      const instruction = step.kind === 'pause' ? step.instruction : PARK_PENDING_INSTRUCTION;
      return { results, pausedAt: { stepIndex: i, instruction } };
    }

    const result = await runStep(step, getCtx);
    results.push(result);
    onStep?.(result);

    // Only an ACTION failure aborts the case - later steps very likely
    // depend on that action's side effect having happened. An ASSERT
    // failure just gets recorded: several cases (A.3/A.5/A.7) deliberately
    // contain a known-gap assertion expected to currently fail partway
    // through, and unrelated later assertions should still get a chance to
    // run and report their own result rather than being silently skipped.
    if (!result.passed && step.kind === 'action')
    {
      break;
    }

    await sleep(STEP_SETTLE_MS);
  }

  return { results };
}

export async function readResumeState(): Promise<ResumeState | undefined>
{
  const stored = await chrome.storage.local.get([RESUME_STORAGE_KEY]);
  return stored[RESUME_STORAGE_KEY] as ResumeState | undefined;
}

/**
 * Records on the checkpoint how the parked page's action went - an error
 * message when it threw, otherwise that it completed. See ResumeState's
 * parkedError/parkedCompleted for how the resumed run uses it.
 */
export async function writeParkedOutcome(state: ResumeState, error?: string): Promise<void>
{
  const updated: ResumeState = error === undefined
    ? { ...state, parkedCompleted: true, parkedError: undefined }
    : { ...state, parkedError: error, parkedCompleted: undefined };
  await chrome.storage.local.set({ [RESUME_STORAGE_KEY]: updated });
}

export async function clearResumeState(): Promise<void>
{
  await chrome.storage.local.remove([RESUME_STORAGE_KEY]);
}

/** Record one case's result into the persisted map, leaving every other case's entry untouched. */
export async function writeCaseResult(caseId: string, results: TestResult[]): Promise<void>
{
  const all = await readAllCaseResults();
  all[caseId] = results;
  await chrome.storage.local.set({ [CASE_RESULTS_STORAGE_KEY]: all });
}

export async function readAllCaseResults(): Promise<CaseResultsMap>
{
  const stored = await chrome.storage.local.get([CASE_RESULTS_STORAGE_KEY]);
  return (stored[CASE_RESULTS_STORAGE_KEY] as CaseResultsMap | undefined) ?? {};
}

// Several cases (A.3, A.5, A.6, A.6c, A.7) contain an assertion documented as
// currently expected to fail (a known gap) - without a way to clear those,
// the panel's mount effect would auto-open on every single sidebar open
// forever, since "at least one case has a failure" stays permanently true.
export async function clearAllCaseResults(): Promise<void>
{
  await chrome.storage.local.remove([CASE_RESULTS_STORAGE_KEY]);
}

// "Run All"'s queue of case ids still to run, persisted for the same reason
// ResumeState is: a pause step means closing the whole sidebar panel, which
// unmounts the React tree and destroys any in-memory loop state. Without
// this, resuming a paused case mid-batch has no way to know there was a
// batch in progress or what was left to run after it.
export async function writeBatchQueue(remainingCaseIds: string[]): Promise<void>
{
  await chrome.storage.local.set({ [BATCH_QUEUE_STORAGE_KEY]: remainingCaseIds });
}

export async function readBatchQueue(): Promise<string[] | undefined>
{
  const stored = await chrome.storage.local.get([BATCH_QUEUE_STORAGE_KEY]);
  return stored[BATCH_QUEUE_STORAGE_KEY] as string[] | undefined;
}

// Every case id the batch was started with (not just what's still left, which
// is what the queue above holds). Persisted for the same pause/remount reason,
// so the completion popup can report the whole batch's counts after a resume
// instead of only the cases that ran since it.
export async function writeBatchCaseIds(caseIds: string[]): Promise<void>
{
  await chrome.storage.local.set({ [BATCH_CASE_IDS_STORAGE_KEY]: caseIds });
}

export async function readBatchCaseIds(): Promise<string[] | undefined>
{
  const stored = await chrome.storage.local.get([BATCH_CASE_IDS_STORAGE_KEY]);
  return stored[BATCH_CASE_IDS_STORAGE_KEY] as string[] | undefined;
}

// Clears the queue and the batch's full case list together - both describe
// the same batch, so they start and end at the same moments.
export async function clearBatchQueue(): Promise<void>
{
  await chrome.storage.local.remove([BATCH_QUEUE_STORAGE_KEY, BATCH_CASE_IDS_STORAGE_KEY]);
}
