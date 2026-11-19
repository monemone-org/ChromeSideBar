// A small Chrome DevTools Protocol client for the test Chrome started by
// tools/start-test-chrome.sh. Uses Node's built-in fetch and WebSocket, so it
// needs Node 22+ and no npm package.
//
// Shared by tools/cdp.mjs (a one-shot CLI) and tools/run-inpanel-tests.mjs
// (the test driver).

export const DEFAULT_DEBUG_PORT = '9333';
export const DEFAULT_TIMEOUT_MS = 30000;

// How long to wait for Chrome's /json/version page and the websocket to open.
const CONNECT_TIMEOUT_MS = 10000;

/** The http://host:port DevTools address for a port. */
export function debugHostFor(port = DEFAULT_DEBUG_PORT)
{
  return `http://127.0.0.1:${port}`;
}

/**
 * One connection to the browser's own DevTools endpoint. Every target is
 * reached through it as a flattened session, which also covers targets the
 * /json/list page leaves out.
 */
export class BrowserConnection
{
  constructor(socket)
  {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    // Optional: set both to hear about calls that took longer than the
    // threshold, e.g. (method, elapsedMs, outcome) => console.log(...)
    this.slowCallThresholdMs = 0;
    this.onSlowCall = null;
    socket.addEventListener('message', (event) => this.handleMessage(event));
    socket.addEventListener('close', () => this.handleClose());
  }

  static async open(debugHost = debugHostFor(process.env.CDP_PORT ?? DEFAULT_DEBUG_PORT))
  {
    let version;
    try
    {
      const response = await fetch(`${debugHost}/json/version`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
      version = await response.json();
    }
    catch (error)
    {
      throw new Error(`could not reach Chrome's DevTools at ${debugHost} (${error instanceof Error ? error.message : String(error)}). `
        + 'Is the test Chrome running? Start it with tools/start-test-chrome.sh.');
    }

    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) =>
    {
      const timer = setTimeout(() => rejectOpen(new Error('the DevTools websocket did not open in time')), CONNECT_TIMEOUT_MS);
      socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); rejectOpen(new Error('could not open the DevTools websocket')); }, { once: true });
    });
    return new BrowserConnection(socket);
  }

  handleMessage(event)
  {
    const message = JSON.parse(event.data);
    const waiter = this.pending.get(message.id);
    if (!waiter) return; // an event, or a reply nobody is waiting for
    this.pending.delete(message.id);

    if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
    else waiter.resolve(message.result);
  }

  /** Fails every call still waiting, so nothing hangs on a connection that is gone. */
  handleClose()
  {
    this.closed = true;
    // Iterate a copy, since the loop deletes entries from the map as it goes
    for (const [id, waiter] of [...this.pending])
    {
      this.pending.delete(id);
      waiter.reject(new Error(`${waiter.method}: the DevTools connection closed (did Chrome quit?)`));
    }
  }

  /** Reports a call that took longer than slowCallThresholdMs, when someone asked to hear about it. */
  noteDuration(method, startedAt, outcome)
  {
    const elapsed = Date.now() - startedAt;
    if (this.onSlowCall && this.slowCallThresholdMs > 0 && elapsed > this.slowCallThresholdMs)
    {
      this.onSlowCall(method, elapsed, outcome);
    }
  }

  /** Sends one protocol method, to the browser or (with sessionId) to an attached target. */
  send(method, params = {}, sessionId = undefined, timeoutMs = DEFAULT_TIMEOUT_MS)
  {
    if (this.closed) return Promise.reject(new Error(`${method}: the DevTools connection is closed`));

    const id = this.nextId++;
    const startedAt = Date.now();
    return new Promise((resolveSend, rejectSend) =>
    {
      const timer = setTimeout(() =>
      {
        this.pending.delete(id);
        this.noteDuration(method, startedAt, 'timed out');
        rejectSend(new Error(`${method}: no reply within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (result) => { clearTimeout(timer); this.noteDuration(method, startedAt, 'ok'); resolveSend(result); },
        reject: (error) => { clearTimeout(timer); this.noteDuration(method, startedAt, 'error'); rejectSend(error); },
      });

      try
      {
        this.socket.send(JSON.stringify({ id, method, params, sessionId }));
      }
      catch (error)
      {
        // The socket refused the message (e.g. it is closing): nothing will reply
        clearTimeout(timer);
        this.pending.delete(id);
        rejectSend(new Error(`${method}: could not send (${error instanceof Error ? error.message : String(error)})`));
      }
    });
  }

  async targets(timeoutMs = DEFAULT_TIMEOUT_MS)
  {
    const { targetInfos } = await this.send('Target.getTargets', {}, undefined, timeoutMs);
    return targetInfos.map(({ targetId, type, title, url, attached }) => ({ targetId, type, title, url, attached }));
  }

  /** The first target whose id equals `match` or whose url, title or type contains it, or undefined. */
  async findTarget(match, type)
  {
    const all = await this.targets();
    return all.find(target =>
      (!type || target.type === type)
      && (target.targetId === match || [target.url, target.title, target.type].some(field => field.includes(match))));
  }

  /** Finds the first target whose url, title or type contains `match` and returns an attached session id for it. */
  async attach(match, type)
  {
    const found = await this.findTarget(match, type);
    if (!found)
    {
      const known = (await this.targets()).map(target => `${target.type} ${target.url}`).join('\n  ');
      throw new Error(`no target matching "${match}"${type ? ` of type ${type}` : ''}. Targets:\n  ${known}`);
    }
    return this.attachToTargetId(found.targetId);
  }

  /** Attaches to one exact target and returns the flattened session id. */
  async attachToTargetId(targetId, timeoutMs = DEFAULT_TIMEOUT_MS)
  {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true }, undefined, timeoutMs);
    return sessionId;
  }

  /**
   * Evaluates an expression in an attached target and returns its value.
   * Promises are awaited, and by default the call counts as a user gesture,
   * which chrome.sidePanel.open() requires. A thrown exception becomes a
   * rejected promise carrying the page's own error text.
   */
  async evaluate(sessionId, expression, { timeoutMs = DEFAULT_TIMEOUT_MS, awaitPromise = true, userGesture = true } = {})
  {
    const reply = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture,
    }, sessionId, timeoutMs);

    if (reply.exceptionDetails)
    {
      const details = reply.exceptionDetails;
      throw new Error(details.exception?.description ?? details.text);
    }
    return reply.result.value;
  }

  close()
  {
    this.socket.close();
  }
}
