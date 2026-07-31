// Reusable Chrome launch/connect/panel-toggle plumbing, extracted from the
// original spike-panel-lifecycle.mjs once the mechanism was proven. See
// e2e/README.md for the gotchas this works around (stale service worker
// cache, Playwright's launchPersistentContext losing the process, ambiguous
// multi-Chrome-instance keystroke targeting, side panel pages not reliably
// surfacing via context.pages()).

import { chromium } from 'playwright-core';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const USER_DATA_DIR = path.resolve(__dirname, '../../tools/tmp/chrome-test-profile');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9333;

const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 10000;
const CDP_READY_TIMEOUT_MS = 10000;

function spawnChrome()
{
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  child.stderr.on('data', () => { /* swallow Chrome's own noisy logging */ });
  child.stdout.on('data', () => { /* swallow Chrome's own noisy logging */ });

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

/** Launch Chrome against the shared test profile and connect Playwright over CDP. */
export async function launchAndConnect()
{
  const chromeProcess = spawnChrome();

  const cdpReady = await waitForCdpReady();
  if (!cdpReady)
  {
    chromeProcess.kill();
    throw new Error('CDP endpoint never came up within 10s - is the extension loaded in tools/tmp/chrome-test-profile? See e2e/README.md.');
  }

  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const context = browser.contexts()[0];
  if (!context)
  {
    await browser.close().catch(() => {});
    chromeProcess.kill();
    throw new Error('browser.contexts() was empty after connecting.');
  }

  let worker = context.serviceWorkers()[0];
  if (!worker)
  {
    worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  if (!worker)
  {
    await browser.close().catch(() => {});
    chromeProcess.kill();
    throw new Error('No service worker registered within 15s. If you just rebuilt, did you reload the extension in chrome://extensions? See e2e/README.md.');
  }

  const extensionId = new URL(worker.url()).hostname;

  // Let the window settle before the first keystroke - a freshly-launched
  // window sometimes isn't ready to reliably receive one yet.
  await new Promise(r => setTimeout(r, 2000));

  return { chromeProcess, browser, context, worker, extensionId };
}

/** Tear down a session from launchAndConnect(). */
export async function disconnect({ browser, chromeProcess })
{
  await browser.close().catch(() => { /* may already be disconnected */ });
  chromeProcess.kill();
}

/**
 * Bring the spawned Chrome process to the front by its actual unix pid -
 * "tell application Google Chrome to activate" is ambiguous when more than
 * one Chrome process is running (see e2e/README.md). Deliberately two
 * SEPARATE osascript invocations for set-frontmost vs. confirm-frontmost -
 * bundling both into one script read back a stale/cached value before the
 * window server actually finished the focus switch.
 */
export async function bringToFront(pid)
{
  for (let i = 0; i < 20; i++)
  {
    await execFileAsync('osascript', [
      '-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`,
    ]);
    const { stdout } = await execFileAsync('osascript', [
      '-e', 'tell application "System Events" to get unix id of (first process whose frontmost is true)',
    ]);
    if (stdout.trim() === String(pid)) return;
    await new Promise(r => setTimeout(r, 150));
  }
}

async function sendToggleShortcut(pid)
{
  // Real OS-level keystroke via System Events, not a CDP-dispatched input
  // event - this is what carries genuine "user gesture" credentials for the
  // browser-level _execute_side_panel command.
  await bringToFront(pid);

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

async function pollUntil(worker, field, afterTimestamp)
{
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline)
  {
    const heartbeat = await readHeartbeat(worker);
    const value = heartbeat[field];
    if (typeof value === 'number' && value > afterTimestamp) return value;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

// A freshly-launched (or freshly-toggled) Chrome window sometimes isn't
// settled enough to reliably receive a real OS-level keystroke on the first
// attempt - retry the toggle itself (not just the wait) a couple of times.
async function toggleUntil(session, field, maxAttempts = 3)
{
  const baseline = (await readHeartbeat(session.worker))[field] ?? 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++)
  {
    await sendToggleShortcut(session.chromeProcess.pid);
    const result = await pollUntil(session.worker, field, baseline);
    if (result) return result;
  }
  throw new Error(`Toggling the panel never produced a new "${field}" heartbeat after ${maxAttempts} attempts.`);
}

/** Open the side panel (idempotent-ish: if already open, this will actually close it - callers should track panel state themselves for multi-step scenarios). */
export async function openSidebar(session)
{
  return toggleUntil(session, 'testHooksMountedAt');
}

/** Close the side panel. */
export async function closeSidebar(session)
{
  return toggleUntil(session, 'testHooksClosedAt');
}

/**
 * Current panel state, inferred from which heartbeat is more recent. Neither
 * timestamp set means the panel has never been opened this Chrome session,
 * which is the same as "closed" for our purposes.
 */
export async function getSidebarState(session)
{
  const { testHooksMountedAt, testHooksClosedAt } = await readHeartbeat(session.worker);
  if (typeof testHooksMountedAt !== 'number') return 'closed';
  if (typeof testHooksClosedAt !== 'number') return 'open';
  return testHooksMountedAt > testHooksClosedAt ? 'open' : 'closed';
}

/** Toggle the panel (if needed) so it ends up in the requested state. */
export async function ensureSidebarState(session, desired)
{
  const current = await getSidebarState(session);
  if (current === desired) return;
  if (desired === 'open') await openSidebar(session);
  else await closeSidebar(session);
}
