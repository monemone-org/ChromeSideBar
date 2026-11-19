// Section T - tab association ordering.
// docs/test/tab-space-association-test-cases.md#section-t---tab-association-ordering
//
// Each case here pins down one bug found by reviewing step 6b (the move of
// tab associations into background's TabAssociationManager). They only show
// when two things happen in one particular order, so most of them use
// background's DEV-only test hooks (backgroundHooks.ts) to hold background at
// a named point, fail one call, or send a broadcast of the case's choosing.
// T.1 needs real audio instead, so it is guided, unless the run is
// unattended and plays the DEV-only tone page itself.

import { TestCase, TestStep } from '../types';
import { createTestBookmark, createTestSpace, TEST_AUDIO_URL, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { bookmarkExistingTab, closeTab, openAudioTab, openBookmarkTab, openRegularTab, pause, playTestAudio, switchSpaceVerified } from '../actions';
import { assertBookmarkLoaded, assertTabAudible } from '../assertions';
import { resolveStringRef, resolveTabId } from '../stepHelpers';
import {
  armGate,
  broadcastFromBackground,
  failNextCall,
  forgetTabAssociationSession,
  readTabAssociationBackup,
  releaseGate,
  runTabAssociationRestore,
  waitForGate,
} from '../backgroundHooks';
import { tabAssociationsProxy } from '../../../managers/proxies/tabAssociationsProxy';
import { ManagerId } from '../../../managers/proxies/messageRouting';
import { TAB_ASSOCIATIONS_CHANGED, TabAssociations } from '../../../managers/shared/tabAssociationsApi';
import { TestGateName } from '../../../managers/shared/backgroundTestHooksApi';

// How long an open is allowed to take before T.2 calls it hung
const OPEN_TIMEOUT_MS = 5000;

// How long T.5 waits for background to reach its gate after closing a tab
const GATE_TIMEOUT_MS = 5000;

const bookmarkKey = (bookmarkId: string) => `bookmark-${bookmarkId}`;

// =============================================================================
// Steps used only by this section
// =============================================================================

/** What a bookmark row's speaker icon reads: this panel's audible state for the bookmark's tab. */
function assertBookmarkAudible(bookmarkRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Bookmark "${bookmarkRef}" shows ${expected ? '' : 'no '}audio indicator`,
    run: async (ctx) =>
    {
      const actual = ctx.isBookmarkAudible(resolveStringRef(ctx, bookmarkRef));
      if (actual !== expected)
      {
        throw new Error(`expected isBookmarkAudible to be ${expected}, got ${actual}`);
      }
    },
  };
}

/** The live URL a bookmark row uses for drift detection - absent means the panel lost the tab's live info. */
function assertBookmarkHasLiveUrl(bookmarkRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Bookmark "${bookmarkRef}" has its tab's live URL`,
    run: async (ctx) =>
    {
      const url = ctx.getBookmarkLiveUrl(resolveStringRef(ctx, bookmarkRef));
      if (url === undefined)
      {
        throw new Error('the panel has no live info for the bookmark\'s tab, so its title, drift marker and audio indicator are gone until the tab navigates');
      }
    },
  };
}

