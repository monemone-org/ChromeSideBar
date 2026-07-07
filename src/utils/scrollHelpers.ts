// The target element may not exist yet when a scroll is requested (space content
// still rendering, bookmark folder still expanding), so poll until it appears.
const RETRY_INTERVAL_MS = 100;
const MAX_WAIT_MS = 2000;

// Window event dispatched while waiting for a bookmark row that is not in the
// DOM yet. BookmarkTree listens for it and expands the bookmark's ancestor
// folders so the row renders. Tying expansion to the scroll (rather than to tab
// activation) keeps folders untouched when the follow mode decides not to scroll.
export const REVEAL_BOOKMARK_EVENT = 'sidebar-reveal-bookmark';

export interface RevealBookmarkDetail
{
  bookmarkId: string;
}

// Identifies the most recent scroll request. A new request supersedes any
// in-flight polling from a previous one so rapid tab activations don't fight.
let currentRequestId = 0;

function scrollToDataElement(dataAttribute: string, id: string, delay: number, onMissing?: () => void): void
{
  currentRequestId++;
  const requestId = currentRequestId;
  const startTime = Date.now();

  const attempt = () =>
  {
    if (requestId !== currentRequestId) return;

    const element = document.querySelector(`[${dataAttribute}="${id}"]`);
    if (element)
    {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    // Element not rendered yet - let the caller react (e.g. expand folders),
    // then retry until the wait cap expires
    onMissing?.();
    if (Date.now() - startTime < MAX_WAIT_MS)
    {
      setTimeout(attempt, RETRY_INTERVAL_MS);
    }
    else if (import.meta.env.DEV)
    {
      console.log(`scrollHelpers: gave up waiting for [${dataAttribute}="${id}"]`);
    }
  };

  setTimeout(attempt, delay);
}

const DEFAULT_DELAY = 100;

export function scrollToBookmark(bookmarkId: string, delay: number = DEFAULT_DELAY): void
{
  // Ask BookmarkTree to expand the bookmark's ancestor folders whenever the row
  // is missing. Dispatched on every retry (not just once) because during a space
  // switch the destination BookmarkTree may not be mounted yet when the first
  // attempts fire.
  const requestReveal = () =>
  {
    const detail: RevealBookmarkDetail = { bookmarkId };
    window.dispatchEvent(new CustomEvent(REVEAL_BOOKMARK_EVENT, { detail }));
  };
  scrollToDataElement('data-bookmark-id', bookmarkId, delay, requestReveal);
}

export function scrollToTab(tabId: string | number, delay: number = DEFAULT_DELAY): void
{
  scrollToDataElement('data-tab-id', String(tabId), delay);
}
