// Spike: can a driver script trigger the extension's side panel through a
// full open -> close -> reopen cycle, and confirm the panel's JS context
// truly tears down and remounts each time? This is the load-bearing
// assumption behind automating any "sidebar closed" test case in
// docs/test/tab-space-association-test-cases.md.
//
// Unknowns this script exists to answer (see e2e/README.md for context):
//   1. Does the real Cmd+Shift+E keystroke (sent via AppleScript, not CDP
//      input) actually reach Chrome's global command dispatcher and toggle
//      the panel, given the "_execute_side_panel" command is a browser-level
//      shortcut rather than a page-level one?
//   2. Does closing/reopening the panel truly tear down and recreate its JS
//      context (proving we can test "sidebar was closed" scenarios), or does
//      Chrome keep it alive in the background?
//
// Run with: node e2e/spike-panel-lifecycle.mjs
// Prerequisites:
//   1. `npm run build:debug` (dist/ must contain the heartbeat writes from
//      src/tests/testHooks.ts).
//   2. A ONE-TIME manual load of dist/ into tools/tmp/chrome-test-profile:
//      real Google Chrome silently ignores the --load-extension /
//      --disable-extensions-except command-line flags now (locked down circa
//      2024 to stop malware from injecting extensions this way), so we can't
//      load it fresh via CLI flags. Instead: run tools/start-test-chrome.sh,
//      go to chrome://extensions, enable Developer mode, click "Load
//      unpacked", pick dist/, then close Chrome. Chrome persists that
//      registration in the profile's Preferences, so subsequent launches
//      (including this script's) resume it without needing the CLI flags.
//
// Already learned:
//   - Playwright's own launchPersistentContext() launch wrapper was silently
//     losing the Chrome process shortly after start (against this real, very
//     new Chrome build). Spawning Chrome ourselves with --remote-debugging-port
//     and attaching via chromium.connectOverCDP() worked where
//     launchPersistentContext() did not - see e2e/diag-launch-chrome.mjs.
//   - "tell application Google Chrome to activate" is ambiguous with more
//     than one Google Chrome process running (e.g. your regular browsing
//     profile alongside this test instance) - target the spawned process by
//     its actual unix pid instead, in a SEPARATE osascript invocation from
//     the frontmost check (bundling both into one script read back a stale
//     value).
//   - The keystroke does visibly open/close the panel (confirmed by eye) even
//     when Playwright's own context.pages() fails to ever list it as a page -
//     side panel targets apparently aren't reliably auto-attached by
//     Playwright. So verification here goes through chrome.storage.session
//     heartbeats read via the service worker instead of ever trying to
//     find/evaluate the panel's own page: testHooksMountedAt is written by
//     the panel itself on mount (src/tests/testHooks.ts); testHooksClosedAt
//     is written by the BACKGROUND on chrome.runtime.connect port disconnect
//     (background.ts) rather than from a page-lifecycle event in the panel -
//     pagehide's async storage write can race with the page's context being
//     destroyed before it finishes, so the panel can't reliably report its
//     own teardown.
//   - CRITICAL gotcha that cost most of the debugging time: Chrome's service
//     worker is a REGISTERED script cached in the profile - rebuilding
//     dist/background.js does NOT make Chrome pick it up. Extension pages
//     (index.html etc.) are re-read from disk on every load, but the service
//     worker only re-registers when Chrome detects the extension version
//     changed. Since manifest.json's version doesn't bump on every
//     build:debug, a plain rebuild silently keeps running the OLD background
//     script with no error of any kind. After every background.ts change:
//     either bump the version (tools/update-version.sh) or manually click
//     "Reload" for the extension in chrome://extensions before rerunning
//     this script.

import { chromium } from 'playwright-core';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.resolve(__dirname, '../tools/tmp/chrome-test-profile');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9333;

const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 10000;
const CDP_READY_TIMEOUT_MS = 10000;

function log(step, message)
{
  console.log(`[${step}] ${message}`);
}

function spawnChrome()
{
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', d => process.stdout.write(`[chrome stdout] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[chrome stderr] ${d}`));
  child.on('exit', (code, signal) => log('chrome', `process exited: code=${code} signal=${signal}`));

  return child;
}

