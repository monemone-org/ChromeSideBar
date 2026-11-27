// Section B - Tab closing.
// docs/test/tab-space-association-test-cases.md#section-b---tab-closing

import { CloseTabAction } from '../../../actions/closeTabAction';
import { TestCase, TestStep } from '../types';
import { createTestBookmark, createTestBookmarkInFolder, createTestPinnedSite, createTestSpace, createTestSubfolder, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import {
  closedPanelStep,
  closeTab,
  closeTabWhileClosed,
  deleteBookmarkNative,
  deleteFolderNative,
  moveTabNative,
  openBookmarkTab,
  openPinnedTab,
  openRegularTab,
  recordTabForBookmark,
  recordTabForPinned,
  removeBookmarkWhileClosed,
  ungroupTab,
  switchSpaceVerified,
} from '../actions';
import { assertBookmarkExists, assertBookmarkLoaded, assertPinnedLoaded, assertTabExists, assertTabInSpace, assertTabUngrouped } from '../assertions';

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
    closedPanelStep('Close the bookmark tab, panel closed', closeTabWhileClosed('tab2'), {
      steps: [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, close the tab for "${testUrl('b1-bookmark')}" (X button or Cmd+W).`,
        'Reopen the sidebar panel to resume.',
      ],
    }),
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
    closedPanelStep('Close the pinned tab, panel closed', closeTabWhileClosed('tab2'), {
      steps: [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, close the tab for "${testUrl('b2-pin')}" (X button or Cmd+W).`,
        'Reopen the sidebar panel to resume.',
      ],
    }),
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
    closedPanelStep('Close the regular tab, panel closed', closeTabWhileClosed('tab2'), {
      steps: [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, close the tab for "${testUrl('b2b-regular-2')}" (X button or Cmd+W).`,
        'Reopen the sidebar panel to resume.',
      ],
    }),
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

// G3 for a tab reopened by undo. Undo opens a new tab and links the bookmark
// to it through restoreItemAssociation. When the tab then leaves its group,
// background must unlink it from the link alone, the same as for a tab the
// sidebar opened.
export const B3B_UNDO_CLOSE_THEN_UNGROUP: TestCase = {
  id: 'B.3b',
  title: 'A bookmark tab reopened by undo is unlinked when it leaves its group',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'B3b bookmark', testUrl('b3b-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps the space's group alive while the bookmark tab is closed
    openRegularTab({ url: testUrl('b3b-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('b3b-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertBookmarkLoaded('bm', true),

    doCloseTabs(['tab1']),
    assertBookmarkLoaded('bm', false),
    undoCloseTabs(),
    assertBookmarkLoaded('bm', true),
    recordTabForBookmark('bm', 'reopenedTab'),
    assertTabInSpace('reopenedTab', 'spaceA'),

    ungroupTab('reopenedTab'),
    assertTabUngrouped('reopenedTab'),
    assertTabExists('reopenedTab', true),
    assertBookmarkLoaded('bm', false),
  ],
};

// G4 for a tab reopened by undo: the other way out of a space. Moving a tab
// into another space's group gives background only the new group, so it
// needs the tab's registered space to see that the tab left its own. Undo has
// to register the reopened bookmark tab again for that. The pinned site's tab
// was never in a group, so undo must not register it with any space: moving
// it into a space's group afterwards keeps it linked, as in A.4.
export const B3C_UNDO_CLOSE_THEN_MOVE: TestCase = {
  id: 'B.3c',
  title: 'A bookmark tab reopened by undo is unlinked when it moves to another space\'s group',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'B3c bookmark', testUrl('b3c-bookmark'), 'bm');
    await createTestPinnedSite(getCtx, 'B3c pin', testUrl('b3c-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps the space's group alive while the bookmark tab is closed
    openRegularTab({ url: testUrl('b3c-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('b3c-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    openPinnedTab({ pinRef: 'pin', url: testUrl('b3c-pin'), tabRef: 'tab2' }),

    doCloseTabs(['tab1', 'tab2']),
    undoCloseTabs(),
    assertBookmarkLoaded('bm', true),
    assertPinnedLoaded('pin', true),
    recordTabForBookmark('bm', 'reopenedTab'),
    recordTabForPinned('pin', 'reopenedPin'),
    assertTabInSpace('reopenedTab', 'spaceA'),

    moveTabNative({ tabRef: 'reopenedTab', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('reopenedTab', 'spaceB'),
    assertBookmarkLoaded('bm', false),

    moveTabNative({ tabRef: 'reopenedPin', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('reopenedPin', 'spaceB'),
    assertPinnedLoaded('pin', true),
  ],
};

// B.5's own intro in the doc calls this "a same-sidebar-state variant of
// B.5b" - deliberately no closed-panel step here (unlike B.5b).
// deleteBookmarkNative fires the same chrome.bookmarks.onRemoved event the
// native chrome://bookmarks manager would; B.5b below is what actually needs
// the sidebar closed.
export const B5_DELETE_BOOKMARK_TAB_OPEN: TestCase = {
  id: 'B.5',
  title: 'Delete a bookmark while its tab is open (G1, fixed)',
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
    // Once the bookmark it's tied to is gone, the tab's association clears
    // too: background's chrome.bookmarks.onRemoved listener unlinks it (G1),
    // and the tab stays open as a regular tab.
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
    closedPanelStep('Delete the bookmark through chrome.bookmarks, panel closed', removeBookmarkWhileClosed('bm'), {
      steps: [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        'Open a new tab, type `chrome://bookmarks`, find "B5b bookmark" and **delete** it - through Chrome\'s own bookmark manager, not the extension\'s tree.',
        'Reopen the sidebar panel to resume.',
      ],
    }),
    assertBookmarkExists('bm', false),
    assertTabExists('tab1', true),
    // Same as B.5 (G1), with the sidebar actually closed this time. The
    // listener lives in background, so the outcome is identical to B.5's.
    assertBookmarkLoaded('bm', false),
  ],
};

