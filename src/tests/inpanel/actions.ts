// Action-step vocabulary for the in-panel test runner. Each factory returns a
// TestStep whose run() performs one real chrome.*/hook call - no simulated
// clicks, same philosophy as src/tests/closeTabActionTest.ts. "Native" and
// "Sidebar" variants of the same move exist because the test doc explicitly
// asks to check both (they may not be equally instrumented) - see Section A's
// intro in docs/test/tab-space-association-test-cases.md.

import { getOrCreateSpaceGroup, moveTabToSpace, regroupAssociatedTab } from '../../utils/tabOperations';
import { FollowActiveTabMode, FOLLOW_ACTIVE_TAB_KEY } from '../../utils/followActiveTab';
import { BookmarkOpenMode } from '../../components/SettingsDialog';
import { ClosedPanelRunner, ManualStep, PauseOptions, SavedRefs, StepRunner, TestContext, TestStep } from './types';
import { getScrollContainer, resolveSpace, resolveStringRef, resolveTabId, resolveTabRowSelector, SimulatedMouse, sleep, waitFor } from './stepHelpers';
import { assertSidebarShowsSpace } from './assertions';
import { spaceTabManagerProxy } from '../../managers/proxies/spaceTabManagerProxy';
import { ARC_SHOW_TAB_TITLE_WHEN_DRIFTED_KEY, AudioTestPage, BOOKMARK_OPEN_MODE_KEY, testUrl } from './fixtures';
import { DEV_TEST_RUN_COMMAND_ACTION, DevTestRunCommandMessage, DevTestRunCommandReply } from '../../utils/devTestCommand';
import { TEST_AUDIO_CONTROL_ACTION, TestAudioCommand, TestAudioControlMessage, TestAudioControlReply } from './testAudioProtocol';
import { tabHistoryManagerProxy } from '../../managers/proxies/tabHistoryManagerProxy';
import { TabHistoryItem } from '../../managers/shared/tabHistoryManagerApi';
import { TAB_HISTORY_HOLD_MS } from '../../utils/tabHistoryHold';
import { lastAudibleTrackerProxy } from '../../managers/proxies/lastAudibleTrackerProxy';

/** Set the "Follow active tab" mode via the same chrome.storage.local key Settings writes - background.ts (space-switch) and useFollowActiveTab (scroll) both read this key directly, so this is the real setting, not a UI simulation. */
export function setFollowActiveTabMode(mode: FollowActiveTabMode): TestStep
{
  return {
    kind: 'action',
    label: `Set "Follow active tab" to "${mode}"`,
    run: async () =>
    {
      await chrome.storage.local.set({ [FOLLOW_ACTIVE_TAB_KEY]: mode });
    },
  };
}

/** Set the "Open bookmarks" mode via the same chrome.storage.local key Settings writes - App.tsx's useChromeLocalStorage picks the change up through chrome.storage.onChanged, so this is the real setting, not a UI simulation. */
export function setBookmarkOpenMode(mode: BookmarkOpenMode): TestStep
{
  return {
    kind: 'action',
    label: `Set "Open bookmarks" to "${mode}"`,
    run: async () =>
    {
      await chrome.storage.local.set({ [BOOKMARK_OPEN_MODE_KEY]: mode });
    },
  };
}

/** Set "Show tab title after navigating away" via the same chrome.storage.local key (and 'true'/'false' string format) Settings writes. */
export function setArcShowTabTitleWhenDrifted(enabled: boolean): TestStep
{
  return {
    kind: 'action',
    label: `Set "Show tab title after navigating away" to ${enabled ? 'on' : 'off'}`,
    run: async () =>
    {
      await chrome.storage.local.set({ [ARC_SHOW_TAB_TITLE_WHEN_DRIFTED_KEY]: enabled.toString() });
    },
  };
}

/** Activate a tab via the raw chrome.tabs API - fires the same chrome.tabs.onActivated event a native tab-strip click would, no simulated click needed. */
export function activateTabNative(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Activate tab "${tabRef}" (native)`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      await chrome.tabs.update(tabId, { active: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Section C.2 "explicit action" triggers. Each sends the exact message its
// toolbar button sends, so they run the real production path rather than a
// copy of it. All of them bottom out in background.ts's setActiveTabAndSpace
// (history navigation reaches it via historyManager.navigate/navigateToIndex),
// which switches space regardless of the "Follow active tab" setting and
// broadcasts TAB_ACTIVATED with explicit:true - that flag is what makes
// useFollowActiveTab scroll even under 'off' mode.
// ---------------------------------------------------------------------------

/** The "Show active tab" toolbar button (Toolbar.tsx, via useShowActiveTab). */
export function showActiveTab(): TestStep
{
  return {
    kind: 'action',
    label: 'Click "Show active tab" (toolbar)',
    run: async (ctx) =>
    {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId: ctx.windowId });
      if (activeTab?.id === undefined) throw new Error('no active tab in the test window');
      await chrome.runtime.sendMessage({ action: 'set-active-tab-and-space', tabId: activeTab.id });
    },
  };
}

/** The toolbar's tab-history Previous/Next buttons (Toolbar.tsx). */
export function navigateTabHistory(direction: 'prev' | 'next'): TestStep
{
  return {
    kind: 'action',
    label: `Click tab history "${direction === 'prev' ? 'Previous' : 'Next'}" (toolbar)`,
    run: async (ctx) =>
    {
      await tabHistoryManagerProxy.navigate(ctx.windowId, direction === 'prev' ? -1 : 1);
    },
  };
}

/**
 * The audio quick-jump button (App.tsx's handleJumpToAudioTab). Goes through
 * lastAudibleTrackerProxy.getAudioTabLists and jumps to whatever IT names, rather than passing a
 * tab id the case already knows - picking the target is the whole job of this
 * button, so short-cutting it would leave the audible tracking untested and
 * make the case a duplicate of C.2a.
 */
export function audioQuickJump(): TestStep
{
  return {
    kind: 'action',
    label: 'Click the audio quick-jump button (toolbar)',
    run: async (ctx) =>
    {
      const { playingTabIds, historyTabIds } = await lastAudibleTrackerProxy.getAudioTabLists(ctx.windowId);

      const targetTabId = playingTabIds[0] ?? historyTabIds[0];
      if (targetTabId === undefined) throw new Error('background reports no audible tab - did the "click Play" step actually start playback?');

      await chrome.runtime.sendMessage({ action: 'set-active-tab-and-space', tabId: targetTabId, skipHistory: false });
    },
  };
}

/**
 * Pick one specific entry out of the audio tabs dropdown
 * (AudioTabsDropdown.tsx's handleSelectTab). Unlike audioQuickJump, which
 * always takes the most recent, this targets a named tab - so it first
 * confirms that tab is actually one of the entries the dropdown would list,
 * then activates it the same way clicking the row does.
 */
export function selectAudioTabFromDropdown(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Select tab "${tabRef}" from the audio tabs dropdown`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const { playingTabIds, historyTabIds } = await lastAudibleTrackerProxy.getAudioTabLists(ctx.windowId);

      const listed = [...playingTabIds, ...historyTabIds];
      if (!listed.includes(tabId)) throw new Error(`tab "${tabRef}" (id ${tabId}) isn't in the audio dropdown's list - it wouldn't be selectable`);

      await chrome.runtime.sendMessage({ action: 'set-active-tab-and-space', tabId, skipHistory: false });
    },
  };
}

