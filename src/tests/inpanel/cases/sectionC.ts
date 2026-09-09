// Section C - "Follow active tab" modes.
// docs/test/tab-space-association-test-cases.md#section-c---follow-active-tab-modes
//
// Covers all of C.1 and C.2. C.1a-C.1f run once per FollowActiveTabMode
// (the mode is what they test); C.2a-C.2f run once under 'off' - see the
// C.2 block comment further down for why that's the stronger choice, not
// just the cheaper one.
//
// setFollowActiveTabMode() + activateTabNative() cover the space-switch
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
import { createTestBookmark, createTestBookmarkInFolder, createTestPinnedSite, createTestSpace, createTestSubfolder, TEST_AUDIO_URL, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { activateTabNative, audioQuickJump, closeTab, navigateTabHistory, openBookmarkTab, openFillerBookmarksUntilScrollable, openFillerTabsUntilScrollable, openPinnedTab, openRegularTab, pause, scrollRowOutOfView, selectAudioTabFromDropdown, selectTabFromHistoryDropdown, setFollowActiveTabMode, showActiveTab, switchSpaceVerified } from '../actions';
import { assertAudioListIncludes, assertBookmarkRowExists, assertCommandShortcutBound, assertSidebarShowsSpace, assertTabActive, assertTabAudible, assertTabRowVisible } from '../assertions';

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

// ---------------------------------------------------------------------------
// C.2 - explicit actions bypass the mode.
//
// These run ONCE, under 'off' - not once per mode like C.1, and the manual
// plan now says the same (see the doc's C.2 intro). That's a stronger test,
// not just a cheaper one. The mode reaches an explicit action through
// exactly one expression, useFollowActiveTab's
//
//   shouldScroll = explicit || mode === 'space-and-scroll'
//                           || (mode === 'space' && spaceSwitched)
//
// where explicit:true short-circuits the whole thing. The space switch never
// consults the mode at all - setActiveTabAndSpace (background.ts) doesn't
// read FOLLOW_ACTIVE_TAB_KEY. So 'off' is the ONLY mode in which the
// explicit flag is load-bearing: under 'space-and-scroll' the scroll happens
// regardless, so that run would still pass with explicit:true deleted
// outright, which is precisely the regression this group exists to catch.
//
// Consequence for the skeleton: no arm-the-mode-late dance here (see this
// file's header). 'off' is both the setup-safe mode and the mode under test,
// so one setFollowActiveTabMode('off') up front covers both jobs.
//
// Coverage note: each case ports its doc table's PRIMARY flow. The trailing
// "repeat steps 1-4, but ..." variant rows (C.2a's bookmark-in-a-collapsed-
// folder, C.2b/C.2d's same-space no-switch) are not ported - the
// explicit-action mechanism is identical, and the collapsed-folder path is
// already covered by C.1e.
// ---------------------------------------------------------------------------

export const C2A_SHOW_ACTIVE_TAB: TestCase = {
  id: 'C.2a',
  title: '"Show active tab" toolbar button',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('c2a-tabA'), spaceRef: 'spaceA', tabRef: 'tabA' }),
    activateTabNative('tabA'),

    ...switchSpaceVerified('spaceB'),
    openFillerTabsUntilScrollable('spaceB'),
    openRegularTab({ url: testUrl('c2a-tabB'), spaceRef: 'spaceB', tabRef: 'tabB' }),
    activateTabNative('tabB'),
    scrollRowOutOfView('tabB'),
    assertTabRowVisible('tabB', false),

    // Sidebar back on spaceA while the ACTIVE tab is still spaceB's tabB -
    // the divergence the button exists to resolve.
    ...switchSpaceVerified('spaceA'),
    assertSidebarShowsSpace('spaceA'),

    // The actual step under test.
    showActiveTab(),
    assertSidebarShowsSpace('spaceB'),
    assertTabRowVisible('tabB', true),
  ],
};

