// Section D - Space lifecycle.
// docs/test/tab-space-association-test-cases.md#section-d---space-lifecycle

import { DeleteSpaceAction } from '../../../actions/deleteSpaceAction';
import { spaceManagerProxy } from '../../../managers/proxies/spaceManagerProxy';
import { Space } from '../../../contexts/SpacesContext';
import { TestCase, TestStep } from '../types';
import { createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { closeTesterWindow, openBookmarkTab, openPinnedTab, openRegularTab, renameSpace, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded, assertPinnedLoaded, assertSpaceExists, assertTabExists, assertTabInSpace, assertTabInSpaceWithin, assertTabUngrouped } from '../assertions';
import { resolveSpace, resolveStringRef, waitFor } from '../stepHelpers';
import { toChromeColor } from '../../../utils/groupColors';

// D.1 covers doc steps 1-2 (single window: rename syncs the Chrome group,
// association survives). D.1b below covers step 3, the second window.
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
    // resolveSpace() inside assertTabInSpaceWithin looks up spaceA's CURRENT
    // name via getSpaceById, so this only passes if the Chrome group's title
    // was actually updated to match the rename, not just the Space object.
    // Background retitles the group as a queued job after it stores the
    // rename, so the check allows it a moment.
    assertTabInSpaceWithin('tab1', 'spaceA', 3000),
    assertBookmarkLoaded('bm', true),
  ],
};

// D.1 doc step 3 (D1): a second window also has a group for the space, and
// the rename happens in this one. Background retitles the space's group in
// every window, so the other window's group must follow, though no sidebar
// is open there.
const D1B_OTHER_WINDOW_REF = 'otherWindow';
const D1B_OTHER_TAB_REF = 'otherTab';

function openSpaceGroupInOtherWindow(spaceRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Open a second window with a tab in space "${spaceRef}"'s group`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);

      // Unfocused, so this window and its sidebar stay in front
      const window = await chrome.windows.create({ url: testUrl('d1b-other-window'), focused: false });
      const tabId = window?.tabs?.[0]?.id;
      if (window?.id === undefined || tabId === undefined) throw new Error('could not open a second window with a tab');
      ctx.refs.set(D1B_OTHER_WINDOW_REF, window.id);
      ctx.refs.set(D1B_OTHER_TAB_REF, tabId);

      // Group it the way a person would by hand, titled with the space's name
      const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId: window.id } });
      await chrome.tabGroups.update(groupId, { title: space.name, color: toChromeColor(space.color) });
    },
  };
}

function assertOtherWindowGroupTitle(spaceRef: string, timeoutMs: number): TestStep
{
  return {
    kind: 'assert',
    label: `The second window's group is titled with space "${spaceRef}"'s name within ${timeoutMs}ms`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);
      const tabId = ctx.refs.get(D1B_OTHER_TAB_REF);
      if (typeof tabId !== 'number') throw new Error('no tab in a second window - did the step that opens it run?');

      const groupTitle = async () =>
      {
        const tab = await chrome.tabs.get(tabId);
        if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return undefined;
        return (await chrome.tabGroups.get(tab.groupId)).title;
      };

      let last: string | undefined;
      await waitFor(async () =>
      {
        last = await groupTitle();
        return last === space.name;
      }, timeoutMs, () => `expected the second window's group to be titled "${space.name}", got ${last === undefined ? '(ungrouped)' : `"${last}"`}`);
    },
  };
}

export const D1B_RENAME_SPACE_OTHER_WINDOW: TestCase = {
  id: 'D.1b',
  title: 'Rename a space: its group in another window is renamed too (D1)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'D1b bookmark', testUrl('d1b-bookmark'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('d1b-bookmark'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    assertTabInSpace('tab1', 'spaceA'),
    openSpaceGroupInOtherWindow('spaceA'),
    assertOtherWindowGroupTitle('spaceA', 1000),

    renameSpace('spaceA', 'Work renamed (inpanel-test)'),
    assertTabInSpaceWithin('tab1', 'spaceA', 3000),
    assertOtherWindowGroupTitle('spaceA', 3000),
    assertBookmarkLoaded('bm', true),

    closeTesterWindow(D1B_OTHER_WINDOW_REF),
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

/**
 * Reads background's OWN in-memory space list - the same
 * spaceManagerProxy.getSpaces() call SpaceNavigatorApp and
 * DeleteSpaceAction.undo() make, which round-trips a message to
 * SpaceManager.dispatch('getSpaces') in background.ts rather than reading
 * the sidebar's own (possibly stale) mirror. This is the actual Case 3
 * regression check from docs/decisions/2026-07-30-shared-storage-multiple-writers.md
 * - see D.3 below. Doesn't cover the doc's step 4 (reading the DEV-only
 * console.log line from the service worker's own console) - that's a
 * different execution context this panel can't read from, and it prints
 * the same underlying data this step already reads live, so that step
 * stays manual-only.
 */
function assertSpaceNotInBackgroundCache(spaceRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Space "${spaceRef}" is not in background's own space cache`,
    run: async (ctx) =>
    {
      const spaceId = resolveStringRef(ctx, spaceRef);
      const backgroundSpaces = await spaceManagerProxy.getSpaces();
      const stillThere = backgroundSpaces.some(s => s.id === spaceId);
      if (stillThere)
      {
        throw new Error(`expected background's SpaceManager to have dropped space "${spaceId}" immediately after delete, but it's still in getSpaces()'s result`);
      }
    },
  };
}

