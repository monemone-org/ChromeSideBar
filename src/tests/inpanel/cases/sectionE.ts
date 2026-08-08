// Section E - Restart / reload durability.
// docs/test/tab-space-association-test-cases.md#section-e---restart--reload-durability

import { TestCase } from '../types';
import { createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { openBookmarkTab, openPinnedTab, pause, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded, assertPinnedLoaded, assertTabInSpace } from '../assertions';

// The runner's pause/resume checkpoint (runner.ts) persists to
// chrome.storage.local rather than .session specifically because of this
// case: .session was tried first and confirmed (by actually running this
// case) to get wiped by a "Reload" from chrome://extensions, unlike a
// sidebar close/reopen. E.2 (full browser quit/relaunch) is still left
// manual - not a storage problem this time, but that Chrome hands out new
// tab/window ids on restore, which this suite's refs (raw ids captured
// pre-pause) has no logic to re-resolve, unlike the real backup-matching
// code E.2 is actually meant to exercise.
export const E1_RELOAD_EXTENSION: TestCase = {
  id: 'E.1',
  title: 'Reload the extension (chrome://extensions -> reload)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'E1 bookmark A', testUrl('e1-bookmark-a'), 'bmA');
    await createTestBookmark(getCtx(), 'spaceB', 'E1 bookmark B', testUrl('e1-bookmark-b'), 'bmB');
    await createTestPinnedSite(getCtx, 'E1 pin', testUrl('e1-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bmA', url: testUrl('e1-bookmark-a'), spaceRef: 'spaceA', tabRef: 'tabA' }),
    ...switchSpaceVerified('spaceB'),
    openBookmarkTab({ bookmarkRef: 'bmB', url: testUrl('e1-bookmark-b'), spaceRef: 'spaceB', tabRef: 'tabB' }),
    openPinnedTab({ pinRef: 'pin', url: testUrl('e1-pin'), tabRef: 'tabPin' }),
    assertBookmarkLoaded('bmA', true),
    assertBookmarkLoaded('bmB', true),
    assertPinnedLoaded('pin', true),

    pause(
      'Manual step: reload the extension',
      [
        'Open chrome://extensions.',
        'Find this extension and click its reload button (circular arrow icon).',
        'Reopen the sidebar panel to resume.',
      ]
    ),

    // Same browser session, so Chrome keeps the tab ids stable across an
    // extension reload - associations should resolve exactly as before.
    assertBookmarkLoaded('bmA', true),
    assertBookmarkLoaded('bmB', true),
    assertPinnedLoaded('pin', true),
    assertTabInSpace('tabA', 'spaceA'),
    assertTabInSpace('tabB', 'spaceB'),
  ],
};

export const SECTION_E_CASES: TestCase[] = [
  E1_RELOAD_EXTENSION,
];
