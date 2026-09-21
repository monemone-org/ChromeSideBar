// Section B - Tab closing.
// docs/test/tab-space-association-test-cases.md#section-b---tab-closing

import { CloseTabAction } from '../../../actions/closeTabAction';
import { TestCase, TestStep } from '../types';
import { createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { closeTab, deleteBookmarkNative, openBookmarkTab, openPageForTester, openPinnedTab, openRegularTab, pause, switchSpaceVerified } from '../actions';
import { assertBookmarkExists, assertBookmarkLoaded, assertPinnedLoaded, assertTabExists, assertTabInSpace } from '../assertions';

export const B1_CLOSE_BOOKMARK_TAB: TestCase = {
  id: 'B.1',
  title: 'Close a bookmark tab directly (X button / Cmd+W)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'B1 bookmark', testUrl('b1-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('b1-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertBookmarkLoaded('bm', true),
    closeTab('tab1'),
    assertBookmarkLoaded('bm', false),

    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('b1-bookmark'), spaceRef: 'spaceA', tabRef: 'tab2' }),
    assertBookmarkLoaded('bm', true),
    pause(
      'Manual step: close the bookmark tab while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, close the tab for "${testUrl('b1-bookmark')}" (X button or Cmd+W).`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertBookmarkLoaded('bm', false),
  ],
};

