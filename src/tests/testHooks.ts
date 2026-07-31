// DEV-only bridge exposing in-app state/actions to an external Playwright driver
// (see e2e/README.md). Not included in production builds - callers must check
// import.meta.env.DEV before relying on window.__testHooks existing.

declare global
{
  interface Window
  {
    __testHooks?: TestHooks;
  }
}

interface TestHooks
{
  ping: () => string;
  loadedAt: () => number;
}

const loadedAt = Date.now();

// Heartbeat keys read by an external driver (e2e/) via chrome.storage.session -
// NOT via evaluating JS directly on the panel's own page. Playwright doesn't
// reliably auto-attach to the side panel as a `page` target, but the
// background service worker is always attachable, and chrome.storage is
// shared across every extension context. testHooksMountedAt is written here
// on mount; testHooksClosedAt is written by background.ts on port disconnect
// (see the matching listener there) rather than from a page lifecycle event
// here - pagehide's async storage write can race with the page's context
// being destroyed before the write finishes, so the panel itself can't
// reliably report its own teardown.
const MOUNTED_AT_KEY = 'testHooksMountedAt';

export function installTestHooks(): void
{
  if (import.meta.env.DEV)
  {
    window.__testHooks = {
      ping: () => 'pong',
      loadedAt: () => loadedAt,
    };

    chrome.storage.session.set({ [MOUNTED_AT_KEY]: loadedAt });
    chrome.runtime.connect({ name: 'testHooksPanel' });
  }
}
