// Section U - URL drift on pinned sites and bookmarks.
// docs/test/tab-space-association-test-cases.md#section-u---url-drift
//
// A pinned site's or bookmark's tab "drifts" when it navigates away from the
// saved URL. These cases walk one tab through open -> same-domain path change
// -> different domain -> "Back to ... URL" -> different domain again -> close,
// and check what the sidebar's DOM shows after each step: the pin button's
// loaded dot / drifted-domain favicon badge / tooltip, and the bookmark row's
// drift marker / Close tab button.
//
// Drift is only tracked in Arc mode, so each case switches "Open bookmarks" to
// Arc first. The bookmark cases also set "Show tab title after navigating
// away". Cleanup resets both to their defaults (Arc, on) - not to whatever the
// tester had chosen before the run.

import { TestCase, TestContext, TestStep } from '../types';
import { createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_WORK_NAME, testOtherDomainUrl, testUrl } from '../fixtures';
import { closeTab, navigateTab, openBookmarkTab, openPinnedTab, setArcShowTabTitleWhenDrifted, setBookmarkOpenMode, setFollowActiveTabMode, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded } from '../assertions';
import { resolveStringRef, sleep } from '../stepHelpers';
import { PIN_GO_BACK_HINT } from '../../../utils/driftTooltip';

// The sidebar only re-renders after Chrome reports the navigation through
// chrome.tabs.onUpdated, so DOM checks poll until this deadline
const DOM_TIMEOUT_MS = 5000;
const DOM_POLL_MS = 100;

// Tooltip line PinnedIcon adds to a drifted pin
const PIN_DRIFT_TOOLTIP = PIN_GO_BACK_HINT;

const OTHER_DOMAIN = 'example.org';

// =============================================================================
// DOM views
// =============================================================================

type PinIndicator = 'none' | 'dot' | 'badge';

/** Read-only view of one pin button in PinnedBar, found by its dnd id. */
class PinButtonView
{
  private constructor(private readonly element: Element) {}

  static find(pinId: string): PinButtonView | null
  {
    const element = document.querySelector(`[data-dnd-id="pin-${pinId}"]`);
    return element ? new PinButtonView(element) : null;
  }

  /** What sits in the button's bottom-right corner: the loaded dot, the drifted-domain favicon, or nothing. */
  indicator(): PinIndicator
  {
    if (this.badge()) return 'badge';
    if (this.element.querySelector('[data-testid="pin-loaded-dot"]')) return 'dot';
    return 'none';
  }

  /** The badge image's src, decoded, so a Chrome _favicon/?pageUrl=... address can be searched for the domain. */
  badgeSource(): string | undefined
  {
    const src = this.badge()?.getAttribute('src');
    return src ? decodeURIComponent(src) : undefined;
  }

  tooltip(): string
  {
    return this.element.getAttribute('title') ?? '';
  }

  private badge(): Element | null
  {
    return this.element.querySelector('[data-testid="pin-drift-favicon"]');
  }
}

/** Read-only view of one bookmark row in BookmarkTree. */
class BookmarkRowView
{
  private constructor(private readonly element: Element) {}

  static find(bookmarkId: string): BookmarkRowView | null
  {
    const element = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
    return element ? new BookmarkRowView(element) : null;
  }

  hasDriftMarker(): boolean
  {
    return this.element.querySelector('[data-testid="bookmark-drift-marker"]') !== null;
  }

  title(): string
  {
    return this.element.querySelector('[data-tree-row-title]')?.textContent ?? '';
  }

  /** Arc mode shows an always-visible Close tab button on a loaded bookmark's row. */
  showsLoaded(): boolean
  {
    return this.element.querySelector('button[aria-label="Close tab"]') !== null;
  }
}

// =============================================================================
// Polling
// =============================================================================

/**
 * Re-run `check` until it reports no problem (returns null) or the deadline
 * passes, then throw its last problem. Each failure also reports where the
 * tab really is, which separates "the tab never navigated" from "the sidebar
 * did not react to it".
 */
async function waitForDom(
  ctx: TestContext,
  tabRef: string | undefined,
  check: () => string | null | Promise<string | null>
): Promise<void>
{
  const deadline = Date.now() + DOM_TIMEOUT_MS;
  let problem = await check();

  // Retry until the sidebar has re-rendered into the expected state
  while (problem !== null && Date.now() < deadline)
  {
    await sleep(DOM_POLL_MS);
    problem = await check();
  }
  if (problem === null) return;

  throw new Error(`${problem} (after ${DOM_TIMEOUT_MS}ms)${await describeTabLocation(ctx, tabRef)}`);
}

