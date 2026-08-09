// Section C - "Follow active tab" modes.
// docs/test/tab-space-association-test-cases.md#section-c---follow-active-tab-modes
//
// Covers C.1a-C.1f, each run once per FollowActiveTabMode. C.2 is not ported
// yet. setFollowActiveTabMode() + activateTabNative() cover the space-switch
// half; openFillerTabsUntilScrollable() + scrollRowOutOfView() + an explicit
// precondition check cover the scroll half for real (not just a smoke test -
// see assertTabRowVisible's caveat in assertions.ts about why an anchor row
// has to be genuinely pushed off-screen first).
//
// ---------------------------------------------------------------------------
// Every case here follows the same skeleton, and the ORDER is load-bearing:
//
//   setFollowActiveTabMode('off')   <- setup runs with following suppressed
//   ...open tabs / anchor rows...
//   assert precondition
//   setFollowActiveTabMode(mode)    <- arm the mode under test, late
//   <the one step under test>
//   assert result
//
// The mode is armed LAST because setup itself activates tabs: openBookmarkTab,
// openPinnedTab and chrome.tabs.create all default to active:true. With the
// real mode armed during setup, those incidental activations fire the very
// behavior under test - scrolling the anchor row back into view, or
// auto-expanding a bookmark's collapsed ancestor folder (C.1e) - and quietly
// destroy the starting state before the tested step ever runs. Running setup
// in 'off' mode makes that structurally impossible rather than something each
// case has to dodge. Explicit sidebar switches (switchSpaceVerified) still
// work in 'off' mode: they call SpacesContext.switchToSpace directly and
// don't depend on tab activation.
// ---------------------------------------------------------------------------

