// Section T - tab association ordering.
// docs/test/tab-space-association-test-cases.md#section-t---tab-association-ordering
//
// T.1 to T.5 each pin down one bug found by reviewing step 6b (the move of
// tab associations into background's TabAssociationManager), and T.6 the race
// behind issue N1, where the sidebar and background group the same new tab.
// They only show
// when two things happen in one particular order, so most of them use
// background's DEV-only test hooks (backgroundHooks.ts) to hold background at
// a named point, fail one call, or send a broadcast of the case's choosing.
// T.1 needs real audio instead, which it plays on the DEV-only tone page.

import { TestCase, TestContext, TestStep } from '../types';
import { AudioTestPage, createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import {
  actionStep,
  bookmarkExistingTab,
  closedPanelStep,
  closeTab,
  moveBookmarkSidebar,
  moveTabNative,
  navigateTab,
  openAudioTab,
  openBookmarkTab,
  openPinnedTab,
  openRegularTab,
  playTestAudio,
  switchSpaceVerified,
  ungroupTab,
  ungroupTabWhileClosed,
} from '../actions';
import { assertBookmarkLoaded, assertPinnedLoaded, assertTabAudible, assertTabInSpace, assertTabUngrouped } from '../assertions';
import { resolveSpace, resolveStringRef, resolveTabId, waitFor } from '../stepHelpers';
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
import { PINNED_ITEM_KEY_PREFIX, TAB_ASSOCIATIONS_CHANGED, TabAssociations } from '../../../managers/shared/tabAssociationsApi';
import { TestGateName } from '../../../managers/shared/backgroundTestHooksApi';
import { createTabInSpace } from '../../../utils/tabOperations';

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
  title: 'A tab already playing audio, dragged onto a bookmark, shows the audio indicator',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T1 other', testUrl('t1-other'), 'otherBookmark');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // The DEV-only tone page, which the next step starts (see AudioTestPage)
    openAudioTab({ spaceRef: 'spaceA', tabRef: 'audioTab' }),

    actionStep('Start audio playback in the tone tab', playTestAudio('audioTab'), {
      steps: [
        'Switch to the newly opened test tone tab in Chrome.',
        'Click **Play** and let it play for a second or two - unmuted, a muted tab does not count as audible.',
        'Come back to the sidebar and click Resume below.',
      ],
    }),
    assertTabAudible('audioTab', true),

    // Any change to the mirror will do; this is the ordinary way to cause one
    openBookmarkTab({ bookmarkRef: 'otherBookmark', url: testUrl('t1-other'), spaceRef: 'spaceA', tabRef: 'otherTab' }),

    // What dragging the tab onto the bookmark tree does
    bookmarkExistingTab({ tabRef: 'audioTab', spaceRef: 'spaceA', title: 'T1 audio', url: AudioTestPage.tonePageUrl(), bookmarkRef: 'audioBookmark' }),
    assertTabAudible('audioTab', true),
    assertBookmarkAudible('audioBookmark', true),

    // Closing the tab stops the audio too, so no stop step is needed
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

// =============================================================================
// T.6 - a bookmark dragged onto another space's icon
// =============================================================================

// Dragging a bookmark (or a pinned site) onto a space icon in the space bar
// opens its URL as a new tab in that space, through createTabInSpace. When
// the sidebar creates the tab and then groups it itself, background's
// chrome.tabs.onCreated handling groups the same new tab into the active
// space at the same time, and whichever writer goes second wins (issue N1,
// and docs/decisions/2026-11-23-new-tab-grouping-two-writers.md). The gate
// holds background right after it has read the new tab with no group, so the
// sidebar always finishes first and background then moves the tab out of the
// space it was dropped on.
//
// Once createTabInSpace places the tab through SpaceTabManager.createTabs,
// background's request for the new tab runs after the tab is placed and
// leaves it alone, so the gate is never reached and the tab stays put.
//
// The automated drop calls createTabInSpace directly; in Manual mode the
// tester drags the bookmark for real while the gate is armed, and the case
// finds the tab the drop opened by its URL.
const T6_URL = testUrl('t6');

export const T6_BOOKMARK_DROP_LANDS_IN_TARGET_SPACE: TestCase = {
  id: 'T.6',
  title: 'A bookmark dragged onto another space\'s icon opens in that space',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T6 bookmark', T6_URL, 'bookmark');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    {
      kind: 'action',
      label: 'Hold background just after it reads a new tab',
      run: async () =>
      {
        await armGate(TestGateName.GROUPING_AFTER_TAB_READ);
      },
    },
    actionStep('Drag the bookmark onto space B\'s icon', async (ctx) =>
    {
      // What the space bar's drop calls for a bookmark or a pinned site
      const result = await createTabInSpace(T6_URL, resolveSpace(ctx, 'spaceB').id, ctx.windowId);
      if (result.tab?.id !== undefined) ctx.refs.set('tab', result.tab.id);
      if (!result.success) throw new Error(`createTabInSpace failed: ${result.error}`);
    }, {
      steps: [
        `In the sidebar's bookmark tree, drag "T6 bookmark" onto the "${TEST_SPACE_VIDEO_NAME}" icon in the space bar and drop it there.`,
        'A new tab opens for it - leave it alone.',
        'Click Resume below.',
      ],
    }),
    {
      kind: 'action',
      label: 'Let background go on',
      run: async (ctx) =>
      {
        const gate = TestGateName.GROUPING_AFTER_TAB_READ;

        // Give background's request for the new tab a moment to reach the
        // gate, if it is going to, so releasing it lets it act. It never
        // arrives once the tab is placed in one job, which is fine.
        try { await waitForGate(gate, 500); }
        catch { /* not held */ }
        await releaseGate(gate);

        // In Manual mode the tab came from the tester's drop, so find it
        if (!ctx.refs.has('tab'))
        {
          const [tab] = await chrome.tabs.query({ windowId: ctx.windowId, url: T6_URL });
          if (tab?.id === undefined) throw new Error(`no tab on ${T6_URL} - did the drop open one?`);
          ctx.refs.set('tab', tab.id);
        }
      },
    },
    assertTabInSpace('tab', 'spaceB'),
  ],
};