async function describeTabLocation(ctx: TestContext, tabRef: string | undefined): Promise<string>
{
  const tabId = tabRef ? ctx.refs.get(tabRef) : undefined;
  if (typeof tabId !== 'number') return '';
  try
  {
    const tab = await chrome.tabs.get(tabId);
    return `; the tab is at ${tab.url || tab.pendingUrl || '(no url)'}`;
  }
  catch
  {
    return '; the tab no longer exists';
  }
}

// =============================================================================
// Steps
// =============================================================================

interface PinExpectation
{
  indicator: PinIndicator;
  drifted: boolean;           // tooltip mentions navigating away
}

function assertPinButton(pinRef: string, tabRef: string | undefined, expected: PinExpectation, why: string): TestStep
{
  return {
    kind: 'assert',
    label: `Pin "${pinRef}" button shows ${expected.indicator === 'none' ? 'no indicator' : `the ${expected.indicator === 'dot' ? 'loaded dot' : `${OTHER_DOMAIN} favicon badge`}`}, ${expected.drifted ? 'drift' : 'plain'} tooltip - ${why}`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      await waitForDom(ctx, tabRef, () =>
      {
        const pin = PinButtonView.find(pinId);
        if (!pin) return `pin button [data-dnd-id="pin-${pinId}"] not found - is a pinned-bar filter active?`;

        const indicator = pin.indicator();
        if (indicator !== expected.indicator)
        {
          return `expected the pin's corner indicator to be "${expected.indicator}", it is "${indicator}"`;
        }

        // The badge must show the NEW domain's icon, not the pin's own site
        if (expected.indicator === 'badge')
        {
          const source = pin.badgeSource() ?? '';
          if (!source.includes(OTHER_DOMAIN))
          {
            return `expected the badge favicon to come from ${OTHER_DOMAIN}, its src is "${source}"`;
          }
        }

        const drifted = pin.tooltip().includes(PIN_DRIFT_TOOLTIP);
        if (drifted !== expected.drifted)
        {
          return `expected the tooltip to ${expected.drifted ? 'have' : 'not have'} a "${PIN_DRIFT_TOOLTIP}" line, it is "${pin.tooltip().replace(/\n/g, ' | ')}"`;
        }
        return null;
      });
    },
  };
}

// Which title the bookmark row shows: the bookmark's own name, or its tab's live title
type BookmarkRowTitle = 'name' | 'tab';

interface BookmarkExpectation
{
  loaded: boolean;
  driftMarker: boolean;
  title: BookmarkRowTitle;
}

/** The title the row should show, or a problem if it can't be determined yet. */
async function expectedBookmarkRowTitle(
  ctx: TestContext,
  bookmarkId: string,
  tabRef: string | undefined,
  title: BookmarkRowTitle
): Promise<{ text: string } | { problem: string }>
{
  if (title === 'name')
  {
    const [bookmark] = await chrome.bookmarks.get(bookmarkId);
    return { text: bookmark.title };
  }

  const tabId = tabRef ? ctx.refs.get(tabRef) : undefined;
  if (typeof tabId !== 'number') return { problem: `no tab "${tabRef}" to read the live title from` };
  const tab = await chrome.tabs.get(tabId);
  // Until the page loads, the tab's "title" is just its URL
  if (!tab.title || tab.status !== 'complete') return { problem: `tab "${tabRef}" hasn't finished loading its title yet` };
  return { text: tab.title };
}

