#!/usr/bin/env node
// Runs the in-panel test suite (src/tests/inpanel/) with nobody at the
// keyboard in the test Chrome started by tools/start-test-chrome.sh, and does
// the few pause steps
// only something outside the extension can do: stopping the service worker
// (E.3, P.8), reloading the extension (E.1) and, only on a Chrome profile
// inside tools/tmp/ that is not signed in, deleting the browsing history (P.6,
// see ProfileGuard).
// See "Phase 4b: the driver script" in docs/test/test-runner-automation-plan.md.
//
// Run it as exactly `node tools/run-inpanel-tests.mjs`, with no arguments: the
// sandbox exclusion for it matches the bare command. Options come from
// tools/tmp/run-inpanel-tests.json, which may be missing (run every case).
// Lines starting with // are comments. Every key is optional:
//
//   {
//     // Section letters and/or case ids to run. Both together run the union;
//     // neither runs every case.
//     "sections": ["E", "P"],
//     "cases": ["A.1", "C.2g"],
//     // Give up after this many minutes (default 45).
//     "timeoutMinutes": 45,
//     // This extension's id, if finding it by its dist folder does not work.
//     "extensionId": "abcdefghijklmnopabcdefghijklmnop",
//     // Leave the test and helper windows open at the end, for a look around.
//     "keepWindows": false,
//     // The DevTools port start-test-chrome.sh opened (default 9333).
//     "cdpPort": 9333
//   }
//
// What it does, in order: finds this extension in chrome://extensions (and
// enables it if it is disabled), opens a helper tab in a window of its own
// and a fresh test window, opens the side panel there, opens the Test Runner
// from the sidebar's Menu, clears away a leftover popup or paused run,
// selects the cases (by writing the panel's own storage key), and clicks Run
// Tests. It then watches the run through
// chrome.storage.local from the helper tab, performs pauses marked
// `external`, and discards (skips) any pause that still needs a person,
// restarting the rest of the batch after it. At the end, or on Ctrl-C, it
// writes tools/tmp/test-results-<timestamp>.json in the shape of the panel's
// Download Results, prints a summary and closes the windows it opened.
//
// Exit code: 0 when every case that ran passed, failed only at its known-gap
// step (KNOWN_GAP_FAILING_STEPS), or was skipped as expected
// (EXPECTED_MANUAL_CASE_IDS, or P.6 when the profile guard refused to clear
// browsing data); 1 otherwise, including when a selected case
// never produced a result or the driver itself failed. 130/143 when stopped
// by SIGINT/SIGTERM.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BrowserConnection, DEFAULT_DEBUG_PORT, debugHostFor } from './cdp-client.mjs';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = resolve(TOOLS_DIR, 'tmp');
const CONFIG_FILE = resolve(TMP_DIR, 'run-inpanel-tests.json');
const DIST_DIR = resolve(TOOLS_DIR, '..', 'dist');

// Cases with an assertion documented as currently expected to fail (known
// gap G2 and friends), with the exact step names expected to fail. A failure
// at one of these steps does not fail the run; a failure at any other step of
// the same case does.
const KNOWN_GAP_FAILING_STEPS = {
  'A.3': ['Bookmark "bm" is not loaded'],
  'A.5': ['Bookmark "bmOpen" is not loaded', 'Bookmark "bmClosed" is not loaded'],
  'A.6': ['Bookmark "bmClosed" is not loaded'],
  'A.6c': ['Pinned site "pinClosed" is not loaded'],
  'B.5': ['Bookmark "bm" is not loaded'],
  'B.5b': ['Bookmark "bm" is not loaded'],
};

// Cases with a pause no driver can do (P.10 needs a pin made in a second
// window's sidebar). Skipping these is expected. A skip because the profile
// guard refused to clear browsing data (P.6, see ProfileGuard) is expected
// too. Any other skip fails the run.
const EXPECTED_MANUAL_CASE_IDS = ['P.10'];

// The Clear browsing data dialog's pref for the "Browsing history" checkbox:
// the only data type the driver deletes. Deleting history for all time also
// drops Chrome's stored favicons, which is what P.6 needs.
const BROWSING_HISTORY_PREF = 'browser.clear_data.browsing_history';
// The time period pref the dialog uses when its picker does not name one.
const DEFAULT_TIME_PERIOD_PREF = 'browser.clear_data.time_period';
// Chrome's TimePeriod value for "All time".
const TIME_PERIOD_ALL_TIME = 4;
// How long Chrome gets to delete the data once Delete is clicked.
const CLEAR_DATA_TIMEOUT_MS = 60000;

// URL prefixes of the pages test cases open, mirroring isTestUrl() in
// src/tests/inpanel/fixtures.ts. A window opened during the run whose tabs are
// all of these (or this extension's pages, or the chrome:// pages cases open)
// is a test artifact and is closed at the end.
const TEST_PAGE_PREFIXES = [
  'https://example.com/inpanel-test-',
  'https://example.org/inpanel-test-',
  'chrome://extensions',
  'chrome://settings',
];

// The storage keys the panel's runner keeps its state in (src/tests/inpanel/runner.ts and TestRunnerPanel.tsx).
const STORAGE_KEYS = {
  resume: 'testRunnerResumeState',
  caseResults: 'testRunnerCaseResults',
  batchQueue: 'testRunnerBatchQueue',
  batchCaseIds: 'testRunnerBatchCaseIds',
  deselected: 'testRunnerDeselectedCaseIds',
  manual: 'testRunnerManualMode',
};

const DEFAULT_TIMEOUT_MINUTES = 45;
// How often the run's progress is read from storage.
const POLL_MS = 1000;
// How long the panel has to sit at the same pause, with its buttons enabled,
// before the driver treats it as waiting. Covers the moment between a
// checkpoint being written and the panel's own automatic resume taking over.
const PAUSE_STABLE_MS = 2500;
// How long the panel has to sit idle with a batch still recorded and no
// pause before the driver treats the batch as stopped by an error.
const STALL_STABLE_MS = 8000;
// How long nothing may change - not storage, not the panel's step list,
// banner or buttons - before the driver decides the run is stuck. Longer than
// any healthy stretch without a visible change: every step shows its result
// as it finishes, and the slowest single steps (polling assertions with ~30s
// deadlines, a parked action capped at 15s plus the panel's 10s ready wait)
// stay well under a minute. The driver's own external actions do not count,
// since the timer restarts after each one.
const NO_PROGRESS_MS = 3 * 60000;
// Per-call ceiling on scripts the driver evaluates in a page; a call inside a
// wait gets less when the wait has less left.
const EVAL_TIMEOUT_MS = 15000;
// The shortest timeout a single CDP call is given, even when a wait is
// nearly out of time, so the last round still gets a real answer.
const MIN_CALL_MS = 1000;
// A single CDP call slower than this is logged.
const SLOW_CALL_MS = 5000;
// A gap this much longer than expected between two rounds of a wait means
// the machine was asleep, not that Chrome was slow.
const SLEEP_GAP_MS = 60000;
// How many times the driver may start a batch over after skipping or losing a
// case, so a pathological loop cannot go on until the overall timeout.
const MAX_BATCH_RESTARTS = 40;
// How many times the driver clicks Resume on one pause before giving up on it.
const MAX_RESUME_ATTEMPTS = 3;
// How many storage reads in a row may fail before the run is given up.
const MAX_CONSECUTIVE_READ_FAILURES = 5;
// How many polls in a row the panel may be missing from the test window
// before the driver opens it again.
const PANEL_MISSING_POLLS = 5;
// The extension reload can take a while to answer.
const RELOAD_TIMEOUT_MS = 45000;
// How long a shutdown (signal or watchdog) gets to write results and clean up.
const SHUTDOWN_GRACE_MS = 30000;
// How long finish() waits for an aborted run() to stop before cleaning up.
const RUN_SETTLE_MS = 5000;

// CDP errors meaning the session or the target behind it is gone, and the
// ones meaning the page navigated while a script was running in it.
const STALE_TARGET_PATTERN = /Session with given id not found|No session with given id|No target with given id|Target closed|not attached/i;
const NAVIGATED_PATTERN = /navigated or closed|Execution context was destroyed|Cannot find context/i;

function log(message)
{
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`[${time}] ${message}`);
}

function errorText(error)
{
  return error instanceof Error ? error.message : String(error);
}