/**
 * Pick one specific entry out of the tab-history dropdown (press-and-hold
 * Previous/Next). Resolves the target's position through the real
 * tabHistoryManagerProxy.getHistoryDetails response rather than assuming an
 * index, the same way
 * Toolbar.tsx renders the dropdown from that response and then navigates by
 * the chosen entry's index - so this fails loudly if the tab isn't actually
 * in the window's history, instead of silently navigating somewhere else.
 */
export function selectTabFromHistoryDropdown(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Select tab "${tabRef}" from the tab-history dropdown`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const history = await tabHistoryManagerProxy.getHistoryDetails(ctx.windowId);

      const entries = [...history.before, ...history.after];
      const entry = entries.find(e => e.tabId === tabId);
      if (!entry) throw new Error(`tab "${tabRef}" (id ${tabId}) is not in the window's tab history`);

      await tabHistoryManagerProxy.navigateToIndex(ctx.windowId, entry.index);
    },
  };
}

/**
 * Opens filler tabs in spaceRef, in small parallel batches, until the
 * sidebar's scroll container has at least OVERFLOW_FACTOR viewports of
 * content. Without this, a scroll-into-view assertion right after would
 * trivially pass even with scrolling completely broken, since everything
 * already fits on screen - see assertTabRowVisible's own caveat about
 * needing an off-screen setup to mean anything.
 *
 * OVERFLOW_FACTOR (not merely "any overflow at all"): scrollRowOutOfView
 * below can only honor its contract if SOME scroll position actually hides
 * the target row, and a container overflowing by a single pixel has none.
 * Two full viewports guarantees a row at either extreme can be scrolled
 * clear of the opposite edge.
 *
 * Opens the very first filler tab on its own, awaited, before parallelizing
 * the rest. SpaceTabManager creates and places each filler one at a time in
 * its grouping queue (see createTabInSpaceForTest), so this isn't required
 * for correctness, but seeding the group with a known single tab first keeps
 * this function's own intent unambiguous.
 */
export function openFillerTabsUntilScrollable(spaceRef: string): TestStep
{
  const BATCH_SIZE = 10;
  const MAX_BATCHES = 6;
  const OVERFLOW_FACTOR = 2;
  // Matches openFillerBookmarksUntilScrollable's RENDER_SETTLE_MS below - a
  // filler tab's effect on scrollHeight isn't visible until TabList has
  // re-rendered, which only happens after chrome.tabs.onCreated/onUpdated
  // round-trips back to useTabs' listener and its own 50ms debounce settles.
  // The awaited chrome.tabs.create/group calls above don't cover that, so
  // without this sleep needsMoreContent() keeps reading stale (pre-render)
  // DOM state every batch.
  const RENDER_SETTLE_MS = 200;

  return {
    kind: 'action',
    label: `Open filler tabs in space "${spaceRef}" until the sidebar scrolls`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);
      const container = getScrollContainer();
      const needsMoreContent = () => container.scrollHeight < container.clientHeight * OVERFLOW_FACTOR;

      const openFiller = async (label: string) =>
      {
        await createTabInSpaceForTest(ctx, testUrl(label), space.id);
      };

      let opened = 0;
      await openFiller('filler-seed');
      opened++;

      for (let batch = 0; batch < MAX_BATCHES && needsMoreContent(); batch++)
      {
        await Promise.all(Array.from({ length: BATCH_SIZE }, (_unused, i) => openFiller(`filler-${batch}-${i}`)));
        opened += BATCH_SIZE;
        await sleep(RENDER_SETTLE_MS);
      }

      if (needsMoreContent())
      {
        throw new Error(`sidebar content still under ${OVERFLOW_FACTOR}x viewport after ${opened} filler tabs (scrollHeight=${container.scrollHeight}, clientHeight=${container.clientHeight}) - increase MAX_BATCHES or check the scroll container`);
      }
    },
  };
}

/**
 * Creates filler bookmarks at the TOP of a space's own bookmark folder,
 * until the sidebar has OVERFLOW_FACTOR viewports of content - pushing
 * whatever already lives in that folder (e.g. C.1e's target subfolder) below
 * the fold.
 *
 * Prepends (index: 0) rather than appending, so it pushes existing siblings
 * DOWN regardless of when it runs relative to their creation - the target
 * subfolder is made in the case's setup(), before this step ever executes,
 * so appending would leave the target above the fillers and change nothing.
 *
 * Exists because a bookmark row lands near the TOP of BookmarkTree, so
 * unlike a tab row at the bottom of a long TabList (C.1b/C.1d), it would be
 * trivially visible at scroll position 0 - making a later "did it scroll to
 * the bookmark" assertion pass whether or not any scrolling happened.
 * Creates serially, with a settle between batches, because each batch's
 * effect on scrollHeight is only measurable once BookmarkTree has re-rendered.
 */
export function openFillerBookmarksUntilScrollable(spaceRef: string): TestStep
{
  const BATCH_SIZE = 10;
  const MAX_BATCHES = 6;
  const OVERFLOW_FACTOR = 2;
  const RENDER_SETTLE_MS = 200;

  return {
    kind: 'action',
    label: `Create filler bookmarks in space "${spaceRef}" until the sidebar scrolls`,
    run: async (ctx) =>
    {
      const folderId = resolveStringRef(ctx, `${spaceRef}:folderId`);
      const container = getScrollContainer();
      const needsMoreContent = () => container.scrollHeight < container.clientHeight * OVERFLOW_FACTOR;

      let created = 0;
      for (let batch = 0; batch < MAX_BATCHES && needsMoreContent(); batch++)
      {
        for (let i = 0; i < BATCH_SIZE; i++)
        {
          await chrome.bookmarks.create({
            parentId: folderId,
            title: `Filler bookmark ${batch}-${i}`,
            url: testUrl(`filler-bookmark-${batch}-${i}`),
            index: 0,
          });
        }
        created += BATCH_SIZE;
        await sleep(RENDER_SETTLE_MS);
      }

      if (needsMoreContent())
      {
        throw new Error(`sidebar content still under ${OVERFLOW_FACTOR}x viewport after ${created} filler bookmarks (scrollHeight=${container.scrollHeight}, clientHeight=${container.clientHeight}) - increase MAX_BATCHES or check the scroll container`);
      }
    },
  };
}

/**
 * Scrolls the sidebar so a specific row ends up OUT of view - the
 * deterministic "anchor" setup every scroll assertion needs to mean
 * anything (see assertTabRowVisible's caveat).
 *
 * Picks the direction itself rather than exposing scroll-to-top and
 * scroll-to-bottom variants for the caller to choose between. That choice
 * depends on where the row rendered, which depends on tab open order, which
 * is in turn dictated by Chrome's tab-strip adjacency rules (see C.1c/C.1d)
 * - two constraints a case author would otherwise have to keep in sync by
 * hand, and reordering tabs for an adjacency fix silently inverted the
 * anchoring exactly once already. Deriving it from the live layout removes
 * that coupling.
 *
 * Verifies the result instead of assuming it: a row that's still visible
 * afterward fails HERE, at the actual cause, rather than surfacing later as
 * a confusing precondition failure.
 */