export const B2_CLOSE_PINNED_TAB: TestCase = {
  id: 'B.2',
  title: 'Close a pinned tab directly',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestPinnedSite(getCtx, 'B2 pin', testUrl('b2-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openPinnedTab({ pinRef: 'pin', url: testUrl('b2-pin'), tabRef: 'tab1' }),
    assertPinnedLoaded('pin', true),
    closeTab('tab1'),
    assertPinnedLoaded('pin', false),

    openPinnedTab({ pinRef: 'pin', url: testUrl('b2-pin'), tabRef: 'tab2' }),
    assertPinnedLoaded('pin', true),
    pause(
      'Manual step: close the pinned tab while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, close the tab for "${testUrl('b2-pin')}" (X button or Cmd+W).`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertPinnedLoaded('pin', false),
  ],
};

export const B2B_CLOSE_REGULAR_TAB: TestCase = {
  id: 'B.2b',
  title: 'Close a regular tab directly',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openRegularTab({ url: testUrl('b2b-regular-1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertTabInSpace('tab1', 'spaceA'),
    closeTab('tab1'),
    assertTabExists('tab1', false),

    openRegularTab({ url: testUrl('b2b-regular-2'), spaceRef: 'spaceA', tabRef: 'tab2' }),
    assertTabInSpace('tab2', 'spaceA'),
    pause(
      'Manual step: close the regular tab while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, close the tab for "${testUrl('b2b-regular-2')}" (X button or Cmd+W).`,
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertTabExists('tab2', false),
  ],
};

// B.3 exercises the same UndoableAction the sidebar's own multi-select
// "Close Tab" action uses (TabList.tsx's performClose -> CloseTabAction), not
// a simulated multi-select click - see D.2's doDeleteSpace for the same
// approach with DeleteSpaceAction. Case-specific (not in actions.ts) since no
// other case needs a multi-tab close yet.
function doCloseTabs(tabRefs: string[]): TestStep
{
  return {
    kind: 'action',
    label: `Close tabs [${tabRefs.join(', ')}] (CloseTabAction.do)`,
    run: async (ctx) =>
    {
      const tabIds = tabRefs.map(ref =>
      {
        const id = ctx.refs.get(ref);
        if (typeof id !== 'number') throw new Error(`doCloseTabs: no tab id for ref "${ref}"`);
        return id;
      });
      const action = new CloseTabAction(tabIds, ctx.windowId, ctx.getItemKeyForTab, ctx.restoreItemAssociation);
      await action.do();
      ctx.refs.set('closeAction', action);
    },
  };
}

function undoCloseTabs(): TestStep
{
  return {
    kind: 'action',
    label: 'Undo close tabs (CloseTabAction.undo)',
    run: async (ctx) =>
    {
      const action = ctx.refs.get('closeAction');
      if (!(action instanceof CloseTabAction)) throw new Error('no closeAction ref - run doCloseTabs first');
      await action.undo();
    },
  };
}

export const B3_MULTI_CLOSE_TABS: TestCase = {
  id: 'B.3',
  title: 'Close via "Close Tab" in the sidebar\'s own context menu / multi-close',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'B3 bookmark 1', testUrl('b3-bookmark-1'), 'bm1');
    await createTestBookmark(getCtx(), 'spaceA', 'B3 bookmark 2', testUrl('b3-bookmark-2'), 'bm2');
    await createTestPinnedSite(getCtx, 'B3 pin', testUrl('b3-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openBookmarkTab({ bookmarkRef: 'bm1', url: testUrl('b3-bookmark-1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    openBookmarkTab({ bookmarkRef: 'bm2', url: testUrl('b3-bookmark-2'), spaceRef: 'spaceA', tabRef: 'tab2' }),
    openPinnedTab({ pinRef: 'pin', url: testUrl('b3-pin'), tabRef: 'tab3' }),
    assertBookmarkLoaded('bm1', true),
    assertBookmarkLoaded('bm2', true),
    assertPinnedLoaded('pin', true),

    doCloseTabs(['tab1', 'tab2', 'tab3']),
    assertBookmarkLoaded('bm1', false),
    assertBookmarkLoaded('bm2', false),
    assertPinnedLoaded('pin', false),
    assertTabExists('tab1', false),
    assertTabExists('tab2', false),
    assertTabExists('tab3', false),

    undoCloseTabs(),
    assertBookmarkLoaded('bm1', true),
    assertBookmarkLoaded('bm2', true),
    assertPinnedLoaded('pin', true),
  ],
};

// B.5's own intro in the doc calls this "a same-sidebar-state variant of
// B.5b" - deliberately no pause step here (unlike B.5b). deleteBookmarkNative
// fires the same chrome.bookmarks.onRemoved event the native chrome://bookmarks
// manager would, so there's nothing a pause would add for this half of the
// gap; B.5b below is what actually needs the sidebar closed.
export const B5_DELETE_BOOKMARK_TAB_OPEN: TestCase = {
  id: 'B.5',
  title: 'Delete a bookmark while its tab is open (known gap G1)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'B5 bookmark', testUrl('b5-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('b5-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertBookmarkLoaded('bm', true),

    deleteBookmarkNative('bm'),
    assertBookmarkExists('bm', false),
    // Tab is left running - there's no code path that closes it, since
    // DeleteBookmarkAction (which does close the tab) isn't what fired here.
    assertTabExists('tab1', true),
    // Correct behavior: once the bookmark it's tied to is gone, the tab's
    // association should clear too. Per known gap G1, there's no
    // chrome.bookmarks.onRemoved listener anywhere in the extension to catch
    // a native deletion, so this is expected to currently FAIL.
    assertBookmarkLoaded('bm', false),
  ],
};

export const B5B_DELETE_BOOKMARK_SIDEBAR_CLOSED: TestCase = {
  id: 'B.5b',
  title: 'Delete a bookmark via Chrome\'s native bookmark manager, sidebar closed',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'B5b bookmark', testUrl('b5b-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('b5b-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertBookmarkLoaded('bm', true),
    // Opened before the pause on purpose: the panel is closed for this step, so
    // the tester has nothing to click in the instructions once they start.
    openPageForTester({ url: 'chrome://bookmarks', ref: 'bookmarksTab' }),
    pause(
      'Manual step: delete the bookmark via chrome://bookmarks while the panel is closed',
      [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        'In the `chrome://bookmarks` tab that just opened, find "B5b bookmark" and **delete** it - through Chrome\'s own bookmark manager, not the extension\'s tree.',
        'Reopen the sidebar panel to resume.',
      ]
    ),
    assertBookmarkExists('bm', false),
    assertTabExists('tab1', true),
    // Same gap as B.5 (G1), reproduced with the sidebar actually closed this
    // time - the doc's point here is that this is NOT a sidebar-open/closed
    // race like G2 (there's simply no listener at all), so the outcome
    // should be identical to B.5's. Expected to currently FAIL, same reason.
    assertBookmarkLoaded('bm', false),
  ],
};

export const SECTION_B_CASES: TestCase[] = [
  B1_CLOSE_BOOKMARK_TAB,
  B2_CLOSE_PINNED_TAB,
  B2B_CLOSE_REGULAR_TAB,
  B3_MULTI_CLOSE_TABS,
  B5_DELETE_BOOKMARK_TAB_OPEN,
  B5B_DELETE_BOOKMARK_SIDEBAR_CLOSED,
];
