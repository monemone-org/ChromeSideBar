#!/usr/bin/env node
// Talks to the test Chrome started by tools/start-test-chrome.sh over the
// Chrome DevTools Protocol (port 9333, or $CDP_PORT). A thin command line over
// tools/cdp-client.mjs, which uses Node's built-in fetch and WebSocket, so it
// needs Node 22+ and no npm package.
//
// The request is one JSON object. It is read from the first argument when
// that is inline JSON or a path to a JSON file, and from
// tools/tmp/cdp-request.json when there is no argument.
//
//   { "op": "targets" }
//       List every target Chrome knows about (tabs, the side panel, the
//       extension's service worker).
//
//   { "op": "eval", "target": "index.html", "expr": "document.title" }
//       Evaluate an expression in the target whose id is "target", or else the
//       first target whose url, title or type contains it. Promises are awaited, and the call counts as a
//       user gesture, which chrome.sidePanel.open() requires.
//       Optional: "type" to also require a target type (e.g. "service_worker"),
//       "timeoutMs" (default 30000), and "exprFile" in place of "expr" to
//       read the script from a file next to the request file.
//
//   { "op": "cdp", "target": "background.js", "method": "Runtime.enable", "params": {} }
//       Send one raw protocol method to a target. Leave "target" out to send
//       it to the browser itself.
//
// The result is printed to stdout as JSON: { "ok": true, "result": ... } or
// { "ok": false, "error": "..." }. The exit code is 0 only when ok.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserConnection, DEFAULT_TIMEOUT_MS } from './cdp-client.mjs';

const DEFAULT_REQUEST_FILE = resolve(dirname(fileURLToPath(import.meta.url)), 'tmp', 'cdp-request.json');

/** Reads the request from argv (inline JSON or a file path) or the default request file. */
function readRequest()
{
  const arg = process.argv[2];
  if (arg && arg.trim().startsWith('{')) return JSON.parse(arg);

  const file = arg ? resolve(arg) : DEFAULT_REQUEST_FILE;
  if (!existsSync(file)) throw new Error(`no request given and ${file} does not exist`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function run(request)
{
  const browser = await BrowserConnection.open();
  try
  {
    if (request.op === 'targets') return await browser.targets();

    if (request.op === 'eval')
    {
      const sessionId = await browser.attach(request.target, request.type);
      const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      // "exprFile" (a path relative to the request file's folder) keeps longer
      // scripts out of a JSON string, where every quote needs escaping.
      const expression = request.exprFile
        ? readFileSync(resolve(dirname(DEFAULT_REQUEST_FILE), request.exprFile), 'utf8')
        : request.expr;
      return await browser.evaluate(sessionId, expression, { timeoutMs });
    }

    if (request.op === 'cdp')
    {
      const sessionId = request.target ? await browser.attach(request.target, request.type) : undefined;
      return await browser.send(request.method, request.params ?? {}, sessionId, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }

    throw new Error(`unknown op "${request.op}" - expected targets, eval or cdp`);
  }
  finally
  {
    browser.close();
  }
}

try
{
  const result = await run(readRequest());
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}
catch (error)
{
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
