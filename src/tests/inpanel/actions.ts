// Action-step vocabulary for the in-panel test runner. Each factory returns a
// TestStep whose run() performs one real chrome.*/hook call - no simulated
// clicks, same philosophy as src/tests/closeTabActionTest.ts. "Native" and
// "Sidebar" variants of the same move exist because the test doc explicitly
// asks to check both (they may not be equally instrumented) - see Section A's
// intro in docs/test/tab-space-association-test-cases.md.

import { getOrCreateSpaceGroup, moveTabToSpace, regroupAssociatedTab } from '../../utils/tabOperations';
import { TestStep } from './types';
import { resolveSpace, resolveStringRef, resolveTabId } from './stepHelpers';
import { assertSidebarShowsSpace } from './assertions';

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
 * `...switchSpaceVerified(ref)` (spread) in a case's steps array. Every
 * case previously called switchSpace() alone without ever checking its
 * effect, so a silently broken switchToSpace() would leave all 17+ call
 * sites across Section A/B/D green regardless.
 */
export function switchSpaceVerified(spaceRef: string): TestStep[]
{
  return [switchSpace(spaceRef), assertSidebarShowsSpace(spaceRef)];
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

/** Pause for a manual step, rendering `steps` as a numbered list (TestRunnerPanel's paused banner is whitespace-pre-wrap) rather than one run-on paragraph. */
export function pause(label: string, steps: string[]): TestStep
{
  const instruction = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  return { kind: 'pause', label, instruction };
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
