// Section A - Tab moved between spaces.
// docs/test/tab-space-association-test-cases.md#section-a---tab-moved-between-spaces

import { TestCase } from '../types';
import { createTestBookmark, createTestPinnedSite, createTestSpace, createTestSubfolder, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import {
  bookmarkExistingTab,
  moveBookmarkSidebar,
  moveBookmarkToFolder,
  moveTabNative,
  moveTabSidebar,
  moveTabToNewWindow,
  openBookmarkTab,
  openPinnedTab,
  openRegularTab,
  pause,
  switchSpaceVerified,
  ungroupTab,
} from '../actions';
import {
  assertBookmarkLoaded,
  assertPinnedLoaded,
  assertTabExists,
  assertTabInOtherWindow,
  assertTabInSpace,
  assertTabUngrouped,
} from '../assertions';

export const A1_REGULAR_TAB_MOVED: TestCase = {
  id: 'A.1',
  title: 'Regular tab moved to another space',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a1-native'), spaceRef: 'spaceA', tabRef: 'nativeTab' }),
    assertTabInSpace('nativeTab', 'spaceA'),
    moveTabNative({ tabRef: 'nativeTab', targetSpaceRef: 'spaceB' }),
    ...switchSpaceVerified('spaceB'),
    assertTabInSpace('nativeTab', 'spaceB'),

    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a1-sidebar'), spaceRef: 'spaceA', tabRef: 'sidebarTab' }),
    assertTabInSpace('sidebarTab', 'spaceA'),
    moveTabSidebar({ tabRef: 'sidebarTab', targetSpaceRef: 'spaceB' }),
    ...switchSpaceVerified('spaceB'),
    assertTabInSpace('sidebarTab', 'spaceB'),

    // Doc steps 5-7: repeat the native move with the panel closed - doc
    // states a firm expectation here ("same result as sidebar-open case"),
    // unlike most of this case's siblings which hit an open doc question.
    // Only the native method applies while closed (the sidebar method needs
    // an open panel to invoke at all). Both groups may have emptied out and
    // disappeared after the moves above, so open fresh dummy tabs in each -
    // same "can't drag a group's lone tab" reasoning as A.3/A.4.
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a1-dummy-work'), spaceRef: 'spaceA', tabRef: 'dummyWorkTab' }),
    openRegularTab({ url: testUrl('a1-dummy-video'), spaceRef: 'spaceB', tabRef: 'dummyVideoTab' }),
    openRegularTab({ url: testUrl('a1-closed'), spaceRef: 'spaceA', tabRef: 'closedTab' }),
    assertTabInSpace('closedTab', 'spaceA'),
    pause(
      'Manual step: move the regular tab natively while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, drag the tab for "${testUrl('a1-closed')}" into the "${TEST_SPACE_VIDEO_NAME}" group (there's a dummy tab there already).`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertTabInSpace('closedTab', 'spaceB'),
  ],
};

export const A2_BOOKMARK_TAB_MOVED_SIDEBAR_OPEN: TestCase = {
  id: 'A.2',
  title: "Bookmark tab moved to a different space's group, sidebar open",
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'A2 native bm', testUrl('a2-native'), 'bmNative');
    await createTestBookmark(getCtx(), 'spaceA', 'A2 sidebar bm', testUrl('a2-sidebar'), 'bmSidebar');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bmNative', url: testUrl('a2-native'), spaceRef: 'spaceA', tabRef: 'nativeTab' }),
    assertBookmarkLoaded('bmNative', true),
    moveTabNative({ tabRef: 'nativeTab', targetSpaceRef: 'spaceB' }),
    assertBookmarkLoaded('bmNative', false),
    // Doc step 3's other half: the now-regular tab should actually show up
    // in Space B's Chrome group, not just have lost its bookmark.
    assertTabInSpace('nativeTab', 'spaceB'),
    ...switchSpaceVerified('spaceB'),
    assertBookmarkLoaded('bmNative', false),
    ...switchSpaceVerified('spaceA'),
    assertBookmarkLoaded('bmNative', false),

    openBookmarkTab({ bookmarkRef: 'bmSidebar', url: testUrl('a2-sidebar'), spaceRef: 'spaceA', tabRef: 'sidebarTab' }),
    assertBookmarkLoaded('bmSidebar', true),
    moveTabSidebar({ tabRef: 'sidebarTab', targetSpaceRef: 'spaceB' }),
    assertBookmarkLoaded('bmSidebar', false),
    assertTabInSpace('sidebarTab', 'spaceB'),
    ...switchSpaceVerified('spaceB'),
    assertBookmarkLoaded('bmSidebar', false),
    ...switchSpaceVerified('spaceA'),
    assertBookmarkLoaded('bmSidebar', false),
  ],
};

export const A3_BOOKMARK_MOVED_SIDEBAR_CLOSED: TestCase = {
  id: 'A.3',
  title: "Bookmark tab moved to a different space's group, sidebar CLOSED (known gap G2)",
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'A3 bookmark', testUrl('a3-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Chrome won't let you drag/re-group a tab that's the only member of its
    // group (the group would have to vanish mid-drag) - open a throwaway
    // tab in Space A first so the bookmark tab has company in "Work" and is
    // actually draggable during the manual step below.
    openRegularTab({ url: testUrl('a3-dummy-work'), spaceRef: 'spaceA', tabRef: 'dummyWorkTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('a3-bookmark'), spaceRef: 'spaceA', tabRef: 'tab' }),
    assertBookmarkLoaded('bm', true),
    // Same reasoning on the destination side: a brand-new space has no
    // Chrome tab group yet (one's only created the first time a tab actually
    // lands in it) - open a throwaway tab in Space B so the "Video" group
    // exists for the manual step below to drag the bookmark tab into.
    openRegularTab({ url: testUrl('a3-dummy-video'), spaceRef: 'spaceB', tabRef: 'dummyVideoTab' }),
    pause(
      'Manual step: move the bookmark tab natively while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, find the tab for "${testUrl('a3-bookmark')}".`,
        `Drag it (or right-click → Add tab to group) into the "${TEST_SPACE_VIDEO_NAME}" group - there's already a dummy tab sitting in it.`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    // Correct behavior: moving the tab out should deassociate the bookmark,
    // same as A.2 - regardless of whether the panel was open to see it
    // happen. This is currently expected to FAIL per known gap G2 (the
    // association fix relies on a live message to the sidebar, which isn't
    // there to receive it while closed) - a red X here is correct until G2
    // is fixed, not a sign the test itself is broken.
    assertBookmarkLoaded('bm', false),
    // This one's a normal correctness check, not part of the known gap - it
    // confirms the manual drag in the pause step actually landed the tab in
    // Space B's Chrome group (independent of whether the bookmark noticed).
    assertTabInSpace('tab', 'spaceB'),
  ],
};