export function scrollRowOutOfView(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Scroll tab "${tabRef}"'s row out of view`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const selector = resolveTabRowSelector(ctx, tabId);
      const container = getScrollContainer();

      const element = document.querySelector(selector);
      if (!element) throw new Error(`row ${selector} not found in DOM - can't scroll it out of view`);

      // Scroll AWAY from whichever half the row sits in: a row in the top
      // half is hidden by scrolling down, one in the bottom half by
      // scrolling up.
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const rowOffsetInContent = (elementRect.top - containerRect.top) + container.scrollTop;
      const rowIsInTopHalf = rowOffsetInContent < container.scrollHeight / 2;
      container.scrollTop = rowIsInTopHalf ? container.scrollHeight : 0;

      // Re-measure after the scroll (getBoundingClientRect is live, but the
      // reference above was taken pre-scroll) to confirm it actually worked.
      const movedRect = element.getBoundingClientRect();
      const movedMidpoint = (movedRect.top + movedRect.bottom) / 2;
      const stillVisible = movedMidpoint >= containerRect.top && movedMidpoint <= containerRect.bottom;
      if (stillVisible)
      {
        throw new Error(`row ${selector} is still visible after scrolling ${rowIsInTopHalf ? 'down' : 'up'} - not enough content to push it off-screen?`);
      }
    },
  };
}

/** Create a plain tab and (native chrome.tabs.group, not moveTabToSpace) drop it into a space's Chrome group. */
export function openRegularTab(opts: { url: string; spaceRef: string; tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Open regular tab ${opts.url} in space "${opts.spaceRef}"`,
    run: async (ctx) =>
    {
      await openTabInSpace(ctx, opts.url, opts.spaceRef, opts.tabRef);
    },
  };
}

/**
 * Opens a tab already placed in a space, through the same SpaceTabManager
 * job the product uses for a tab the sidebar wants somewhere specific. Doing
 * it in two steps here (create, then group) raced background's own grouping
 * of the new tab - see docs/test/issues/N1-no-group-with-id-when-adding-tab-to-space.md.
 */
async function openTabInSpace(ctx: TestContext, url: string, spaceRef: string, tabRef: string): Promise<void>
{
  const tabId = await createTabInSpaceForTest(ctx, url, resolveSpace(ctx, spaceRef).id);
  ctx.refs.set(tabRef, tabId);
}

/** One tab, created and placed in a space by SpaceTabManager. Returns its id. */
async function createTabInSpaceForTest(ctx: TestContext, url: string, spaceId: string): Promise<number>
{
  const { tabIds } = await spaceTabManagerProxy.createTabs(ctx.windowId, [{ url }], { kind: 'space', spaceId });
  if (tabIds.length === 0) throw new Error(`SpaceTabManager.createTabs opened no tab for ${url}`);
  return tabIds[0];
}

/**
 * openRegularTab for the audio cases: opens the DEV-only tone page (see
 * AudioTestPage).
 */
export function openAudioTab(opts: { spaceRef: string; tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Open the test tone page in space "${opts.spaceRef}"`,
    run: async (ctx) =>
    {
      await openTabInSpace(ctx, AudioTestPage.tonePageUrl(), opts.spaceRef, opts.tabRef);
    },
  };
}

/** Open a bookmark as a live tab via the same association path the bookmark tree uses. */
export function openBookmarkTab(opts: { bookmarkRef: string; url: string; spaceRef?: string; tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Open bookmark tab for "${opts.bookmarkRef}"`,
    run: async (ctx) =>
    {
      await openBookmarkTabAt(ctx, opts.bookmarkRef, opts.url, opts.spaceRef, opts.tabRef);
    },
  };
}

async function openBookmarkTabAt(ctx: TestContext, bookmarkRef: string, url: string, spaceRef: string | undefined, tabRef: string): Promise<void>
{
  const bookmarkId = resolveStringRef(ctx, bookmarkRef);
  const spaceId = spaceRef ? resolveSpace(ctx, spaceRef).id : undefined;
  const tabId = await ctx.openBookmarkTab(bookmarkId, url, spaceId);
  if (tabId === undefined) throw new Error('openBookmarkTab did not return a tab id');
  ctx.refs.set(tabRef, tabId);
}

/**
 * openBookmarkTab for an audio bookmark, whose URL (the tone page's, see
 * AudioTestPage) is only known at run time - so it opens whatever the
 * bookmark itself points at rather than a URL fixed when the steps were built.
 */
export function openAudioBookmarkTab(opts: { bookmarkRef: string; spaceRef?: string; tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Open audio bookmark tab for "${opts.bookmarkRef}"`,
    run: async (ctx) =>
    {
      const [bookmark] = await chrome.bookmarks.get(resolveStringRef(ctx, opts.bookmarkRef));
      if (!bookmark?.url) throw new Error(`bookmark "${opts.bookmarkRef}" has no URL to open`);
      await openBookmarkTabAt(ctx, opts.bookmarkRef, bookmark.url, opts.spaceRef, opts.tabRef);
    },
  };
}

/** Open a pinned site as a live tab. */
export function openPinnedTab(opts: { pinRef: string; url: string; tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Open pinned tab for "${opts.pinRef}"`,
    run: async (ctx) =>
    {
      const pinnedId = resolveStringRef(ctx, opts.pinRef);
      const tabId = await ctx.openPinnedTab(pinnedId, opts.url);
      if (tabId === undefined) throw new Error('openPinnedTab did not return a tab id');
      ctx.refs.set(opts.tabRef, tabId);
    },
  };
}

/**
 * Move a tab's Chrome group directly, calling the same getOrCreateSpaceGroup
 * helper moveTabToSpace uses rather than going through the extension's own
 * moveTabToSpace function itself - meant to mirror a native right-click "Add
 * tab to group" / drag. Honesty check: since both this and moveTabSidebar
 * bottom out in the same helper, this step currently produces an identical
 * event to moveTabSidebar - it verifies background.ts reacts correctly to a
 * group-membership change regardless of who caused it, but does NOT catch a
 * future divergence between the two paths on its own. Chrome reports a drag
 * in its own tab strip to background as the same group-change events, which
 * is why the closed-panel steps (A.3) use the API too.
 */
export function moveTabNative(opts: { tabRef: string; targetSpaceRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Move tab "${opts.tabRef}" to space "${opts.targetSpaceRef}" (native)`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, opts.tabRef);
      const space = resolveSpace(ctx, opts.targetSpaceRef);
      await getOrCreateSpaceGroup(tabId, space, ctx.windowId);
    },
  };
}

/**
 * Create a tab the way Cmd+T does: active, and with no grouping of its own.
 * Unlike openRegularTab, which puts the tab into a space's group itself, this
 * leaves grouping entirely to background's chrome.tabs.onCreated listener -
 * the path under test when a brand-new tab should join the active space.
 */
export function openNewTabNative(opts: { url: string; tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Open a new tab ${opts.url} (native, like Cmd+T)`,
    run: async (ctx) =>
    {
      const tab = await chrome.tabs.create({ url: opts.url, active: true, windowId: ctx.windowId });
      if (tab.id === undefined) throw new Error('chrome.tabs.create did not return an id');
      ctx.refs.set(opts.tabRef, tab.id);
    },
  };
}

/** A bookmark row's "Move To Tabs" menu item (BookmarkTree.tsx): breaks the bookmark's association with its tab, leaving the tab open. */
export function moveBookmarkTabToTabs(bookmarkRef: string): TestStep
{
  return {
    kind: 'action',
    label: `"Move To Tabs" on bookmark "${bookmarkRef}"`,
    run: async (ctx) =>
    {
      ctx.deassociateBookmarkTab(resolveStringRef(ctx, bookmarkRef));
    },
  };
}

/** Move a tab to a space via the sidebar's own tab-row "Move to Space" action (src/utils/tabOperations.ts). */
export function moveTabSidebar(opts: { tabRef: string; targetSpaceRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Move tab "${opts.tabRef}" to space "${opts.targetSpaceRef}" (sidebar method)`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, opts.tabRef);
      const space = resolveSpace(ctx, opts.targetSpaceRef);
      const outcome = await moveTabToSpace(tabId, space.id, ctx.spaces, ctx.windowId);
      if (!outcome.success) throw new Error(outcome.error ?? 'moveTabToSpace failed');
    },
  };
}

