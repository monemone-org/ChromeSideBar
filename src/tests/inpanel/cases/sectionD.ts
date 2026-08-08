// Section D - Space lifecycle.
// docs/test/tab-space-association-test-cases.md#section-d---space-lifecycle

import { DeleteSpaceAction } from '../../../actions/deleteSpaceAction';
import { TestCase, TestStep } from '../types';
import { createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { openBookmarkTab, openPinnedTab, openRegularTab, renameSpace, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded, assertPinnedLoaded, assertSpaceExists, assertTabExists, assertTabInSpace, assertTabUngrouped } from '../assertions';
import { resolveStringRef } from '../stepHelpers';

// D.1's doc step 3 (renaming from a second window and checking whether a
// FIRST window's own Chrome group also picks it up) needs a second live
// sidebar/window to observe - out of scope here, same reason B.4/E.2 are
// left manual (see docs/test/tab-space-association-test-cases.md). This case
// only covers steps 1-2 (single window: rename syncs the Chrome group,
// association survives).
export const D1_RENAME_SPACE_WITH_TRACKED_TABS: TestCase = {
  id: 'D.1',
  title: 'Rename a space while it has tracked tabs',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'D1 bookmark', testUrl('d1-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('d1-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertBookmarkLoaded('bm', true),
    assertTabInSpace('tab1', 'spaceA'),

    renameSpace('spaceA', 'Work renamed (inpanel-test)'),
    // resolveSpace() inside assertTabInSpace looks up spaceA's CURRENT name
    // via getSpaceById, so this only passes if the Chrome group's title was
    // actually updated to match the rename, not just the Space object.
    assertTabInSpace('tab1', 'spaceA'),
    assertBookmarkLoaded('bm', true),
  ],
};

// D.2 exercises the same UndoableAction the "Delete Space" menu item uses
// (SpaceDialogs.tsx), not SpacesContext.deleteSpace() directly, so this test
// matches what a real delete + undo actually does. Case-specific (not in
// actions.ts) since no other Section D case needs it yet.
function doDeleteSpace(spaceRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Delete space "${spaceRef}" (DeleteSpaceAction.do)`,
    run: async (ctx) =>
    {
      const spaceId = resolveStringRef(ctx, spaceRef);
      const action = new DeleteSpaceAction(spaceId, () => ctx.spaces, ctx.windowId, ctx.getItemKeyForTab, ctx.restoreItemAssociation);
      await action.do();
      ctx.refs.set('deleteAction', action);
    },
  };
}

function undoDeleteSpace(): TestStep
{
  return {
    kind: 'action',
    label: 'Undo delete space (DeleteSpaceAction.undo)',
    run: async (ctx) =>
    {
      const action = ctx.refs.get('deleteAction');
      if (!(action instanceof DeleteSpaceAction)) throw new Error('no deleteAction ref - run doDeleteSpace first');
      await action.undo();
    },
  };
}

export const D2_DELETE_SPACE_WITH_TRACKED_TABS: TestCase = {
  id: 'D.2',
  title: 'Delete a space with tracked tabs',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'D2 bookmark', testUrl('d2-bookmark'), 'bm');
    await createTestPinnedSite(getCtx, 'D2 pin', testUrl('d2-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('d2-bookmark'), spaceRef: 'spaceA', tabRef: 'bookmarkTab' }),
    openPinnedTab({ pinRef: 'pin', url: testUrl('d2-pin'), tabRef: 'pinnedTab' }),
    openRegularTab({ url: testUrl('d2-regular'), spaceRef: 'spaceA', tabRef: 'regularTab' }),
    assertBookmarkLoaded('bm', true),
    assertPinnedLoaded('pin', true),
    // Confirms the actual precondition the survival assertion below depends
    // on: the pinned tab is NOT in spaceA's Chrome group at delete time
    // (pinned tabs open ungrouped by default and this case never moves it).
    // DeleteSpaceAction closes tabs purely by group membership - a pinned
    // tab that IS in the group is expected to close along with everything
    // else (deleting the space it's visibly grouped into is intentional,
    // not a bug), which is a different scenario this case isn't testing.
    assertTabUngrouped('pinnedTab'),

    doDeleteSpace('spaceA'),
    // Confirmed independently of the tab-survival checks below: the space
    // itself is gone from storage/state right after do(), not just "closed
    // its tabs". Without this, a DeleteSpaceAction that closed tabs but
    // never actually removed the space (a realistic single-line regression -
    // do()'s storage write is a separate statement after the tab-closing
    // try/catch) would still pass every assertion in this case, since
    // undo() re-inserts the snapshot regardless of whether do() actually
    // removed it first.
    assertSpaceExists('spaceA', false),
    assertTabExists('bookmarkTab', false),
    assertTabExists('regularTab', false),
    // Correct behavior: an ungrouped pinned tab is untouched by deleting a
    // space it was never actually grouped into - DeleteSpaceAction only
    // acts on tabs it finds via the space's Chrome group, so this pin was
    // never in scope for it to close. Expected to PASS.
    assertTabExists('pinnedTab', true),
    assertPinnedLoaded('pin', true),

    undoDeleteSpace(),
    assertSpaceExists('spaceA', true),
    assertBookmarkLoaded('bm', true),
    assertPinnedLoaded('pin', true),
  ],
};

export const SECTION_D_CASES: TestCase[] = [
  D1_RENAME_SPACE_WITH_TRACKED_TABS,
  D2_DELETE_SPACE_WITH_TRACKED_TABS,
];