import { FollowActiveTabMode } from '../../../utils/followActiveTab';
import { TestCase } from '../types';
import { createTestBookmark, createTestBookmarkInFolder, createTestPinnedSite, createTestSpace, createTestSubfolder, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { activateTabNative, closeTab, openBookmarkTab, openFillerBookmarksUntilScrollable, openFillerTabsUntilScrollable, openPinnedTab, openRegularTab, scrollRowOutOfView, setFollowActiveTabMode, switchSpaceVerified } from '../actions';
import { assertBookmarkRowExists, assertSidebarShowsSpace, assertTabRowVisible } from '../assertions';

const MODES: FollowActiveTabMode[] = ['off', 'space', 'space-and-scroll'];

// Same-space activation never switches the sidebar's space in any mode
// (background.ts's onActivated handler only switches when
// currentSpaceId !== destinationSpaceId), so this case's real signal is
// scroll-only: per useFollowActiveTab.ts, 'space-and-scroll' scrolls on
// EVERY activation even without a space switch, while 'off'/'space' don't
// (space mode only scrolls when the activation also switched the space,
// which never happens here).
function makeC1aCase(mode: FollowActiveTabMode): TestCase
{
  return {
    id: `C.1a (${mode})`,
    title: 'Activate another tab in the same space',
    setup: async (getCtx) =>
    {
      await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    },
    steps: [
      setFollowActiveTabMode('off'),
      ...switchSpaceVerified('spaceA'),
      openRegularTab({ url: testUrl('c1a-tab1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
      openFillerTabsUntilScrollable('spaceA'),
      openRegularTab({ url: testUrl('c1a-tab2'), spaceRef: 'spaceA', tabRef: 'tab2' }),
      activateTabNative('tab2'),
      scrollRowOutOfView('tab1'),
      assertSidebarShowsSpace('spaceA'),
      // Precondition: confirms the off-screen setup actually worked, so the
      // check below means something regardless of which way it comes out.
      assertTabRowVisible('tab1', false),

      // The actual step under test: native-activate tab1 from Chrome's tab strip.
      setFollowActiveTabMode(mode),
      activateTabNative('tab1'),
      assertSidebarShowsSpace('spaceA'),
      assertTabRowVisible('tab1', mode === 'space-and-scroll'),
    ],
  };
}

// This DOES also differ on the space-switch half: 'off' never switches;
// 'space'/'space-and-scroll' switch to the newly-activated tab's space.
// tabB is anchored off-screen while spaceB is still the displayed space (a
// row can only be measured and scrolled while its own space is showing),
// then we switch away. Switching back later doesn't need to preserve that
// scroll position: the precondition is checked once, before we ever leave.
function makeC1bCase(mode: FollowActiveTabMode): TestCase
{
  return {
    id: `C.1b (${mode})`,
    title: 'Activate a tab in a different space',
    setup: async (getCtx) =>
    {
      await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
      await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    },
    steps: [
      setFollowActiveTabMode('off'),
      ...switchSpaceVerified('spaceA'),
      openRegularTab({ url: testUrl('c1b-tabA'), spaceRef: 'spaceA', tabRef: 'tabA' }),
      ...switchSpaceVerified('spaceB'),
      openFillerTabsUntilScrollable('spaceB'),
      openRegularTab({ url: testUrl('c1b-tabB'), spaceRef: 'spaceB', tabRef: 'tabB' }),
      scrollRowOutOfView('tabB'),
      // Precondition: confirms tabB actually starts off-screen while we're
      // still looking at spaceB, before switching away and back.
      assertTabRowVisible('tabB', false),

      ...switchSpaceVerified('spaceA'),
      activateTabNative('tabA'),
      assertSidebarShowsSpace('spaceA'),

      // The actual step under test: native-activate spaceB's tab from Chrome's tab strip.
      setFollowActiveTabMode(mode),
      activateTabNative('tabB'),
      ...(mode === 'off'
        ? [assertSidebarShowsSpace('spaceA')]
        : [assertSidebarShowsSpace('spaceB'), assertTabRowVisible('tabB', true)]),
    ],
  };
}

// closeTab() fires the same chrome.tabs.onActivated Chrome does on its own
// when the active tab closes and another takes its place (no explicit
// activateTabNative needed for the tested step itself) - real regression
// target per the doc: closing a tab used to cause a spurious scroll even
// when nothing should. tab1 is a bookmark tab, to also exercise the
// data-bookmark-id routing path.
//
// Filler tabs are opened FIRST, keeping tab1 and tab2 strip-ADJACENT. That
// adjacency isn't cosmetic - it's required for correctness. Per the doc's
// own note on C.1d, Chrome prefers to keep activation inside the same tab
// group when closing a tab, if another tab in that group exists. An earlier
// version of this case put filler tabs BETWEEN tab1 and tab2 (all three
// sharing spaceA's group); closing tab2 then gave Chrome a whole pool of
// same-group siblings to fall back to instead of tab1 specifically, so
// nothing scrolled at all - confirmed by manually watching it run, not just
// a hunch. Keeping tab1 as tab2's nearest group-neighbor is what makes "tab1
// specifically" the one Chrome actually picks.
function makeC1cCase(mode: FollowActiveTabMode): TestCase
{
  return {
    id: `C.1c (${mode})`,
    title: 'Close the active tab, Chrome activates another tab in the same space',
    setup: async (getCtx) =>
    {
      await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
      await createTestBookmark(getCtx(), 'spaceA', 'C1c bookmark', testUrl('c1c-bookmark'), 'bm');
    },
    steps: [
      setFollowActiveTabMode('off'),
      ...switchSpaceVerified('spaceA'),
      openFillerTabsUntilScrollable('spaceA'),
      openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('c1c-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
      openRegularTab({ url: testUrl('c1c-tab2'), spaceRef: 'spaceA', tabRef: 'tab2' }),
      activateTabNative('tab2'),
      scrollRowOutOfView('tab1'),
      assertSidebarShowsSpace('spaceA'),
      // Precondition: confirms tab1's row actually starts off-screen.
      assertTabRowVisible('tab1', false),

      // The actual step under test: close tab2 - Chrome auto-activates tab1.
      setFollowActiveTabMode(mode),
      closeTab('tab2'),
      assertSidebarShowsSpace('spaceA'),
      assertTabRowVisible('tab1', mode === 'space-and-scroll'),
    ],
  };
}

// Doc's own note: Chrome prefers to keep activation inside the same group
// when closing a tab if a sibling exists, so tabB must be the ONLY tab in
// spaceB's group - otherwise Chrome activates a spaceB sibling instead of
// crossing into spaceA, and this case wouldn't exercise the cross-space
// path at all (setup never groups a second tab into spaceB, so this holds
// by construction). Unlike C.1a/b's "only space-and-scroll scrolls a
// same-space activation" case, this activation DOES switch space
// (spaceB -> spaceA), so per useFollowActiveTab.ts's shouldScroll formula
// (explicit || mode==='space-and-scroll' || (mode==='space' && spaceSwitched))
// BOTH 'space' and 'space-and-scroll' scroll here, not just the latter.
//
// Positional adjacency matters here too, same lesson as C.1c but with a
// twist confirmed by actually watching it run: tabB has no group-mate (by
// construction), but Chrome's cross-group fallback still isn't "return to
// whatever was active before" - it's positional. An earlier version created
// tabA, then filler tabs, THEN switched to spaceB and created tabB last -
// tabB's immediate strip-neighbor ended up being the last FILLER tab (not
// tabA), and Chrome activated that filler instead (confirmed via a
// temporary chrome.tabs.onActivated log: the activated tabId matched the
// filler's id, not tabA's). Fix: filler tabs first, then tabA, then tabB
// created LAST with nothing after it - tabA is tabB's only remaining
// neighbor in the whole window, not just within spaceA's group.
function makeC1dCase(mode: FollowActiveTabMode): TestCase
{
  return {
    id: `C.1d (${mode})`,
    title: 'Close the active tab, Chrome activates another tab in a different space',
    setup: async (getCtx) =>
    {
      await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
      await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    },
    steps: [
      setFollowActiveTabMode('off'),
      ...switchSpaceVerified('spaceA'),
      openFillerTabsUntilScrollable('spaceA'),
      openRegularTab({ url: testUrl('c1d-tabA'), spaceRef: 'spaceA', tabRef: 'tabA' }),
      activateTabNative('tabA'),
      scrollRowOutOfView('tabA'),
      assertSidebarShowsSpace('spaceA'),
      // Precondition: confirms tabA's row actually starts off-screen, so a
      // later "scrolled back into view" check means something.
      assertTabRowVisible('tabA', false),

      // tabB opens LAST, right after tabA, with nothing created after it -
      // see the note above on why that adjacency is load-bearing.
      ...switchSpaceVerified('spaceB'),
      openRegularTab({ url: testUrl('c1d-tabB'), spaceRef: 'spaceB', tabRef: 'tabB' }),
      activateTabNative('tabB'),

      // The actual step under test: close tabB - Chrome's MRU order
      // activates tabA, crossing back into spaceA.
      setFollowActiveTabMode(mode),
      closeTab('tabB'),
      ...(mode === 'off'
        ? [assertSidebarShowsSpace('spaceB')]
        : [assertSidebarShowsSpace('spaceA'), assertTabRowVisible('tabA', true)]),
    ],
  };
}

// A freshly-created subfolder has no saved expand state yet (BookmarkTree
// loads it per-space from chrome.storage.local, keyed by space id - see
// getExpandedStateKey), so it starts collapsed by default without needing
// an explicit "collapse" action - the precondition check below confirms
// that assumption rather than relying on it blindly. Like C.1b/d, this IS a
// real space-switch (spaceA -> spaceB), so per useFollowActiveTab.ts's
// shouldScroll formula both 'space' and 'space-and-scroll' expand+scroll,
// not just the latter.
//
// The 'off'-during-setup rule in this file's header matters most here:
// openBookmarkTab self-activates bmTab, and with the real mode already armed
// that activation would scroll toward the bookmark, dispatching
// REVEAL_BOOKMARK_EVENT (see scrollHelpers.ts) and auto-expanding the very
// folder this case needs to still be collapsed.
//
// Both 'space' and 'space-and-scroll' are expected to scroll here, so they
// assert the same thing - that's not an oversight. This activation crosses
// spaceA -> spaceB, so spaceSwitched is true and useFollowActiveTab's
// shouldScroll (explicit || 'space-and-scroll' || ('space' && spaceSwitched))
// is satisfied by both; the manual doc's own C.1e row says the same ("Same"
// under Space-and-scroll). C.1a is where the two modes actually diverge,
// because a same-space activation leaves spaceSwitched false.
//
// The filler bookmarks are what make the scroll assertion mean anything: a
// bookmark row renders near the TOP of BookmarkTree, so without something
// above it, it would be visible at scroll position 0 and "is it visible
// after activating" would pass even if scrolling were completely broken.
// This is specific to C.1e - C.1b/C.1d target a tab row at the BOTTOM of a
// long list, and C.1a/C.1c never switch space so their anchored scroll
// position survives to the tested step.
function makeC1eCase(mode: FollowActiveTabMode): TestCase
{
  return {
    id: `C.1e (${mode})`,
    title: 'Activate a bookmark tab in another space (collapsed folder auto-expands)',
    setup: async (getCtx) =>
    {
      await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
      await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
      await createTestSubfolder(getCtx(), 'spaceB', 'C1e subfolder', 'subfolder');
      await createTestBookmarkInFolder(getCtx(), 'subfolder', 'C1e bookmark', testUrl('c1e-bookmark'), 'bm');
    },
    steps: [
      setFollowActiveTabMode('off'),
      ...switchSpaceVerified('spaceB'),
      // Prepends, pushing the subfolder created in setup() below the fold.
      openFillerBookmarksUntilScrollable('spaceB'),
      openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('c1e-bookmark'), spaceRef: 'spaceB', tabRef: 'bmTab' }),
      // Precondition: confirms the subfolder starts collapsed while we're
      // still looking at spaceB, before switching away.
      assertBookmarkRowExists('bmTab', false),

      ...switchSpaceVerified('spaceA'),
      openRegularTab({ url: testUrl('c1e-tabA'), spaceRef: 'spaceA', tabRef: 'tabA' }),
      activateTabNative('tabA'),
      assertSidebarShowsSpace('spaceA'),

      // The actual step under test: native-activate spaceB's bookmark tab from Chrome's tab strip.
      setFollowActiveTabMode(mode),
      activateTabNative('bmTab'),
      ...(mode === 'off'
        ? [assertSidebarShowsSpace('spaceA')]
        : [assertSidebarShowsSpace('spaceB'), assertTabRowVisible('bmTab', true)]),
    ],
  };
}

// Doc's own expectation: NO switch in any mode, since pinned tabs are
// space-agnostic. Confirmed directly in background.ts's getSpaceForTab():
// `if (await isPinnedManagedTab(windowId, tabId)) return undefined;` -
// destinationSpaceId is always undefined for a pinned tab, so the
// space-switch gate never fires regardless of mode. No scroll assertion
// here (unlike C.1a-e): PinnedBar.tsx renders pinned-site rows with neither
// data-tab-id nor data-bookmark-id, and a pinned tab's live tab is excluded
// from TabList's own rows entirely (BookmarkTabsContext.getManagedTabIds()
// filters it out) - there's no scrollable DOM target for this case to check
// in the first place, and the doc itself never claims scroll behavior here.
function makeC1fCase(mode: FollowActiveTabMode): TestCase
{
  return {
    id: `C.1f (${mode})`,
    title: 'Activate a pinned-site tab from another space',
    setup: async (getCtx) =>
    {
      await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
      await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
      await createTestPinnedSite(getCtx, 'C1f pin', testUrl('c1f-pin'), 'pin');
    },
    steps: [
      setFollowActiveTabMode('off'),
      ...switchSpaceVerified('spaceA'),
      openPinnedTab({ pinRef: 'pin', url: testUrl('c1f-pin'), tabRef: 'pinTab' }),
      ...switchSpaceVerified('spaceB'),
      openRegularTab({ url: testUrl('c1f-tabB'), spaceRef: 'spaceB', tabRef: 'tabB' }),
      activateTabNative('tabB'),
      assertSidebarShowsSpace('spaceB'),

      // The actual step under test: native-activate the pinned tab from Chrome's tab strip.
      setFollowActiveTabMode(mode),
      activateTabNative('pinTab'),
      assertSidebarShowsSpace('spaceB'),
    ],
  };
}

export const SECTION_C_CASES: TestCase[] = [
  ...MODES.map(makeC1aCase),
  ...MODES.map(makeC1bCase),
  ...MODES.map(makeC1cCase),
  ...MODES.map(makeC1dCase),
  ...MODES.map(makeC1eCase),
  ...MODES.map(makeC1fCase),
];