// ---------------------------------------------------------------------------
// T.7 and T.8: bookmark tabs after a browser restart. A restart empties the
// tab-space registry with the rest of session storage, and the startup
// restore links each tab to its bookmark again from the local backup.
// forgetTabAssociationSession empties the registry the same way a restart
// does, so these cases see what a real restart leaves behind.
//
// - T.7 and T.7b (G3): a restored tab that leaves its group must be unlinked.
//   Background can tell that from the link alone.
// - T.8 to T.8f (G4): a restored tab that moves into another space's group
//   must be unlinked. Background only learns the new group, so it needs the
//   tab's registered space, which the restore has to register again.
// ---------------------------------------------------------------------------

const pinnedKey = (pinnedId: string) => `${PINNED_ITEM_KEY_PREFIX}${pinnedId}`;

// The local storage key of a window's association backup. Mirrors backupKey
// in managers/impl/tabAssociationManager.ts, which does not export it.
const backupStorageKey = (windowId: number) => `tabAssociationsBackup_${windowId}`;

/**
 * Wait until the backup entry for an item names the tab (and, with url, has
 * that url). Reads go through background's backup queue, so once this
 * returns, every backup save queued before the read has landed - including a
 * registration's, which follows the association's own save.
 */
function settleBackupEntry(opts: { itemKey: (ctx: TestContext) => string; tabRef: string; url?: string }): TestStep
{
  return {
    kind: 'assert',
    label: `Precondition: the backup entry names tab "${opts.tabRef}"${opts.url ? ` at ${opts.url}` : ''}`,
    run: async (ctx) =>
    {
      const key = opts.itemKey(ctx);
      const tabId = resolveTabId(ctx, opts.tabRef);
      let entry: unknown;
      await waitFor(async () =>
      {
        const found = (await readTabAssociationBackup(ctx.windowId))[key];
        entry = found;
        return found?.tabId === tabId && (opts.url === undefined || found.url === opts.url);
      }, 3000, () => `expected the backup entry ${key} to name tab ${tabId}${opts.url ? ` at ${opts.url}` : ''}, got ${JSON.stringify(entry)}`);
    },
  };
}

const bookmarkEntry = (bookmarkRef: string) => (ctx: TestContext) => bookmarkKey(resolveStringRef(ctx, bookmarkRef));
const pinnedEntry = (pinRef: string) => (ctx: TestContext) => pinnedKey(resolveStringRef(ctx, pinRef));