export function switchSpace(spaceRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Switch sidebar to space "${spaceRef}"`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);
      ctx.switchToSpace(space.id);
    },
  };
}

/**
 * switchSpace() plus a verification that the switch actually took - use
 * `...switchSpaceVerified(ref)` (spread) in a case's steps array. Prefer this
 * over a bare switchSpace(): unchecked, a silently broken switchToSpace()
 * leaves all 17+ call sites across Section A/B/D green regardless.
 */
export function switchSpaceVerified(spaceRef: string): TestStep[]
{
  return [switchSpace(spaceRef), assertSidebarShowsSpace(spaceRef)];
}

/** Rename a space - same updateSpace() call Settings/"Edit Space" uses, which also syncs the Chrome group's title. */
export function renameSpace(spaceRef: string, newName: string): TestStep
{
  return {
    kind: 'action',
    label: `Rename space "${spaceRef}" to "${newName}"`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);
      await ctx.updateSpace(space.id, { name: newName });
    },
  };
}

/** Navigate a tab to another URL via the raw chrome.tabs API - fires the same chrome.tabs.onUpdated url/favicon changes clicking a link in the page would. */
export function navigateTab(tabRef: string, url: string): TestStep
{
  return {
    kind: 'action',
    label: `Navigate tab "${tabRef}" to ${url}`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      await chrome.tabs.update(tabId, { url });
    },
  };
}

export function closeTab(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Close tab "${tabRef}"`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      await chrome.tabs.remove(tabId);
    },
  };
}

/**
 * Pause for something only Chrome itself or a person can do, rendering
 * `steps` as a numbered list rather than one run-on paragraph. TestRunnerPanel's paused banner renders each "N. " line on its own row, dims
 * anything after a " - " as an explanation/aside, and turns chrome://... mentions into
 * clickable links - see renderPausedLine there.
 *
 * Pass `confirm` when the step asks the tester to JUDGE something the runner
 * cannot observe - whether a favicon rendered, whether a dropdown appeared.
 * The banner then offers Pass/Fail plus a note box instead of a single Resume
 * button, and the answer is recorded as a result under that question. Leave it
 * off for a pause that only asks for an action to be carried out.
 *
 * The third argument is either that confirm question on its own or an
 * options object, which can instead carry `external` for an action the
 * driver script performs from outside the extension (see PauseOptions in
 * types.ts). The written steps are what a tester follows when the driver is
 * not running the suite.
 *
 * Anything the panel can do itself belongs in an action or assert step, and
 * anything that must happen with the sidebar unloaded in a closedPanel step,
 * not in a pause.
 */
export function pause(label: string, steps: string[], options?: string | PauseOptions): TestStep
{
  const instruction = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const resolved: PauseOptions = typeof options === 'string' ? { confirm: options } : options ?? {};
  return { kind: 'pause', label, instruction, ...resolved };
}

/**
 * An action step whose work is a StepRunner built elsewhere, such as the
 * stand-ins below. `manual` is how a tester does the same with real input,
 * for the runner's Manual mode (see ManualStep in types.ts).
 */
export function actionStep(label: string, run: StepRunner, manual?: ManualStep): TestStep
{
  return { kind: 'action', label, run, manual };
}

/** An assert step whose check is a StepRunner built elsewhere, such as the gesture checks below. `manual` as for actionStep. */
export function assertStep(label: string, run: StepRunner, manual?: ManualStep): TestStep
{
  return { kind: 'assert', label, run, manual };
}

/**
 * A step that runs on the parked page with the sidebar app unloaded - from
 * the extension's side, the same state as a closed panel. See the
 * closed-panel actions below for what `run` can be. `manual` is how a tester
 * closes the panel for real and does the same by hand, for Manual mode.
 */
export function closedPanelStep(label: string, run: ClosedPanelRunner, manual?: ManualStep): TestStep
{
  return { kind: 'closedPanel', label, run, manual };
}

// ---------------------------------------------------------------------------
// Closed-panel actions, for closedPanelStep. These run on the parked page
// (parked.ts), with the sidebar app unloaded, so they get no TestContext:
// only the checkpoint's saved refs, and raw chrome.* calls. Each one mirrors
// the in-panel action of the same effect above (moveTabNative, ungroupTab,
// moveTabToNewWindow, closeTab, deleteBookmarkNative). Chrome reports the
// same tab and bookmark events to background for these calls as for the
// matching gesture in its own tab strip or bookmark manager.
// ---------------------------------------------------------------------------

/** Reads typed ids back out of a checkpoint's saved refs - the closed-panel counterpart of resolveTabId/resolveStringRef. */
class SavedRefReader
{
  constructor(private readonly refs: SavedRefs) {}

  tabId(ref: string): number
  {
    const value = this.refs[ref];
    if (typeof value !== 'number') throw new Error(`no saved tab ref "${ref}" in the checkpoint`);
    return value;
  }

  string(ref: string): string
  {
    const value = this.refs[ref];
    if (typeof value !== 'string') throw new Error(`no saved ref "${ref}" in the checkpoint`);
    return value;
  }
}

/**
 * Add a tab to the existing Chrome group of a test space, found by the
 * space's name in the tab's own window - what dragging the tab into that
 * group in the tab strip does. Same query and chrome.tabs.group call as
 * getOrCreateSpaceGroup's existing-group path (moveTabNative), minus the
 * create branch: every pause using this has opened a dummy tab in the target
 * group first, so a missing group means the case set up the wrong state, and
 * that should fail rather than be papered over.
 */
export function moveTabToSpaceGroupWhileClosed(opts: { tabRef: string; spaceName: string }): ClosedPanelRunner
{
  return async (refs) =>
  {
    const tabId = new SavedRefReader(refs).tabId(opts.tabRef);
    const tab = await chrome.tabs.get(tabId);
    const groups = await chrome.tabGroups.query({ windowId: tab.windowId, title: opts.spaceName });
    if (groups.length === 0) throw new Error(`no "${opts.spaceName}" tab group in window ${tab.windowId} to move tab "${opts.tabRef}" into`);
    await chrome.tabs.group({ tabIds: [tabId], groupId: groups[0].id });
  };
}

/** Remove a tab from its group - right-click "Remove from group" (same call as ungroupTab). */
export function ungroupTabWhileClosed(tabRef: string): ClosedPanelRunner
{
  return async (refs) =>
  {
    await chrome.tabs.ungroup(new SavedRefReader(refs).tabId(tabRef));
  };
}

/** Pop a tab out into its own new window - dragging it out of the tab strip (same call as moveTabToNewWindow). */
export function moveTabToNewWindowWhileClosed(tabRef: string): ClosedPanelRunner
{
  return async (refs) =>
  {
    const tabId = new SavedRefReader(refs).tabId(tabRef);
    const win = await chrome.windows.create({ tabId, focused: false });
    if (win?.id === undefined) throw new Error('chrome.windows.create did not return a window id');
  };
}

/** Close a tab - its X button or Cmd+W (same call as closeTab). */
export function closeTabWhileClosed(tabRef: string): ClosedPanelRunner
{
  return async (refs) =>
  {
    await chrome.tabs.remove(new SavedRefReader(refs).tabId(tabRef));
  };
}

