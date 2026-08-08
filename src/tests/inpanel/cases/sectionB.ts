// Section B - Tab closing.
// docs/test/tab-space-association-test-cases.md#section-b---tab-closing

import { TestCase } from '../types';
import { createTestBookmark, createTestSpace, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { closeTab, openBookmarkTab, pause, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded } from '../assertions';

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

export const SECTION_B_CASES: TestCase[] = [
  B1_CLOSE_BOOKMARK_TAB,
];
