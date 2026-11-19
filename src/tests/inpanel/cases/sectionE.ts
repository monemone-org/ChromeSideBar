// Section E - Restart / reload durability.
// docs/test/tab-space-association-test-cases.md#section-e---restart--reload-durability

import { TestCase, TestStep } from '../types';
import { tabHistoryManagerProxy } from '../../../managers/proxies/tabHistoryManagerProxy';
import { resolveTabId } from '../stepHelpers';
import { createTestBookmark, createTestPinnedSite, createTestSpace, TEST_SPACE_VIDEO_NAME, TEST_SPACE_WORK_NAME, testUrl } from '../fixtures';
import { activateTabNative, closeTesterWindow, navigateTabHistory, openAudioTab, openBookmarkTab, openPageForTester, openPinnedTab, openRegularTab, pause, playTestAudio, stopTestAudio, switchSpaceVerified } from '../actions';
import { assertAudioListIncludes, assertBookmarkLoaded, assertPinnedLoaded, assertTabActive, assertTabAudible, assertTabInSpace } from '../assertions';

// The runner's pause/resume checkpoint (runner.ts) persists to
// chrome.storage.local rather than .session specifically because of this
// case: running it confirms that a "Reload" from chrome://extensions wipes
// .session, unlike a sidebar close/reopen. E.2 (full browser quit/relaunch)
// is left
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

    openPageForTester({ url: 'chrome://extensions', ref: 'extensionsTab' }),
    pause(
      'Manual step: reload the extension',
      [
        'In the `chrome://extensions` tab that just opened, find this extension and click its **reload** button (circular arrow icon).',
        'Reopen the sidebar panel to resume.',
      ],
      { external: 'reload-extension' }
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

/**
 * Read background's own history for this window and check what Previous would
 * go back to, before actually pressing it.
 *
 * Without this, a failed "audioTab is active" assertion has three possible
 * causes that look identical: the history was never restored after the
 * restart, it was restored but points somewhere else, or navigation itself is
 * broken. This separates the first two by naming what background actually
 * holds.
 */
function assertPreviousHistoryEntry(tabRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Background's history has "${tabRef}" as the previous entry`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const history = await tabHistoryManagerProxy.getHistoryDetails(ctx.windowId);
      // getHistoryDetails lists `before` most recent first (the order the
      // Previous dropdown shows), so the entry Previous goes to is the first
      const previous = history.before[0];

      if (!previous)
      {
        throw new Error(`background has no earlier entry for this window (currentIndex ${history.currentIndex}, `
          + `${history.before.length} before / ${history.after.length} after), so Previous has nowhere to go. `
          + 'An empty history here means load() did not restore it - most likely the extension was reloaded rather than the worker stopped');
      }

      if (previous.tabId !== tabId)
      {
        // Oldest first, with the current position marked: `before` is
        // reversed back into stack order so the listing reads left to right
        const describe = (item: { index: number; tabId: number; title: string }) => `${item.index}:${item.tabId} "${item.title}"`;
        const entries = [
          ...[...history.before].reverse().map(describe),
          `${history.currentIndex}: (current)`,
          ...history.after.map(describe),
        ].join(', ');
        throw new Error(`expected the previous entry to be tab ${tabId}, got ${previous.tabId} ("${previous.title}"). `
          + `Full history, oldest first: [${entries}]`);
      }
    },
  };
}