function assertBookmarkRow(bookmarkRef: string, tabRef: string | undefined, expected: BookmarkExpectation, why: string): TestStep
{
  return {
    kind: 'assert',
    label: `Bookmark "${bookmarkRef}" row shows ${expected.loaded ? 'loaded' : 'not loaded'}, ${expected.driftMarker ? 'with' : 'without'} drift marker, ${expected.title === 'name' ? "the bookmark's name" : "the tab's title"} - ${why}`,
    run: async (ctx) =>
    {
      const bookmarkId = resolveStringRef(ctx, bookmarkRef);
      await waitForDom(ctx, tabRef, async () =>
      {
        const row = BookmarkRowView.find(bookmarkId);
        if (!row) return `bookmark row [data-bookmark-id="${bookmarkId}"] not found - is the sidebar showing the test space?`;

        if (row.showsLoaded() !== expected.loaded)
        {
          return `expected the row to ${expected.loaded ? 'show' : 'not show'} the Close tab button, it ${row.showsLoaded() ? 'does' : "doesn't"}`;
        }
        if (row.hasDriftMarker() !== expected.driftMarker)
        {
          return `expected the row to ${expected.driftMarker ? 'show' : 'not show'} the drift marker, it ${row.hasDriftMarker() ? 'does' : "doesn't"}`;
        }

        // Compare the row's title against the bookmark name or the tab's live title
        const expectedTitle = await expectedBookmarkRowTitle(ctx, bookmarkId, tabRef, expected.title);
        if ('problem' in expectedTitle) return expectedTitle.problem;
        if (row.title() !== expectedTitle.text)
        {
          return `expected the row title to be ${expected.title === 'name' ? "the bookmark's name" : "the tab's title"} "${expectedTitle.text}", it is "${row.title()}"`;
        }
        return null;
      });
    },
  };
}

/** "Back to Pinned URL": what PinnedBar's onReset calls, with the pin's saved URL. */
function backToPinnedUrl(pinRef: string): TestStep
{
  return {
    kind: 'action',
    label: `"Back to Pinned URL" on pin "${pinRef}"`,
    run: async (ctx) =>
    {
      const pinId = resolveStringRef(ctx, pinRef);
      const site = ctx.pinnedSites.find(p => p.id === pinId);
      if (!site) throw new Error(`pin "${pinId}" not found in ctx.pinnedSites`);
      await ctx.resetPinnedTab(site.id, site.url);
    },
  };
}

/** "Back to Bookmarked URL": what BookmarkTree's onResetBookmark calls, with the bookmark's saved URL. */
function backToBookmarkedUrl(bookmarkRef: string): TestStep
{
  return {
    kind: 'action',
    label: `"Back to Bookmarked URL" on bookmark "${bookmarkRef}"`,
    run: async (ctx) =>
    {
      const bookmarkId = resolveStringRef(ctx, bookmarkRef);
      const [bookmark] = await chrome.bookmarks.get(bookmarkId);
      if (!bookmark?.url) throw new Error(`bookmark "${bookmarkId}" has no url`);
      await ctx.resetBookmarkTab(bookmarkId, bookmark.url);
    },
  };
}

// =============================================================================
// Cases
// =============================================================================

const U1_PIN_URL = testUrl('u1-pin');

// U.1 - a pinned site's button through every drift state. Pins compare the
// full URL for "drifted" (tooltip, Back to Pinned URL) but only swap the
// loaded dot for the new site's favicon when the DOMAIN changes.
export const U1_PINNED_SITE_DRIFT: TestCase = {
  id: 'U.1',
  title: 'Pinned site button follows its tab drifting away and back',
  setup: async (getCtx) =>
  {
    await createTestPinnedSite(getCtx, 'U1 drift', U1_PIN_URL, 'pin');
  },
  steps: [
    setFollowActiveTabMode('off'),
    setBookmarkOpenMode('arc'),
    assertPinButton('pin', undefined, { indicator: 'none', drifted: false }, 'no tab yet'),

    openPinnedTab({ pinRef: 'pin', url: U1_PIN_URL, tabRef: 'tab' }),
    assertPinButton('pin', 'tab', { indicator: 'dot', drifted: false }, 'tab open on the pinned URL'),

    navigateTab('tab', testUrl('u1-pin-other-path')),
    assertPinButton('pin', 'tab', { indicator: 'dot', drifted: true }, 'same domain, different path'),

    navigateTab('tab', testOtherDomainUrl('u1-pin')),
    assertPinButton('pin', 'tab', { indicator: 'badge', drifted: true }, 'different domain'),

    backToPinnedUrl('pin'),
    assertPinButton('pin', 'tab', { indicator: 'dot', drifted: false }, 'back on the pinned URL'),

    navigateTab('tab', testOtherDomainUrl('u1-pin-again')),
    assertPinButton('pin', 'tab', { indicator: 'badge', drifted: true }, 'different domain again'),

    closeTab('tab'),
    assertPinButton('pin', undefined, { indicator: 'none', drifted: false }, 'tab closed while drifted'),
  ],
};

