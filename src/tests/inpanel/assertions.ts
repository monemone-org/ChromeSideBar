// Assertion-step vocabulary for the in-panel test runner. Each factory
// returns a TestStep whose run() throws (with a descriptive message) when the
// expectation isn't met - the runner turns that into a failed TestResult.

import { TestStep } from './types';
import { resolveSpace, resolveStringRef, resolveTabId } from './stepHelpers';

async function tabGroupTitle(tabId: number): Promise<string | undefined>
{
  const tab = await chrome.tabs.get(tabId);
  if (tab.groupId === undefined || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return undefined;
  const group = await chrome.tabGroups.get(tab.groupId);
  return group.title;
}

export function assertTabInSpace(tabRef: string, spaceRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" is in space "${spaceRef}"`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const space = resolveSpace(ctx, spaceRef);
      const groupTitle = await tabGroupTitle(tabId);
      if (groupTitle !== space.name)
      {
        throw new Error(`expected tab's Chrome group title to be "${space.name}", got ${groupTitle ? `"${groupTitle}"` : '(ungrouped)'}`);
      }
    },
  };
}

export function assertTabUngrouped(tabRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" is ungrouped`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const groupTitle = await tabGroupTitle(tabId);
      if (groupTitle !== undefined)
      {
        throw new Error(`expected tab to be ungrouped, but it's in group "${groupTitle}"`);
      }
    },
  };
}

export function assertBookmarkLoaded(bookmarkRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Bookmark "${bookmarkRef}" is ${expected ? '' : 'not '}loaded`,
    run: async (ctx) =>
    {
      const bookmarkId = resolveStringRef(ctx, bookmarkRef);
      const actual = ctx.isBookmarkLoaded(bookmarkId);
      if (actual !== expected)
      {
        throw new Error(`expected isBookmarkLoaded to be ${expected}, got ${actual}`);
      }
    },
  };
}

export function assertPinnedLoaded(pinRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Pinned site "${pinRef}" is ${expected ? '' : 'not '}loaded`,
    run: async (ctx) =>
    {
      const pinnedId = resolveStringRef(ctx, pinRef);
      const actual = ctx.isPinnedLoaded(pinnedId);
      if (actual !== expected)
      {
        throw new Error(`expected isPinnedLoaded to be ${expected}, got ${actual}`);
      }
    },
  };
}

export function assertTabExists(tabRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" ${expected ? 'still exists' : 'is closed'}`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const exists = await chrome.tabs.get(tabId).then(() => true, () => false);
      if (exists !== expected)
      {
        throw new Error(`expected tab to ${expected ? 'exist' : 'be closed'}, but it ${exists ? 'exists' : "doesn't"}`);
      }
    },
  };
}

/** Confirms a bookmark node itself is gone/present in chrome.bookmarks - distinct from assertBookmarkLoaded, which checks the extension's own (possibly stale) association map rather than the real bookmark tree. */
export function assertBookmarkExists(bookmarkRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Bookmark "${bookmarkRef}" ${expected ? 'still exists' : 'is deleted'}`,
    run: async (ctx) =>
    {
      const bookmarkId = resolveStringRef(ctx, bookmarkRef);
      const exists = await chrome.bookmarks.get(bookmarkId).then(() => true, () => false);
      if (exists !== expected)
      {
        throw new Error(`expected bookmark to ${expected ? 'exist' : 'be deleted'}, but it ${exists ? 'exists' : "doesn't"}`);
      }
    },
  };
}

export function assertSidebarShowsSpace(spaceRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Sidebar is showing space "${spaceRef}"`,
    run: async (ctx) =>
    {
      const space = resolveSpace(ctx, spaceRef);
      if (ctx.activeSpaceId !== space.id)
      {
        throw new Error(`expected activeSpaceId to be "${space.id}" (${space.name}), got "${ctx.activeSpaceId}"`);
      }
    },
  };
}

export function assertSpaceExists(spaceRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Space "${spaceRef}" ${expected ? 'exists' : "doesn't exist"}`,
    run: async (ctx) =>
    {
      const spaceId = resolveStringRef(ctx, spaceRef);
      const exists = ctx.getSpaceById(spaceId) !== undefined;
      if (exists !== expected)
      {
        throw new Error(`expected space to ${expected ? 'exist' : 'not exist'}, but it ${exists ? 'exists' : "doesn't"}`);
      }
    },
  };
}

/** Confirms a tab has actually left the test window (e.g. after moveTabToNewWindow) - used for regular tabs, which have no bookmark/pinned association to check instead. */
export function assertTabInOtherWindow(tabRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" has moved to a different window`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId === ctx.windowId)
      {
        throw new Error(`expected tab to have moved to a different window, but it's still in window ${ctx.windowId}`);
      }
    },
  };
}
