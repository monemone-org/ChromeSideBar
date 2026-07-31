// Runs YAML test cases (e2e/test-cases/*.yaml) against the extension via
// direct chrome.* API calls - no UI click/drag simulation needed, since the
// background reacts to the same underlying Chrome events regardless of what
// triggered them (a real user's click, the sidebar's own code, or us calling
// the API directly).
//
// Run with: node e2e/run-test-cases.mjs [--watch|--step] [path/to/specific.yaml ...]
// (defaults to every *.yaml file in e2e/test-cases/)
//
// --watch: brings Chrome to the front, narrates each step, pauses briefly
// between them, and activates whatever tab a step touches - for visually
// watching a test case run instead of just reading the PASS/FAIL summary.
//
// --step: same as --watch, but pauses and waits for you to press Enter
// between each step instead of a fixed delay - for stepping through at your
// own pace.
//
// Prerequisites: same as e2e/spike-panel-lifecycle.mjs - build:debug, and the
// extension already loaded + reloaded in tools/tmp/chrome-test-profile. See
// e2e/README.md, especially the stale-service-worker gotcha.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { load as loadYaml } from 'js-yaml';
import { launchAndConnect, disconnect, bringToFront, ensureSidebarState } from './lib/chromeDriver.mjs';
import { resetState, seedFixture } from './lib/fixtures.mjs';
import { actions, assertions } from './lib/actions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(__dirname, 'test-cases');
const WATCH_PAUSE_MS = 1500;

function waitForEnter(prompt)
{
  return new Promise((resolve) =>
  {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () =>
    {
      rl.close();
      // readline.question() doesn't itself emit a newline after the prompt -
      // it relies on the terminal echoing the Enter keypress to create one.
      // That's not reliable across terminals/input modes, so force one
      // explicitly rather than risk the next printed line running onto the
      // same visual line as the prompt.
      process.stdout.write('\n');
      resolve();
    });
  });
}

function loadTestCases(paths)
{
  const files = paths.length > 0
    ? paths
    : readdirSync(DEFAULT_DIR).filter(f => f.endsWith('.yaml')).map(f => path.join(DEFAULT_DIR, f));

  return files.map(f => ({ file: f, testCase: loadYaml(readFileSync(f, 'utf8')) }));
}

function describeStep(step)
{
  if (step.action)
  {
    const { action, ...params } = step;
    return `action ${action} ${JSON.stringify(params)}`;
  }
  const { assert, ...params } = step;
  return `assert ${assert} ${JSON.stringify(params)}`;
}

/** Best-effort: bring whatever tab this step touches to the front so it's visible. */
async function activateTouchedTab(session, refs, step)
{
  const ref = refs[step.tab] ?? (step.as ? refs[step.as] : undefined);
  if (!ref || typeof ref.tabId !== 'number') return;

  await session.worker.evaluate(async ({ tabId }) =>
  {
    try { await chrome.tabs.update(tabId, { active: true }); }
    catch { /* tab may not exist yet/anymore */ }
  }, { tabId: ref.tabId });
}

async function runOneTestCase(session, testCase, { watch, step: stepMode })
{
  const narrate = watch || stepMode;
  await resetState(session.worker);

  if (testCase.initial_sidebar !== 'open' && testCase.initial_sidebar !== 'closed')
  {
    return {
      passed: false,
      error: `Test case is missing a top-level "initial_sidebar: open" or "initial_sidebar: closed" - ` +
        `the starting panel state must be explicit, not assumed.`,
    };
  }

  const seeded = await seedFixture(session.worker, testCase.fixture ?? {});
  const refs = { __spaces: seeded.spaces, ...seeded.bookmarks, ...seeded.pinnedSites };

  if (narrate) console.log(`    [setup] ensuring sidebar starts ${testCase.initial_sidebar}`);
  await ensureSidebarState(session, testCase.initial_sidebar);

  for (const [index, step] of (testCase.steps ?? []).entries())
  {
    const stepNum = index + 1;


    if (stepMode)
    {
      await waitForEnter(`    press Enter to run this step:\n      [${stepNum}] ${describeStep(step)}`);
    }
    else if (narrate)
    {
      console.log(`    [${stepNum}] ${describeStep(step)}`);
    }

    try
    {
      if (step.action)
      {
        const fn = actions[step.action];
        if (!fn) throw new Error(`Unknown action "${step.action}"`);
        await fn(session, refs, step);
      }
      else if (step.assert)
      {
        const fn = assertions[step.assert];
        if (!fn) throw new Error(`Unknown assertion "${step.assert}"`);
        await fn(session, refs, step);
      }
      else
      {
        throw new Error(`Step ${stepNum} has neither "action" nor "assert"`);
      }
    }
    catch (err)
    {
      return {
        passed: false,
        error: `Step ${stepNum} (${step.action ? `action: ${step.action}` : `assert: ${step.assert}`}) failed: ${err.message}`,
      };
    }

    if (narrate)
    {
      await activateTouchedTab(session, refs, step);
    }

    if (watch && !stepMode)
    {
      await new Promise(r => setTimeout(r, WATCH_PAUSE_MS));
    }
  }

  return { passed: true };
}

async function main()
{
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const step = args.includes('--step');
  const paths = args.filter(a => a !== '--watch' && a !== '--step');
  const entries = loadTestCases(paths);

  const mode = step ? ' (--step mode)' : watch ? ' (--watch mode)' : '';
  console.log(`Loaded ${entries.length} test case(s).${mode}`);
  console.log('Launching Chrome...');
  const session = await launchAndConnect();

  if (watch || step)
  {
    await bringToFront(session.chromeProcess.pid);
  }

  const results = [];
  try
  {
    for (const { file, testCase } of entries)
    {
      console.log(`  ${testCase.id} - ${testCase.title}`);
      const result = await runOneTestCase(session, testCase, { watch, step });
      results.push({ file, id: testCase.id, title: testCase.title, ...result });
      console.log(`  -> ${result.passed ? 'PASS' : `FAIL\n     ${result.error}`}`);
    }
  }
  finally
  {
    await disconnect(session);
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch(err =>
{
  console.error('Runner crashed:', err);
  process.exitCode = 1;
});