async function waitForCdpReady()
{
  const deadline = Date.now() + CDP_READY_TIMEOUT_MS;
  while (Date.now() < deadline)
  {
    try
    {
      const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
      if (res.ok) return true;
    }
    catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function sendToggleShortcut(pid)
{
  // Real OS-level keystroke via System Events, not a CDP-dispatched input
  // event - this is what should carry genuine "user gesture" credentials
  // for the browser-level _execute_side_panel command.
  //
  // Deliberately two SEPARATE osascript invocations for set-frontmost vs.
  // confirm-frontmost - bundling them into one script (two -e statements)
  // read back a stale/cached frontmost value before the window server
  // actually finished the focus switch.
  for (let i = 0; i < 20; i++)
  {
    await execFileAsync('osascript', [
      '-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`,
    ]);
    const { stdout } = await execFileAsync('osascript', [
      '-e', 'tell application "System Events" to get unix id of (first process whose frontmost is true)',
    ]);
    if (stdout.trim() === String(pid)) break;
    await new Promise(r => setTimeout(r, 150));
  }

  await execFileAsync('osascript', [
    '-e', 'tell application "System Events" to keystroke "e" using {command down, shift down}',
  ]);
}

async function readHeartbeat(worker)
{
  return worker.evaluate(() =>
    chrome.storage.session.get(['testHooksMountedAt', 'testHooksClosedAt'])
  );
}

async function waitForMountedAfter(worker, afterTimestamp)
{
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline)
  {
    const { testHooksMountedAt } = await readHeartbeat(worker);
    if (typeof testHooksMountedAt === 'number' && testHooksMountedAt > afterTimestamp)
    {
      return testHooksMountedAt;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function waitForClosedAfter(worker, afterTimestamp)
{
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline)
  {
    const { testHooksClosedAt } = await readHeartbeat(worker);
    if (typeof testHooksClosedAt === 'number' && testHooksClosedAt > afterTimestamp)
    {
      return testHooksClosedAt;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

// A freshly-launched Chrome window sometimes isn't settled enough to reliably
// receive a real OS-level keystroke on the first attempt - retry the toggle
// itself (not just the wait) a couple of times before giving up.
async function toggleWithRetry(pid, waitFn, label, maxAttempts = 3)
{
  for (let attempt = 1; attempt <= maxAttempts; attempt++)
  {
    log(label, `Toggle attempt ${attempt}/${maxAttempts}...`);
    await sendToggleShortcut(pid);
    const result = await waitFn();
    if (result) return result;
  }
  return null;
}

async function main()
{
  log('setup', `Spawning Chrome directly against ${USER_DATA_DIR} (extension must already be loaded there manually - see prerequisites above)`);
  const chromeProcess = spawnChrome();

  try
  {
    log('setup', 'Waiting for the CDP endpoint to come up...');
    const cdpReady = await waitForCdpReady();
    if (!cdpReady)
    {
      log('setup', 'FAIL - CDP endpoint never came up within 10s. See [chrome stdout]/[chrome stderr] lines above.');
      return;
    }

    log('setup', 'Connecting Playwright to the running Chrome via connectOverCDP...');
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);

    try
    {
      const context = browser.contexts()[0];
      if (!context)
      {
        log('setup', 'FAIL - browser.contexts() was empty after connecting.');
        return;
      }

      log('setup', 'Waiting for the extension service worker to register...');
      let worker = context.serviceWorkers()[0];
      if (!worker)
      {
        worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
      }
      if (!worker)
      {
        log('setup', 'FAIL - no service worker registered within 15s.');
        return;
      }
      const extensionId = new URL(worker.url()).hostname;
      log('setup', `Extension ID: ${extensionId}`);

      log('open', 'Letting the window settle before sending the first keystroke...');
      await new Promise(r => setTimeout(r, 2000));

      const baseline = await readHeartbeat(worker);
      log('open', `Baseline heartbeat before any toggle: ${JSON.stringify(baseline)}`);

      log('open', 'Sending Cmd+Shift+E to open the panel...');
      const firstMountedAt = await toggleWithRetry(
        chromeProcess.pid,
        () => waitForMountedAfter(worker, baseline.testHooksMountedAt ?? 0),
        'open'
      );
      if (!firstMountedAt)
      {
        log('open', 'FAIL - testHooksMountedAt never appeared/increased after retries. ' +
          'Either the keystroke isn\'t reaching Chrome, or the panel opened but testHooks.ts didn\'t write the heartbeat.');
        return;
      }
      log('open', `PASS - panel mounted, testHooksMountedAt = ${firstMountedAt}`);

      log('close', 'Sending Cmd+Shift+E again to toggle the panel closed...');
      const closedAt = await toggleWithRetry(
        chromeProcess.pid,
        () => waitForClosedAfter(worker, baseline.testHooksClosedAt ?? 0),
        'close'
      );
      if (!closedAt)
      {
        const diag = await readHeartbeat(worker);
        log('close', `DIAG: full heartbeat after failed close attempts: ${JSON.stringify(diag)}`);
        log('close', 'FAIL - testHooksClosedAt never appeared/increased after retries (port never connected, disconnect never fired, or the panel didn\'t actually close).');
        return;
      }
      log('close', `PASS - panel closed, testHooksClosedAt = ${closedAt}`);

      log('reopen', 'Sending Cmd+Shift+E a third time to reopen the panel...');
      const secondMountedAt = await toggleWithRetry(
        chromeProcess.pid,
        () => waitForMountedAfter(worker, firstMountedAt),
        'reopen'
      );
      if (!secondMountedAt)
      {
        log('reopen', 'FAIL - testHooksMountedAt never increased again after retries.');
        return;
      }
      log('reopen', `PASS - panel reopened with a fresh JS context, testHooksMountedAt = ${secondMountedAt} (was ${firstMountedAt}), ` +
        'confirming close/reopen genuinely tears down and recreates state rather than reusing it.');

      console.log('\nSpike complete. All PASS lines above confirm the mechanism works.');
    }
    finally
    {
      await browser.close().catch(() => { /* may already be disconnected */ });
    }
  }
  finally
  {
    chromeProcess.kill();
  }
}

main().catch(err =>
{
  console.error('Spike crashed:', err);
  process.exitCode = 1;
});