/** What a browser restart does to the links: session state is gone, then the startup restore runs from the backup. */
function simulateRestart(): TestStep[]
{
  return [
    {
      kind: 'action',
      label: 'Clear this window\'s live associations and tab-space registry, keeping the backup (as a restart does)',
      run: async (ctx) =>
      {
        await forgetTabAssociationSession(ctx.windowId);
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
  ];
}

export const T7_RESTORE_THEN_UNGROUP: TestCase = {
  id: 'T.7',
  title: 'After a restart, a restored bookmark tab is unlinked when it is ungrouped',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T7 bookmark', testUrl('t7'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps the space's group alive whatever happens to the bookmark tab
    openRegularTab({ url: testUrl('t7-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t7'), spaceRef: 'spaceA', tabRef: 'tab' }),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),
    assertTabInSpace('tab', 'spaceA'),

    ungroupTab('tab'),
    assertTabUngrouped('tab'),
    assertBookmarkLoaded('bm', false),
  ],
};

// T.7 with the sidebar closed when the tab leaves its group, so only
// background can unlink it
export const T7B_RESTORE_THEN_UNGROUP_PANEL_CLOSED: TestCase = {
  id: 'T.7b',
  title: 'After a restart, a restored bookmark tab ungrouped while the sidebar is closed is unlinked',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T7b bookmark', testUrl('t7b'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('t7b-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t7b'), spaceRef: 'spaceA', tabRef: 'tab' }),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),

    closedPanelStep('Ungroup the restored bookmark tab, panel closed', ungroupTabWhileClosed('tab'), {
      steps: [
        'Close the sidebar panel (Cmd+Shift+E or the toolbar icon).',
        `In Chrome's own tab strip, right-click the tab for "${testUrl('t7b')}" → Remove from group.`,
        'Reopen the sidebar panel to resume.',
      ],
    }),
    assertTabUngrouped('tab'),
    assertBookmarkLoaded('bm', false),
  ],
};

export const T8_RESTORE_THEN_MOVE_TO_OTHER_SPACE: TestCase = {
  id: 'T.8',
  title: 'After a restart, a restored bookmark tab is unlinked when it moves to another space\'s group',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T8 bookmark', testUrl('t8'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('t8-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t8'), spaceRef: 'spaceA', tabRef: 'tab' }),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),

    // The same check as A.2, on a tab the restore linked
    moveTabNative({ tabRef: 'tab', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('tab', 'spaceB'),
    assertBookmarkLoaded('bm', false),
  ],
};

// The backup entry is saved again when the tab navigates, and that save must
// keep the tab's space, or the restore has nothing to register
export const T8B_NAVIGATE_THEN_RESTORE: TestCase = {
  id: 'T.8b',
  title: 'A bookmark tab that navigated before a restart is unlinked when it moves to another space\'s group after it',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T8b bookmark', testUrl('t8b'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('t8b-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t8b'), spaceRef: 'spaceA', tabRef: 'tab' }),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),

    // Navigating within the site keeps the link, and saves the entry again
    navigateTab('tab', testUrl('t8b-next')),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab', url: testUrl('t8b-next') }),
    assertBookmarkLoaded('bm', true),

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),

    moveTabNative({ tabRef: 'tab', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('tab', 'spaceB'),
    assertBookmarkLoaded('bm', false),
  ],
};

// The restore must register the space the tab is in when the restart
// happens, not the one it was first opened in. If it registered space A, the
// tab moving into space A's group would look like no change, and the
// bookmark, which now lives in space B, would stay loaded there.
export const T8C_MOVED_BOOKMARK_THEN_RESTORE: TestCase = {
  id: 'T.8c',
  title: 'A bookmark moved to another space before a restart is restored with its new space',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T8c bookmark', testUrl('t8c'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps space A's group alive after the bookmark tab leaves it
    openRegularTab({ url: testUrl('t8c-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t8c'), spaceRef: 'spaceA', tabRef: 'tab' }),

    moveBookmarkSidebar({ bookmarkRef: 'bm', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('tab', 'spaceB'),
    assertBookmarkLoaded('bm', true),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),

    // Back into space A's group, which is no longer the bookmark's space
    moveTabNative({ tabRef: 'tab', targetSpaceRef: 'spaceA' }),
    assertTabInSpace('tab', 'spaceA'),
    assertBookmarkLoaded('bm', false),
  ],
};

// Guards the other direction: moving a restored tab's bookmark to another
// space through the sidebar must not unlink it, since the sidebar registers
// the new space before it regroups the tab. After that, the tab moving back
// into its old space's group leaves the bookmark's space.
export const T8D_RESTORE_THEN_MOVE_BOOKMARK: TestCase = {
  id: 'T.8d',
  title: 'After a restart, moving a restored bookmark to another space keeps its tab linked',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T8d bookmark', testUrl('t8d'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    // Keeps space A's group alive after the bookmark tab leaves it
    openRegularTab({ url: testUrl('t8d-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t8d'), spaceRef: 'spaceA', tabRef: 'tab' }),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),

    moveBookmarkSidebar({ bookmarkRef: 'bm', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('tab', 'spaceB'),
    assertBookmarkLoaded('bm', true),

    moveTabNative({ tabRef: 'tab', targetSpaceRef: 'spaceA' }),
    assertTabInSpace('tab', 'spaceA'),
    assertBookmarkLoaded('bm', false),
  ],
};

// A pinned site's tab is never tied to a space, and the restore must not
// register one for it. If it did, moving the tab into another space's group
// would unlink it, which A.4 says must not happen.
export const T8E_RESTORE_PINNED_THEN_GROUP: TestCase = {
  id: 'T.8e',
  title: 'After a restart, a restored pinned-site tab stays linked when it is grouped',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
    await createTestPinnedSite(getCtx, 'T8e pin', testUrl('t8e-pin'), 'pin');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openPinnedTab({ pinRef: 'pin', url: testUrl('t8e-pin'), tabRef: 'pinTab' }),
    settleBackupEntry({ itemKey: pinnedEntry('pin'), tabRef: 'pinTab' }),

    ...simulateRestart(),
    assertPinnedLoaded('pin', true),

    moveTabNative({ tabRef: 'pinTab', targetSpaceRef: 'spaceB' }),
    assertTabInSpace('pinTab', 'spaceB'),
    assertPinnedLoaded('pin', true),
  ],
};