const U2_BOOKMARK_URL = testUrl('u2-bookmark');

// U.2 - a bookmark row through the same states, with "Show tab title after
// navigating away" off: the row keeps the bookmark's name and shows the drift
// marker instead. Bookmarks compare the full URL, so a path change on the same
// domain already counts as drifted.
export const U2_BOOKMARK_DRIFT: TestCase = {
  id: 'U.2',
  title: 'Bookmark row follows its tab drifting away and back (tab title setting off)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'space', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'space', 'U2 drift', U2_BOOKMARK_URL, 'bookmark');
  },
  steps: [
    setFollowActiveTabMode('off'),
    setBookmarkOpenMode('arc'),
    setArcShowTabTitleWhenDrifted(false),
    ...switchSpaceVerified('space'),
    assertBookmarkRow('bookmark', undefined, { loaded: false, driftMarker: false, title: 'name' }, 'no tab yet'),

    openBookmarkTab({ bookmarkRef: 'bookmark', url: U2_BOOKMARK_URL, spaceRef: 'space', tabRef: 'tab' }),
    assertBookmarkLoaded('bookmark', true),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: false, title: 'name' }, 'tab open on the bookmarked URL'),

    navigateTab('tab', testUrl('u2-bookmark-other-path')),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: true, title: 'name' }, 'same domain, different path'),

    navigateTab('tab', testOtherDomainUrl('u2-bookmark')),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: true, title: 'name' }, 'different domain'),

    backToBookmarkedUrl('bookmark'),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: false, title: 'name' }, 'back on the bookmarked URL'),

    navigateTab('tab', testOtherDomainUrl('u2-bookmark-again')),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: true, title: 'name' }, 'different domain again'),

    closeTab('tab'),
    assertBookmarkLoaded('bookmark', false),
    assertBookmarkRow('bookmark', undefined, { loaded: false, driftMarker: false, title: 'name' }, 'tab closed while drifted'),
  ],
};

const U3_BOOKMARK_URL = testUrl('u3-bookmark');

// U.3 - the same walk with "Show tab title after navigating away" on (the
// default): a drifted row shows its tab's title instead of the bookmark's
// name, alongside the drift marker.
export const U3_BOOKMARK_DRIFT_TAB_TITLE: TestCase = {
  id: 'U.3',
  title: 'Bookmark row shows its tab title while drifted (tab title setting on)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'space', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'space', 'U3 drift', U3_BOOKMARK_URL, 'bookmark');
  },
  steps: [
    setFollowActiveTabMode('off'),
    setBookmarkOpenMode('arc'),
    setArcShowTabTitleWhenDrifted(true),
    ...switchSpaceVerified('space'),
    assertBookmarkRow('bookmark', undefined, { loaded: false, driftMarker: false, title: 'name' }, 'no tab yet'),

    openBookmarkTab({ bookmarkRef: 'bookmark', url: U3_BOOKMARK_URL, spaceRef: 'space', tabRef: 'tab' }),
    assertBookmarkLoaded('bookmark', true),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: false, title: 'name' }, 'tab open on the bookmarked URL keeps the name'),

    navigateTab('tab', testUrl('u3-bookmark-other-path')),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: true, title: 'tab' }, 'same domain, different path'),

    navigateTab('tab', testOtherDomainUrl('u3-bookmark')),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: true, title: 'tab' }, 'different domain'),

    backToBookmarkedUrl('bookmark'),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: false, title: 'name' }, 'back on the bookmarked URL'),

    navigateTab('tab', testOtherDomainUrl('u3-bookmark-again')),
    assertBookmarkRow('bookmark', 'tab', { loaded: true, driftMarker: true, title: 'tab' }, 'different domain again'),

    closeTab('tab'),
    assertBookmarkLoaded('bookmark', false),
    assertBookmarkRow('bookmark', undefined, { loaded: false, driftMarker: false, title: 'name' }, 'tab closed while drifted'),
  ],
};

export const SECTION_U_CASES: TestCase[] = [
  U1_PINNED_SITE_DRIFT,
  U2_BOOKMARK_DRIFT,
  U3_BOOKMARK_DRIFT_TAB_TITLE,
];
