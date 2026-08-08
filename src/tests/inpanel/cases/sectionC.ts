// Section C - "Follow active tab" modes.
// docs/test/tab-space-association-test-cases.md#section-c---follow-active-tab-modes
//
// Starter slice: C.1a and C.1b only (the doc's own "at minimum" starred
// cases), each run once per FollowActiveTabMode - not all of Section C.
// Every other C.1/C.2 sub-case follows the same shape once this one's
// validated: setFollowActiveTabMode() + activateTabNative() cover the
// space-switch half; openFillerTabsUntilScrollable() + an explicit
// precondition check cover the scroll half for real (not just a smoke test -
// see assertTabRowVisible's caveat in assertions.ts about why an anchor row
// has to be genuinely pushed off-screen first).

import { FollowActiveTabMode } from '../../../utils/followActiveTab';
import { TestCase } from '../types';
import { createTestSpace, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { activateTabNative, openFillerTabsUntilScrollable, openRegularTab, scrollSidebarToBottom, setFollowActiveTabMode, switchSpaceVerified } from '../actions';
import { assertSidebarShowsSpace, assertTabRowVisible } from '../assertions';

const MODES: FollowActiveTabMode[] = ['off', 'space', 'space-and-scroll'];

// Same-space activation never switches the sidebar's space in any mode
// (background.ts's onActivated handler only switches when
// currentSpaceId !== destinationSpaceId), so this case's real signal is
// scroll-only: per useFollowActiveTab.ts, 'space-and-scroll' scrolls on
// EVERY activation even without a space switch, while 'off'/'space' don't
// (space mode only scrolls when the activation also switched the space,
// which never happens here). tab1 is opened first (renders at the top),
// then pushed off-screen by filler tabs + an explicit scroll-to-bottom -
// staying in spaceA the whole time means there's no space-switch remount to
// exploit for a "starts scrolled away" default, unlike C.1b below.
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
      setFollowActiveTabMode(mode),
      ...switchSpaceVerified('spaceA'),
      openRegularTab({ url: testUrl('c1a-tab1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
      openFillerTabsUntilScrollable('spaceA'),
      openRegularTab({ url: testUrl('c1a-tab2'), spaceRef: 'spaceA', tabRef: 'tab2' }),
      activateTabNative('tab2'),
      scrollSidebarToBottom(),
      assertSidebarShowsSpace('spaceA'),
      // Precondition: confirms the off-screen setup actually worked, so the
      // check below means something regardless of which way it comes out.
      assertTabRowVisible('tab1', false),

      // The actual step under test: native-activate tab1 from Chrome's tab strip.
      activateTabNative('tab1'),
      assertSidebarShowsSpace('spaceA'),
      assertTabRowVisible('tab1', mode === 'space-and-scroll'),
    ],
  };
}

// This DOES also differ on the space-switch half: 'off' never switches;
// 'space'/'space-and-scroll' switch to the newly-activated tab's space. For
// the scroll half, tabB is opened LAST (after filler tabs, so it renders at
// the bottom) while spaceB is still the displayed space - a fresh space's
// scroll container starts at the top by default, so tabB is off-screen
// without needing an explicit scroll step here (verified below, not
// assumed). Switching away and back later doesn't need to preserve that:
// the precondition is checked once, right after setup, before we ever leave.
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
      setFollowActiveTabMode(mode),
      ...switchSpaceVerified('spaceA'),
      openRegularTab({ url: testUrl('c1b-tabA'), spaceRef: 'spaceA', tabRef: 'tabA' }),
      ...switchSpaceVerified('spaceB'),
      openFillerTabsUntilScrollable('spaceB'),
      openRegularTab({ url: testUrl('c1b-tabB'), spaceRef: 'spaceB', tabRef: 'tabB' }),
      // Precondition: confirms tabB actually starts off-screen while we're
      // still looking at spaceB, before switching away and back.
      assertTabRowVisible('tabB', false),

      ...switchSpaceVerified('spaceA'),
      activateTabNative('tabA'),
      assertSidebarShowsSpace('spaceA'),

      // The actual step under test: native-activate spaceB's tab from Chrome's tab strip.
      activateTabNative('tabB'),
      ...(mode === 'off'
        ? [assertSidebarShowsSpace('spaceA')]
        : [assertSidebarShowsSpace('spaceB'), assertTabRowVisible('tabB', true)]),
    ],
  };
}

export const SECTION_C_CASES: TestCase[] = [
  ...MODES.map(makeC1aCase),
  ...MODES.map(makeC1bCase),
];