/** Wait for a tab to finish loading, so no late onUpdated can refill what a case is checking. */
function waitForTabLoaded(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Wait for tab "${tabRef}" to finish loading`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const deadline = Date.now() + OPEN_TIMEOUT_MS;

      // Poll Chrome's own status rather than sleeping a fixed time
      while ((await chrome.tabs.get(tabId)).status !== 'complete')
      {
        if (Date.now() > deadline) throw new Error(`tab "${tabRef}" never finished loading`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
  };
}

// =============================================================================
// T.1 - an already-playing tab dragged onto a bookmark
// =============================================================================

// The panel tracks audio for every tab, tracked or not, and drops what it
// knows about a tab once it leaves the mirror. Opening any other bookmark
// changes the mirror, so an untracked tab that was already playing loses its
// audible flag then. Dragging it onto a bookmark afterwards has to bring the
// flag back, because Chrome sends no new audible event: the tab was playing
// all along.
export const T1_PLAYING_TAB_ONTO_BOOKMARK: TestCase = {
  id: 'T.1',
  title: 'A tab already playing audio, dragged onto a bookmark, shows the audio indicator (guided)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T1 other', testUrl('t1-other'), 'otherBookmark');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // YouTube, or in unattended mode the tone page the pause below can start
    // itself (see AudioTestPage)
    openAudioTab({ spaceRef: 'spaceA', tabRef: 'audioTab' }),

    pause(
      'Manual step: start audio playback',
      [
        'Switch to the newly opened YouTube tab in Chrome.',
        'Press play and let it play for a second or two - unmuted, a muted tab does not count as audible.',
        'Come back to the sidebar and click Resume below.',
      ],
      { auto: playTestAudio('audioTab') }
    ),
    assertTabAudible('audioTab', true),

    // Any change to the mirror will do; this is the ordinary way to cause one
    openBookmarkTab({ bookmarkRef: 'otherBookmark', url: testUrl('t1-other'), spaceRef: 'spaceA', tabRef: 'otherTab' }),

    // What dragging the tab onto the bookmark tree does
    bookmarkExistingTab({ tabRef: 'audioTab', spaceRef: 'spaceA', title: 'T1 audio', url: TEST_AUDIO_URL, bookmarkRef: 'audioBookmark' }),
    assertTabAudible('audioTab', true),
    assertBookmarkAudible('audioBookmark', true),

    // Closing the tab stops the audio too, so no second pause is needed
    closeTab('audioTab'),
  ],
};

// =============================================================================
// T.2 - opening a bookmark when background rejects the association
// =============================================================================

// createItemTab awaits the association from inside chrome.tabs.create's
// callback. When background rejects it, the tab still exists, so opening the
// bookmark has to come back rather than wait forever, and the mirror has to
// end up showing what background really has: no association.
export const T2_OPEN_SURVIVES_REJECTED_ASSOCIATION: TestCase = {
  id: 'T.2',
  title: 'Opening a bookmark returns even when background rejects the association',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T2 bookmark', testUrl('t2'), 'bookmark');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    {
      kind: 'action',
      label: 'Make background reject the next associate call',
      run: async () =>
      {
        await failNextCall(ManagerId.TAB_ASSOCIATIONS, 'associate');
      },
    },
    {
      // An assert, not an action: a hang is the failure being looked for, and
      // the checks after it still have something to say either way
      kind: 'assert',
      label: `Opening the bookmark returns within ${OPEN_TIMEOUT_MS}ms`,
      run: async (ctx) =>
      {
        const bookmarkId = resolveStringRef(ctx, 'bookmark');
        const spaceId = resolveStringRef(ctx, 'spaceA');

        const timedOut = Symbol('timedOut');
        const result = await Promise.race([
          ctx.openBookmarkTab(bookmarkId, testUrl('t2'), spaceId),
          new Promise<typeof timedOut>(resolve => setTimeout(() => resolve(timedOut), OPEN_TIMEOUT_MS)),
        ]);

        if (result === timedOut)
        {
          throw new Error('openBookmarkTab never resolved - the rejected associate escaped createItemTab\'s callback');
        }
        if (result === undefined) throw new Error('openBookmarkTab returned no tab id, though the tab was created');

        ctx.refs.set('tab', result);
      },
    },
    {
      kind: 'assert',
      label: 'The new tab is open',
      run: async (ctx) =>
      {
        await chrome.tabs.get(resolveTabId(ctx, 'tab'));
      },
    },
    // The proxy resyncs its mirror from background after a failed write
    assertBookmarkLoaded('bookmark', false),
  ],
};

// =============================================================================
// T.3 - a stale broadcast arriving after a bookmark opens
// =============================================================================

// A broadcast sent before background processed this panel's associate can
// arrive after it, briefly taking the new tab back out of the mirror until
// the next broadcast puts it back. The plans accept that flicker. What they
// don't accept is the panel throwing away the tab's live info during it and
// never getting it back.
export const T3_STALE_BROADCAST_KEEPS_LIVE_INFO: TestCase = {
  id: 'T.3',
  title: 'A late, stale broadcast does not leave a bookmark tab without its live info',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T3 bookmark', testUrl('t3'), 'bookmark');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    {
      kind: 'action',
      label: 'Remember the window\'s associations, then open the bookmark',
      run: async (ctx) =>
      {
        ctx.refs.set('staleMap', await tabAssociationsProxy.getAssociations(ctx.windowId));

        const tabId = await ctx.openBookmarkTab(resolveStringRef(ctx, 'bookmark'), testUrl('t3'), resolveStringRef(ctx, 'spaceA'));
        if (tabId === undefined) throw new Error('openBookmarkTab did not return a tab id');
        ctx.refs.set('tab', tabId);
      },
    },
    waitForTabLoaded('tab'),
    assertBookmarkHasLiveUrl('bookmark'),
    {
      kind: 'action',
      label: 'Have background send the remembered (stale) map',
      run: async (ctx) =>
      {
        await broadcastFromBackground({
          action: TAB_ASSOCIATIONS_CHANGED,
          windowId: ctx.windowId,
          associations: ctx.refs.get('staleMap') as TabAssociations,
        });
      },
    },
    // Confirms the stale map really reached the mirror, so the rest of the
    // case is testing the recovery and not a broadcast that never arrived
    assertBookmarkLoaded('bookmark', false),
    {
      kind: 'action',
      label: 'Have background send the real map again',
      run: async (ctx) =>
      {
        await broadcastFromBackground({
          action: TAB_ASSOCIATIONS_CHANGED,
          windowId: ctx.windowId,
          associations: await tabAssociationsProxy.getAssociations(ctx.windowId),
        });
      },
    },
    assertBookmarkLoaded('bookmark', true),
    assertBookmarkHasLiveUrl('bookmark'),
  ],
};

// =============================================================================
// T.4 - the startup restore against a tab that is already associated
// =============================================================================

// After a browser restart the session map is empty but the backup is not.
// If a tab gets associated to item Y before the restore merges the backup in,
// the restore skips the backup's older X -> same tab entry, as it should. It
// must not then write that skipped entry back into the backup, or the next
// restart finds two items claiming one tab and may pick the stale one.
//
// The hooks stand in for the restart: forgetTabAssociationSession clears the
// session map the way a restart does, and runTabAssociationRestore runs the
// same restore a worker start runs. Clearing the session map empties this
// whole window's map, the tester's own bookmark tabs in it included, and the
// restore brings those back from the backup the same way a restart would. It
// also covers every other window, exactly as it does on every real worker
// start.
export const T4_RESTORE_SKIPS_TAKEN_TAB_IN_BACKUP: TestCase = {
  id: 'T.4',
  title: 'The startup restore does not back up an association it skipped',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T4 X', testUrl('t4'), 'bookmarkX');
    await createTestBookmark(getCtx(), 'spaceA', 'T4 Y', testUrl('t4-y'), 'bookmarkY');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bookmarkX', url: testUrl('t4'), spaceRef: 'spaceA', tabRef: 'tab' }),
    {
      kind: 'assert',
      label: 'Precondition: the backup points X at the tab',
      run: async (ctx) =>
      {
        const backup = await readTabAssociationBackup(ctx.windowId);
        const entry = backup[bookmarkKey(resolveStringRef(ctx, 'bookmarkX'))];
        if (entry?.tabId !== resolveTabId(ctx, 'tab'))
        {
          throw new Error(`expected X's backup entry to name the tab, got ${JSON.stringify(entry)}`);
        }
      },
    },
    {
      kind: 'action',
      label: 'Clear this window\'s live associations, keeping the backup (as a restart does)',
      run: async (ctx) =>
      {
        await forgetTabAssociationSession(ctx.windowId);
      },
    },
    assertBookmarkLoaded('bookmarkX', false),
    {
      kind: 'action',
      label: 'Associate the same tab with Y before the restore runs',
      run: async (ctx) =>
      {
        await ctx.associateExistingTab(resolveTabId(ctx, 'tab'), resolveStringRef(ctx, 'bookmarkY'));
      },
    },
    {
      kind: 'action',
      label: 'Run the startup restore',
      run: async () =>
      {
        await runTabAssociationRestore();
      },
    },
    {
      kind: 'assert',
      label: 'Only Y\'s backup entry names the tab',
      run: async (ctx) =>
      {
        const tabId = resolveTabId(ctx, 'tab');
        const backup = await readTabAssociationBackup(ctx.windowId);
        const claimants = Object.entries(backup)
          .filter(([, entry]) => entry.tabId === tabId)
          .map(([itemKey]) => itemKey);

        const expected = bookmarkKey(resolveStringRef(ctx, 'bookmarkY'));
        if (claimants.length !== 1 || claimants[0] !== expected)
        {
          throw new Error(`expected only ${expected} to name tab ${tabId} in the backup, got [${claimants.join(', ')}]`);
        }
      },
    },
    assertBookmarkLoaded('bookmarkY', true),
    assertBookmarkLoaded('bookmarkX', false),
  ],
};