// Both spaces get filler tabs so the target row is off-screen on arrival in
// EITHER direction - without that, the 'next' leg's row would be the only
// thing in its space and visible no matter what, making that half of the
// case pass whether or not scrolling works.
export const C2B_HISTORY_TOOLBAR_BUTTONS: TestCase = {
  id: 'C.2b',
  title: 'Tab history Previous/Next toolbar buttons',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openFillerTabsUntilScrollable('spaceA'),
    openRegularTab({ url: testUrl('c2b-tab1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    activateTabNative('tab1'),
    scrollRowOutOfView('tab1'),
    assertTabRowVisible('tab1', false),

    ...switchSpaceVerified('spaceB'),
    openFillerTabsUntilScrollable('spaceB'),
    openRegularTab({ url: testUrl('c2b-tab2'), spaceRef: 'spaceB', tabRef: 'tab2' }),
    activateTabNative('tab2'),
    scrollRowOutOfView('tab2'),
    assertTabRowVisible('tab2', false),

    // The actual steps under test: back to tab1, then forward to tab2.
    navigateTabHistory('prev'),
    assertSidebarShowsSpace('spaceA'),
    assertTabRowVisible('tab1', true),

    navigateTabHistory('next'),
    assertSidebarShowsSpace('spaceB'),
    assertTabRowVisible('tab2', true),
  ],
};

// Same flow as C.2b, driven by the real keyboard shortcuts. The one manual
// case in Section C, and deliberately just ONE case rather than one per mode:
// what it adds over C.2b is entirely about the shortcut itself, which has
// nothing to do with the follow mode.
//
// Why not simply send prev-used-tab/next-used-tab like C.2b does: both
// entry points converge on historyManager.navigate() one line in, so a
// message-driven version would re-run C.2b exactly while claiming to test
// the keybinding. It would keep passing with the command renamed or dropped
// from public/manifest.json, its shortcut unbound or lost to a conflict, or
// the chrome.commands.onCommand listener deleted. The two
// assertCommandShortcutBound steps below catch the first two of those
// automatically; only a real keypress covers the third.
//
// Two pauses rather than one that presses both keys: back-then-forward
// returns to the starting tab, so a single pause couldn't tell "both worked"
// from "neither did".
//
// Unlike every other pause in this suite, these do NOT ask you to close the
// panel - chrome.commands fires globally, so the shortcut works with the
// sidebar open and the run resumes on the button alone.
export const C2C_HISTORY_SHORTCUTS: TestCase = {
  id: 'C.2c',
  title: 'History keyboard shortcuts (Previous/Next Used Tab)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    assertCommandShortcutBound('prev-used-tab'),
    assertCommandShortcutBound('next-used-tab'),

    ...switchSpaceVerified('spaceA'),
    openFillerTabsUntilScrollable('spaceA'),
    openRegularTab({ url: testUrl('c2c-tab1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    activateTabNative('tab1'),
    scrollRowOutOfView('tab1'),
    assertTabRowVisible('tab1', false),

    ...switchSpaceVerified('spaceB'),
    openFillerTabsUntilScrollable('spaceB'),
    openRegularTab({ url: testUrl('c2c-tab2'), spaceRef: 'spaceB', tabRef: 'tab2' }),
    activateTabNative('tab2'),
    scrollRowOutOfView('tab2'),
    assertTabRowVisible('tab2', false),

    pause(
      'Manual step: press the history BACK shortcut',
      [
        'Press the "Previous Used Tab" shortcut (default Cmd+Shift+Comma - check chrome://extensions/shortcuts if unsure).',
        'Leave the sidebar panel open.',
        'Click Resume below.',
      ]
    ),
    assertSidebarShowsSpace('spaceA'),
    assertTabRowVisible('tab1', true),

    pause(
      'Manual step: press the history FORWARD shortcut',
      [
        'Press the "Next Used Tab" shortcut (default Cmd+Shift+Period).',
        'Leave the sidebar panel open.',
        'Click Resume below.',
      ]
    ),
    assertSidebarShowsSpace('spaceB'),
    assertTabRowVisible('tab2', true),
  ],
};

// Three activations, so the target (tab2) sits a couple of entries back
// rather than being reachable by a single "Previous" - that's what separates
// this from C.2b and makes it exercise navigateToIndex rather than navigate.
//
// Title deliberately doesn't say "press-and-hold" - this case never performs
// that gesture. It sends the same two messages the dropdown ends up sending
// (get-tab-history, then navigate-to-history-index) and so covers the
// background half only. Everything on the Toolbar.tsx side is skipped: the
// 300ms hold timer, the quick-click-vs-hold branch in handleHistoryMouseUp,
// the dropdown rendering, and the entry click wiring - this case passes with
// all of that broken. Testing the gesture itself needs DOM-level mousedown /
// wait / click against the real toolbar, which nothing in this suite does yet.
export const C2D_HISTORY_DROPDOWN: TestCase = {
  id: 'C.2d',
  title: 'Jump to a specific tab-history entry (dropdown navigate-to-index path)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('c2d-tab1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    activateTabNative('tab1'),

    ...switchSpaceVerified('spaceB'),
    openFillerTabsUntilScrollable('spaceB'),
    openRegularTab({ url: testUrl('c2d-tab2'), spaceRef: 'spaceB', tabRef: 'tab2' }),
    activateTabNative('tab2'),
    scrollRowOutOfView('tab2'),
    assertTabRowVisible('tab2', false),

    // tab3 pushes tab2 further back in the history stack.
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('c2d-tab3'), spaceRef: 'spaceA', tabRef: 'tab3' }),
    activateTabNative('tab3'),
    assertSidebarShowsSpace('spaceA'),

    // The actual step under test: jump straight to tab2's entry.
    selectTabFromHistoryDropdown('tab2'),
    assertSidebarShowsSpace('spaceB'),
    assertTabRowVisible('tab2', true),
  ],
};

// The audio pair needs a genuinely audible tab, and only real playback sets
// chrome.tabs' `audible` flag - autoplay is blocked without a user gesture,
// and muted playback doesn't count. So both cases open TEST_AUDIO_URL (see
// fixtures.ts) and pause for you to press play. assertTabAudible right after
// the pause is what keeps that honest: skip the play click and the case fails
// there, at the cause, instead of drifting on and possibly locking onto some
// unrelated audible tab elsewhere in the browser.
export const C2E_AUDIO_QUICK_JUMP: TestCase = {
  id: 'C.2e',
  title: 'Audio quick-jump (single click on audio button)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceB'),
    openFillerTabsUntilScrollable('spaceB'),
    openRegularTab({ url: TEST_AUDIO_URL, spaceRef: 'spaceB', tabRef: 'audioTab' }),

    pause(
      'Manual step: start audio playback',
      [
        'Switch to the newly opened YouTube tab in Chrome.',
        'Press play and leave it playing (unmuted - a muted tab does not count as audible).',
        'Come back to the sidebar and click Resume below.',
      ]
    ),
    assertTabAudible('audioTab', true),
    scrollRowOutOfView('audioTab'),
    assertTabRowVisible('audioTab', false),

    ...switchSpaceVerified('spaceA'),
    assertSidebarShowsSpace('spaceA'),

    // The actual step under test.
    audioQuickJump(),
    assertTabActive('audioTab'),
    assertSidebarShowsSpace('spaceB'),
    assertTabRowVisible('audioTab', true),
  ],
};