// E.3 - a cold start of the service worker, which is the only time each
// manager's load() runs and refills its in-memory state from session storage.
//
// Why this case exists at all: step 4 of
// docs/decisions/2026-07-30-shared-storage-multiple-writers.md moved both
// TabHistoryManager and LastAudibleTracker out of background.ts, and
// LastAudibleTracker now has to be constructed AFTER TabHistoryManager because
// it holds one. A wiring mistake there is invisible while the worker stays
// warm, since the in-memory maps are already populated.
//
// Why E.1 is not a substitute: "Reload" from chrome://extensions is a fresh
// extension load and wipes chrome.storage.session with it. The runner's own
// resume checkpoint lives in storage.local for exactly that reason (see E.1's
// comment above). Nothing would be left to repopulate, so the case would
// pass whether load() worked or not. Stopping the worker leaves session
// storage alone, which is the condition this case needs - and step 1 after the
// pause checks that assumption rather than trusting it.
//
// Why playback has to be STOPPED before the restart: getAudioTabLists rebuilds
// playingTabIds from each tab's live `audible` flag, so a still-playing tab
// would show up even if the tracker had lost everything. Only a silent tab can
// appear, via historyTabIds, purely because load() restored the list.
export const E3_SERVICE_WORKER_RESTART: TestCase = {
  id: 'E.3',
  title: 'Service worker restart repopulates tab history and audible tracking (guided)',
  setup: async (getCtx) =>
  {
    await createTestSpace(getCtx, { ref: 'spaceA', name: TEST_SPACE_WORK_NAME });
    await createTestSpace(getCtx, { ref: 'spaceB', name: TEST_SPACE_VIDEO_NAME });
  },
  steps: [
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('e3-tab1'), spaceRef: 'spaceA', tabRef: 'tab1' }),
    activateTabNative('tab1'),

    ...switchSpaceVerified('spaceB'),
    // YouTube, or in unattended mode the DEV-only tone page that the two
    // pauses below can start and stop themselves (see AudioTestPage)
    openAudioTab({ spaceRef: 'spaceB', tabRef: 'audioTab' }),

    pause(
      'Manual step: start audio playback',
      [
        'Switch to the newly opened YouTube tab in Chrome.',
        'Press play and let it play for a second or two (unmuted - a muted tab does not count as audible).',
        'Come back to the sidebar and click Resume below.',
      ],
      { auto: playTestAudio('audioTab') }
    ),
    assertTabAudible('audioTab', true),

    pause(
      'Manual step: stop the audio playback',
      [
        'Switch back to the YouTube tab and pause it, so the tab goes silent.',
        'Leave the tab open - it has to survive into the restart.',
        'Come back to the sidebar and click Resume below.',
      ],
      { auto: stopTestAudio('audioTab') }
    ),
    assertTabAudible('audioTab', false),

    // The tracker keeps a silent tab in its list (nothing clears it until the
    // tab closes), so the audio dropdown should still offer it. Checking here
    // as well as after the restart separates "the tracker never had it" from
    // "load() failed to bring it back".
    assertAudioListIncludes(['audioTab']),

    // Leaves history as [tab1, audioTab, tab3] with tab3 current, so one step
    // back after the restart is audioTab.
    ...switchSpaceVerified('spaceA'),
    openRegularTab({ url: testUrl('e3-tab3'), spaceRef: 'spaceA', tabRef: 'tab3' }),
    activateTabNative('tab3'),
    assertTabActive('tab3'),

    // Its own window, not a tab here: tab history is kept per window, so a tab
    // in this window would change what Previous goes back to.
    openPageForTester({ url: 'chrome://extensions', ref: 'extensionsWindow', inNewWindow: true }),
    pause(
      'Manual step: stop the service worker (do NOT reload the extension)',
      [
        'In the window that just opened, find this extension and click its **service worker** link - DevTools opens for the worker.',
        'In those DevTools, go to **Application** -> **Service Workers** and click **Stop** - waiting a minute or so for it to idle out works too.',
        'Do NOT click the extension\'s **reload** button - that is a fresh extension load and clears chrome.storage.session, which is exactly what this case needs kept.',
        'Come back to this window by clicking inside the sidebar, not a tab, and click Resume below.',
      ],
      { external: 'stop-service-worker' }
    ),
    // The first proxy call wakes the worker, which runs load() on every
    // manager before the router dispatches anything. Reading the history
    // before pressing Previous says whether load() restored it, separately
    // from whether navigation works.
    assertPreviousHistoryEntry('audioTab'),
    navigateTabHistory('prev'),
    assertTabActive('audioTab'),

    // Same restart, the other manager. The tab is silent, so the only way it
    // can be listed is LastAudibleTracker.load() having restored the list -
    // which also means the construction order held, since this call reaches
    // through the tracker into the history manager for its sort order.
    assertAudioListIncludes(['audioTab']),

    // Closed last, not straight after the pause: closing a window moves
    // Chrome's focus back to this one, and everything above is measuring this
    // window's tab activity.
    closeTesterWindow('extensionsWindow'),
  ],
};

export const SECTION_E_CASES: TestCase[] = [
  E1_RELOAD_EXTENSION,
  E3_SERVICE_WORKER_RESTART,
];