/** Delete a bookmark - Chrome's own bookmark manager calls this same API (same call as deleteBookmarkNative). */
export function removeBookmarkWhileClosed(bookmarkRef: string): ClosedPanelRunner
{
  return async (refs) =>
  {
    await chrome.bookmarks.remove(new SavedRefReader(refs).string(bookmarkRef));
  };
}

// ---------------------------------------------------------------------------
// In-panel stand-ins, for actionStep. These do inside the panel what would
// otherwise need a person: press a shortcut, start or stop audio.
// ---------------------------------------------------------------------------

/**
 * Press a keyboard shortcut - runs background's handleCommand for `command`
 * through its DEV-only "dev-test-run-command" message (see background.ts),
 * the same function chrome.commands.onCommand calls on a real key press. It
 * acts on this panel's window, and background replies only once the command
 * has finished, so the next assertion sees its result. What it cannot cover
 * is the key binding and the listener registration. assertCommandShortcutBound
 * covers the first and assertShortcutListenerRegistered the second, which
 * leaves only Chrome's delivery of the key press itself untested.
 */
export function pressShortcut(command: 'prev-used-tab' | 'next-used-tab'): StepRunner
{
  return async (ctx) =>
  {
    const message: DevTestRunCommandMessage = { action: DEV_TEST_RUN_COMMAND_ACTION, command, windowId: ctx.windowId };
    const reply: DevTestRunCommandReply | undefined = await chrome.runtime.sendMessage(message);
    if (!reply?.ok)
    {
      throw new Error(`background did not run the "${command}" command: ${reply?.error ?? 'no reply - is this a development build?'}`);
    }
  };
}

// How long the tone page gets to load and answer, and then how long Chrome
// gets to flip the tab's `audible` flag. Chrome holds `audible` on for a
// couple of seconds after sound stops, so the stop wait needs the margin too.
const TONE_PAGE_REPLY_TIMEOUT_MS = 10000;
const AUDIBLE_CHANGE_TIMEOUT_MS = 10000;
const AUDIO_POLL_MS = 200;
const AUTOPLAY_HINT = 'Check the profile was started by tools/start-test-chrome.sh, which allows audio to start without a click.';

/** Remote control for the tone page (test-audio.html) open in one test tab. */
class TonePageTab
{
  constructor(private readonly tabRef: string, private readonly tabId: number) {}

  static async resolve(ctx: TestContext, tabRef: string): Promise<TonePageTab>
  {
    const tabId = resolveTabId(ctx, tabRef);
    const tab = await chrome.tabs.get(tabId);
    // The tab has navigated away from the tone page: nothing here can play it
    if (!AudioTestPage.isTonePage(tab.url ?? tab.pendingUrl))
    {
      throw new Error(`tab "${tabRef}" is not the test tone page (it is on ${tab.url ?? tab.pendingUrl}), so it cannot be played`);
    }
    return new TonePageTab(tabRef, tabId);
  }

  /**
   * Makes the tab the active one, as the written step's "switch to the tab"
   * does. That is not cosmetic: activation is what puts the tab into
   * background's tab history (tabs.onActivated), which later steps rely on,
   * e.g. E.3's "Previous goes back to the audio tab".
   */
  async activate(): Promise<void>
  {
    await chrome.tabs.update(this.tabId, { active: true });
  }

  /**
   * Sends a play or stop command and waits for the page's answer. The page
   * only starts listening once it has loaded, so a message that finds no
   * receiver is retried until the deadline.
   */
  async send(command: TestAudioCommand): Promise<void>
  {
    const message: TestAudioControlMessage = { action: TEST_AUDIO_CONTROL_ACTION, tabId: this.tabId, command };
    const deadline = Date.now() + TONE_PAGE_REPLY_TIMEOUT_MS;
    let lastProblem = 'no reply';

    // Retry until the page answers or the deadline passes
    while (Date.now() < deadline)
    {
      let reply: TestAudioControlReply | undefined;
      try
      {
        reply = await chrome.runtime.sendMessage(message);
      }
      catch (err)
      {
        lastProblem = err instanceof Error ? err.message : String(err);
      }

      if (reply?.ok) return;
      if (reply && !reply.ok) throw new Error(`the tone page in tab "${this.tabRef}" could not ${command}: ${reply.error}. ${AUTOPLAY_HINT}`);
      await sleep(AUDIO_POLL_MS);
    }
    throw new Error(`the tone page in tab "${this.tabRef}" never answered the ${command} command (${lastProblem}). ${AUTOPLAY_HINT}`);
  }

  /** Polls the tab's `audible` flag until it matches, or the deadline passes. */
  async waitUntilAudible(expected: boolean): Promise<boolean>
  {
    const deadline = Date.now() + AUDIBLE_CHANGE_TIMEOUT_MS;

    // Poll Chrome's own flag - it is what the sidebar's audio features read
    while (Date.now() < deadline)
    {
      const tab = await chrome.tabs.get(this.tabId);
      if ((tab.audible ?? false) === expected) return true;
      await sleep(AUDIO_POLL_MS);
    }
    return false;
  }
}

/**
 * Start audio in each tone-page tab, one after another in the order given:
 * switch to the tab, play, and wait for it to turn audible before moving on to
 * the next - so when order matters (C.2f's "play the Work one first"), the
 * later tab is also the later one activated and the later one to start
 * playing, as in the written steps. The last tab stays active afterwards, as
 * it does for a tester who then just clicks back into the sidebar.
 */
export function playTestAudio(...tabRefs: string[]): StepRunner
{
  return async (ctx) =>
  {
    // One tab at a time, in the order the case asks for
    for (const tabRef of tabRefs)
    {
      const tonePage = await TonePageTab.resolve(ctx, tabRef);
      await tonePage.activate();
      await tonePage.send('play');
      if (!await tonePage.waitUntilAudible(true))
      {
        throw new Error(`playback never started in tab "${tabRef}": the tone page says it is playing, but Chrome did not mark the tab audible within ${AUDIBLE_CHANGE_TIMEOUT_MS / 1000}s. ${AUTOPLAY_HINT}`);
      }
    }
  };
}

/** Switch to a tone-page tab, stop its audio and wait for Chrome to mark it silent. */
export function stopTestAudio(tabRef: string): StepRunner
{
  return async (ctx) =>
  {
    const tonePage = await TonePageTab.resolve(ctx, tabRef);
    await tonePage.activate();
    await tonePage.send('stop');
    if (!await tonePage.waitUntilAudible(false))
    {
      throw new Error(`tab "${tabRef}" was still audible ${AUDIBLE_CHANGE_TIMEOUT_MS / 1000}s after the tone page stopped`);
    }
  };
}

// ---------------------------------------------------------------------------
// Sidebar gestures, for actionStep and assertStep: press-and-hold and click
// on the toolbar's history buttons (C.2g) and dragging a tab row onto a space
// icon (F.1). They go through SimulatedMouse (stepHelpers.ts), which dispatches the
// pointer and mouse events a real mouse would, so the component's own
// handlers, timers and dnd-kit's sensor all run as they do for a person.
// ---------------------------------------------------------------------------

type HistoryDirection = 'prev' | 'next';

// How long the gesture runners wait for each visible effect of a gesture
const GESTURE_EFFECT_TIMEOUT_MS = 3000;
const NAVIGATION_TIMEOUT_MS = 5000;

/**
 * The toolbar's tab-history Previous/Next buttons and the dropdown a
 * press-and-hold opens (Toolbar.tsx), as a tester sees them.
 *
 * The buttons are found by their tooltip ("Previous used tab ... Hold for
 * history"), the dropdown and its rows by the data-testid hooks Toolbar puts
 * on them for this purpose.
 */