// Two audible tabs, so the dropdown has a real choice to make. The target is
// deliberately the one in spaceA, opened FIRST and so the older of the two -
// audioQuickJump (C.2e) always takes playingTabIds[0], the most recent, so
// picking the older entry is exactly what separates this case from that one.
export const C2F_AUDIO_DROPDOWN: TestCase = {
  id: 'C.2f',
  title: 'Select a tab from the audio tabs dropdown list',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openFillerTabsUntilScrollable('spaceA'),
    openRegularTab({ url: TEST_AUDIO_URL, spaceRef: 'spaceA', tabRef: 'audioTabA' }),

    ...switchSpaceVerified('spaceB'),
    openRegularTab({ url: TEST_AUDIO_URL, spaceRef: 'spaceB', tabRef: 'audioTabB' }),

    pause(
      'Manual step: start playback on BOTH audio tabs',
      [
        'Two YouTube tabs were opened. Press play on both, leaving both unmuted.',
        `Play the ${TEST_SPACE_WORK_NAME} one FIRST, then the ${TEST_SPACE_VIDEO_NAME} one - the ${TEST_SPACE_VIDEO_NAME} tab must be the more recent, so selecting the ${TEST_SPACE_WORK_NAME} entry is a real choice rather than the default.`,
        'Come back to the sidebar and click Resume below.',
      ]
    ),
    assertTabAudible('audioTabA', true),
    assertTabAudible('audioTabB', true),
    // Both must be listed, otherwise "pick a specific entry" is a one-item menu.
    assertAudioListIncludes(['audioTabA', 'audioTabB']),

    ...switchSpaceVerified('spaceA'),
    scrollRowOutOfView('audioTabA'),
    assertTabRowVisible('audioTabA', false),
    ...switchSpaceVerified('spaceB'),
    assertSidebarShowsSpace('spaceB'),

    // The actual step under test: pick spaceA's (older) entry, not the newest.
    selectAudioTabFromDropdown('audioTabA'),
    assertTabActive('audioTabA'),
    assertSidebarShowsSpace('spaceA'),
    assertTabRowVisible('audioTabA', true),
  ],
};

export const SECTION_C_CASES: TestCase[] = [
  ...MODES.map(makeC1aCase),
  ...MODES.map(makeC1bCase),
  ...MODES.map(makeC1cCase),
  ...MODES.map(makeC1dCase),
  ...MODES.map(makeC1eCase),
  ...MODES.map(makeC1fCase),
  C2A_SHOW_ACTIVE_TAB,
  C2B_HISTORY_TOOLBAR_BUTTONS,
  C2C_HISTORY_SHORTCUTS,
  C2D_HISTORY_DROPDOWN,
  C2E_AUDIO_QUICK_JUMP,
  C2F_AUDIO_DROPDOWN,
];
