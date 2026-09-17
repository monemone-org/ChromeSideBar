// Section F - Regression check on pre-existing behavior.
// docs/test/tab-space-association-test-cases.md#section-f---regression-check-on-pre-existing-behavior

import { TestCase } from '../types';
import { createTestBookmark, createTestBookmarkInFolder, createTestSpace, createTestSubfolder, createTestSubfolderInFolder, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { activateTabNative, moveBookmarkTabToTabs, openBookmarkTab, openFillerBookmarksUntilScrollable, openNewTabNative, openRegularTab, pause, setFollowActiveTabMode, showActiveTab, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded, assertBookmarkRowExists, assertSidebarShowsSpace, assertTabExists, assertTabInSpace, assertTabInSpaceWithin, assertTabRowVisible } from '../assertions';

// F.1 - dragging a tab row onto a space in the space bar. The move that drop
// triggers (moveTabToSpace) already runs in Section A through moveTabSidebar,
// so what this case adds is the drag-and-drop wiring itself: SpaceBar.tsx's
// DragFormat.TAB drop handler. The drag is a real pointer gesture, so it's a
// pause; the runner checks where the tab ended up.
//
// spaceA gets exactly one tab, so "the only tab row" identifies it without
// relying on titles - every test tab is an example.com page with the same one.
export const F1_DRAG_TAB_TO_SPACE: TestCase = {
  id: 'F.1',
  title: 'Drag a tab onto another space in the space bar (guided)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('f1-tab'), spaceRef: 'spaceA', tabRef: 'tab' }),
    assertTabInSpace('tab', 'spaceA'),

    pause(
      'Manual step: drag the tab onto the other space',
      [
        `The sidebar is showing "${TEST_SPACE_WORK_NAME}", which has exactly one tab.`,
        `Drag that tab row onto the "${TEST_SPACE_VIDEO_NAME}" space icon in the space bar (hover an icon to see its name) and drop it there.`,
        'Click Resume below.',
      ]
    ),

    assertTabInSpace('tab', 'spaceB'),
  ],
};

// F.2 - "Move To Tabs" on a loaded bookmark row breaks the association and
// nothing else: the tab stays open, in the group it was already in.
export const F2_MOVE_BOOKMARK_TAB_TO_TABS: TestCase = {
  id: 'F.2',
  title: '"Move To Tabs" on a bookmark tab',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'F2 bookmark', testUrl('f2-bookmark'), 'bm');
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('f2-bookmark'), spaceRef: 'spaceA', tabRef: 'bmTab' }),
    assertBookmarkLoaded('bm', true),
    assertTabInSpace('bmTab', 'spaceA'),

    // The actual step under test.
    moveBookmarkTabToTabs('bm'),
    assertBookmarkLoaded('bm', false),
    assertTabExists('bmTab', true),
    assertTabInSpace('bmTab', 'spaceA'),
  ],
};

// F.3 - a brand-new tab joins the active space's group. openNewTabNative
// creates the tab with no grouping of its own, so the only thing that can put
// it in spaceB's group is background's chrome.tabs.onCreated listener - the
// same path Cmd+T takes. That listener queues the tab rather than grouping it
// inline, hence the polling assertion.
export const F3_NEW_TAB_JOINS_ACTIVE_SPACE: TestCase = {
  id: 'F.3',
  title: 'A brand-new tab joins the active space\'s group',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceB'),

    // The actual step under test.
    openNewTabNative({ url: testUrl('f3-new-tab'), tabRef: 'newTab' }),
    assertTabInSpaceWithin('newTab', 'spaceB', 3000),
  ],
};

// F.4 - C.2a (bookmark) three folders deep. The bookmark sits in
// level1 > level2 > level3, all collapsed, in the space the sidebar isn't
// showing, so "Show active tab" has to switch space and expand every ancestor
// folder before it can scroll to the row. Filler bookmarks are prepended to
// spaceB's own folder, pushing level1 below the fold (see C.1e).
export const F4_SHOW_ACTIVE_TAB_DEEPLY_NESTED: TestCase = {
  id: 'F.4',
  title: '"Show active tab" on a bookmark tab three collapsed folders deep',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestSubfolder(getCtx(), 'spaceB', 'F4 level 1', 'level1');
    await createTestSubfolderInFolder(getCtx(), 'level1', 'F4 level 2', 'level2');
    await createTestSubfolderInFolder(getCtx(), 'level2', 'F4 level 3', 'level3');
    await createTestBookmarkInFolder(getCtx(), 'level3', 'F4 bookmark', testUrl('f4-bookmark'), 'bm');
  },
  steps: [
    setFollowActiveTabMode('off'),
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('f4-tabA'), spaceRef: 'spaceA', tabRef: 'tabA' }),
    activateTabNative('tabA'),

    ...switchSpaceVerified('spaceB'),
    openFillerBookmarksUntilScrollable('spaceB'),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('f4-bookmark'), spaceRef: 'spaceB', tabRef: 'bmTab' }),
    activateTabNative('bmTab'),
    // Precondition: the folders are still collapsed, so the row isn't rendered.
    assertBookmarkRowExists('bmTab', false),

    ...switchSpaceVerified('spaceA'),
    assertSidebarShowsSpace('spaceA'),

    // The actual step under test.
    showActiveTab(),
    assertSidebarShowsSpace('spaceB'),
    assertTabRowVisible('bmTab', true),
  ],
};

export const SECTION_F_CASES: TestCase[] = [
  F1_DRAG_TAB_TO_SPACE,
  F2_MOVE_BOOKMARK_TAB_TO_TABS,
  F3_NEW_TAB_JOINS_ACTIVE_SPACE,
  F4_SHOW_ACTIVE_TAB_DEEPLY_NESTED,
];