// A backup saved before entries recorded their space has no space to
// register. The restore must still link the tab, the same as it always has.
export const T8F_RESTORE_ENTRY_WITHOUT_SPACE: TestCase = {
  id: 'T.8f',
  title: 'The restore still links a tab whose backup entry records no space',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestBookmark(getCtx(), 'spaceA', 'T8f bookmark', testUrl('t8f'), 'bm');
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('t8f-dummy'), spaceRef: 'spaceA', tabRef: 'dummyTab' }),
    openBookmarkTab({ bookmarkRef: 'bm', url: testUrl('t8f'), spaceRef: 'spaceA', tabRef: 'tab' }),
    settleBackupEntry({ itemKey: bookmarkEntry('bm'), tabRef: 'tab' }),
    {
      kind: 'action',
      label: 'Remove the space from the bookmark\'s backup entry, as an older version saved it',
      run: async (ctx) =>
      {
        const storageKey = backupStorageKey(ctx.windowId);
        const itemKey = bookmarkEntry('bm')(ctx);
        const backup = (await chrome.storage.local.get(storageKey))[storageKey] as Record<string, Record<string, unknown>> | undefined;
        if (!backup?.[itemKey]) throw new Error(`no backup entry ${itemKey} under ${storageKey}`);
        delete backup[itemKey].spaceId;
        await chrome.storage.local.set({ [storageKey]: backup });
      },
    },

    ...simulateRestart(),
    assertBookmarkLoaded('bm', true),
    assertTabInSpace('tab', 'spaceA'),
  ],
};

export const SECTION_T_CASES: TestCase[] = [
  T1_PLAYING_TAB_ONTO_BOOKMARK,
  T2_OPEN_SURVIVES_REJECTED_ASSOCIATION,
  T3_STALE_BROADCAST_KEEPS_LIVE_INFO,
  T4_RESTORE_SKIPS_TAKEN_TAB_IN_BACKUP,
  T5_INDEX_REFRESH_AFTER_RETARGET,
  T6_BOOKMARK_DROP_LANDS_IN_TARGET_SPACE,
  T7_RESTORE_THEN_UNGROUP,
  T7B_RESTORE_THEN_UNGROUP_PANEL_CLOSED,
  T8_RESTORE_THEN_MOVE_TO_OTHER_SPACE,
  T8B_NAVIGATE_THEN_RESTORE,
  T8C_MOVED_BOOKMARK_THEN_RESTORE,
  T8D_RESTORE_THEN_MOVE_BOOKMARK,
  T8E_RESTORE_PINNED_THEN_GROUP,
  T8F_RESTORE_ENTRY_WITHOUT_SPACE,
];