// D.3 confirms background's own SpaceManager in-memory list drops a deleted
// space immediately, with no other space edit run in between - regression
// check for Case 3 in docs/decisions/2026-07-30-shared-storage-multiple-writers.md
// (before that port, background's in-memory list only refreshed on the NEXT
// unrelated space edit, or a service worker restart). Covers doc steps 1-3;
// step 4 (reading a DEV-only console.log line from the service worker's own
// console) is a different execution context this panel can't observe, and
// prints the same data step 3 already reads live - left manual-only, see
// docs/test/tab-space-association-test-cases.md's "Still manual" list.
export const D3_BACKGROUND_SPACE_CACHE_DROPS_DELETED_SPACE: TestCase = {
  id: 'D.3',
  title: "Background's own space cache must drop a deleted space immediately",
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
  },
  steps: [
    assertSpaceExists('spaceA', true),
    doDeleteSpace('spaceA'),
    // Doc step 2: sidebar's own mirror drops it immediately.
    assertSpaceExists('spaceA', false),
    // Doc step 3: background's OWN in-memory list (not the sidebar's
    // mirror) must have dropped it too, with no other space edit run in
    // between.
    assertSpaceNotInBackgroundCache('spaceA'),
  ],
};

// D.4 exercises SpaceManager.replaceAll()'s self-heal for a space that has
// bookmarkFolderPath but no bookmarkFolderSegments - the exact shape Arc
// import and any pre-bookmarkFolderSegments backup both produce (see the
// "Case" writeup in docs/decisions/2026-07-30-shared-storage-multiple-writers.md).
// Feeds spaceManagerProxy.replaceAll() directly with that shape rather than
// driving the actual Import dialog (which needs a real file picker this
// panel can't automate) - replaceAll() is the exact same real message-
// passing call import's replace option makes (SpacesContext.replaceSpaces ->
// spaceManagerProxy.replaceAll()), so this exercises the identical proxy <->
// impl wiring, broadcast back to this same window included.
function stripSegmentsAndWrite(spaceRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Strip bookmarkFolderSegments from "${spaceRef}" and write via replaceAll (simulates Arc import / a legacy backup)`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);
      // Stash what it was, so the assertions below can confirm the SAME
      // segments came back, not just that some array showed up.
      ctx.refs.set(`${spaceRef}:originalSegments`, JSON.stringify(space.bookmarkFolderSegments));

      const legacyShape: Space = { ...space };
      delete legacyShape.bookmarkFolderSegments;

      const nextList = spaceManagerProxy.snapshot.map(s => s.id === space.id ? legacyShape : s);
      await spaceManagerProxy.replaceAll(nextList);
    },
  };
}

/**
 * Confirms bookmarkFolderSegments came back matching what it was before
 * stripSegmentsAndWrite removed it. `fromBackground` picks which copy to
 * read: background's own live list (spaceManagerProxy.getSpaces(), a fresh
 * round trip - exercises SpaceManager.replaceAll()'s self-heal itself) or
 * this context's own mirror (ctx.getSpaceById, what BookmarkTree.tsx
 * actually renders from - the check that exercises the proxy/broadcast
 * wiring: the corrected list reaches this mirror only through the ordinary
 * SPACES_CHANGED broadcast, since the proxy never applies its own ack).
 */
function assertSegmentsRestored(spaceRef: string, fromBackground: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `bookmarkFolderSegments restored on "${spaceRef}" (${fromBackground ? "background's own list" : "this window's mirror"})`,
    run: async (ctx) =>
    {
      const spaceId = resolveStringRef(ctx, spaceRef);
      const expected = ctx.refs.get(`${spaceRef}:originalSegments`);
      if (typeof expected !== 'string') throw new Error(`no "${spaceRef}:originalSegments" ref - run stripSegmentsAndWrite first`);

      const space = fromBackground
        ? (await spaceManagerProxy.getSpaces()).find(s => s.id === spaceId)
        : ctx.getSpaceById(spaceId);
      if (!space) throw new Error(`space "${spaceRef}" (id ${spaceId}) not found`);

      const actual = JSON.stringify(space.bookmarkFolderSegments);
      if (actual !== expected)
      {
        throw new Error(`expected bookmarkFolderSegments to be restored to ${expected}, got ${actual}`);
      }
    },
  };
}

export const D4_MIGRATE_LEGACY_SPACE_ON_UPDATE: TestCase = {
  id: 'D.4',
  title: 'Legacy space (bookmarkFolderPath, no bookmarkFolderSegments) self-heals through replaceAll',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
  },
  steps: [
    stripSegmentsAndWrite('spaceA'),
    // Background's own list gets the segments back immediately, no reload
    // needed - the actual self-heal, in SpaceManager.replaceAll().
    assertSegmentsRestored('spaceA', true),
    // This window's OWN mirror - what BookmarkTree.tsx renders from - must
    // also end up correct, not just background's copy. The proxy's optimistic
    // write showed the (unmigrated) list it just sent; the correction arrives
    // as the ordinary SPACES_CHANGED broadcast, which the proxy applies like
    // any other since it differs from the mirror. If it didn't, BookmarkTree
    // would keep showing "Folder not found" until reload.
    assertSegmentsRestored('spaceA', false),
  ],
};

export const SECTION_D_CASES: TestCase[] = [
  D1_RENAME_SPACE_WITH_TRACKED_TABS,
  D1B_RENAME_SPACE_OTHER_WINDOW,
  D2_DELETE_SPACE_WITH_TRACKED_TABS,
  D3_BACKGROUND_SPACE_CACHE_DROPS_DELETED_SPACE,
  D4_MIGRATE_LEGACY_SPACE_ON_UPDATE,
];