export const A4_PINNED_TAB_MOVED: TestCase = {
  id: 'A.4',
  title: "Pinned tab moved to a different space's group",
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestPinnedSite(getCtx, 'A4 pin', testUrl('a4-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Dummy tabs in both groups so the manual step below (moving the pin's
    // *current* group's sole member into the *other* group) doesn't hit
    // Chrome's "can't drag the last tab of a group into another group"
    // restriction - same issue A.3 hit.
    openRegularTab({ url: testUrl('a4-dummy-work'), spaceRef: 'spaceA', tabRef: 'dummyWork' }),
    openRegularTab({ url: testUrl('a4-dummy-video'), spaceRef: 'spaceB', tabRef: 'dummyVideo' }),
    openPinnedTab({ pinRef: 'pin', url: testUrl('a4-pin'), tabRef: 'pinTab' }),
    assertPinnedLoaded('pin', true),
    assertTabUngrouped('pinTab'), // pinned tabs open ungrouped by default, same as A.5c
    // Deliberately group it now (doc step 2) - the whole point of this case
    // is confirming a pin's association survives being grouped, unlike a
    // bookmark tab's move in A.2. Pinned sites are never registered in
    // tabSpaceRegistry, so no deassociation should fire.
    moveTabNative({ tabRef: 'pinTab', targetSpaceRef: 'spaceA' }),
    assertPinnedLoaded('pin', true),
    assertTabExists('pinTab', true),

    pause(
      'Manual step: move the pinned tab natively while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, drag the tab for "${testUrl('a4-pin')}" into the "${TEST_SPACE_VIDEO_NAME}" group (there's a dummy tab there already).`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertPinnedLoaded('pin', true),
    assertTabExists('pinTab', true),
    // Without this, the two assertions above would also pass if the manual
    // drag was skipped entirely - they only re-check state that was already
    // true before the pause. This is the one assertion that actually
    // depends on the drag having happened.
    assertTabInSpace('pinTab', 'spaceB'),
  ],
};

export const A5_BOOKMARK_TAB_UNGROUP: TestCase = {
  id: 'A.5',
  title: 'Bookmark tab: native "Remove from group" / ungroup (known gap G3)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'A5 open bm', testUrl('a5-open'), 'bmOpen');
    await createTestBookmark(getCtx(), 'spaceA', 'A5 closed bm', testUrl('a5-closed'), 'bmClosed');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps spaceA's group non-empty for the rest of the case, same reason
    // as A.5c's dummyTab: tabOpen ungroups itself right below (leaving the
    // group empty and gone if it was the only member), then tabClosed opens
    // into a fresh group as its sole member - without this, the manual
    // "Remove from group" pause below would be asked to ungroup a tab that
    // IS its group's only member, which may hit the same Chrome UI
    // restriction discovered for lone-tab drags in A.3.
    openRegularTab({ url: testUrl('a5-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bmOpen', url: testUrl('a5-open'), spaceRef: 'spaceA', tabRef: 'tabOpen' }),
    assertBookmarkLoaded('bmOpen', true),
    ungroupTab('tabOpen'),
    assertTabUngrouped('tabOpen'),
    // Correct behavior: ungrouping should deassociate the bookmark the same
    // way a cross-space move does in A.2. Currently expected to FAIL per
    // known gap G3 - the detection only fires on a move to ANOTHER group,
    // not on leaving the group entirely - so a red X here is correct until
    // G3 is fixed. (Doc step 4/7's "does activating the tab force-switch the
    // sidebar back" is left unasserted - it's an open question in the doc
    // itself, not a stated requirement.)
    assertBookmarkLoaded('bmOpen', false),

    openBookmarkTab({ bookmarkRef: 'bmClosed', url: testUrl('a5-closed'), spaceRef: 'spaceA', tabRef: 'tabClosed' }),
    assertBookmarkLoaded('bmClosed', true),
    pause(
      'Manual step: ungroup the bookmark tab while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, right-click the tab for "${testUrl('a5-closed')}" → Remove from group.`,
        'If that option is greyed out, dragging the tab out of the group strip has the same effect.',
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertTabUngrouped('tabClosed'),
    // Same G3 gap as the panel-open half above - expected to currently FAIL.
    assertBookmarkLoaded('bmClosed', false),
  ],
};

export const A5B_REGULAR_TAB_UNGROUP: TestCase = {
  id: 'A.5b',
  title: 'Regular tab: native "Remove from group" / ungroup',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Same reasoning as A.5's dummyTab - keeps spaceA's group non-empty so
    // tabClosed isn't its group's sole member when the manual "Remove from
    // group" pause below asks you to ungroup it.
    openRegularTab({ url: testUrl('a5b-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openRegularTab({ url: testUrl('a5b-open'), spaceRef: 'spaceA', tabRef: 'tabOpen' }),
    assertTabInSpace('tabOpen', 'spaceA'),
    ungroupTab('tabOpen'),
    assertTabUngrouped('tabOpen'),

    openRegularTab({ url: testUrl('a5b-closed'), spaceRef: 'spaceA', tabRef: 'tabClosed' }),
    assertTabInSpace('tabClosed', 'spaceA'),
    pause(
      'Manual step: ungroup the regular tab while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, right-click the tab for "${testUrl('a5b-closed')}" → Remove from group.`,
        'If that option is greyed out, dragging the tab out of the group strip has the same effect.',
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertTabUngrouped('tabClosed'),
  ],
};

export const A5C_PINNED_TAB_UNGROUP: TestCase = {
  id: 'A.5c',
  title: 'Pinned tab: native "Remove from group" / ungroup',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestPinnedSite(getCtx, 'A5c open pin', testUrl('a5c-open'), 'pinOpen');
    await createTestPinnedSite(getCtx, 'A5c closed pin', testUrl('a5c-closed'), 'pinClosed');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps the "Work" group non-empty throughout, so it never disappears
    // and gets silently recreated between the two pinned tabs joining it.
    openRegularTab({ url: testUrl('a5c-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),

    openPinnedTab({ pinRef: 'pinOpen', url: testUrl('a5c-open'), tabRef: 'tabOpen' }),
    assertPinnedLoaded('pinOpen', true),
    assertTabUngrouped('tabOpen'), // pinned tabs open ungrouped by default
    moveTabNative({ tabRef: 'tabOpen', targetSpaceRef: 'spaceA' }),
    assertPinnedLoaded('pinOpen', true),
    ungroupTab('tabOpen'),
    assertPinnedLoaded('pinOpen', true), // keeps tracking regardless of group

    openPinnedTab({ pinRef: 'pinClosed', url: testUrl('a5c-closed'), tabRef: 'tabClosed' }),
    moveTabNative({ tabRef: 'tabClosed', targetSpaceRef: 'spaceA' }),
    pause(
      'Manual step: ungroup the pinned tab while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, right-click the tab for "${testUrl('a5c-closed')}" → Remove from group.`,
        'If that option is greyed out, dragging the tab out of the group strip has the same effect.',
        'Reopen the sidebar panel to resume.',
      ]
    ),
    // Without this, "still loaded" was already true before the pause and
    // would pass even if the manual ungroup was skipped entirely - this is
    // the one assertion that actually depends on it having happened.
    assertTabUngrouped('tabClosed'),
    assertPinnedLoaded('pinClosed', true),
  ],
};

export const A6_BOOKMARK_TAB_MOVED_TO_WINDOW: TestCase = {
  id: 'A.6',
  title: 'Tab moved to a different window',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'A6 open bm', testUrl('a6-open'), 'bmOpen');
    await createTestBookmark(getCtx(), 'spaceA', 'A6 closed bm', testUrl('a6-closed'), 'bmClosed');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bmOpen', url: testUrl('a6-open'), spaceRef: 'spaceA', tabRef: 'tabOpen' }),
    assertBookmarkLoaded('bmOpen', true),
    moveTabToNewWindow({ tabRef: 'tabOpen' }),
    // chrome.tabs.onRemoved (a plain close) triggers the exact same
    // deassociation as onDetached - without this, a tab that got closed
    // instead of actually detached to a new window would produce the same
    // "not loaded" result below, reporting a false pass for window-detach
    // behavior that was never exercised.
    assertTabInOtherWindow('tabOpen'),
    // Confirmed against source (BookmarkTabsContext's chrome.tabs.onDetached
    // listener, generic across item types) rather than assumed: detaching to
    // another window does deassociate today, so this should PASS.
    assertBookmarkLoaded('bmOpen', false),

    openBookmarkTab({ bookmarkRef: 'bmClosed', url: testUrl('a6-closed'), spaceRef: 'spaceA', tabRef: 'tabClosed' }),
    assertBookmarkLoaded('bmClosed', true),
    pause(
      'Manual step: drag the bookmark tab into a new window while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, drag the tab for "${testUrl('a6-closed')}" out of the window entirely (e.g. down onto the desktop) to pop it into its own new window.`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    // Doc step 6 only asks to "confirm whether closing the sidebar changes
    // this vs. step 3" - an open question, not a stated requirement. Correct
    // behavior is still deassociation regardless of panel state, same as
    // step 3 above, so asserting `false` here is the right target either
    // way. Worth noting though: the chrome.tabs.onDetached listener that
    // makes step 3 pass only exists in BookmarkTabsContext (the panel's own
    // context, not background.ts), and rebuildAssociations() on reopen
    // doesn't check a restored tab's current windowId - so this may well
    // currently fail, an apparently-undocumented gap in the same family as
    // G2, not a sign the test is wrong.
    //
    // Same onRemoved-vs-onDetached ambiguity as above applies here too -
    // check the tab actually landed in a different window before trusting
    // the association result, since a plain close produces the identical
    // "not loaded" signal.
    assertTabInOtherWindow('tabClosed'),
    assertBookmarkLoaded('bmClosed', false),
    // Doc step 4/6's "check the new window's own sidebar" isn't asserted -
    // this panel only has visibility into the ORIGINATING window's state.
  ],
};

export const A6B_REGULAR_TAB_MOVED_TO_WINDOW: TestCase = {
  id: 'A.6b',
  title: 'Regular tab moved to a different window',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a6b-open'), spaceRef: 'spaceA', tabRef: 'tabOpen' }),
    assertTabInSpace('tabOpen', 'spaceA'),
    moveTabToNewWindow({ tabRef: 'tabOpen' }),
    assertTabInOtherWindow('tabOpen'),

    openRegularTab({ url: testUrl('a6b-closed'), spaceRef: 'spaceA', tabRef: 'tabClosed' }),
    pause(
      'Manual step: drag the regular tab into a new window while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, drag the tab for "${testUrl('a6b-closed')}" out of the window entirely to pop it into its own new window.`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertTabInOtherWindow('tabClosed'),
  ],
};

export const A6C_PINNED_TAB_MOVED_TO_WINDOW: TestCase = {
  id: 'A.6c',
  title: 'Pinned tab moved to a different window',
  setup: async (getCtx) =>
  {
    await createTestPinnedSite(getCtx, 'A6c open pin', testUrl('a6c-open'), 'pinOpen');
    await createTestPinnedSite(getCtx, 'A6c closed pin', testUrl('a6c-closed'), 'pinClosed');
  },
  steps: [
    openPinnedTab({ pinRef: 'pinOpen', url: testUrl('a6c-open'), tabRef: 'tabOpen' }),
    assertPinnedLoaded('pinOpen', true),
    moveTabToNewWindow({ tabRef: 'tabOpen' }),
    // Same onRemoved-vs-onDetached ambiguity as A.6 - a plain close produces
    // the identical "not loaded" result, so confirm the tab actually landed
    // in a different window before trusting the association check below.
    assertTabInOtherWindow('tabOpen'),
    // Same onDetached listener as A.6 - generic across bookmark/pinned keys,
    // so this deassociates too, resolving the doc's "check whether" as a
    // firm expectation.
    assertPinnedLoaded('pinOpen', false),

    openPinnedTab({ pinRef: 'pinClosed', url: testUrl('a6c-closed'), tabRef: 'tabClosed' }),
    pause(
      'Manual step: drag the pinned tab into a new window while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, drag the tab for "${testUrl('a6c-closed')}" out of the window entirely to pop it into its own new window.`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    // Same reasoning as A.6's closed-panel block: correct behavior is still
    // deassociation, but the onDetached listener that makes the open-panel
    // half above pass only lives in the panel's own context and reopen's
    // rebuildAssociations() doesn't re-check windowId - this may currently
    // fail as an apparently-undocumented gap, resolving the doc's "check
    // whether sidebar-closed changes the outcome" either way.
    assertTabInOtherWindow('tabClosed'),
    assertPinnedLoaded('pinClosed', false),
  ],
};

export const A7_BOOKMARKED_VIA_DRAG_THEN_MOVED: TestCase = {
  id: 'A.7',
  title: 'Regular tab bookmarked via drag-into-tree, then moved to another space',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a7-native'), spaceRef: 'spaceA', tabRef: 'nativeTab' }),
    bookmarkExistingTab({ tabRef: 'nativeTab', spaceRef: 'spaceA', title: 'A7 native bm', url: testUrl('a7-native'), bookmarkRef: 'bmNative' }),
    assertBookmarkLoaded('bmNative', true),
    moveTabNative({ tabRef: 'nativeTab', targetSpaceRef: 'spaceB' }),
    // Doc flags this path as uncertain (bookmarking-in-place via
    // associateExistingTab was flagged as possibly not registering a space
    // with tabSpaceRegistry at creation time, unlike openBookmarkTab).
    // Asserting the same correct behavior as A.2 anyway - a fail here means
    // this creation path needs the same fix, not that the test is wrong.
    assertBookmarkLoaded('bmNative', false),

    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a7-sidebar'), spaceRef: 'spaceA', tabRef: 'sidebarTab' }),
    bookmarkExistingTab({ tabRef: 'sidebarTab', spaceRef: 'spaceA', title: 'A7 sidebar bm', url: testUrl('a7-sidebar'), bookmarkRef: 'bmSidebar' }),
    assertBookmarkLoaded('bmSidebar', true),
    // Doc says moving the BOOKMARK (not the tab) to Space B was previously
    // broken (tab didn't follow) but is now fixed - should PASS.
    moveBookmarkSidebar({ bookmarkRef: 'bmSidebar', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('sidebarTab', 'spaceB'),
    // Doc steps 5-6 (repeat the native-move half with the panel closed) are
    // not ported - the doc itself only asks to "confirm whether closing the
    // sidebar changes the outcome" vs. step 3, with no stated expectation
    // either way, so there's no correct-behavior assertion to write yet.
  ],
};

export const A7B_MOVE_VIA_FOLDER_PICKER: TestCase = {
  id: 'A.7b',
  title: 'Bookmarked tab moved via generic "Move Bookmark to..." folder picker',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestSubfolder(getCtx(), 'spaceB', 'Nested', 'subfolder');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a7b'), spaceRef: 'spaceA', tabRef: 'tab' }),
    bookmarkExistingTab({ tabRef: 'tab', spaceRef: 'spaceA', title: 'A7b bm', url: testUrl('a7b'), bookmarkRef: 'bm' }),
    assertBookmarkLoaded('bm', true),
    // Targets a folder NESTED inside Space B's own folder (not Space B's
    // folder directly) - exercises the generic "Move to..." picker path
    // distinctly from A.2/A.7's "Move to Space" shortcut.
    moveBookmarkToFolder({ bookmarkRef: 'bm', targetFolderRef: 'subfolder' }),
    assertTabInSpace('tab', 'spaceB'),
    ...switchSpaceVerified('spaceB'),
    assertBookmarkLoaded('bm', true),
  ],
};

export const A7C_MULTI_SELECT_MOVE: TestCase = {
  id: 'A.7c',
  // Title deliberately doesn't say "via multi-select" - see the comment
  // below on what this case does and doesn't actually reach.
  title: 'Two bookmarked tabs each individually moved to the same space',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('a7c-1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    bookmarkExistingTab({ tabRef: 'tab1', spaceRef: 'spaceA', title: 'A7c bm1', url: testUrl('a7c-1'), bookmarkRef: 'bm1' }),
    openRegularTab({ url: testUrl('a7c-2'), spaceRef: 'spaceA', tabRef: 'tab2' }),
    bookmarkExistingTab({ tabRef: 'tab2', spaceRef: 'spaceA', title: 'A7c bm2', url: testUrl('a7c-2'), bookmarkRef: 'bm2' }),
    assertBookmarkLoaded('bm1', true),
    assertBookmarkLoaded('bm2', true),
    // NOT a test of doc A.7c's actual multi-select "Move to...": the real
    // handler is BookmarkTree.tsx's handleMoveSelectedBookmarksToFolder,
    // which reads the SelectionContext selection, filters out any item that
    // isDescendant() of another selected folder (so a folder's children
    // aren't moved twice), and only calls regroupAssociatedTab for
    // item.type === 'bookmark' (folders don't get regrouped). None of that
    // is reachable from here - there's no in-panel equivalent to a
    // SelectionContext selection, so this just calls the single-bookmark
    // move path twice. It proves the underlying move+regroup step is safe
    // to run repeatedly, nothing about the real multi-select handler's own
    // selection/filtering logic - a bug in that filtering (e.g. the
    // descendant check) would not be caught here.
    moveBookmarkSidebar({ bookmarkRef: 'bm1', targetSpaceRef: 'spaceB' }),
    moveBookmarkSidebar({ bookmarkRef: 'bm2', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('tab1', 'spaceB'),
    assertTabInSpace('tab2', 'spaceB'),
    ...switchSpaceVerified('spaceB'),
    assertBookmarkLoaded('bm1', true),
    assertBookmarkLoaded('bm2', true),
  ],
};

export const SECTION_A_CASES: TestCase[] = [
  A1_REGULAR_TAB_MOVED,
  A2_BOOKMARK_TAB_MOVED_SIDEBAR_OPEN,
  A3_BOOKMARK_MOVED_SIDEBAR_CLOSED,
  A4_PINNED_TAB_MOVED,
  A5_BOOKMARK_TAB_UNGROUP,
  A5B_REGULAR_TAB_UNGROUP,
  A5C_PINNED_TAB_UNGROUP,
  A6_BOOKMARK_TAB_MOVED_TO_WINDOW,
  A6B_REGULAR_TAB_MOVED_TO_WINDOW,
  A6C_PINNED_TAB_MOVED_TO_WINDOW,
  A7_BOOKMARKED_VIA_DRAG_THEN_MOVED,
  A7B_MOVE_VIA_FOLDER_PICKER,
  A7C_MULTI_SELECT_MOVE,
];