class TabHistoryToolbar
{
  // The written instruction's "about half a second": Toolbar opens the
  // dropdown once the button has been held for TAB_HISTORY_HOLD_MS (300ms),
  // and the margin keeps this a hold if that threshold is ever raised
  static readonly #HOLD_MS = TAB_HISTORY_HOLD_MS + 200;

  readonly #mouse = new SimulatedMouse();

  constructor(private readonly windowId: number) {}

  static label(direction: HistoryDirection): string
  {
    return direction === 'prev' ? 'Previous' : 'Next';
  }

  button(direction: HistoryDirection): HTMLElement
  {
    const titlePrefix = direction === 'prev' ? 'Previous used tab' : 'Next used tab';
    const button = document.querySelector<HTMLElement>(`button[title^="${titlePrefix}"]`);
    if (!button) throw new Error(`the toolbar's "${TabHistoryToolbar.label(direction)}" button (title starting "${titlePrefix}") is not in the sidebar`);
    return button;
  }

  openDropdown(direction: HistoryDirection): HTMLElement | null
  {
    return document.querySelector<HTMLElement>(`[data-testid="tab-history-dropdown-${direction}"]`);
  }

  isAnyDropdownOpen(): boolean
  {
    return this.openDropdown('prev') !== null || this.openDropdown('next') !== null;
  }

  /** Press and hold the button for about half a second, then release. */
  async hold(direction: HistoryDirection): Promise<void>
  {
    await this.#mouse.pressAndHold(this.button(direction), TabHistoryToolbar.#HOLD_MS, `the toolbar's "${TabHistoryToolbar.label(direction)}" button`);
  }

  /** Click and release immediately. */
  async quickClick(direction: HistoryDirection): Promise<void>
  {
    await this.#mouse.click(this.button(direction), `the toolbar's "${TabHistoryToolbar.label(direction)}" button`);
  }

  /**
   * Click where the button is drawn, landing on whatever covers it - while
   * the dropdown is open, that is the menu's full-panel overlay.
   */
  async clickWhereButtonIs(direction: HistoryDirection): Promise<void>
  {
    await this.#mouse.clickWhereDrawn(this.button(direction));
  }

  async waitForDropdown(direction: HistoryDirection): Promise<HTMLElement>
  {
    return waitFor(() => this.openDropdown(direction) ?? undefined, GESTURE_EFFECT_TIMEOUT_MS,
      () => `holding "${TabHistoryToolbar.label(direction)}" for ${TabHistoryToolbar.#HOLD_MS}ms did not open its history dropdown`);
  }

  async waitForDropdownClosed(direction: HistoryDirection, cause: string): Promise<void>
  {
    await waitFor(() => this.openDropdown(direction) === null, GESTURE_EFFECT_TIMEOUT_MS,
      () => `the "${TabHistoryToolbar.label(direction)}" dropdown was still open ${GESTURE_EFFECT_TIMEOUT_MS / 1000}s after ${cause}`);
  }

  /**
   * Waits until the dropdown lists exactly the entries background holds on
   * that side of the current position - `before` for Previous, `after` for
   * Next, both nearest first - then checks every row the way the confirm
   * question asks: a title, and either a favicon that actually loaded or the
   * grey fallback square. Returns the rows, top first.
   *
   * Polls rather than reading once: Toolbar opens the dropdown first and
   * fills it when its own getHistoryDetails call returns, so for a moment it
   * can still show the rows from the last time it was open.
   */
  async checkRows(direction: HistoryDirection, dropdown: HTMLElement): Promise<HTMLElement[]>
  {
    const side = direction === 'prev' ? 'before' : 'after';
    const history = await tabHistoryManagerProxy.getHistoryDetails(this.windowId);
    const expected = history[side];
    if (expected.length === 0)
    {
      throw new Error(`background's tab history has no entries ${side} the current position (index ${history.currentIndex}), so the dropdown has nothing to list - the case's earlier steps did not build the history it expects`);
    }

    const rowsNow = () => this.rowsIn(dropdown);
    const titlesOf = (rows: HTMLElement[]) => rows.map(row => (row.textContent ?? '').trim());
    const expectedTitles = expected.map(item => item.title);

    const rows = await waitFor(() =>
    {
      const current = rowsNow();
      const titles = titlesOf(current);
      const matches = titles.length === expectedTitles.length && titles.every((title, i) => title === expectedTitles[i]);
      return matches ? current : false;
    }, GESTURE_EFFECT_TIMEOUT_MS, () => `the "${TabHistoryToolbar.label(direction)}" dropdown lists ${rowsNow().length} row(s) [${titlesOf(rowsNow()).map(t => `"${t}"`).join(', ')}], `
      + `but background's history has ${expected.length} entr${expected.length === 1 ? 'y' : 'ies'} ${side} the current position: [${expected.map(item => `${item.index}:${item.tabId} "${item.title}"`).join(', ')}]`);

    // Every row needs a title and an icon of one of the two allowed kinds
    for (let i = 0; i < rows.length; i++)
    {
      await TabHistoryToolbar.#checkRowIcon(rows[i], i, expected[i]);
    }
    return rows;
  }

  /** The rows the dropdown shows right now, top first. */
  rowsIn(dropdown: HTMLElement): HTMLElement[]
  {
    return [...dropdown.querySelectorAll<HTMLElement>('[data-testid="tab-history-row"]')];
  }

  static async #checkRowIcon(row: HTMLElement, position: number, entry: TabHistoryItem): Promise<void>
  {
    const where = `row ${position + 1} ("${entry.title}", tab ${entry.tabId})`;
    if ((row.textContent ?? '').trim() === '') throw new Error(`${where} shows no title`);

    const favicon = row.querySelector<HTMLImageElement>('img');
    const fallback = row.querySelector('[data-testid="tab-history-favicon-fallback"]');

    // A favicon has to have actually loaded; a broken image is neither of
    // the two things the tester is told are acceptable
    if (favicon)
    {
      await waitFor(() => favicon.complete, GESTURE_EFFECT_TIMEOUT_MS,
        () => `${where}: its favicon (${favicon.src}) was still loading after ${GESTURE_EFFECT_TIMEOUT_MS / 1000}s`);
      if (favicon.naturalWidth === 0) throw new Error(`${where}: its favicon (${favicon.src}) failed to load, so the row shows a broken image rather than a favicon or the grey square`);
      return;
    }

    if (!fallback) throw new Error(`${where} shows neither a favicon nor the grey fallback square`);
  }

  async clickRow(row: HTMLElement, description: string): Promise<void>
  {
    await this.#mouse.click(row, description);
  }

  async activeTabId(): Promise<number | undefined>
  {
    const [tab] = await chrome.tabs.query({ active: true, windowId: this.windowId });
    return tab?.id;
  }

  async currentIndex(): Promise<number>
  {
    return (await tabHistoryManagerProxy.getHistoryDetails(this.windowId)).currentIndex;
  }

  /**
   * After a click that should navigate, waits for the active tab to change so
   * the case's own assertions that follow (which tab, which space) read the
   * settled result. Does not throw: those assertions report where it landed.
   */
  async settleAfterNavigationFrom(activeBefore: number | undefined): Promise<void>
  {
    try
    {
      await waitFor(async () => (await this.activeTabId()) !== activeBefore, NAVIGATION_TIMEOUT_MS, () => 'no navigation');
    }
    catch
    {
      // Reported by the assertions after this pause
    }
  }

