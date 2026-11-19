// DEV-only "parked" page for the in-panel test runner (see test-parked.html
// and docs/test/test-runner-automation-plan.md). When a run reaches a
// closedPanel step, the side panel navigates itself here. That replaces the
// sidebar's document, tearing down the React tree and every message listener
// the app registered - from the extension's side, the same state as a closed
// panel, which is what those cases test.
//
// This page carries no application code. It reads the checkpoint, runs the
// step's run(refs), waits for the extension to settle, records the outcome on
// the checkpoint and goes back to index.html, where the panel remounts and
// resumes on its own.
//
// It must never get stuck here: every path, including ones that should not
// happen, ends with navigating back to the sidebar.
//
// Loading ALL_CASES pulls in the panel's modules, which was checked for
// import-time side effects: every chrome.runtime.onMessage listener in that
// graph is registered lazily (proxy load()/mirrorWindow(), or inside React
// effects), none at import, so nothing here listens for messages.

import { readResumeState, STEP_SETTLE_MS, writeParkedOutcome } from './runner';
import { sleep } from './stepHelpers';
import { TestCase } from './types';

// Upper bound on the step's own action. Every closedPanel step is one or two
// chrome.* calls, so anything near this means a promise that will never
// settle, and waiting on it would leave the run parked forever.
const ACTION_TIMEOUT_MS = 15000;

/** Shows what the page is doing, for whoever happens to be watching the panel. */
function showStatus(text: string): void
{
  const status = document.getElementById('status');
  if (status) status.textContent = text;

  if (import.meta.env.DEV)
  {
    console.log(`[test-parked] ${text}`);
  }
}

function returnToSidebar(): void
{
  window.location.replace(chrome.runtime.getURL('index.html'));
}

function rejectAfter(ms: number): Promise<never>
{
  return new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms));
}

async function runParkedStep(): Promise<void>
{
  const state = await readResumeState();
  if (!state)
  {
    showStatus('No paused test run found - returning to the sidebar.');
    return;
  }

  // Loaded here rather than imported at the top, so a case module that fails
  // to load or evaluate lands in a catch on this page - recorded on the
  // checkpoint as a failed parked step - instead of stopping the page before
  // it can navigate back.
  let allCases: TestCase[];
  try
  {
    ({ ALL_CASES: allCases } = await import('./cases'));
  }
  catch (err)
  {
    const message = `could not load the test cases: ${err instanceof Error ? err.message : String(err)}`;
    showStatus(`Test runner parked: ${message}. Returning to the sidebar...`);
    await writeParkedOutcome(state, message);
    return;
  }

  const testCase = allCases.find(c => c.id === state.caseId);
  const step = testCase?.steps[state.stepIndex];
  if (!testCase || step?.kind !== 'closedPanel')
  {
    // Leaves the checkpoint untouched, so the panel shows its banner for it
    // instead of resuming as though something had been done.
    showStatus(`Test ${state.caseId} step ${state.stepIndex + 1} has no panel-closed action - returning to the sidebar.`);
    return;
  }

  showStatus(`Test runner parked: ${testCase.id} - ${step.label}. Running it with the sidebar unloaded...`);
  try
  {
    await Promise.race([step.run(state.refs), rejectAfter(ACTION_TIMEOUT_MS)]);
    showStatus(`Test runner parked: ${testCase.id} - done, waiting for the extension to settle...`);
    await sleep(STEP_SETTLE_MS);
    await writeParkedOutcome(state);
  }
  catch (err)
  {
    const message = err instanceof Error ? err.message : String(err);
    showStatus(`Test runner parked: ${testCase.id} - the action failed (${message}). Returning to the sidebar...`);
    await writeParkedOutcome(state, message);
  }
}

// Whatever happens above, go back to the sidebar.
runParkedStep()
  .catch((err) =>
  {
    showStatus(`Parked page error: ${err instanceof Error ? err.message : String(err)} - returning to the sidebar.`);
  })
  .finally(returnToSidebar);