function describeValue(value)
{
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

// ---------------------------------------------------------------------------
// Time budgets, aborting, and waiting
// ---------------------------------------------------------------------------

/** Set by a signal or the watchdog; every wait and the watch loop stop at the next check. */
class AbortState
{
  static reason = null;

  static request(reason)
  {
    if (!AbortState.reason) AbortState.reason = reason;
  }

  static get requested()
  {
    return AbortState.reason !== null;
  }

  static throwIfRequested()
  {
    if (AbortState.requested) throw new Error(`aborted (${AbortState.reason})`);
  }

  /**
   * What a wait checks: like throwIfRequested, except inside finish(), whose
   * waits (a new helper, reading results, restoring settings) are exactly
   * what an abort still needs. Those stay bounded by their own timeouts and
   * by the shutdown's grace period.
   */
  static throwIfRequestedOutsideFinish()
  {
    if (finishScope.getStore()) return;
    AbortState.throwIfRequested();
  }
}

// Marks the async work started by finish(), so an abort does not cut it short.
const finishScope = new AsyncLocalStorage();

const deadlineScope = new AsyncLocalStorage();

/**
 * The time budget of one wait. While a probe runs, the wait's deadline is the
 * "current" one, and every CDP call made inside gets at most what is left of
 * it (see Deadline.capCall), so one slow call cannot carry a wait far past
 * its deadline. A nested wait ends no later than the one around it.
 */
class Deadline
{
  constructor(timeoutMs)
  {
    const outer = Deadline.current();
    this.startedAt = Date.now();
    this.endsAt = Math.min(this.startedAt + timeoutMs, outer ? outer.endsAt : Infinity);
    this.timeoutMs = timeoutMs;
    this.resetForSleep = false;
  }

  static current()
  {
    return deadlineScope.getStore();
  }

  /** A per-call timeout: the given ceiling, cut down to what the current wait has left (never below MIN_CALL_MS). */
  static capCall(ceilingMs)
  {
    const current = Deadline.current();
    if (!current) return ceilingMs;
    return Math.max(MIN_CALL_MS, Math.min(ceilingMs, current.remaining()));
  }

  remaining()
  {
    return this.endsAt - Date.now();
  }

  get passed()
  {
    return this.remaining() <= 0;
  }

  /** Gives the wait its whole budget again, once, after the machine slept through it. */
  restartAfterSleep()
  {
    if (this.resetForSleep) return false;
    this.resetForSleep = true;
    this.endsAt = Date.now() + this.timeoutMs;
    return true;
  }

  run(fn)
  {
    return deadlineScope.run(this, fn);
  }
}

/**
 * Notices the machine sleeping: the wall clock jumps while the monotonic one
 * (and the interval just slept) does not account for it.
 */
class SleepDetector
{
  constructor()
  {
    this.wall = Date.now();
    this.mono = performance.now();
  }

  /**
   * How long the machine seems to have slept since the last check (0 when it
   * did not). `expectedMs` is how long the stretch since the last check
   * should have taken (a timer's interval); pass null for a stretch of work
   * whose length is unknown, which then counts only time the monotonic clock
   * did not see.
   */
  check(expectedMs = null)
  {
    const wall = Date.now();
    const mono = performance.now();
    const wallDelta = wall - this.wall;
    const monoDelta = mono - this.mono;
    this.wall = wall;
    this.mono = mono;
    const unaccounted = Math.max(wallDelta - monoDelta, expectedMs === null ? 0 : wallDelta - expectedMs);
    return unaccounted > SLEEP_GAP_MS ? unaccounted : 0;
  }
}

/**
 * Polls `probe` until it returns something truthy, and returns that. Errors
 * from the probe count as "not yet". On timeout the error says how long it
 * really waited, how many rounds it made and what the last round did, and
 * adds `hint` (a string, or a function of the last value) only when the last
 * round answered without throwing - when it threw, the error is the clue.
 */
async function waitFor(what, probe, { timeoutMs = 30000, intervalMs = 500, hint = '' } = {})
{
  const deadline = new Deadline(timeoutMs);
  const sleepDetector = new SleepDetector();
  let rounds = 0;
  let lastError = null;
  let lastValue;

  // Poll until the probe answers, the deadline passes or the run is aborted
  while (true)
  {
    AbortState.throwIfRequestedOutsideFinish();
    rounds++;
    try
    {
      const value = await deadline.run(probe);
      lastError = null;
      lastValue = value;
      if (value) return value;
    }
    catch (error)
    {
      lastError = error;
    }

    // A wait the machine slept through gets its whole budget again, once
    const sleptInProbe = sleepDetector.check(null);
    if (sleptInProbe && deadline.restartAfterSleep())
    {
      log(`the machine seems to have slept ${Math.round(sleptInProbe / 1000)}s while waiting for ${what} - restarting that wait`);
    }

    if (deadline.passed) break;
    const pauseMs = Math.min(intervalMs, Math.max(0, deadline.remaining()));
    await sleep(pauseMs);
    const sleptInPause = sleepDetector.check(pauseMs);
    if (sleptInPause && deadline.restartAfterSleep())
    {
      log(`the machine seems to have slept ${Math.round(sleptInPause / 1000)}s while waiting for ${what} - restarting that wait`);
    }
  }

  const elapsedS = ((Date.now() - deadline.startedAt) / 1000).toFixed(1);
  const parts = [`timed out after ${elapsedS}s (${rounds} round${rounds === 1 ? '' : 's'}) waiting for ${what}.`];
  if (lastError)
  {
    parts.push(`The last round threw: ${errorText(lastError)}`);
  }
  else
  {
    parts.push(`The last round returned ${describeValue(lastValue)}.`);
    const hintText = typeof hint === 'function' ? hint(lastValue) : hint;
    if (hintText) parts.push(hintText);
  }
  throw new Error(parts.join(' '));
}

/** Turns a function into an expression that calls it in a page with JSON arguments. The function must not use anything from this file. */
function pageCall(fn, ...args)
{
  return `(${fn.toString()})(...${JSON.stringify(args)})`;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** The options in tools/tmp/run-inpanel-tests.json, with defaults for what it leaves out. */
class DriverConfig
{
  static #KNOWN_KEYS = ['sections', 'cases', 'timeoutMinutes', 'extensionId', 'keepWindows', 'cdpPort'];

  constructor(raw, source)
  {
    this.source = source;
    this.sections = DriverConfig.#stringList(raw.sections, 'sections');
    this.cases = DriverConfig.#stringList(raw.cases, 'cases');
    this.timeoutMs = (Number(raw.timeoutMinutes) > 0 ? Number(raw.timeoutMinutes) : DEFAULT_TIMEOUT_MINUTES) * 60000;
    this.extensionId = typeof raw.extensionId === 'string' && raw.extensionId ? raw.extensionId : undefined;
    this.keepWindows = raw.keepWindows === true;
    this.debugHost = debugHostFor(String(raw.cdpPort ?? DEFAULT_DEBUG_PORT));

    // Warn about keys that would otherwise be silently ignored, e.g. a typo
    for (const key of Object.keys(raw))
    {
      if (!DriverConfig.#KNOWN_KEYS.includes(key) && !key.startsWith('_') && !key.startsWith('//'))
      {
        log(`warning: ignoring unknown option "${key}" in ${source}`);
      }
    }
  }

  static load()
  {
    if (!existsSync(CONFIG_FILE))
    {
      log(`no ${CONFIG_FILE} - running every case (see the top of tools/run-inpanel-tests.mjs for the options)`);
      return new DriverConfig({}, 'defaults');
    }

    // Whole-line // comments are allowed, so the file can explain itself
    const text = readFileSync(CONFIG_FILE, 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
    let raw;
    try
    {
      raw = text.trim() ? JSON.parse(text) : {};
    }
    catch (error)
    {
      throw new Error(`${CONFIG_FILE} is not valid JSON: ${errorText(error)}`);
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${CONFIG_FILE} must hold one JSON object`);
    return new DriverConfig(raw, CONFIG_FILE);
  }

  static #stringList(value, name)
  {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`"${name}" in ${CONFIG_FILE} must be a list of strings`);
    return value;
  }

  /**
   * The case ids to run, in the panel's own list order. `available` is that
   * list (id + title) as read from the panel.
   */
  selectCases(available)
  {
    const allIds = available.map(c => c.id);
    if (this.sections.length === 0 && this.cases.length === 0) return allIds;

    const unknownCases = this.cases.filter(id => !allIds.includes(id));
    const unknownSections = this.sections.filter(section => !allIds.some(id => id[0] === section));
    if (unknownCases.length > 0 || unknownSections.length > 0)
    {
      throw new Error(`${CONFIG_FILE} names ${[...unknownSections.map(s => `section ${s}`), ...unknownCases].join(', ')}, which the Test Runner does not have. `
        + `Known cases: ${allIds.join(', ')}`);
    }

    // Section letter is the id's first character, as in the panel's sectionOf()
    return allIds.filter(id => this.cases.includes(id) || this.sections.includes(id[0]));
  }
}

// ---------------------------------------------------------------------------
// Talking to pages
// ---------------------------------------------------------------------------

/**
 * Attached sessions, one per target. This is the one place a stale session
 * is retried: the session is dropped, re-attached and the call made again,
 * once. A target that is really gone fails the re-attach, and the caller
 * decides what to do (usually: look for the target again next round).
 */
class SessionPool
{
  constructor(browser)
  {
    this.browser = browser;
    this.sessions = new Map();
  }

  async sessionFor(targetId)
  {
    if (!this.sessions.has(targetId))
    {
      this.sessions.set(targetId, await this.browser.attachToTargetId(targetId, Deadline.capCall(EVAL_TIMEOUT_MS)));
    }
    return this.sessions.get(targetId);
  }

  /** Detaches from a target, e.g. a tester's own page that was only probed. */
  forget(targetId)
  {
    const sessionId = this.sessions.get(targetId);
    this.sessions.delete(targetId);
    if (sessionId)
    {
      this.browser.send('Target.detachFromTarget', { sessionId }, undefined, 5000).catch(() => {});
    }
  }

  /** Drops the sessions of targets that no longer exist. */
  forgetMissing(liveTargets)
  {
    const liveIds = new Set(liveTargets.map(target => target.targetId));
    // Drop each session whose target is not in the live list (no detach: the target is gone)
    for (const targetId of [...this.sessions.keys()])
    {
      if (!liveIds.has(targetId)) this.sessions.delete(targetId);
    }
  }

  /**
   * Evaluates in a target, with a timeout no longer than `ceilingMs` or what
   * the current wait has left. A call cut off by the page navigating is
   * retried too, when the caller says the script is safe to run twice
   * (`retryOnNavigate`).
   */
  async evaluate(targetId, expression, { ceilingMs = EVAL_TIMEOUT_MS, userGesture = true, retryOnNavigate = true } = {})
  {
    // After an abort, only finish()'s own calls may still touch a page: a
    // run() that is still going must not, e.g., write its selection over the
    // tester's settings that cleanup has just restored
    AbortState.throwIfRequestedOutsideFinish();

    // At most two attempts: the first, and one after replacing the session
    for (let attempt = 1; ; attempt++)
    {
      try
      {
        const sessionId = await this.sessionFor(targetId);
        return await this.browser.evaluate(sessionId, expression, { timeoutMs: Deadline.capCall(ceilingMs), userGesture });
      }
      catch (error)
      {
        const message = errorText(error);
        const stale = STALE_TARGET_PATTERN.test(message);
        const navigated = NAVIGATED_PATTERN.test(message);
        if (stale || navigated) this.forget(targetId);
        if (attempt >= 2 || !(stale || (navigated && retryOnNavigate))) throw error;
        await sleep(300);
      }
    }
  }
}

/** Opens a page in a new window of its own and returns its target id. */
async function createWindowTarget(browser, url)
{
  const { targetId } = await browser.send('Target.createTarget', { url, newWindow: true, background: true }, undefined, Deadline.capCall(EVAL_TIMEOUT_MS));
  return targetId;
}

async function closeTarget(browser, targetId)
{
  try
  {
    await browser.send('Target.closeTarget', { targetId }, undefined, 5000);
  }
  catch
  {
    // Already gone, which is all closing wanted
  }
}

/**
 * Which browser window each tab is in, read through CDP alone, so it works
 * even when the extension (and with it the helper tab) is unavailable.
 */
class WindowCensus
{
  constructor(tabsByWindow)
  {
    this.tabsByWindow = tabsByWindow;   // window id -> [{ targetId, url }]
  }

  static async take(browser)
  {
    const tabsByWindow = new Map();
    const pages = (await browser.targets(10000)).filter(target => target.type === 'page');
    // Ask Chrome for each page's window
    for (const page of pages)
    {
      try
      {
        const { windowId } = await browser.send('Browser.getWindowForTarget', { targetId: page.targetId }, undefined, 5000);
        if (!tabsByWindow.has(windowId)) tabsByWindow.set(windowId, []);
        tabsByWindow.get(windowId).push({ targetId: page.targetId, url: page.url });
      }
      catch
      {
        // A page that closed meanwhile, or one with no window of its own
      }
    }
    return new WindowCensus(tabsByWindow);
  }

  windowIds()
  {
    return [...this.tabsByWindow.keys()];
  }

  tabsIn(windowId)
  {
    return this.tabsByWindow.get(windowId) ?? [];
  }
}

// ---------------------------------------------------------------------------
// chrome://extensions
// ---------------------------------------------------------------------------

/** Scripts run in chrome://extensions, where chrome.developerPrivate and chrome.management are available. */
const ExtensionsPageScripts = {
  ready: function ready()
  {
    return typeof chrome !== 'undefined' && !!chrome.developerPrivate && typeof chrome.developerPrivate.getExtensionsInfo === 'function';
  },

  list: async function list()
  {
    const infos = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
    return infos.map(info => ({
      id: info.id,
      name: info.name,
      location: info.location,
      state: info.state,
      path: info.path ?? null,
      prettifiedPath: info.prettifiedPath ?? null,
      disableReasons: info.disableReasons ?? null,
    }));
  },

  state: async function state(id)
  {
    const info = await chrome.developerPrivate.getExtensionInfo(id);
    return { state: info.state, disableReasons: info.disableReasons ?? null };
  },

  enable: async function enable(id)
  {
    await chrome.management.setEnabled(id, true);
    return true;
  },

  reload: async function reload(id)
  {
    await chrome.developerPrivate.reload(id, { failQuietly: false });
    return true;
  },
};

/**
 * A chrome://extensions page in a window of its own, opened only for as long
 * as one job needs it: finding and enabling the extension at the start, and
 * reloading it for E.1.
 */
class ExtensionsAdminPage
{
  constructor(browser, pool, targetId)
  {
    this.browser = browser;
    this.pool = pool;
    this.targetId = targetId;
  }

  static async open(browser, pool)
  {
    const targetId = await createWindowTarget(browser, 'chrome://extensions/');
    const page = new ExtensionsAdminPage(browser, pool, targetId);
    try
    {
      await waitFor('chrome://extensions to load', () => page.call(ExtensionsPageScripts.ready), {
        timeoutMs: 20000,
        hint: 'The page answered but chrome.developerPrivate never appeared in it.',
      });
    }
    catch (error)
    {
      await page.close();
      throw error;
    }
    return page;
  }

  call(fn, ...args)
  {
    return this.callWithCeiling(EVAL_TIMEOUT_MS, fn, ...args);
  }

  callWithCeiling(ceilingMs, fn, ...args)
  {
    return this.pool.evaluate(this.targetId, pageCall(fn, ...args), { ceilingMs, retryOnNavigate: false });
  }

  /** Picks this worktree's unpacked build out of every installed extension, or the configured id. */
  async findExtension(configuredId)
  {
    const all = await this.call(ExtensionsPageScripts.list);
    if (configuredId)
    {
      const configured = all.find(info => info.id === configuredId);
      if (!configured) throw new Error(`extensionId "${configuredId}" from ${CONFIG_FILE} is not installed in the test Chrome`);
      return configured;
    }

    const wanted = [DIST_DIR];
    try
    {
      wanted.push(realpathSync(DIST_DIR));
    }
    catch
    {
      // No dist folder yet - matched by name below, and the error says to build
    }
    const trimSlash = (path) => path.replace(/\/+$/, '');
    const worktreeSuffix = `/${basename(resolve(TOOLS_DIR, '..'))}/dist`;

    const matches = all.filter(info => info.location === 'UNPACKED' && (
      (info.path && wanted.includes(trimSlash(info.path)))
      || (info.prettifiedPath && trimSlash(info.prettifiedPath).endsWith(worktreeSuffix))));

    if (matches.length === 1) return matches[0];

    const unpacked = all.filter(info => info.location === 'UNPACKED')
      .map(info => `${info.id} ${info.name} (${info.prettifiedPath ?? info.path ?? 'no path'})`);
    if (matches.length === 0)
    {
      throw new Error(`no unpacked extension loaded from ${DIST_DIR}. Build it, load that folder in chrome://extensions `
        + `(Developer mode -> Load unpacked), or set "extensionId" in ${CONFIG_FILE}. Unpacked extensions found: ${unpacked.join('; ') || 'none'}`);
    }
    throw new Error(`more than one unpacked extension matches ${DIST_DIR}: ${unpacked.join('; ')}. Set "extensionId" in ${CONFIG_FILE}.`);
  }

  /** Enables the extension if Chrome has it disabled, and waits until it reports enabled. */
  async ensureEnabled(id)
  {
    const { state, disableReasons } = await this.call(ExtensionsPageScripts.state, id);
    if (state === 'ENABLED') return;

    log(`the extension is ${state}${disableReasons ? ` (${JSON.stringify(disableReasons)})` : ''} - enabling it`);
    await this.call(ExtensionsPageScripts.enable, id);
    await waitFor('the extension to be enabled', async () => (await this.call(ExtensionsPageScripts.state, id)).state === 'ENABLED', {
      timeoutMs: 20000,
      hint: 'Check chrome://extensions in the test Chrome for errors on this extension.',
    });
  }

  async reload(id)
  {
    await this.callWithCeiling(RELOAD_TIMEOUT_MS, ExtensionsPageScripts.reload, id);
  }

  async close()
  {
    this.pool.forget(this.targetId);
    await closeTarget(this.browser, this.targetId);
  }
}

/**
 * A page the driver opens in a window of its own and talks to by its own
 * target id, so it can never be mixed up with a page a test case opened on
 * the same URL (P.6 opens its own Clear browsing data tab for the tester).
 */
class OwnedWindowPage
{
  constructor(browser, pool, targetId)
  {
    this.browser = browser;
    this.pool = pool;
    this.targetId = targetId;
  }

  static async open(browser, pool, url)
  {
    return new OwnedWindowPage(browser, pool, await createWindowTarget(browser, url));
  }

  call(fn, ...args)
  {
    return this.pool.evaluate(this.targetId, pageCall(fn, ...args), { retryOnNavigate: false });
  }

  async close()
  {
    this.pool.forget(this.targetId);
    await closeTarget(this.browser, this.targetId);
  }
}

// ---------------------------------------------------------------------------
// Clearing browsing data (P.6), only on a profile inside tools/tmp/
// ---------------------------------------------------------------------------

/** Scripts run in chrome://version. */
const VersionPageScripts = {
  profilePath: function profilePath()
  {
    const text = document.getElementById('profile_path')?.textContent?.trim();
    return text || null;
  },
};

/** Scripts run in chrome://sync-internals. */
const SyncInternalsScripts = {
  // The About section's rows, read from the page text, where each row is
  // "label<TAB>value". Null until the "Transport State" row has a value,
  // since the page fills its values in after it loads.
  signInFields: function signInFields()
  {
    // The page text, plus the text inside any shadow roots
    const texts = [document.body?.innerText ?? ''];
    const visit = (root) =>
    {
      // Collect each shadow root's text and look further down inside it
      for (const element of root.querySelectorAll('*'))
      {
        if (!element.shadowRoot) continue;
        texts.push([...element.shadowRoot.children].map(child => child.innerText ?? '').join('\n'));
        visit(element.shadowRoot);
      }
    };
    visit(document);

    const rows = {};
    // Keep the first value seen for each label
    for (const line of texts.join('\n').split('\n'))
    {
      const cells = line.split('\t');
      const label = cells[0].trim();
      if (!label || label in rows) continue;
      rows[label] = cells.slice(1).join(' ').trim();
    }

    if (!rows['Transport State']) return null;
    return {
      transportState: rows['Transport State'],
      username: rows['Username'] ?? null,
      disableReasons: rows['Disable Reasons'] ?? null,
      syncFeatureEnabled: rows['Sync Feature Enabled'] ?? null,
      lastSynced: rows['Last Synced'] ?? null,
    };
  },
};

/**
 * Decides whether the driver may clear browsing data. Both conditions must
 * hold, and anything that cannot be read counts as a refusal:
 * - The Chrome it is connected to runs on a profile inside this checkout's
 *   tools/tmp/ folder (where start-test-chrome.sh puts it).
 * - That profile is not signed in to any account, even with sync off. On a
 *   signed-in profile with history sync, deleting history for all time also
 *   deletes the account's history on every synced device.
 * The decision is made at the start of the run and cached. The clearing
 * itself asks again with a fresh reading.
 */
class ProfileGuard
{
  constructor(browser, pool)
  {
    this.browser = browser;
    this.pool = pool;
    this.decision = null;
  }

  /**
   * Null when clearing is allowed; otherwise the skip reason ("profile not in
   * <tools/tmp path>", "profile is signed in to <account>", "sign-in state
   * unknown"). `fresh` reads Chrome again instead of using the cached
   * decision. Never throws.
   */
  async refusalReason({ fresh = false } = {})
  {
    if (!this.decision || fresh) this.decision = await this.#decide();
    return this.decision.allowed ? null : this.decision.reason;
  }

  async #decide()
  {
    // Both pages in windows of the driver's own, read side by side
    const [pathResult, signInResult] = await Promise.allSettled([this.#readProfilePath(), this.#readSignInFields()]);

    const refusal = this.#pathRefusal(pathResult) ?? this.#signInRefusal(signInResult);
    if (refusal)
    {
      log(`profile guard: will NOT clear browsing data - ${refusal.detail}`);
      return { allowed: false, reason: refusal.reason };
    }

    log('profile guard: clearing browsing data is allowed - the profile is inside tools/tmp/ and not signed in');
    return { allowed: true, reason: null };
  }

  /** Null when the profile is inside tools/tmp/; otherwise { reason, detail }. Logs the paths it compared. */
  #pathRefusal(pathResult)
  {
    let tmpReal = TMP_DIR;
    try
    {
      tmpReal = realpathSync(TMP_DIR);
    }
    catch
    {
      // No tools/tmp/ at all: no profile can be inside it, so the check below refuses
    }
    const refuse = (detail) => ({ reason: `profile not in ${tmpReal}`, detail });

    if (pathResult.status === 'rejected')
    {
      return refuse(`could not read the profile path from chrome://version (${errorText(pathResult.reason)})`);
    }
    const profilePath = pathResult.value;

    let profileReal;
    try
    {
      profileReal = realpathSync(profilePath);
    }
    catch
    {
      return refuse(`the profile path ${profilePath} does not resolve on this machine`);
    }

    // Inside means: a path below tools/tmp/, not tools/tmp/ itself and not a sibling
    const below = relative(tmpReal, profileReal);
    const inside = below !== '' && below !== '..' && !below.startsWith(`..${sep}`) && !isAbsolute(below);
    log(`profile guard: profile ${profileReal}, tools/tmp ${tmpReal} - ${inside ? 'inside' : 'NOT inside'}`);
    return inside ? null : refuse(`the profile is ${profileReal}, which is not inside ${tmpReal}`);
  }

  /**
   * Null only when chrome://sync-internals shows an empty Username and
   * "Not signed in" among the Disable Reasons; otherwise { reason, detail }.
   * Logs the fields it read.
   */
  #signInRefusal(signInResult)
  {
    if (signInResult.status === 'rejected')
    {
      return { reason: 'sign-in state unknown', detail: `could not read chrome://sync-internals (${errorText(signInResult.reason)})` };
    }
    const fields = signInResult.value;
    log(`profile guard: sync-internals shows Username "${fields.username ?? '(no row)'}", Disable Reasons "${fields.disableReasons ?? '(no row)'}", `
      + `Transport State "${fields.transportState}", Sync Feature Enabled "${fields.syncFeatureEnabled ?? '(no row)'}", Last Synced "${fields.lastSynced ?? '(no row)'}"`);

    // A username, even with sync off, means an account is signed in
    if (fields.username)
    {
      return { reason: `profile is signed in to ${fields.username}`, detail: `the profile is signed in to ${fields.username}` };
    }
    if (fields.username === null || fields.disableReasons === null)
    {
      return { reason: 'sign-in state unknown', detail: 'chrome://sync-internals has no Username or Disable Reasons row' };
    }
    if (!fields.disableReasons.includes('Not signed in'))
    {
      return { reason: 'profile is signed in to an account', detail: `Disable Reasons is "${fields.disableReasons}", without "Not signed in"` };
    }
    return null;
  }

  /** Opens a page in a window of the driver's own, polls `fn` there until it answers, and closes the window. */
  async #readFromOwnPage(url, fn, what, hint)
  {
    const page = await OwnedWindowPage.open(this.browser, this.pool, url);
    try
    {
      return await waitFor(what, () => page.call(fn), { timeoutMs: 15000, hint });
    }
    finally
    {
      await page.close();
    }
  }

  #readProfilePath()
  {
    return this.#readFromOwnPage('chrome://version/', VersionPageScripts.profilePath,
      'chrome://version to show the profile path', 'chrome://version has no #profile_path element with text.');
  }

  #readSignInFields()
  {
    return this.#readFromOwnPage('chrome://sync-internals/', SyncInternalsScripts.signInFields,
      'chrome://sync-internals to show its Transport State row', 'The page text never had a "Transport State<TAB>value" row.');
  }
}

/**
 * Scripts run in chrome://settings/clearBrowserData. The page is built from
 * nested shadow roots, so every lookup searches through all of them. One
 * function with a command keeps the search helpers in one place, since each
 * page script has to carry everything it uses.
 */
const ClearDataScripts = {
  run: async function run(command, arg)
  {
    // Every element matching `selector` in `root` and in every shadow root below it
    const deepAll = (selector, root) =>
    {
      const found = [];
      const visit = (node) =>
      {
        found.push(...node.querySelectorAll(selector));
        // Descend into each shadow root under this node
        for (const element of node.querySelectorAll('*'))
        {
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      visit(root ?? document);
      return found;
    };
    const text = (element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const missing = (what) => new Error(`Clear browsing data page: no ${what} found - Chrome's UI may have changed`);
    const isSelected = (chip) => !!chip.selected || chip.hasAttribute('selected')
      || chip.getAttribute('aria-pressed') === 'true' || chip.getAttribute('aria-selected') === 'true';

    const dialog = deepAll('cr-dialog#deleteBrowsingDataDialog')[0] ?? null;
    const toast = deepAll('cr-toast#deleteBrowsingDataToast')[0] ?? null;
    const host = deepAll('settings-clear-browsing-data-dialog')[0] ?? null;
    const scope = host?.shadowRoot ?? null;
    const boxes = scope ? deepAll('settings-checkbox', scope) : [];
    const innerBox = (box) => box.shadowRoot?.querySelector('cr-checkbox#checkbox') ?? null;
    const picker = scope ? (deepAll('settings-clear-browsing-data-time-picker', scope)[0] ?? null) : null;
    const chips = picker?.shadowRoot ? deepAll('cr-chip', picker.shadowRoot) : [];
    const deleteButton = scope ? (deepAll('cr-button#deleteButton', scope)[0] ?? null) : null;

    switch (command)
    {
      case 'ready':
        return !!host && !!dialog?.open;

      case 'progress':
        return {
          dialogOpen: !!dialog?.open,
          toastOpen: !!toast?.open,
          deleteDisabled: !!deleteButton?.disabled,
          spinner: deepAll('paper-spinner-lite, cr-spinner, [role=progressbar]').some(spinner => spinner.active === true || spinner.hasAttribute('active')),
        };

      case 'state':
        if (!host) throw missing('settings-clear-browsing-data-dialog');
        return {
          boxes: boxes.map(box => ({
            key: box.pref?.key ?? null,
            label: box.label || text(box),
            checked: !!innerBox(box)?.checked,
            outerChecked: box.checked === true,
            hasCheckbox: !!innerBox(box),
          })),
          picker: !!picker,
          timePeriodPrefKey: picker?.pref?.key ?? null,
          timePeriodValue: picker?.pref?.value ?? null,
          chips: chips.map(chip => ({ id: chip.id, text: text(chip), selected: isSelected(chip) })),
          deleteButton: !!deleteButton,
        };

      case 'toggleCheckbox':
      {
        const box = boxes.find(candidate => candidate.pref?.key === arg);
        if (!box) throw missing(`settings-checkbox for ${arg}`);
        const inner = innerBox(box);
        if (!inner) throw missing(`cr-checkbox#checkbox inside the settings-checkbox for ${arg}`);
        inner.click();
        return true;
      }

      // `arg` is a chip's text, or "#id" for a chip's id
      case 'clickChip':
      {
        const chip = arg.startsWith('#') ? chips.find(c => c.id === arg.slice(1)) : chips.find(c => text(c) === arg);
        if (!chip) throw missing(`cr-chip ${arg} in settings-clear-browsing-data-time-picker`);
        chip.click();
        return true;
      }

      // An item of the "More" menu (cr-lazy-render-lit#moreTimePeriodsMenu), found by its text
      case 'clickMenuItem':
      {
        const items = deepAll('button, cr-button, .dropdown-item, [role=menuitem], [role=menuitemradio], [role=option]')
          .filter(element => element.tagName !== 'CR-CHIP' && text(element) === arg);
        if (items.length === 0) return false;
        items[0].click();
        return true;
      }

      // The irreversible click, gated on a reading taken in this same call:
      // `arg` is { historyPref, allTimeValue }
      case 'clickDelete':
      {
        if (!deleteButton) throw missing('cr-button#deleteButton');
        if (deleteButton.disabled) throw new Error('Clear browsing data page: the delete button is disabled');
        if (boxes.length === 0) throw missing('settings-checkbox');

        const problems = [];
        // Every checkbox must be unticked, except browsing history, which must be ticked
        for (const box of boxes)
        {
          const key = box.pref?.key;
          const inner = innerBox(box);
          if (!key || !inner)
          {
            problems.push(`the "${box.label || text(box)}" settings-checkbox has no pref key or cr-checkbox#checkbox`);
            continue;
          }
          // Both the outer settings-checkbox (what Chrome's delete reads) and
          // the inner cr-checkbox (what the tester sees) must show the wanted state
          const wanted = key === arg.historyPref;
          if (box.checked !== wanted) problems.push(`${key} settings-checkbox.checked is ${box.checked}`);
          if (inner.checked !== wanted) problems.push(`${key} cr-checkbox#checkbox.checked is ${inner.checked}`);
        }
        if (!boxes.some(box => box.pref?.key === arg.historyPref)) problems.push(`there is no settings-checkbox for ${arg.historyPref}`);

        const allTime = picker?.pref?.value === arg.allTimeValue || chips.some(chip => isSelected(chip) && text(chip) === 'All time');
        if (!allTime) problems.push('"All time" is not the selected time range');

        if (problems.length > 0) throw new Error(`Clear browsing data page: not clicking delete, because ${problems.join(', ')}`);
        deleteButton.click();
        return text(deleteButton);
      }

      // The dialog's own prefs, through the settings page's chrome.settingsPrivate API
      case 'readPrefs':
      {
        if (!chrome.settingsPrivate?.getPref) return { available: false, values: {} };
        const values = {};
        // Read each pref the dialog uses
        for (const key of arg)
        {
          const pref = await new Promise(resolve => chrome.settingsPrivate.getPref(key, resolve));
          if (pref) values[key] = pref.value;
        }
        return { available: true, values };
      }

      case 'writePrefs':
        if (!chrome.settingsPrivate?.setPref) return false;
        // Write each saved pref back
        for (const [key, value] of Object.entries(arg))
        {
          await new Promise(resolve => chrome.settingsPrivate.setPref(key, value, '', resolve));
        }
        return true;

      default:
        throw new Error(`unknown Clear browsing data command "${command}"`);
    }
  },
};

/**
 * chrome://settings/clearBrowserData in a window the driver owns. Drives the
 * dialog the way a tester would: ticks only "Browsing history", picks "All
 * time" and clicks the delete button. Cookies, cache and download history
 * stay, so a sign-in in the test profile survives. Afterwards it puts the
 * dialog's checkboxes and time period back the way they were.
 */
class ClearBrowsingDataPage
{
  constructor(page)
  {
    this.page = page;
  }

  static async open(browser, pool)
  {
    const page = await OwnedWindowPage.open(browser, pool, 'chrome://settings/clearBrowserData');
    const clearPage = new ClearBrowsingDataPage(page);
    try
    {
      await waitFor('the Clear browsing data dialog to open', () => clearPage.command('ready'), {
        timeoutMs: 20000,
        hint: 'chrome://settings/clearBrowserData loaded, but no open cr-dialog#deleteBrowsingDataDialog inside settings-clear-browsing-data-dialog was found.',
      });
    }
    catch (error)
    {
      await page.close();
      throw error;
    }
    return clearPage;
  }

  command(name, arg = null)
  {
    return this.page.call(ClearDataScripts.run, name, arg);
  }

  async close()
  {
    await this.page.close();
  }

  async deleteBrowsingHistoryForAllTime()
  {
    const before = await this.command('state');
    // Every checkbox needs its pref key: it is how the driver tells them apart
    const unnamed = before.boxes.find(box => !box.key || !box.hasCheckbox);
    if (unnamed) throw new Error(`Clear browsing data page: the "${unnamed.label}" settings-checkbox has no pref key or no cr-checkbox#checkbox - Chrome's UI may have changed`);
    if (!before.boxes.some(box => box.key === BROWSING_HISTORY_PREF)) throw new Error(`Clear browsing data page: no settings-checkbox for ${BROWSING_HISTORY_PREF} - Chrome's UI may have changed`);
    if (!before.picker) throw new Error('Clear browsing data page: no settings-clear-browsing-data-time-picker found - Chrome\'s UI may have changed');
    log(`  dialog before: ${before.boxes.map(box => `${box.label}=${box.checked ? 'on' : 'off'}`).join(', ')}; time: ${before.chips.find(chip => chip.selected)?.text ?? before.timePeriodValue ?? 'unknown'}`);

    const timePrefKey = before.timePeriodPrefKey ?? DEFAULT_TIME_PERIOD_PREF;
    const saved = await this.command('readPrefs', [...before.boxes.map(box => box.key), timePrefKey]);
    let clicked = false;
    let started = false;
    let finished = false;
    try
    {
      await this.#tickOnlyBrowsingHistory();
      await this.#chooseAllTime();

      // The page script checks the checkboxes and the time range again in the same call as the click
      const label = await this.command('clickDelete', { historyPref: BROWSING_HISTORY_PREF, allTimeValue: TIME_PERIOD_ALL_TIME });
      clicked = true;
      log(`  clicked "${label}"; waiting for Chrome to start and finish`);

      await waitFor('the delete to start', async () =>
      {
        const progress = await this.command('progress');
        return progress.deleteDisabled || progress.spinner || !progress.dialogOpen || progress.toastOpen;
      }, {
        timeoutMs: 10000,
        intervalMs: 100,
        hint: 'After the click, the delete button stayed enabled, no spinner showed, the dialog stayed open and no toast showed.',
      });
      started = true;

      await waitFor('Chrome to finish deleting the browsing history', async () =>
      {
        const progress = await this.command('progress');
        return !progress.dialogOpen || progress.toastOpen;
      }, {
        timeoutMs: CLEAR_DATA_TIMEOUT_MS,
        intervalMs: 500,
        hint: 'After the delete started, the dialog stayed open and cr-toast#deleteBrowsingDataToast never showed.',
      });
      finished = true;
      log('  browsing history deleted for all time');
    }
    finally
    {
      // Changing the prefs before the delete has started, or while an
      // aborted run leaves it in flight, could change what it deletes
      const deleteMayBeInFlight = clicked && (!started || (AbortState.requested && !finished));
      if (deleteMayBeInFlight)
      {
        log('  the delete may still be running - leaving the dialog\'s choices as the driver set them (only Browsing history, All time)');
      }
      else
      {
        await this.#restorePrefs(saved).catch(error => log(`  warning: could not put back the dialog's choices: ${errorText(error)}`));
      }
    }
  }

  /** Clicks checkboxes until only "Browsing history" is ticked, one click per round. */
  async #tickOnlyBrowsingHistory()
  {
    await waitFor('only "Browsing history" to be ticked', async () =>
    {
      const state = await this.command('state');
      // Click only where the visible checkbox is wrong; an outer settings-checkbox that lags behind is waited for
      const wrong = state.boxes.find(box => box.checked !== (box.key === BROWSING_HISTORY_PREF));
      if (wrong)
      {
        await this.command('toggleCheckbox', wrong.key);
        return false;
      }
      return state.boxes.every(box => box.outerChecked === (box.key === BROWSING_HISTORY_PREF));
    }, { timeoutMs: 10000, intervalMs: 200, hint: 'A cr-checkbox#checkbox and its settings-checkbox did not both end up in the wanted state.' });
  }

  /** Picks "All time": a chip of that name if there is one, otherwise from the "More" menu. */
  async #chooseAllTime()
  {
    const isAllTime = (state) => state.timePeriodValue === TIME_PERIOD_ALL_TIME
      || state.chips.some(chip => chip.selected && chip.text === 'All time');

    await waitFor('"All time" to be the time range', async () =>
    {
      const state = await this.command('state');
      if (isAllTime(state)) return true;

      // A visible "All time" chip: click it directly
      if (state.chips.some(chip => chip.text === 'All time'))
      {
        await this.command('clickChip', 'All time');
        return false;
      }

      if (!state.chips.some(chip => chip.id === 'moreButton'))
      {
        throw new Error('Clear browsing data page: no cr-chip#moreButton ("More") in the time picker - Chrome\'s UI may have changed');
      }
      await this.command('clickChip', '#moreButton');
      await sleep(400);
      const clicked = await this.command('clickMenuItem', 'All time');
      if (!clicked) throw new Error('Clear browsing data page: the "More" menu (cr-lazy-render-lit#moreTimePeriodsMenu) has no "All time" item - Chrome\'s UI may have changed');
      return false;
    }, {
      timeoutMs: 15000,
      intervalMs: 500,
      hint: `"All time" was clicked, but neither a selected "All time" cr-chip nor the picker's pref value ${TIME_PERIOD_ALL_TIME} showed it.`,
    });
  }

  async #restorePrefs(saved)
  {
    if (!saved.available)
    {
      log('  warning: chrome.settingsPrivate is not available on the settings page - the dialog keeps the driver\'s choices');
      return;
    }
    await this.command('writePrefs', saved.values);
    log('  put back the dialog\'s checkboxes and time range');
  }
}

// ---------------------------------------------------------------------------
// The helper tab
// ---------------------------------------------------------------------------

/** Scripts run in the helper tab, an extension page with the full chrome.* API of this extension. */
const HelperScripts = {
  identity: async function identity()
  {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return null;
    const own = await chrome.windows.getCurrent();
    return { extensionId: chrome.runtime.id, windowId: own.id };
  },

  createTestWindow: async function createTestWindow()
  {
    const created = await chrome.windows.create({ url: 'chrome://newtab/', focused: true, type: 'normal' });
    return created.id;
  },

  windowExists: async function windowExists(windowId)
  {
    try
    {
      await chrome.windows.get(windowId);
      return true;
    }
    catch
    {
      return false;
    }
  },

  // Nothing is awaited before sidePanel.open, so the call stays inside the
  // user gesture Runtime.evaluate grants.
  openSidePanel: function openSidePanel(windowId)
  {
    return chrome.sidePanel.open({ windowId }).then(() => true);
  },

  focusWindow: async function focusWindow(windowId)
  {
    await chrome.windows.update(windowId, { focused: true });
    return true;
  },

  removeWindow: async function removeWindow(windowId)
  {
    try
    {
      await chrome.windows.remove(windowId);
    }
    catch
    {
      // Already closed
    }
    return true;
  },

  readStorage: async function readStorage(keys)
  {
    return chrome.storage.local.get(keys);
  },

  // Writes each value, and removes each key whose value is null.
  writeStorage: async function writeStorage(values)
  {
    const toSet = {};
    const toRemove = [];
    // Split the request into writes and removals
    for (const [key, value] of Object.entries(values))
    {
      if (value === null) toRemove.push(key);
      else toSet[key] = value;
    }
    if (Object.keys(toSet).length > 0) await chrome.storage.local.set(toSet);
    if (toRemove.length > 0) await chrome.storage.local.remove(toRemove);
    return true;
  },

  removeCaseResults: async function removeCaseResults(key, caseIds)
  {
    const stored = (await chrome.storage.local.get([key]))[key] ?? {};
    // Drop only the given cases' entries, leaving every other case's last result
    for (const id of caseIds) delete stored[id];
    await chrome.storage.local.set({ [key]: stored });
    return true;
  },
};

/**
 * An extension page (the extension's icon.png) in a window of its own, so it
 * never enters the test window's tabs or tab history. Everything that needs
 * this extension's own chrome.* API from outside the panel goes through it:
 * opening the side panel (which a service worker cannot do), and reading the
 * run's progress from storage (which keeps working while the panel parks or
 * reloads).
 */
class HelperPage
{
  constructor(browser, pool, targetId, windowId)
  {
    this.browser = browser;
    this.pool = pool;
    this.targetId = targetId;
    this.windowId = windowId;
  }

  /** Opens the helper, retrying while the extension is still coming back from a reload. */
  static async open(browser, pool, extensionId, timeoutMs = 45000)
  {
    const url = `chrome-extension://${extensionId}/icon.png`;
    return waitFor('the helper tab to load as an extension page', async () =>
    {
      const targetId = await createWindowTarget(browser, url);
      try
      {
        const identity = await waitFor('the helper tab to answer', () => pool.evaluate(targetId, pageCall(HelperScripts.identity), { ceilingMs: 5000 }), { timeoutMs: 5000 });
        if (identity.extensionId !== extensionId) throw new Error(`the helper tab belongs to ${identity.extensionId}, not ${extensionId}`);
        return new HelperPage(browser, pool, targetId, identity.windowId);
      }
      catch (error)
      {
        pool.forget(targetId);
        await closeTarget(browser, targetId);
        throw error;
      }
    }, {
      timeoutMs,
      intervalMs: 1000,
      hint: `Could not use ${url} as an extension page. Is the extension enabled in chrome://extensions, and does dist/icon.png exist?`,
    });
  }

  call(fn, ...args)
  {
    return this.pool.evaluate(this.targetId, pageCall(fn, ...args));
  }

  async isAlive()
  {
    try
    {
      return !!(await this.pool.evaluate(this.targetId, pageCall(HelperScripts.identity), { ceilingMs: 5000 }));
    }
    catch
    {
      return false;
    }
  }

  async readStorage(keys)
  {
    return this.call(HelperScripts.readStorage, keys);
  }

  async close()
  {
    this.pool.forget(this.targetId);
    await closeTarget(this.browser, this.targetId);
  }
}

// ---------------------------------------------------------------------------
// The side panel
// ---------------------------------------------------------------------------

/** Scripts run in the side panel's document. */
const PanelScripts = {
  windowId: async function windowId()
  {
    return (await chrome.windows.getCurrent()).id;
  },

  // Everything the driver needs to know about the panel's UI in one call.
  snapshot: function snapshot()
  {
    const buttons = [...document.querySelectorAll('button')];
    const text = (element) => (element?.innerText ?? '').trim();
    const page = location.pathname.replace(/^\//, '');
    const runnerOpen = [...document.querySelectorAll('h3')].some(h => text(h) === 'Test Runner (dev)');

    const runButton = buttons.find(b => /^Run Tests \(\d+\)$/.test(text(b)));
    const busyButton = buttons.find(b => text(b).startsWith('Running tests'));

    let banner = null;
    const discard = buttons.find(b => text(b) === 'Discard');
    if (discard)
    {
      const box = discard.closest('.border-amber-400') ?? discard.parentElement?.parentElement;
      const resume = buttons.find(b => text(b).startsWith("I've done it - Resume"));
      banner = {
        title: text(box?.querySelector('.font-medium')),
        instruction: text(box?.querySelector('.mb-2.text-gray-700')),
        discardEnabled: !discard.disabled,
        hasResume: !!resume,
        resumeEnabled: !!resume && !resume.disabled,
        hasPassFail: buttons.some(b => text(b) === 'Pass') && buttons.some(b => text(b) === 'Fail'),
      };
    }

    const popup = document.querySelector('[role=alertdialog]');
    const cases = [...document.querySelectorAll('input[aria-label^="Include "]')].map(box =>
    {
      const id = box.getAttribute('aria-label').replace(/^Include /, '').replace(/ in Run Tests$/, '');
      const row = document.getElementById(`test-case-${id}`);
      const title = text(row?.querySelector('span.font-mono')?.nextElementSibling);
      return { id, title, checked: box.checked, disabled: box.disabled };
    });

    return {
      page,
      appReady: !!document.querySelector('button[title="Menu"]'),
      runnerOpen,
      busy: !!busyButton,
      busyLabel: busyButton ? text(busyButton) : null,
      runButton: runButton ? { label: text(runButton), disabled: runButton.disabled } : null,
      banner,
      popup: popup ? text(popup) : null,
      panelError: text(document.querySelector('.bg-red-100')) || null,
      // Every step result row in the case list: grows by one per finished step
      resultRows: document.querySelectorAll('ul.font-mono li').length,
      cases,
    };
  },

  clickMenu: function clickMenu()
  {
    const button = document.querySelector('button[title="Menu"]');
    if (!button) return false;
    button.click();
    return true;
  },

  clickMenuItem: function clickMenuItem(label)
  {
    const items = [...document.querySelectorAll('[role=menuitem]')];
    const item = items.find(element => element.innerText.trim() === label);
    if (!item) return false;
    item.click();
    return true;
  },

  // Clicks the first enabled button whose text equals `exact` or starts with `prefix`.
  clickButton: function clickButton({ exact, prefix, within })
  {
    const scope = within === 'popup' ? document.querySelector('[role=alertdialog]') : document;
    if (!scope) return null;
    const button = [...scope.querySelectorAll('button')].find(b =>
    {
      const label = b.innerText.trim();
      return !b.disabled && (exact !== undefined ? label === exact : label.startsWith(prefix));
    });
    if (!button) return null;
    button.click();
    return button.innerText.trim();
  },

  // Reloads the sidebar document: ends whatever the old document was running.
  reloadPage: function reloadPage()
  {
    setTimeout(() => location.reload(), 0);
    return true;
  },
};

/** What the panel's UI showed at one moment - see PanelScripts.snapshot. */
class PanelView
{
  constructor(raw)
  {
    Object.assign(this, raw);
  }

  /** The sidebar app is loaded (not parked, not still starting). */
  get isApp()
  {
    return this.page === 'index.html' && this.appReady;
  }

  /** The paused banner is showing for this checkpoint, with its buttons usable - i.e. the run is waiting for someone. */
  isWaitingAt(checkpoint)
  {
    return !!(this.isApp && !this.busy && this.banner && this.banner.discardEnabled
      && this.banner.title.includes(`step ${checkpoint.stepIndex + 1} of ${checkpoint.caseId} -`));
  }

  /** Nothing running and nothing paused in the panel. */
  get isIdle()
  {
    return this.isApp && this.runnerOpen && !this.busy && !this.banner;
  }

  /** Whether the case checkboxes and the Run Tests count show exactly this selection. */
  showsSelection(caseIds)
  {
    const wanted = new Set(caseIds);
    return this.runButton?.label === `Run Tests (${caseIds.length})`
      && this.cases.every(c => c.checked === wanted.has(c.id));
  }

  /** The case the busy button names ("Running tests… (C.2e)"), or null. */
  get runningCaseId()
  {
    const match = /\(([^)]+)\)\s*$/.exec(this.busyLabel ?? '');
    return match ? match[1].trim() || null : null;
  }

  /** A short description for error messages. */
  summary()
  {
    return {
      page: this.page,
      runnerOpen: this.runnerOpen,
      busy: this.busyLabel,
      runButton: this.runButton?.label ?? null,
      banner: this.banner?.title ?? null,
      popup: this.popup ? this.popup.slice(0, 60) : null,
      panelError: this.panelError,
    };
  }

  /** The parts of the view that change while a run makes progress. */
  progressFingerprint()
  {
    return {
      page: this.page,
      busy: this.busyLabel,
      banner: this.banner ? `${this.banner.title}|${this.banner.discardEnabled}` : null,
      resultRows: this.resultRows,
      runButton: this.runButton?.label ?? null,
      panelError: this.panelError,
    };
  }
}

/**
 * The side panel in the test window. Its CDP target is found by asking each
 * of this extension's panel-shaped pages which window it is in, because the
 * tester may have this extension's sidebar open in a window of their own;
 * the driver detaches again from every page that turns out not to be the
 * test window's. Parking keeps the same target and only changes its url.
 */
class SidePanel
{
  constructor(browser, pool, extensionId, windowId)
  {
    this.browser = browser;
    this.pool = pool;
    this.extensionId = extensionId;
    this.windowId = windowId;
    this.targetId = null;
  }

  /** One look for the panel's target; null when it is not there (yet). */
  async locate()
  {
    const prefix = `chrome-extension://${this.extensionId}/`;
    const all = await this.browser.targets(Deadline.capCall(10000));
    this.pool.forgetMissing(all);
    const candidates = all.filter(target =>
      target.type === 'page' && target.url.startsWith(prefix) && /\/(index|test-parked)\.html(\?|#|$)/.test(target.url));
    // The one found last time first, as it is nearly always still the one
    candidates.sort((a, b) => (b.targetId === this.targetId) - (a.targetId === this.targetId));

    // Ask each candidate which window it sits in
    for (const candidate of candidates)
    {
      try
      {
        const windowId = await this.pool.evaluate(candidate.targetId, pageCall(PanelScripts.windowId), { ceilingMs: 5000 });
        if (windowId === this.windowId) return candidate.targetId;
      }
      catch
      {
        // A page mid-navigation or closing - try the others, and this one again next time
      }
      // Not the test window's panel (or no answer): don't stay attached to it
      this.pool.forget(candidate.targetId);
    }
    return null;
  }

  /** Waits for the panel's target to exist in the test window. */
  async find(timeoutMs = 30000)
  {
    this.targetId = await waitFor('the side panel to appear in the test window', () => this.locate(), {
      timeoutMs,
      hint: 'chrome.sidePanel.open() was called from the helper tab; check the test window shows the sidebar.',
    });
    return this.targetId;
  }

  forgetTarget()
  {
    if (this.targetId) this.pool.forget(this.targetId);
    this.targetId = null;
  }

  /**
   * Runs a panel script. Without a known target it looks once (no waiting);
   * when the target is gone it is forgotten and the error passed on. There
   * is no retry here (SessionPool already retried the session once): the
   * caller's next round looks for the panel again. `targetId` stays null
   * while the panel is missing, which is how the watch loop counts that.
   */
  async call(fn, ...args)
  {
    // Look for the panel once when its target is not known
    if (!this.targetId)
    {
      this.targetId = await this.locate();
      if (!this.targetId) throw new Error('the side panel is not open in the test window');
    }

    try
    {
      return await this.pool.evaluate(this.targetId, pageCall(fn, ...args));
    }
    catch (error)
    {
      // The target itself is gone (closed panel, reloaded extension)
      if (STALE_TARGET_PATTERN.test(errorText(error))) this.targetId = null;
      throw error;
    }
  }

  async view()
  {
    return new PanelView(await this.call(PanelScripts.snapshot));
  }

  /** Waits for a view the predicate accepts and returns it; on timeout the error describes the last view seen. */
  waitForView(what, predicate, { timeoutMs = 30000, hint = '' } = {})
  {
    let lastView = null;
    return waitFor(what, async () =>
    {
      const view = await this.view();
      lastView = view;
      return predicate(view) ? view : null;
    }, {
      timeoutMs,
      hint: () => [hint, lastView ? `The panel last showed ${describeValue(lastView.summary())}.` : ''].filter(Boolean).join(' '),
    });
  }
}

// ---------------------------------------------------------------------------
// The run's state in storage
// ---------------------------------------------------------------------------

/** One read of the runner's storage keys. */
class RunState
{
  constructor(stored)
  {
    this.checkpoint = stored[STORAGE_KEYS.resume] ?? null;
    this.queue = stored[STORAGE_KEYS.batchQueue] ?? null;
    this.batchCaseIds = stored[STORAGE_KEYS.batchCaseIds] ?? null;
    this.caseResults = stored[STORAGE_KEYS.caseResults] ?? {};
  }

  static async read(helper)
  {
    return new RunState(await helper.readStorage([
      STORAGE_KEYS.resume, STORAGE_KEYS.batchQueue, STORAGE_KEYS.batchCaseIds, STORAGE_KEYS.caseResults,
    ]));
  }

  get batchInProgress()
  {
    return this.batchCaseIds !== null;
  }

  /** No batch and no paused case left. */
  get isFinished()
  {
    return !this.batchInProgress && !this.checkpoint;
  }

  get checkpointKey()
  {
    return this.checkpoint ? `${this.checkpoint.caseId}#${this.checkpoint.stepIndex}` : null;
  }

  resultsFor(caseId)
  {
    return this.caseResults[caseId];
  }

  /** The parts of the stored state that change while a run makes progress. */
  progressFingerprint()
  {
    const checkpoint = this.checkpoint;
    return {
      checkpoint: checkpoint
        ? `${this.checkpointKey}|${checkpoint.results?.length ?? 0}|${checkpoint.parkedCompleted ?? ''}|${checkpoint.parkedError ?? ''}`
        : null,
      queue: this.queue,
      batch: this.batchCaseIds,
      results: Object.keys(this.caseResults).sort().map(id => `${id}:${this.caseResults[id].length}`),
    };
  }
}

/** Notices when neither storage nor the panel has changed for a long time. */
class ProgressTracker
{
  constructor()
  {
    this.reset();
  }

  reset()
  {
    this.fingerprint = null;
    this.changedAt = Date.now();
  }

  observe(fingerprint)
  {
    const text = JSON.stringify(fingerprint);
    if (text !== this.fingerprint)
    {
      this.fingerprint = text;
      this.changedAt = Date.now();
    }
  }

  get unchangedForMs()
  {
    return Date.now() - this.changedAt;
  }
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/** The known-gap list as questions: is this failing step one we expect to fail? */
class KnownGaps
{
  static isKnownGapCase(caseId)
  {
    return Object.hasOwn(KNOWN_GAP_FAILING_STEPS, caseId);
  }

  static isExpectedFailure(caseId, stepName)
  {
    return KnownGaps.isKnownGapCase(caseId) && KNOWN_GAP_FAILING_STEPS[caseId].includes(stepName);
  }
}

/** What the driver saw over the whole run, turned into the results file, the printed summary and the exit code. */
class RunReport
{
  constructor()
  {
    this.extensionId = null;
    this.startedAt = new Date();
    this.plannedCases = [];      // { id, title }, in the panel's order
    this.skipped = new Map();    // case id -> { stepIndex, step, results }
    this.abandoned = new Map();  // case id -> { stepIndex, results, reason }
    this.driverErrors = [];
    this.externalActions = [];   // { caseId, action, at }
    this.finalResults = {};
  }

  plan(cases)
  {
    this.plannedCases = cases;
  }

  /** A case discarded at a pause the driver did not do. `expected` says whether that skip is fine for the exit code. */
  recordSkip(checkpoint, stepTitle, { reason, expected })
  {
    this.skipped.set(checkpoint.caseId, { stepIndex: checkpoint.stepIndex, step: stepTitle, results: checkpoint.results ?? [], reason, expected });
  }

  /** A case given up on mid-run (error, stuck, abort): its results so far, from the checkpoint. The first reason recorded is kept. */
  recordAbandoned(checkpoint, reason)
  {
    if (this.abandoned.has(checkpoint.caseId)) return;
    this.abandoned.set(checkpoint.caseId, { stepIndex: checkpoint.stepIndex ?? null, results: checkpoint.results ?? [], reason });
  }

  /** A case given up on while it was running with no checkpoint, so no step index or results are known. */
  recordAbandonedRunningCase(caseId, reason)
  {
    this.recordAbandoned({ caseId, stepIndex: null, results: [] }, reason);
  }

  recordExternal(caseId, action)
  {
    this.externalActions.push({ caseId, action, at: new Date().toISOString() });
  }

  recordDriverError(message)
  {
    this.driverErrors.push(message);
  }

  setFinalResults(caseResults)
  {
    this.finalResults = caseResults ?? {};
  }

  /** Per-case outcome for every planned case: passed, failed, skipped or missing. */
  outcomes()
  {
    return this.plannedCases.map(({ id, title }) =>
    {
      const results = this.finalResults[id];
      // A case with a final result
      if (results)
      {
        const failedSteps = results.filter(r => !r.passed);
        const unexpectedSteps = failedSteps.filter(step => !KnownGaps.isExpectedFailure(id, step.name));
        const status = failedSteps.length === 0 ? 'passed' : 'failed';
        return { id, title, status, results, failedSteps, unexpected: unexpectedSteps.length > 0, knownGap: KnownGaps.isKnownGapCase(id) };
      }

      const skip = this.skipped.get(id);
      if (skip) return { id, title, status: 'skipped', skip, unexpected: !skip.expected };
      return { id, title, status: 'missing', abandoned: this.abandoned.get(id) ?? null, unexpected: true };
    });
  }

  /** The same shape as the panel's Download Results, plus a `driver` section the panel's file does not have. */
  toJson()
  {
    const outcomes = this.outcomes();
    const cases = outcomes
      .filter(outcome => outcome.results)
      .map(outcome => ({
        id: outcome.id,
        title: outcome.title,
        section: outcome.id[0],
        passed: outcome.failedSteps.length === 0,
        total: outcome.results.length,
        failed: outcome.failedSteps.length,
        results: outcome.results,
      }));

    return {
      generatedAt: new Date().toISOString(),
      cases,
      driver: {
        startedAt: this.startedAt.toISOString(),
        extensionId: this.extensionId,
        aborted: AbortState.reason,
        plannedCaseIds: this.plannedCases.map(c => c.id),
        knownGapFailingSteps: KNOWN_GAP_FAILING_STEPS,
        expectedManualCaseIds: EXPECTED_MANUAL_CASE_IDS,
        unexpectedFailures: outcomes.filter(o => o.status === 'failed' && o.unexpected).map(o => o.id),
        knownGapFailures: outcomes.filter(o => o.status === 'failed' && !o.unexpected).map(o => o.id),
        skipped: outcomes.filter(o => o.status === 'skipped').map(o => ({
          id: o.id,
          title: o.title,
          reason: o.skip.reason,
          expected: !o.unexpected,
          pausedAtStep: o.skip.stepIndex + 1,
          step: o.skip.step,
          resultsBeforePause: o.skip.results,
        })),
        missing: outcomes.filter(o => o.status === 'missing').map(o => ({
          id: o.id,
          title: o.title,
          reason: o.abandoned?.reason ?? 'no result was recorded',
          pausedAtStep: o.abandoned?.stepIndex != null ? o.abandoned.stepIndex + 1 : null,
          partialResults: o.abandoned?.results ?? [],
        })),
        externalActions: this.externalActions,
        errors: this.driverErrors,
      },
    };
  }

  writeFile()
  {
    mkdirSync(TMP_DIR, { recursive: true });
    const file = resolve(TMP_DIR, `test-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify(this.toJson(), null, 2));
    return file;
  }

  printSummary()
  {
    const outcomes = this.outcomes();
    const byStatus = (status) => outcomes.filter(o => o.status === status);
    const passed = byStatus('passed');
    const failed = byStatus('failed');
    const skipped = byStatus('skipped');
    const missing = byStatus('missing');

    console.log('');
    console.log(`Summary: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped, ${missing.length} without a result (of ${outcomes.length})`);

    // One line per failed case, then its failing steps
    for (const outcome of failed)
    {
      const tag = outcome.unexpected ? (outcome.knownGap ? '   [known-gap case, but an unexpected step failed]' : '') : '   [known gap]';
      console.log(`  FAIL ${outcome.id} ${outcome.title}${tag}`);
      for (const step of outcome.failedSteps)
      {
        const detail = step.error ? ` - ${step.error.replace(/\s+/g, ' ').slice(0, 200)}` : '';
        const expected = KnownGaps.isExpectedFailure(outcome.id, step.name) ? ' (expected)' : '';
        console.log(`         x ${step.name}${expected}${detail}`);
      }
    }

    // Skipped cases: paused at a step the driver cannot do
    for (const outcome of skipped)
    {
      const tag = outcome.unexpected ? '   [UNEXPECTED skip]' : '';
      console.log(`  SKIP ${outcome.id} ${outcome.title} - ${outcome.skip.reason}, at step ${outcome.skip.stepIndex + 1} (${outcome.skip.step})${tag}`);
    }

    // Selected cases that never produced a result
    for (const outcome of missing)
    {
      let why = 'selected but no result was recorded';
      // A case given up on: say why, and where its partial results are
      if (outcome.abandoned)
      {
        const { reason, stepIndex, results } = outcome.abandoned;
        why = stepIndex === null
          ? `${reason} (it was running, with no checkpoint to take results from)`
          : `${reason}; ${results.length} step result(s) before step ${stepIndex + 1} are in the results file`;
      }
      console.log(`  MISSING ${outcome.id} ${outcome.title} - ${why}`);
    }

    const gapsNowPassing = passed.filter(o => o.knownGap);
    if (gapsNowPassing.length > 0)
    {
      console.log(`  note: known-gap case(s) now pass: ${gapsNowPassing.map(o => o.id).join(', ')} - consider removing them from KNOWN_GAP_FAILING_STEPS`);
    }

    // Problems in the driver itself
    for (const message of this.driverErrors)
    {
      console.log(`  DRIVER ERROR ${message}`);
    }
  }

  /** 1 when any case ended unexpectedly (failed outside its known gap, skipped unexpectedly, no result) or the driver hit an error. */
  exitCode()
  {
    const unexpected = this.outcomes().some(o => o.status !== 'passed' && o.unexpected);
    return unexpected || this.driverErrors.length > 0 ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

class TestRunDriver
{
  constructor(browser, config)
  {
    this.browser = browser;
    this.config = config;
    this.pool = new SessionPool(browser);
    this.extensionId = null;
    this.helper = null;
    this.testWindowId = null;
    this.panel = null;
    this.report = new RunReport();
    this.originalSettings = null;
    this.availableCaseIds = [];
    this.initialWindowIds = null;
    this.profileGuard = new ProfileGuard(browser, this.pool);
    this.batchFinished = false;
    this.runPromise = null;
    this.finishing = null;
    this.deadline = Date.now() + config.timeoutMs;
  }

  // -- setup ---------------------------------------------------------------

  async findExtension()
  {
    const admin = await ExtensionsAdminPage.open(this.browser, this.pool);
    try
    {
      const info = await admin.findExtension(this.config.extensionId);
      log(`extension: ${info.name} (${info.id}) from ${info.prettifiedPath ?? info.path ?? 'unknown path'}`);
      await admin.ensureEnabled(info.id);
      this.extensionId = info.id;
      this.report.extensionId = info.id;
    }
    finally
    {
      await admin.close();
    }
  }

  async openHelper(timeoutMs = 45000)
  {
    this.helper = await HelperPage.open(this.browser, this.pool, this.extensionId, timeoutMs);
  }

  /** Makes sure there is a working helper tab, opening a new one when the old one is gone. */
  async ensureHelper(timeoutMs = 20000)
  {
    if (this.helper && await this.helper.isAlive()) return this.helper;
    if (this.helper) await this.helper.close();
    this.helper = null;
    log('the helper tab is gone - opening a new one');
    await this.openHelper(timeoutMs);
    return this.helper;
  }

  /** Opens the side panel in the test window and waits for the sidebar app in it. */
  async openPanel()
  {
    if (!await this.helper.call(HelperScripts.windowExists, this.testWindowId))
    {
      throw new Error(`the test window (${this.testWindowId}) is gone - was it closed by hand?`);
    }

    await this.helper.call(HelperScripts.openSidePanel, this.testWindowId);
    this.panel.forgetTarget();
    await this.panel.find();
    // The helper's window took focus when it opened; tests open tabs in the focused window
    await this.helper.call(HelperScripts.focusWindow, this.testWindowId);
    await this.panel.waitForView('the sidebar app to load in the panel', view => view.isApp, {
      timeoutMs: 30000,
      hint: 'The panel opened but the sidebar never rendered its Menu button. Check the panel for errors (right-click -> Inspect).',
    });
  }

  /** Opens the Test Runner from the sidebar's Menu, unless it is open already. */
  async openTestRunner()
  {
    await waitFor('the Test Runner to open', async () =>
    {
      const view = await this.panel.view();
      if (view.runnerOpen) return true;
      if (!view.isApp) return false;

      await this.panel.call(PanelScripts.clickMenu);
      const item = await waitFor('the "Test Runner…" menu item', () => this.panel.call(PanelScripts.clickMenuItem, 'Test Runner…'), { timeoutMs: 3000, intervalMs: 250 });
      if (!item) return false;
      return (await this.panel.waitForView('the Test Runner to render', v => v.runnerOpen, { timeoutMs: 5000 })).runnerOpen;
    }, {
      timeoutMs: 30000,
      intervalMs: 1000,
      hint: 'The Menu never offered "Test Runner…" - check that this is a development build (the item only exists in DEV).',
    });
  }

  /** Brings the panel back into the test window (after it vanished, or a reload), with the Test Runner open. */
  async recoverPanel(reason)
  {
    log(`reopening the side panel: ${reason}`);
    await this.ensureHelper();
    await this.openPanel();
    // The panel's mount effect opens the Test Runner by itself when it finds a checkpoint
    await sleep(1500);
    await this.openTestRunner();
  }

  /** Gets the panel into a clean, idle state: no run going, no leftover pause or popup. */
  async clearLeftovers()
  {
    // Give the panel's mount effect time to restore a leftover checkpoint
    await sleep(1500);

    let view = await this.panel.view();
    if (view.busy)
    {
      log('the panel is already running something - waiting for it to stop');
      view = await this.panel.waitForView('the panel to stop running', v => !v.busy, {
        timeoutMs: 180000,
        hint: 'A run was already going in this panel when the driver started.',
      });
    }

    if (view.popup)
    {
      log('dismissing a leftover "All tests done" popup');
      await this.panel.call(PanelScripts.clickButton, { exact: 'OK', within: 'popup' });
    }

    if (view.banner)
    {
      log(`discarding a leftover paused run (${view.banner.title})`);
      await this.panel.call(PanelScripts.clickButton, { exact: 'Discard' });
      await this.panel.waitForView('the leftover pause to be discarded', v => !v.banner, { timeoutMs: 10000 });
    }

    await this.panel.waitForView('the Test Runner to be idle', v => v.isIdle && !v.popup, {
      timeoutMs: 15000,
      hint: 'The Test Runner still shows a popup, a paused run or a running batch.',
    });
  }

  /** Remembers the tester's own checkbox choices (the case selection and Manual), to put them back at the end. */
  async saveSettings()
  {
    this.originalSettings = await this.helper.readStorage([STORAGE_KEYS.deselected, STORAGE_KEYS.manual]);
  }

  async restoreSettings()
  {
    if (!this.originalSettings) return;
    await this.writeStorageTolerantly({
      [STORAGE_KEYS.deselected]: this.originalSettings[STORAGE_KEYS.deselected] ?? null,
      [STORAGE_KEYS.manual]: this.originalSettings[STORAGE_KEYS.manual] ?? null,
    });
  }

  /** Writes (or, for null values, removes) storage keys through the helper, opening a new helper and trying once more if the write fails. */
  async writeStorageTolerantly(values)
  {
    try
    {
      if (!this.helper) throw new Error('no helper tab');
      await this.helper.call(HelperScripts.writeStorage, values);
    }
    catch (error)
    {
      log(`writing to storage failed (${errorText(error)}) - trying again with a new helper`);
      await this.ensureHelper();
      await this.helper.call(HelperScripts.writeStorage, values);
    }
  }

  /**
   * Selects exactly `caseIds`, by writing the key the panel's
   * useChromeLocalStorage hook reads (stored as JSON text, as the hook's
   * setter writes it); the hook picks the change up from
   * chrome.storage.onChanged. The deselected list is built from the panel's
   * own case list, so any case not named stays checked as it would by default.
   *
   * Also turns the panel's Manual checkbox off: in Manual mode the steps
   * with a manual version wait for a person, and the driver is there to run
   * without one.
   */
  async applySelection(caseIds)
  {
    const wanted = new Set(caseIds);
    const deselected = this.availableCaseIds.filter(id => !wanted.has(id));
    await this.helper.call(HelperScripts.writeStorage, {
      [STORAGE_KEYS.deselected]: JSON.stringify(deselected),
      [STORAGE_KEYS.manual]: JSON.stringify(false),
    });
    await this.panel.waitForView(`the Test Runner to show "Run Tests (${caseIds.length})"`, v => v.showsSelection(caseIds), {
      timeoutMs: 15000,
      hint: 'The selection was written to chrome.storage.local but the panel did not show it.',
    });
  }

  /** Selects the cases, clicks Run Tests and waits for the batch to be recorded. */
  async startBatch(caseIds)
  {
    await this.applySelection(caseIds);

    const label = await this.panel.call(PanelScripts.clickButton, { prefix: 'Run Tests (' });
    if (!label) throw new Error('could not click Run Tests (missing or disabled)');
    log(`clicked "${label}"`);

    // The panel records the batch's case list before running the first case
    // (and a batch so short it already finished has left its results)
    const wanted = [...caseIds].sort().join(',');
    await waitFor('the batch to start', async () =>
    {
      const state = await RunState.read(this.helper);
      return state.checkpoint
        || (state.batchCaseIds && [...state.batchCaseIds].sort().join(',') === wanted)
        || caseIds.every(id => state.resultsFor(id));
    }, { timeoutMs: 20000, hint: 'Run Tests was clicked but the batch was not recorded in chrome.storage.local.' });
  }

  // -- external actions ----------------------------------------------------

  async stopServiceWorker()
  {
    const prefix = `chrome-extension://${this.extensionId}/`;
    const running = (await this.browser.targets(10000)).filter(t => t.type === 'service_worker' && t.url.startsWith(prefix));
    if (running.length === 0)
    {
      log('  the service worker is already stopped');
      return;
    }

    // Close each of this extension's worker targets (normally just one); one
    // that idled out between the listing and the close is already stopped
    for (const worker of running)
    {
      try
      {
        await this.browser.send('Target.closeTarget', { targetId: worker.targetId }, undefined, 10000);
      }
      catch (error)
      {
        log(`  closing worker ${worker.targetId} failed (${errorText(error)}) - it probably stopped by itself`);
      }
    }

    // Wait for those exact targets to go: a fresh worker may legitimately start meanwhile
    const oldIds = new Set(running.map(worker => worker.targetId));
    await waitFor('the stopped service worker to disappear', async () =>
      !(await this.browser.targets(Deadline.capCall(10000))).some(t => oldIds.has(t.targetId)), {
      timeoutMs: 10000,
      hint: 'Target.closeTarget did not remove the service worker target.',
    });
    log('  service worker stopped');
  }

  /** Reloads the extension, then brings back the helper, the panel and the Test Runner. */
  async reloadExtension()
  {
    // The reload closes every page of the extension, the helper and panel included
    if (this.helper) await this.helper.close();
    this.helper = null;
    this.panel.forgetTarget();

    const admin = await ExtensionsAdminPage.open(this.browser, this.pool);
    try
    {
      await admin.reload(this.extensionId);
      log('  reloaded; waiting for the extension to come back');
      await sleep(1000);
      await admin.ensureEnabled(this.extensionId);
    }
    finally
    {
      await admin.close();
    }

    await this.openHelper();
    await this.recoverPanel('the extension was reloaded');
    log('  helper, panel and Test Runner are back');
  }

  /**
   * Deletes Chrome's browsing history for all time, in a Clear browsing data
   * dialog the driver opens in a window of its own. Only called after the
   * profile guard allowed it (see watchRun), and checked again here with a
   * fresh reading of the profile path and the sign-in state.
   */
  async clearBrowsingHistory()
  {
    try
    {
      // Last line of defence: watchRun has just checked with a fresh reading
      // (guardRefusalAtPause) and skips the case on a refusal. A refusal here
      // means the state changed in the moments between those two readings,
      // which is a real race worth reporting, so it stays an error.
      const refusal = await this.profileGuard.refusalReason({ fresh: true });
      if (refusal) throw new Error(`refusing to clear browsing data: ${refusal}`);

      const page = await ClearBrowsingDataPage.open(this.browser, this.pool);
      try
      {
        await page.deleteBrowsingHistoryForAllTime();
      }
      finally
      {
        await page.close();
      }
    }
    finally
    {
      // The driver's own windows took focus; tests open tabs in the focused window
      await this.helper?.call(HelperScripts.focusWindow, this.testWindowId).catch(() => {});
    }
  }

  /**
   * The guard's answer for a clear-browsing-data pause, with a fresh reading
   * of the profile path and the sign-in state. A refusal (including a page
   * that could not be read in time) is an expected skip, not an error.
   */
  async guardRefusalAtPause()
  {
    try
    {
      return await this.profileGuard.refusalReason({ fresh: true });
    }
    finally
    {
      // The guard's own windows took focus; tests open tabs in the focused window
      await this.helper?.call(HelperScripts.focusWindow, this.testWindowId).catch(() => {});
    }
  }

  async performExternal(checkpoint)
  {
    log(`${checkpoint.caseId} paused at step ${checkpoint.stepIndex + 1} for the driver: ${checkpoint.external}`);
    this.report.recordExternal(checkpoint.caseId, checkpoint.external);

    if (checkpoint.external === 'stop-service-worker') await this.stopServiceWorker();
    else if (checkpoint.external === 'reload-extension') await this.reloadExtension();
    else if (checkpoint.external === 'clear-browsing-data') await this.clearBrowsingHistory();
    else throw new Error(`unknown external action "${checkpoint.external}" on ${checkpoint.caseId}`);
  }

  /** Clicks the banner's Resume for this checkpoint and waits for the run to move on. */
  async resume(checkpoint)
  {
    await this.panel.waitForView(`the paused banner for ${checkpoint.caseId}`, v => v.isWaitingAt(checkpoint) && v.banner.resumeEnabled, {
      timeoutMs: 30000,
      hint: 'After the external action the panel should show the paused banner with its Resume button.',
    });
    const label = await this.panel.call(PanelScripts.clickButton, { prefix: "I've done it - Resume" });
    if (!label) throw new Error(`could not click Resume for ${checkpoint.caseId}`);
    log(`  clicked "${label}"`);

    await waitFor(`${checkpoint.caseId} to carry on after Resume`, async () =>
    {
      const view = await this.panel.view();
      return !view.isWaitingAt(checkpoint);
    }, { timeoutMs: 15000 });
  }

  /** Ends the batch in storage: the checkpoint and both batch keys, which is what the panel's Discard clears. */
  async discardInStorage()
  {
    await this.writeStorageTolerantly({
      [STORAGE_KEYS.resume]: null,
      [STORAGE_KEYS.batchQueue]: null,
      [STORAGE_KEYS.batchCaseIds]: null,
    });
  }

  /**
   * Discards the paused run, with the banner's Discard when the panel shows
   * it, otherwise straight in storage, and waits for the checkpoint to go.
   */
  async discardPause()
  {
    let clicked = null;
    try
    {
      clicked = await this.panel.call(PanelScripts.clickButton, { exact: 'Discard' });
    }
    catch
    {
      // No usable panel - fall back to storage below
    }
    if (!clicked) await this.discardInStorage();
    await waitFor('the paused run to be discarded', async () => !(await RunState.read(this.helper)).checkpoint, { timeoutMs: 10000 });
  }

  /**
   * Discards a pause that needs a person, and starts the rest of its batch
   * again. `reason` and `expected` are what the report records; by default
   * the skip is expected only for EXPECTED_MANUAL_CASE_IDS.
   */
  async skipPause(state, view, { reason = 'needs a person', expected } = {})
  {
    const checkpoint = state.checkpoint;
    // The queue has to be read before Discard, which clears it with the checkpoint
    const queue = state.queue ?? [];
    // The banner shows the step's instruction, not its label; its first line says what was asked
    const firstLine = (view.banner.instruction || view.banner.title).split('\n')[0].slice(0, 160);
    log(`SKIP ${checkpoint.caseId}: paused at step ${checkpoint.stepIndex + 1}, ${reason} (${firstLine})`);
    this.report.recordSkip(checkpoint, firstLine, {
      reason,
      expected: expected ?? EXPECTED_MANUAL_CASE_IDS.includes(checkpoint.caseId),
    });

    await this.discardPause();
    await this.restartRemaining(queue);
  }

  /**
   * Gives up on the paused case after its external action failed: records
   * it, gets a working panel back if the action took it away, discards the
   * pause and carries on with the rest of the queue.
   */
  async abandonPause(state, error)
  {
    const checkpoint = state.checkpoint;
    const queue = state.queue ?? [];
    const message = `${checkpoint.caseId}: the ${checkpoint.external ?? 'driver'} step failed: ${errorText(error)}`;
    log(`ERROR ${message}`);
    this.report.recordDriverError(message);
    this.report.recordAbandoned(checkpoint, `the driver's ${checkpoint.external ?? ''} action failed`);

    // The panel may have gone with the failed action (e.g. a half-done reload)
    let panelUsable = false;
    try
    {
      panelUsable = !!this.helper && (await this.helper.isAlive()) && (await this.panel.view()).isApp;
    }
    catch
    {
      panelUsable = false;
    }
    if (!panelUsable) await this.recoverPanel(`${checkpoint.caseId}'s failed action left no usable panel`);

    await this.discardPause();
    await this.restartRemaining(queue);
  }

  /**
   * Nothing has changed for NO_PROGRESS_MS: the case in progress is stuck
   * (e.g. it threw outside a step, leaving its checkpoint and no banner).
   * Records it, ends the batch in storage, reloads the panel's document to
   * stop whatever the old one was still running, and restarts the queue.
   */
  async recoverFromNoProgress(state, view)
  {
    const where = state.checkpoint
      ? `${state.checkpoint.caseId} at step ${state.checkpoint.stepIndex + 1}`
      : (view?.busyLabel ?? 'no case in progress');
    const message = `no progress for ${Math.round(NO_PROGRESS_MS / 60000)} minutes (${where}${view?.panelError ? `; the panel says: ${view.panelError}` : ''})`;
    log(`ERROR ${message}`);
    this.report.recordDriverError(message);
    // The stuck case: from its checkpoint when it has one, otherwise the one the busy button names
    if (state.checkpoint) this.report.recordAbandoned(state.checkpoint, 'stuck: no progress');
    else if (view?.runningCaseId) this.report.recordAbandonedRunningCase(view.runningCaseId, 'stuck: no progress');

    const queue = state.queue ?? [];
    await this.discardInStorage();

    // Reload the panel's document, or open the panel again if it is gone
    try
    {
      await this.panel.call(PanelScripts.reloadPage);
      await sleep(1000);
      // The stuck document was busy; the reloaded one starts idle
      await this.panel.waitForView('the panel to reload', v => v.isApp && !v.busy, { timeoutMs: 30000 });
      await sleep(1500);
      await this.openTestRunner();
    }
    catch (error)
    {
      await this.recoverPanel(`reloading the stuck panel failed (${errorText(error)})`);
    }

    // The stuck document may have written a checkpoint just before it was
    // reloaded, after the clear above: clear again, and Discard any banner
    // the new document already raised from it
    await this.discardInStorage();
    const reloaded = await this.panel.view();
    if (reloaded.banner)
    {
      await this.panel.call(PanelScripts.clickButton, { exact: 'Discard' });
      await this.panel.waitForView('the stale banner to be discarded', v => !v.banner, { timeoutMs: 10000 });
    }
    if (reloaded.popup) await this.panel.call(PanelScripts.clickButton, { exact: 'OK', within: 'popup' });
    await this.restartRemaining(queue);
  }

  async restartRemaining(queue)
  {
    if (queue.length === 0) return;
    this.batchRestarts++;
    if (this.batchRestarts > MAX_BATCH_RESTARTS) throw new Error(`started the batch over ${MAX_BATCH_RESTARTS} times; giving up`);

    log(`restarting the batch with the ${queue.length} remaining case(s): ${queue.join(', ')}`);
    await this.panel.waitForView('the Test Runner to be idle before restarting', v => v.isIdle, { timeoutMs: 30000 });
    if ((await this.panel.view()).popup) await this.panel.call(PanelScripts.clickButton, { exact: 'OK', within: 'popup' });
    await this.startBatch(queue);
  }

  // -- the watch loop ------------------------------------------------------

  /** Prints each case as its result lands in storage. */
  reportNewResults(state)
  {
    // Compare against what was printed already
    for (const { id } of this.report.plannedCases)
    {
      const results = state.resultsFor(id);
      if (!results || this.printedResults.has(id)) continue;
      this.printedResults.add(id);
      const failed = results.filter(r => !r.passed).length;
      log(failed === 0 ? `PASS ${id} (${results.length}/${results.length})` : `FAIL ${id} (${failed}/${results.length} failed)`);
    }
  }

  /** Reads the run's state, tolerating a few failures in a row (opening a new helper in between). */
  async readStateTolerantly()
  {
    try
    {
      const state = await RunState.read(this.helper);
      this.readFailures = 0;
      return state;
    }
    catch (error)
    {
      this.readFailures++;
      log(`reading the run's state failed (${this.readFailures}/${MAX_CONSECUTIVE_READ_FAILURES}): ${errorText(error)}`);
      if (this.readFailures >= MAX_CONSECUTIVE_READ_FAILURES)
      {
        throw new Error(`could not read the run's state ${MAX_CONSECUTIVE_READ_FAILURES} times in a row: ${errorText(error)}`);
      }
      await this.ensureHelper().catch(helperError => log(`  opening a new helper failed: ${errorText(helperError)}`));
      return null;
    }
  }

  /** Reads the panel, opening it again when its target has been missing for several polls in a row. */
  async readViewTolerantly()
  {
    try
    {
      const view = await this.panel.view();
      this.panelMissingPolls = 0;
      return view;
    }
    catch
    {
      // Parking or coming back keeps the target, so only a missing target
      // counts (SidePanel.call leaves targetId null for that)
      if (this.panel.targetId === null) this.panelMissingPolls++;
      if (this.panelMissingPolls >= PANEL_MISSING_POLLS)
      {
        this.panelMissingPolls = 0;
        await this.recoverPanel(`its target vanished from the test window for ${PANEL_MISSING_POLLS} polls`);
      }
      return null;
    }
  }

  async watchRun()
  {
    this.printedResults = new Set();
    this.batchRestarts = 0;
    this.readFailures = 0;
    this.panelMissingPolls = 0;
    const resumeAttempts = new Map();   // checkpoint key -> times Resume was clicked
    const progress = new ProgressTracker();
    const sleepDetector = new SleepDetector();
    let waiting = { key: null, since: 0 };
    let stalledSince = 0;

    // A machine sleep is not the run's fault: move the deadlines on by it
    const allowForSleep = (slept) =>
    {
      if (!slept) return;
      this.deadline += slept;
      progress.reset();
      log(`the machine seems to have slept ${Math.round(slept / 1000)}s - extending the run's deadline by that much`);
    };

    // Poll the run until the batch is over
    while (true)
    {
      AbortState.throwIfRequested();
      // The last iteration's work can legitimately be long (a reload), so only the monotonic clock's gap counts here
      allowForSleep(sleepDetector.check(null));

      if (Date.now() > this.deadline)
      {
        throw new Error(`the run did not finish within ${Math.round(this.config.timeoutMs / 60000)} minutes (set "timeoutMinutes" in ${CONFIG_FILE} for longer)`);
      }

      const state = await this.readStateTolerantly();
      if (!state)
      {
        await sleep(POLL_MS);
        continue;
      }
      this.reportNewResults(state);
      if (state.isFinished) return;

      const view = await this.readViewTolerantly();
      progress.observe({ state: state.progressFingerprint(), view: view ? view.progressFingerprint() : null });

      // A checkpoint the panel is waiting at, stable for long enough that it
      // is not the moment before an automatic resume
      if (state.checkpoint && view?.isWaitingAt(state.checkpoint))
      {
        stalledSince = 0;
        if (waiting.key !== state.checkpointKey) waiting = { key: state.checkpointKey, since: Date.now() };

        if (Date.now() - waiting.since >= PAUSE_STABLE_MS)
        {
          const key = state.checkpointKey;
          const attempts = resumeAttempts.get(key) ?? 0;

          // Clearing browsing data on a profile outside tools/tmp/ is refused:
          // the pause is left to a person, which is an expected skip
          const guardRefusal = state.checkpoint.external === 'clear-browsing-data' && attempts === 0
            ? await this.guardRefusalAtPause()
            : null;

          if (guardRefusal)
          {
            await this.skipPause(state, view, { reason: guardRefusal, expected: true });
          }
          // A pause the driver owns: do the action once, then click Resume
          // (a repeat visit only needs Resume clicked again)
          else if (state.checkpoint.external && view.banner.hasResume && attempts < MAX_RESUME_ATTEMPTS)
          {
            resumeAttempts.set(key, attempts + 1);
            try
            {
              if (attempts === 0) await this.performExternal(state.checkpoint);
              await this.resume(state.checkpoint);
            }
            catch (error)
            {
              AbortState.throwIfRequested();
              await this.abandonPause(state, error);
            }
          }
          else
          {
            if (state.checkpoint.external)
            {
              this.report.recordDriverError(`${state.checkpoint.caseId}: Resume did not take after ${attempts} attempt(s); skipped`);
            }
            await this.skipPause(state, view);
          }
          waiting = { key: null, since: 0 };
          progress.reset();
        }
      }
      // A batch still recorded, but nothing running and nothing paused: a
      // case errored and stopped the batch (the panel shows the error)
      else if (!state.checkpoint && state.batchInProgress && view?.isIdle)
      {
        waiting = { key: null, since: 0 };
        if (!stalledSince) stalledSince = Date.now();
        if (Date.now() - stalledSince >= STALL_STABLE_MS)
        {
          stalledSince = 0;
          const queue = state.queue ?? [];
          const message = `the batch stopped with ${queue.length} case(s) left${view.panelError ? `; the panel says: ${view.panelError}` : ''}`;
          log(`ERROR ${message}`);
          this.report.recordDriverError(message);
          // The batch is over as far as the panel is concerned; end it in
          // storage too, so a finished restart is recognised as finished
          await this.writeStorageTolerantly({ [STORAGE_KEYS.batchQueue]: null, [STORAGE_KEYS.batchCaseIds]: null });
          await this.restartRemaining(queue);
          progress.reset();
        }
      }
      // Nothing has moved for a long time: the case in progress is stuck
      else if (progress.unchangedForMs >= NO_PROGRESS_MS)
      {
        waiting = { key: null, since: 0 };
        stalledSince = 0;
        await this.recoverFromNoProgress(state, view);
        progress.reset();
      }
      else
      {
        waiting = state.checkpoint && waiting.key === state.checkpointKey ? waiting : { key: null, since: 0 };
        stalledSince = 0;
      }

      sleepDetector.check(null);
      await sleep(POLL_MS);
      allowForSleep(sleepDetector.check(POLL_MS));
    }
  }

  // -- whole run -----------------------------------------------------------

  async run()
  {
    // Windows that exist now are never closed by the driver
    this.initialWindowIds = new Set((await WindowCensus.take(this.browser)).windowIds());

    await this.findExtension();
    // Decide now whether P.6 may clear browsing data, so its chrome://version
    // window comes and goes before the test window exists and has focus
    await this.profileGuard.refusalReason();

    await this.openHelper();
    const testWindowId = await this.helper.call(HelperScripts.createTestWindow);
    // An abort that came while the window was being made: cleanup may already
    // have looked for a test window and found none, so close this one here
    if (AbortState.requested)
    {
      await this.helper.call(HelperScripts.removeWindow, testWindowId).catch(() => {});
      AbortState.throwIfRequested();
    }
    this.testWindowId = testWindowId;
    log(`helper window ${this.helper.windowId}, test window ${this.testWindowId}`);

    this.panel = new SidePanel(this.browser, this.pool, this.extensionId, this.testWindowId);
    await this.openPanel();
    await this.openTestRunner();
    await this.clearLeftovers();
    await this.saveSettings();

    const available = (await this.panel.view()).cases;
    if (available.length === 0) throw new Error('the Test Runner lists no cases');
    this.availableCaseIds = available.map(c => c.id);
    const caseIds = this.config.selectCases(available);
    this.report.plan(available.filter(c => caseIds.includes(c.id)).map(({ id, title }) => ({ id, title })));
    log(`running ${caseIds.length} case(s): ${caseIds.join(', ')}`);

    // Earlier results for these cases would otherwise pass for this run's
    await this.helper.call(HelperScripts.removeCaseResults, STORAGE_KEYS.caseResults, caseIds);
    // A batch an earlier error left recorded would look like this one already running
    await this.helper.call(HelperScripts.writeStorage, { [STORAGE_KEYS.batchQueue]: null, [STORAGE_KEYS.batchCaseIds]: null });

    await this.startBatch(caseIds);
    await this.watchRun();
    this.batchFinished = true;
    log('the batch is finished');
  }

  /**
   * Reads the final results, even after a failed or aborted run, so the file
   * shows how far it got - including the paused case's results so far.
   */
  async collectResults()
  {
    if (!this.extensionId) return;
    try
    {
      await this.ensureHelper();
      let state;
      try
      {
        state = await RunState.read(this.helper);
      }
      catch (error)
      {
        // The helper can close under us (e.g. a reload that finished late): open another and read once more
        log(`reading the final results failed (${errorText(error)}) - trying again with a new helper`);
        await this.ensureHelper();
        state = await RunState.read(this.helper);
      }
      this.report.setFinalResults(state.caseResults);

      // A case still paused when the run ended: keep what it had so far
      const checkpoint = state.checkpoint;
      if (checkpoint && !state.resultsFor(checkpoint.caseId) && !this.report.skipped.has(checkpoint.caseId))
      {
        this.report.recordAbandoned(checkpoint, AbortState.reason ? `the run was stopped (${AbortState.reason})` : 'the run ended while this case was in progress');
      }
    }
    catch (error)
    {
      this.report.recordDriverError(`could not read the final results: ${errorText(error)}`);
    }
  }

  /** Closes the test window: through the helper, or by closing its tabs over CDP when there is no helper. */
  async closeTestWindow()
  {
    if (this.testWindowId === null) return;
    try
    {
      if (this.helper)
      {
        await this.helper.call(HelperScripts.removeWindow, this.testWindowId);
        return;
      }
    }
    catch
    {
      // Fall through to the CDP fallback
    }

    const census = await WindowCensus.take(this.browser);
    // Closing every tab closes the window
    for (const tab of census.tabsIn(this.testWindowId))
    {
      await closeTarget(this.browser, tab.targetId);
    }
  }

  /** Whether a tab is something a test case opened (see TEST_PAGE_PREFIXES) or a page of this extension. */
  isTestArtifactUrl(url)
  {
    return (this.extensionId && url.startsWith(`chrome-extension://${this.extensionId}/`))
      || TEST_PAGE_PREFIXES.some(prefix => url.startsWith(prefix));
  }

  /**
   * Closes windows opened during the run whose tabs are all test artifacts
   * (e.g. a case's chrome://extensions window, a tab a case moved to a new
   * window). Never touches a window that existed when the driver started.
   */
  async closeArtifactWindows()
  {
    if (!this.initialWindowIds) return;
    const census = await WindowCensus.take(this.browser);
    // Look at every window that is new since the start
    for (const windowId of census.windowIds())
    {
      if (this.initialWindowIds.has(windowId) || windowId === this.helper?.windowId) continue;
      const tabs = census.tabsIn(windowId);
      if (tabs.length === 0 || !tabs.every(tab => this.isTestArtifactUrl(tab.url))) continue;

      log(`closing a window the run left behind (${tabs.map(tab => tab.url).join(', ')})`);
      // Closing every tab closes the window
      for (const tab of tabs)
      {
        await closeTarget(this.browser, tab.targetId);
      }
    }
  }

  async cleanup()
  {
    const runEndedEarly = !this.batchFinished;

    // Stop the panel first, so it cannot carry on a batch by itself
    if (!this.config.keepWindows)
    {
      await this.closeTestWindow().catch(error => log(`warning: could not close the test window: ${errorText(error)}`));
    }
    else if (runEndedEarly && this.panel)
    {
      await this.panel.call(PanelScripts.clickButton, { exact: 'Discard' }).catch(() => null);
      log('warning: keepWindows is set and the run ended early - a case already running in the panel may still finish by itself');
    }

    // A run that ended early leaves no paused run behind for the next sidebar to show
    if (runEndedEarly && this.extensionId)
    {
      await this.discardInStorage().catch(error => log(`warning: could not clear the paused run: ${errorText(error)}`));
    }

    try
    {
      await this.restoreSettings();
    }
    catch (error)
    {
      log(`warning: could not restore the Test Runner's checkboxes: ${errorText(error)}`);
    }

    if (this.config.keepWindows)
    {
      log('keepWindows is set - leaving the test and helper windows open');
      return;
    }

    await this.closeArtifactWindows().catch(error => log(`warning: could not close leftover test windows: ${errorText(error)}`));
    if (this.helper) await this.helper.close();
  }

  /** Starts the run, remembering it so finish() can wait for it to stop. */
  start()
  {
    this.runPromise = this.run();
    return this.runPromise;
  }

  /**
   * Collects the results, writes the file, prints the summary and cleans up,
   * once, however the run ended (normally, by error, signal or watchdog).
   * Its waits run in finishScope, so an abort does not cut them short (see
   * AbortState.throwIfRequestedOutsideFinish). Returns the exit code.
   */
  finish()
  {
    if (!this.finishing)
    {
      this.finishing = finishScope.run(true, async () =>
      {
        // Give an aborted run() a moment to stop, so it does not open
        // anything after cleanup has looked
        if (this.runPromise)
        {
          await Promise.race([this.runPromise.catch(() => {}), sleep(RUN_SETTLE_MS, undefined, { ref: false })]);
        }

        try
        {
          await this.collectResults();
          const file = this.report.writeFile();
          this.report.printSummary();
          console.log(`\nResults: ${file}`);
        }
        catch (error)
        {
          log(`ERROR could not write the report: ${errorText(error)}`);
          this.report.recordDriverError(`could not write the report: ${errorText(error)}`);
        }
        finally
        {
          await this.cleanup().catch(error => log(`warning: cleanup failed: ${errorText(error)}`));
        }
        return this.report.exitCode();
      });
    }
    return this.finishing;
  }
}

// ---------------------------------------------------------------------------

async function main()
{
  let config;
  try
  {
    config = DriverConfig.load();
  }
  catch (error)
  {
    console.error(`run-inpanel-tests: ${errorText(error)}`);
    return 1;
  }

  let browser;
  try
  {
    browser = await BrowserConnection.open(config.debugHost);
  }
  catch (error)
  {
    console.error(`run-inpanel-tests: ${errorText(error)}`);
    return 1;
  }
  browser.slowCallThresholdMs = SLOW_CALL_MS;
  browser.onSlowCall = (method, elapsedMs, outcome) => log(`slow CDP call: ${method} took ${(elapsedMs / 1000).toFixed(1)}s (${outcome})`);

  const driver = new TestRunDriver(browser, config);

  // Stops the run, still writing the results and cleaning up (within a grace period), then exits
  const shutdown = (reason, exitCode) =>
  {
    // A second signal (or the watchdog during a shutdown) exits at once
    if (AbortState.requested)
    {
      log(`${reason} again - exiting now without waiting for cleanup`);
      process.exit(exitCode);
    }
    AbortState.request(reason);
    log(`${reason} - stopping, writing results and cleaning up`);
    Promise.race([driver.finish(), sleep(SHUTDOWN_GRACE_MS)])
      .finally(() =>
      {
        browser.close();
        process.exit(exitCode);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT', 130));
  process.on('SIGTERM', () => shutdown('SIGTERM', 143));

  // Last resort if a CDP call or a wait somehow outlives every deadline:
  // give the run a few minutes past its own timeout, then stop it
  const watchdog = setTimeout(() => shutdown('watchdog: the driver hung past its timeout', 1), config.timeoutMs + 5 * 60000);
  watchdog.unref();

  try
  {
    await driver.start();
  }
  catch (error)
  {
    // An abort's own error is expected; the shutdown above reports it
    if (!AbortState.requested)
    {
      log(`ERROR ${errorText(error)}`);
      driver.report.recordDriverError(errorText(error));
    }
  }

  const exitCode = await driver.finish();
  // A shutdown in progress decides the exit code and closes the connection itself
  if (AbortState.requested) return new Promise(() => {});
  browser.close();
  return exitCode;
}

process.exitCode = await main();