  /**
   * For a failure path: closes any dropdown left open (Escape, which
   * DropdownMenu handles), so its full-panel overlay does not swallow the
   * clicks of the steps after it. Waits a little first and checks twice,
   * because a dropdown can open just after a check timed out waiting for it.
   */
  async closeLeftoverDropdown(): Promise<void>
  {
    const LATE_OPEN_GRACE_MS = 300;
    const RECHECK_MS = 150;

    await sleep(LATE_OPEN_GRACE_MS);
    this.#pressEscapeIfOpen();
    await sleep(RECHECK_MS);
    this.#pressEscapeIfOpen();
  }

  #pressEscapeIfOpen(): void
  {
    if (!this.isAnyDropdownOpen()) return;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }
}

/**
 * C.2g's press-and-hold on Previous or Next: hold the button, check the
 * dropdown that opens against background's history for that direction (rows
 * present, each with a title and a favicon or the grey square), then click
 * the top row. Throws when the dropdown does not open or a row fails the
 * check - the answers that would have been Fail.
 *
 * A failed row check still clicks the top row before throwing, as a tester
 * answering Fail would still have clicked it: otherwise one cosmetic failure
 * (a broken favicon) would leave the history where it was and fail every
 * navigation check after it in the case. The click is skipped only when the
 * dropdown did not open or has no rows.
 */
export function holdHistoryButtonAndPickTopRow(direction: HistoryDirection): StepRunner
{
  return async (ctx) =>
  {
    const toolbar = new TabHistoryToolbar(ctx.windowId);
    try
    {
      const activeBefore = await toolbar.activeTabId();
      await toolbar.hold(direction);
      const dropdown = await toolbar.waitForDropdown(direction);

      let rowCheckError: unknown;
      try
      {
        await toolbar.checkRows(direction, dropdown);
      }
      catch (err)
      {
        rowCheckError = err;
      }

      // Nothing to click when the dropdown is empty: report the check's error
      const rows = toolbar.rowsIn(dropdown);
      if (rows.length === 0)
      {
        throw rowCheckError ?? new Error(`the "${TabHistoryToolbar.label(direction)}" dropdown has no rows to click`);
      }

      try
      {
        await toolbar.clickRow(rows[0], 'the top row of the history dropdown');
        await toolbar.waitForDropdownClosed(direction, 'clicking its top row');
        await toolbar.settleAfterNavigationFrom(activeBefore);
      }
      catch (clickError)
      {
        // Keep the row check's failure when the click fails as well, first
        if (rowCheckError === undefined) throw clickError;
        const messageOf = (err: unknown) => err instanceof Error ? err.message : String(err);
        throw new Error(`${messageOf(rowCheckError)}; and then clicking the top row failed too: ${messageOf(clickError)}`);
      }

      if (rowCheckError !== undefined) throw rowCheckError;
    }
    catch (err)
    {
      await toolbar.closeLeftoverDropdown();
      throw err;
    }
  };
}

/**
 * C.2g's quick click on Previous: it must navigate, and the dropdown must not
 * open. Watches for at least the hold threshold after the release, since a
 * quick click wrongly taken as a hold would open the dropdown at that point.
 */
export function quickClickHistoryButton(direction: HistoryDirection): StepRunner
{
  return async (ctx) =>
  {
    const toolbar = new TabHistoryToolbar(ctx.windowId);
    const label = TabHistoryToolbar.label(direction);
    try
    {
      const activeBefore = await toolbar.activeTabId();
      await toolbar.quickClick(direction);
      const releasedAt = Date.now();

      // Fail the moment a dropdown shows; pass once the tab has changed and
      // the hold threshold has gone by with no dropdown
      await waitFor(async () =>
      {
        if (toolbar.isAnyDropdownOpen()) throw new Error(`the quick click on "${label}" opened the history dropdown - it was taken as a press-and-hold`);
        const navigated = (await toolbar.activeTabId()) !== activeBefore;
        return navigated && Date.now() - releasedAt > TAB_HISTORY_HOLD_MS * 2;
      }, NAVIGATION_TIMEOUT_MS, () => `the quick click on "${label}" did not navigate: tab ${activeBefore} was still active ${NAVIGATION_TIMEOUT_MS / 1000}s later`);
    }
    catch (err)
    {
      await toolbar.closeLeftoverDropdown();
      throw err;
    }
  };
}

/**
 * C.2g's dismiss gesture: hold to open the dropdown, then click the button
 * once while it is open. The click lands on the menu's overlay, as a real one
 * does. The dropdown must close and nothing may navigate.
 *
 * "Nothing navigates" can only be shown by watching for a while, so after the
 * close this polls the active tab and the history position for a fixed quiet
 * period and fails as soon as either moves.
 */
export function dismissHistoryDropdownWithClick(direction: HistoryDirection): StepRunner
{
  const QUIET_PERIOD_MS = 2000;

  return async (ctx) =>
  {
    const toolbar = new TabHistoryToolbar(ctx.windowId);
    const label = TabHistoryToolbar.label(direction);
    try
    {
      await toolbar.hold(direction);
      await toolbar.waitForDropdown(direction);

      const activeBefore = await toolbar.activeTabId();
      const indexBefore = await toolbar.currentIndex();
      await toolbar.clickWhereButtonIs(direction);
      await toolbar.waitForDropdownClosed(direction, `clicking "${label}" while it was open`);

      const quietUntil = Date.now() + QUIET_PERIOD_MS;
      // Watch for any navigation during the quiet period
      while (Date.now() < quietUntil)
      {
        const activeNow = await toolbar.activeTabId();
        const indexNow = await toolbar.currentIndex();
        if (activeNow !== activeBefore || indexNow !== indexBefore)
        {
          throw new Error(`clicking "${label}" to dismiss the dropdown also navigated: active tab ${activeBefore} -> ${activeNow}, history index ${indexBefore} -> ${indexNow}`);
        }
        await sleep(100);
      }
    }
    catch (err)
    {
      await toolbar.closeLeftoverDropdown();
      throw err;
    }
  };
}

// dnd-kit's PointerSensor activation distance in UnifiedDndContext.tsx
// (activationConstraint: { distance: 8 }). Not imported, to keep the React
// context module out of what the parked page loads; SimulatedMouse.drag moves
// a few pixels past it, and fails saying the drag never started if the
// constraint is ever raised beyond that.
const DND_ACTIVATION_DISTANCE_PX = 8;

/**
 * F.1's drag: press on the tab's row in the sidebar, drag it onto a space's
 * icon in the space bar and drop it, through dnd-kit's real pointer sensor -
 * so SpaceBar's own drop handler does the move. Waits for the tab's Chrome
 * group to change, since that handler runs asynchronously after the drop;
 * the case's assertion then checks which space it landed in.
 */