// =============================================================================
// T.5 - refreshing backup indices while an item moves to another tab
// =============================================================================

// Closing or moving any tab makes background refresh the stored tab index of
// every tracked tab in the window. If an item is moved to a different tab
// while that refresh waits on chrome.tabs.query, the refresh must not write
// the old tab's index over the new tab's backup entry, or the index+domain
// pass of the next restore looks in the wrong place.
export const T5_INDEX_REFRESH_AFTER_RETARGET: TestCase = {
  id: 'T.5',
  title: 'Refreshing backup indices does not give a moved item its old tab\'s index',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T5 bookmark', testUrl('t5'), 'bookmark');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openBookmarkTab({ bookmarkRef: 'bookmark', url: testUrl('t5'), spaceRef: 'spaceA', tabRef: 'oldTab' }),
    openRegularTab({ url: testUrl('t5-new'), spaceRef: 'spaceA', tabRef: 'newTab' }),
    openRegularTab({ url: testUrl('t5-spacer'), spaceRef: 'spaceA', tabRef: 'spacerTab' }),
    {
      kind: 'action',
      label: 'Close a tab, and move the bookmark to another tab while background refreshes indices',
      run: async (ctx) =>
      {
        const gate = TestGateName.REFRESH_BACKUP_INDICES_AFTER_TAB_QUERY;
        await armGate(gate);

        try
        {
          // Any tab removal makes background refresh every tracked tab's index
          await chrome.tabs.remove(resolveTabId(ctx, 'spacerTab'));
          await waitForGate(gate, GATE_TIMEOUT_MS);

          // The undo path's call: points the item at a tab without regrouping
          await ctx.restoreItemAssociation(resolveTabId(ctx, 'newTab'), bookmarkKey(resolveStringRef(ctx, 'bookmark')));
        }
        finally
        {
          await releaseGate(gate);
        }
      },
    },
    {
      kind: 'assert',
      label: 'The bookmark\'s backup entry has the new tab and the new tab\'s index',
      run: async (ctx) =>
      {
        const newTabId = resolveTabId(ctx, 'newTab');
        const backup = await readTabAssociationBackup(ctx.windowId);
        const entry = backup[bookmarkKey(resolveStringRef(ctx, 'bookmark'))];
        if (!entry) throw new Error('the bookmark has no backup entry');

        const newTab = await chrome.tabs.get(newTabId);
        const oldTab = await chrome.tabs.get(resolveTabId(ctx, 'oldTab'));

        if (entry.tabId !== newTabId)
        {
          throw new Error(`expected the entry to name tab ${newTabId}, got ${entry.tabId}`);
        }
        if (entry.tabIndex !== newTab.index)
        {
          const whose = entry.tabIndex === oldTab.index ? ' - the old tab\'s index' : '';
          throw new Error(`expected tabIndex ${newTab.index}, got ${entry.tabIndex}${whose}`);
        }
      },
    },
  ],
};

export const SECTION_T_CASES: TestCase[] = [
  T1_PLAYING_TAB_ONTO_BOOKMARK,
  T2_OPEN_SURVIVES_REJECTED_ASSOCIATION,
  T3_STALE_BROADCAST_KEEPS_LIVE_INFO,
  T4_RESTORE_SKIPS_TAKEN_TAB_IN_BACKUP,
  T5_INDEX_REFRESH_AFTER_RETARGET,
];
