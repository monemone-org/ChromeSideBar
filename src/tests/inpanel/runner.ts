// Executes a TestCase's steps in order, persisting a checkpoint to
// chrome.storage.session when it hits a manual-pause step so a later panel
// mount can resume where it left off. See types.ts for the step shapes and
// TestRunnerPanel.tsx for how this is driven from the UI.

import { ResumeState, TestCase, TestContext, TestResult, TestStep } from './types';
import { sleep } from './stepHelpers';

export const RESUME_STORAGE_KEY = 'testRunnerResumeState';
export const CASE_RESULTS_STORAGE_KEY = 'testRunnerCaseResults';
export const BATCH_QUEUE_STORAGE_KEY = 'testRunnerBatchQueue';

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
// a chrome.* call, before the next step reads it.
const STEP_SETTLE_MS = 500;

async function runStep(step: TestStep, getCtx: () => TestContext): Promise<TestResult>
{
  try
  {
    if (step.kind !== 'pause')
    {
      await step.run(getCtx());
    }
    return { name: step.label, passed: true };
  }
  catch (err)
  {
    return { name: step.label, passed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run a case's steps starting at `fromIndex`. Stops (without error) either
 * when all steps finish or when a 'pause' step is reached - the caller
 * decides what to do with a pause (surface instructions, persist resume
 * state). Steps are separated by a short sleep() so React state from a
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

    if (step.kind === 'pause')
    {
      const refs: Record<string, string | number> = {};
      for (const [key, value] of getCtx().refs.entries())
      {
        if (typeof value === 'string' || typeof value === 'number') refs[key] = value;
      }

      await chrome.storage.session.set({
        [RESUME_STORAGE_KEY]: {
          caseId: testCase.id,
          stepIndex: i,
          results,
          refs,
        } satisfies ResumeState,
      });
      return { results, pausedAt: { stepIndex: i, instruction: step.instruction } };
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
  const stored = await chrome.storage.session.get([RESUME_STORAGE_KEY]);
  return stored[RESUME_STORAGE_KEY] as ResumeState | undefined;
}

export async function clearResumeState(): Promise<void>
{
  await chrome.storage.session.remove([RESUME_STORAGE_KEY]);
}

/** Record one case's result into the persisted map, leaving every other case's entry untouched. */
export async function writeCaseResult(caseId: string, results: TestResult[]): Promise<void>
{
  const all = await readAllCaseResults();
  all[caseId] = results;
  await chrome.storage.session.set({ [CASE_RESULTS_STORAGE_KEY]: all });
}

export async function readAllCaseResults(): Promise<CaseResultsMap>
{
  const stored = await chrome.storage.session.get([CASE_RESULTS_STORAGE_KEY]);
  return (stored[CASE_RESULTS_STORAGE_KEY] as CaseResultsMap | undefined) ?? {};
}

// Several cases (A.3, A.5, A.6, A.6c, A.7) contain an assertion documented as
// currently expected to fail (a known gap) - without a way to clear those,
// the panel's mount effect would auto-open on every single sidebar open
// forever, since "at least one case has a failure" stays permanently true.
export async function clearAllCaseResults(): Promise<void>
{
  await chrome.storage.session.remove([CASE_RESULTS_STORAGE_KEY]);
}

// "Run All"'s queue of case ids still to run, persisted for the same reason
// ResumeState is: a pause step means closing the whole sidebar panel, which
// unmounts the React tree and destroys any in-memory loop state. Without
// this, resuming a paused case mid-batch has no way to know there was a
// batch in progress or what was left to run after it.
export async function writeBatchQueue(remainingCaseIds: string[]): Promise<void>
{
  await chrome.storage.session.set({ [BATCH_QUEUE_STORAGE_KEY]: remainingCaseIds });
}

export async function readBatchQueue(): Promise<string[] | undefined>
{
  const stored = await chrome.storage.session.get([BATCH_QUEUE_STORAGE_KEY]);
  return stored[BATCH_QUEUE_STORAGE_KEY] as string[] | undefined;
}

export async function clearBatchQueue(): Promise<void>
{
  await chrome.storage.session.remove([BATCH_QUEUE_STORAGE_KEY]);
}