export function dragTabRowToSpaceIcon(opts: { tabRef: string; spaceRef: string }): StepRunner
{
  return async (ctx) =>
  {
    const tabId = resolveTabId(ctx, opts.tabRef);
    const space = resolveSpace(ctx, opts.spaceRef);
    const groupBefore = (await chrome.tabs.get(tabId)).groupId;

    // TabList only makes a row draggable once it is on screen (useInView),
    // and dnd-kit marks a draggable with aria-roledescription
    const rowSelector = resolveTabRowSelector(ctx, tabId);
    const draggableRowSelector = `${rowSelector}[aria-roledescription="draggable"]`;
    document.querySelector(rowSelector)?.scrollIntoView({ block: 'center' });
    const row = await waitFor(() => document.querySelector(draggableRowSelector) ?? undefined, GESTURE_EFFECT_TIMEOUT_MS,
      () => `tab "${opts.tabRef}" has no draggable row (${draggableRowSelector}) in the sidebar - is the sidebar showing the tab's space?`);

    const iconSelector = `[data-space-button="true"][data-space-id="${space.id}"]`;
    const icon = document.querySelector(iconSelector);
    if (!icon) throw new Error(`the "${space.name}" space icon (${iconSelector}) is not in the space bar - is Spaces turned on?`);
    icon.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // Read fresh each time: a re-render may replace either node mid-drag
    await new SimulatedMouse().drag({
      source: row,
      target: icon,
      sourceName: `tab "${opts.tabRef}"'s row`,
      targetName: `the "${space.name}" space icon`,
      activationDistancePx: DND_ACTIVATION_DISTANCE_PX,
      isActivated: () => document.querySelector(rowSelector)?.getAttribute('aria-pressed') === 'true',
      isOverTarget: () => document.querySelector(iconSelector)?.getAttribute('data-test-drop-target') === 'true',
      timeoutMs: GESTURE_EFFECT_TIMEOUT_MS,
    });

    await waitFor(async () => (await chrome.tabs.get(tabId)).groupId !== groupBefore, NAVIGATION_TIMEOUT_MS,
      () => `the drop on the "${space.name}" icon did not move tab "${opts.tabRef}": it was still in its original group ${NAVIGATION_TIMEOUT_MS / 1000}s later, so SpaceBar's drop handler did not run or its move failed`);
  };
}

/**
 * Open a page the tester is about to work in, so the instruction next to it
 * only has to describe what a human actually has to do there.
 *
 * `inNewWindow` puts it in its own Chrome window, which is what the
 * service-worker cases need: their whole point is that the sidebar's own
 * window is left alone, and a link in an instruction would open in that window
 * instead.
 *
 * The opened tab or window is recorded under `ref` so a later step can close
 * it. chrome:// pages are not scriptable by an extension, so this gets the
 * page on screen and no further.
 */
export function openPageForTester(opts: { url: string; ref: string; inNewWindow?: boolean }): TestStep
{
  return {
    kind: 'action',
    label: `Open ${opts.url}${opts.inNewWindow ? ' in a new window' : ''} for the tester`,
    run: async (ctx) =>
    {
      if (opts.inNewWindow)
      {
        const window = await chrome.windows.create({ url: opts.url, focused: true });
        if (window?.id === undefined) throw new Error(`could not open a window on ${opts.url}`);
        ctx.refs.set(opts.ref, window.id);
        return;
      }

      const tab = await chrome.tabs.create({ url: opts.url, active: true });
      if (tab.id === undefined) throw new Error(`could not open a tab on ${opts.url}`);
      ctx.refs.set(opts.ref, tab.id);
    },
  };
}

/**
 * Close a window opened by openPageForTester. Silent when it is already gone,
 * since the tester may well have closed it by hand.
 */
export function closeTesterWindow(windowRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Close the window opened for the tester ("${windowRef}")`,
    run: async (ctx) =>
    {
      const windowId = ctx.refs.get(windowRef);
      if (typeof windowId !== 'number') return;
      try { await chrome.windows.remove(windowId); }
      catch { /* already closed */ }
    },
  };
}

/** Remove a tab from its Chrome group entirely, without joining another one - mirrors native right-click "Remove from group". */
export function ungroupTab(tabRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Ungroup tab "${tabRef}"`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      await chrome.tabs.ungroup(tabId);
    },
  };
}

/** Move a bookmark into an arbitrary folder (looked up via ctx.refs) via the sidebar's move-bookmark path, regrouping its live tab (if any) to match. Covers both "Move to Space" (targetFolderRef = a space's own root folder) and the generic "Move to..." picker (targetFolderRef = any folder, e.g. a subfolder). Calls the SAME regroupAssociatedTab BookmarkTree.tsx uses (via tabOperations.ts), not a copy, so this actually catches a regression in the real move-and-regroup path rather than only ever exercising itself. */
export function moveBookmarkToFolder(opts: { bookmarkRef: string; targetFolderRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Move bookmark "${opts.bookmarkRef}" into folder "${opts.targetFolderRef}"`,
    run: async (ctx) =>
    {
      const bookmarkId = resolveStringRef(ctx, opts.bookmarkRef);
      const folderId = resolveStringRef(ctx, opts.targetFolderRef);
      await ctx.moveBookmark(bookmarkId, folderId, 'into');
      await regroupAssociatedTab(bookmarkId, folderId, ctx.getTabIdForBookmark, ctx.windowId, ctx.findSpaceForFolder);
    },
  };
}

/** Convenience wrapper for the common case of moving a bookmark to a space's own (root) bookmark folder, i.e. the sidebar's "Move to Space" shortcut - see moveBookmarkToFolder for the generic "Move to..." folder picker. */
export function moveBookmarkSidebar(opts: { bookmarkRef: string; targetSpaceRef: string }): TestStep
{
  const step = moveBookmarkToFolder({ bookmarkRef: opts.bookmarkRef, targetFolderRef: `${opts.targetSpaceRef}:folderId` });
  return { ...step, label: `Move bookmark "${opts.bookmarkRef}" to space "${opts.targetSpaceRef}" (sidebar method)` };
}

/** Bookmark an already-open tab in place, the same way dragging a tab onto the bookmark tree does - creates the bookmark then links the existing tab to it via associateExistingTab. */
export function bookmarkExistingTab(opts: { tabRef: string; spaceRef: string; title: string; url: string; bookmarkRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Bookmark existing tab "${opts.tabRef}" into space "${opts.spaceRef}"`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, opts.tabRef);
      const space = resolveSpace(ctx, opts.spaceRef);
      const folderId = resolveStringRef(ctx, `${opts.spaceRef}:folderId`);
      const bookmark = await ctx.createBookmark(folderId, opts.title, opts.url);
      await ctx.associateExistingTab(tabId, bookmark.id, space.id);
      ctx.refs.set(opts.bookmarkRef, bookmark.id);
    },
  };
}

/**
 * Delete a bookmark via the raw chrome.bookmarks API, not the extension's own
 * DeleteBookmarkAction - mirrors deleting it through Chrome's native
 * chrome://bookmarks manager. Honest, not a shortcut: the native manager's
 * delete button calls this exact same browser API under the hood (there's no
 * separate "native deletion" code path to simulate), so this fires the same
 * chrome.bookmarks.onRemoved event a real click would, without needing a
 * pause step.
 */
export function deleteBookmarkNative(bookmarkRef: string): TestStep
{
  return {
    kind: 'action',
    label: `Delete bookmark "${bookmarkRef}" (native chrome.bookmarks.remove)`,
    run: async (ctx) =>
    {
      const bookmarkId = resolveStringRef(ctx, bookmarkRef);
      await chrome.bookmarks.remove(bookmarkId);
    },
  };
}

/** Pop a tab out into its own new Chrome window - mirrors dragging a tab out of the tab strip. resetTestData() finds and closes the new window itself by scanning for test-tagged tabs, not via a ref, so nothing needs to be recorded here. */
export function moveTabToNewWindow(opts: { tabRef: string }): TestStep
{
  return {
    kind: 'action',
    label: `Move tab "${opts.tabRef}" to a new window`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, opts.tabRef);
      const win = await chrome.windows.create({ tabId, focused: false });
      if (win.id === undefined) throw new Error('chrome.windows.create did not return a window id');
    },
  };
}