// G1 for a folder: deleting a folder removes every bookmark under it, and the
// onRemoved event names only the folder. Both open tabs must be unlinked, which
// only happens if the listener walks the removed subtree.
export const B5C_DELETE_FOLDER_TABS_OPEN: TestCase = {
  id: 'B.5c',
  title: 'Delete a folder whose bookmarks have open tabs',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSubfolder(getCtx(), 'spaceA', 'B5c folder', 'folder');
    await createTestBookmarkInFolder(getCtx(), 'folder', 'B5c bookmark one', testUrl('b5c-one'), 'bmOne');
    await createTestBookmarkInFolder(getCtx(), 'folder', 'B5c bookmark two', testUrl('b5c-two'), 'bmTwo');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),

    openBookmarkTab({ bookmarkRef: 'bmOne', url: testUrl('b5c-one'), spaceRef: 'spaceA', tabRef: 'tabOne' }),
    openBookmarkTab({ bookmarkRef: 'bmTwo', url: testUrl('b5c-two'), spaceRef: 'spaceA', tabRef: 'tabTwo' }),
    assertBookmarkLoaded('bmOne', true),
    assertBookmarkLoaded('bmTwo', true),

    deleteFolderNative('folder'),
    assertBookmarkExists('bmOne', false),
    assertBookmarkExists('bmTwo', false),
    assertTabExists('tabOne', true),
    assertTabExists('tabTwo', true),
    assertBookmarkLoaded('bmOne', false),
    assertBookmarkLoaded('bmTwo', false),
  ],
};

export const SECTION_B_CASES: TestCase[] = [
  B1_CLOSE_BOOKMARK_TAB,
  B2_CLOSE_PINNED_TAB,
  B2B_CLOSE_REGULAR_TAB,
  B3_MULTI_CLOSE_TABS,
  B3B_UNDO_CLOSE_THEN_UNGROUP,
  B3C_UNDO_CLOSE_THEN_MOVE,
  B5_DELETE_BOOKMARK_TAB_OPEN,
  B5B_DELETE_BOOKMARK_SIDEBAR_CLOSED,
  B5C_DELETE_FOLDER_TABS_OPEN,
];
