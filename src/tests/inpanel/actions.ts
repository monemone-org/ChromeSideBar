// Action-step vocabulary for the in-panel test runner. Each factory returns a
// TestStep whose run() performs one real chrome.*/hook call - no simulated
// clicks, same philosophy as src/tests/closeTabActionTest.ts. "Native" and
// "Sidebar" variants of the same move exist because the test doc explicitly
// asks to check both (they may not be equally instrumented) - see Section A's
// intro in docs/test/tab-space-association-test-cases.md.

import { getOrCreateSpaceGroup, moveTabToSpace, regroupAssociatedTab } from '../../utils/tabOperations';
import { FollowActiveTabMode, FOLLOW_ACTIVE_TAB_KEY } from '../../utils/followActiveTab';
import { TestStep } from './types';
import { getScrollContainer, resolveSpace, resolveStringRef, resolveTabId, resolveTabRowSelector, sleep } from './stepHelpers';
import { assertSidebarShowsSpace } from './assertions';
import { testUrl } from './fixtures';
import { tabHistoryManagerProxy } from '../../managers/proxies/tabHistoryManagerProxy';
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
      if (targetTabId === undefined) throw new Error('background reports no audible tab - did the manual "press play" step actually start playback?');

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
 * the rest - getOrCreateSpaceGroup now coalesces concurrent create-race
 * callers into one creation (see tabOperations.ts's resolveGroupId), so this
 * isn't required for correctness anymore, but seeding the group with a known
 * single tab first keeps this function's own intent unambiguous and avoids
 * every tab in the first batch hitting the "does this group exist yet" race
 * at once for no benefit (they'd all just wait on the same promise anyway).
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
        const tab = await chrome.tabs.create({ url: testUrl(label), active: false, windowId: ctx.windowId });
        if (tab.id === undefined) throw new Error('chrome.tabs.create did not return an id');
        await getOrCreateSpaceGroup(tab.id, space, ctx.windowId);
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
      const space = resolveSpace(ctx, opts.spaceRef);
      const tab = await chrome.tabs.create({ url: opts.url, active: false, windowId: ctx.windowId });
      if (tab.id === undefined) throw new Error('chrome.tabs.create did not return an id');

      await getOrCreateSpaceGroup(tab.id, space, ctx.windowId);
      ctx.refs.set(opts.tabRef, tab.id);
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
      const bookmarkId = resolveStringRef(ctx, opts.bookmarkRef);
      const spaceId = opts.spaceRef ? resolveSpace(ctx, opts.spaceRef).id : undefined;
      const tabId = await ctx.openBookmarkTab(bookmarkId, opts.url, spaceId);
      if (tabId === undefined) throw new Error('openBookmarkTab did not return a tab id');
      ctx.refs.set(opts.tabRef, tabId);
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
 * future divergence between the two paths on its own. A true native-gesture
 * test needs a real user action, which (like A.3) means a manual pause step.
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
 * Pause for a manual step, rendering `steps` as a numbered list rather than one run-on
 * paragraph. TestRunnerPanel's paused banner renders each "N. " line on its own row, dims
 * anything after a " - " as an explanation/aside, and turns chrome://... mentions into
 * clickable links - see renderPausedLine there.
 *
 * Pass `confirm` when the step asks the tester to JUDGE something the runner
 * cannot observe - whether a favicon rendered, whether a dropdown appeared.
 * The banner then offers Pass/Fail plus a note box instead of a single Resume
 * button, and the answer is recorded as a result under that question. Leave it
 * off for a pause that only asks for an action to be carried out.
 */
export function pause(label: string, steps: string[], confirm?: string): TestStep
{
  const instruction = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  return { kind: 'pause', label, instruction, confirm };
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
