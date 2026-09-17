// Assertion-step vocabulary for the in-panel test runner. Each factory
// returns a TestStep whose run() throws (with a descriptive message) when the
// expectation isn't met - the runner turns that into a failed TestResult.

import { TestStep } from './types';
import { getScrollContainer, resolveSpace, resolveStringRef, resolveTabId, resolveTabRowSelector, sleep } from './stepHelpers';
import { lastAudibleTrackerProxy } from '../../managers/proxies/lastAudibleTrackerProxy';

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

/**
 * assertTabInSpace, but polls until `timeoutMs` passes. For tabs grouped by
 * background's grouping queue rather than by the step before, where the
 * runner's fixed settle delay between steps is no guarantee the queue has
 * reached this tab yet.
 */
export function assertTabInSpaceWithin(tabRef: string, spaceRef: string, timeoutMs: number): TestStep
{
  const POLL_MS = 100;

  return {
    kind: 'assert',
    label: `Tab "${tabRef}" is in space "${spaceRef}" within ${timeoutMs}ms`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const space = resolveSpace(ctx, spaceRef);
      const deadline = Date.now() + timeoutMs;

      // Keep checking until the tab's group title matches or time runs out.
      let groupTitle = await tabGroupTitle(tabId);
      while (groupTitle !== space.name && Date.now() < deadline)
      {
        await sleep(POLL_MS);
        groupTitle = await tabGroupTitle(tabId);
      }

      if (groupTitle !== space.name)
      {
        throw new Error(`expected tab's Chrome group title to be "${space.name}" within ${timeoutMs}ms, got ${groupTitle ? `"${groupTitle}"` : '(ungrouped)'}`);
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

/**
 * Confirms a bookmark's row exists in the DOM at all - distinct from
 * assertTabRowVisible, which treats a missing row as always an error.
 * BookmarkTree only renders a bookmark's row while ALL of its ancestor
 * folders are expanded (collapsed folders don't render their children), so
 * "missing" is a legitimate, expected state here, not a bug - used as the
 * precondition check for C.1e's "folder auto-expands" scenario, before the
 * real activation is expected to expand it. Only meaningful for
 * bookmark-associated tabs (data-bookmark-id); TabList's own rows (regular
 * tabs) are always rendered regardless of scroll position, so use
 * assertTabRowVisible for those instead.
 */
export function assertBookmarkRowExists(tabRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}"'s bookmark row ${expected ? 'exists' : "doesn't exist"} in the DOM`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const selector = resolveTabRowSelector(ctx, tabId);
      const exists = document.querySelector(selector) !== null;
      if (exists !== expected)
      {
        throw new Error(`expected row ${selector} to ${expected ? 'exist' : 'not exist'} in the DOM, but it ${exists ? 'does' : "doesn't"}`);
      }
    },
  };
}

/**
 * Confirms a tab's sidebar row is (or isn't) within the visible bounds of
 * the sidebar's scroll container - the real DOM effect of scrollHelpers.ts's
 * scrollToTab/scrollToBookmark (element.scrollIntoView()). The row must
 * exist in the DOM either way (TabList doesn't virtualize, and by this point
 * any collapsed BookmarkTree ancestor should already have auto-expanded -
 * see assertBookmarkRowExists for checking that on its own), so a missing
 * row is always an error regardless of `expected`.
 *
 * Caveat: expected=true only proves the row IS visible right now, not that a
 * scroll HAD to happen to get there - a row already in view before the
 * activation passes trivially regardless of follow mode. Telling "scrolled"
 * apart from "was already visible" needs the row pushed off-screen first
 * (see openFillerTabsUntilScrollable/scrollRowOutOfView in actions.ts,
 * and the manual doc's C.1c note on anchoring tabs far apart) - callers
 * relying on this to distinguish scroll-vs-no-scroll modes must set that up
 * first and should assert expected=false as a precondition check.
 *
 * Polls for up to POLL_TIMEOUT_MS rather than checking once: scrollHelpers.ts's
 * scrollIntoView() call uses `behavior: 'smooth'`, an animation with no
 * completion callback, so checking immediately after the settle delay can
 * catch it mid-scroll (especially over the long distance
 * openFillerTabsUntilScrollable creates) and see a false "not visible" even
 * though the scroll is genuinely in progress toward the right answer.
 */
export function assertTabRowVisible(tabRef: string, expected: boolean): TestStep
{
  const POLL_TIMEOUT_MS = 1500;
  const POLL_INTERVAL_MS = 100;

  return {
    kind: 'assert',
    label: `Tab "${tabRef}"'s sidebar row is ${expected ? '' : 'not '}visible`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const selector = resolveTabRowSelector(ctx, tabId);

      const startTime = Date.now();
      for (;;)
      {
        const container = getScrollContainer();
        const element = document.querySelector(selector);
        if (!element) throw new Error(`row ${selector} not found in DOM - should be rendered (just possibly scrolled out of view), not absent`);

        // Midpoint rather than full-containment: scrollIntoView({block: 'nearest'})
        // routinely lands the target row flush against the container's edge,
        // and a strict top/bottom containment check has no tolerance for the
        // container's own padding (p-2 in App.tsx) or ordinary sub-pixel
        // rounding - both produce a false "not visible" for a row a human
        // looking at the same screen would call clearly visible.
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const elementMidpoint = (elementRect.top + elementRect.bottom) / 2;
        const visible = elementMidpoint >= containerRect.top && elementMidpoint <= containerRect.bottom;
        if (visible === expected) return;

        if (Date.now() - startTime >= POLL_TIMEOUT_MS)
        {
          throw new Error(
            `expected row ${selector} to be ${expected ? '' : 'not '}visible, but it ${visible ? 'is' : "isn't"} (waited ${POLL_TIMEOUT_MS}ms) - ` +
            `container=[${containerRect.top.toFixed(1)}, ${containerRect.bottom.toFixed(1)}] element=[${elementRect.top.toFixed(1)}, ${elementRect.bottom.toFixed(1)}] midpoint=${elementMidpoint.toFixed(1)}`
          );
        }
        await sleep(POLL_INTERVAL_MS);
      }
    },
  };
}

/**
 * Confirms a tab really is producing sound, per chrome.tabs' own `audible`
 * flag - the same signal the audio quick-jump and audio dropdown are built
 * on. Used as the precondition right after C.2e/C.2f's "press play" pause:
 * without it, forgetting to press play would either fail somewhere confusing
 * later or, worse, quietly pass by locking onto some unrelated audible tab
 * elsewhere in the browser.
 */
export function assertTabAudible(tabRef: string, expected: boolean): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" is ${expected ? '' : 'not '}playing audio`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const tab = await chrome.tabs.get(tabId);
      if ((tab.audible ?? false) !== expected)
      {
        throw new Error(`expected tab to be ${expected ? '' : 'not '}audible, but it ${tab.audible ? 'is' : "isn't"}`);
      }
    },
  };
}

/** Confirms a tab is the window's active tab - what an explicit jump action is ultimately supposed to achieve, separately from where the sidebar ended up. */
export function assertTabActive(tabRef: string): TestStep
{
  return {
    kind: 'assert',
    label: `Tab "${tabRef}" is the active tab`,
    run: async (ctx) =>
    {
      const tabId = resolveTabId(ctx, tabRef);
      const tab = await chrome.tabs.get(tabId);
      if (!tab.active)
      {
        // Name the tab that IS active, so a failure can be diagnosed from the
        // results file alone - by its ref when the case created it, otherwise
        // by URL.
        const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
        const activeRef = [...ctx.refs.entries()].find(([, value]) => value === activeTab?.id)?.[0];
        const activeDesc = activeTab === undefined
          ? 'no tab'
          : activeRef !== undefined
            ? `"${activeRef}" (id ${activeTab.id})`
            : `id ${activeTab.id} (${activeTab.url || activeTab.pendingUrl || 'no url'})`;
        throw new Error(`expected tab "${tabRef}" (id ${tabId}) to be active, but ${activeDesc} is`);
      }
    },
  };
}

/** Confirms every named tab is one the audio dropdown would list (i.e. the background is tracking them all as audible), which is what makes C.2f's "pick a specific entry" meaningful rather than a one-entry menu. */
export function assertAudioListIncludes(tabRefs: string[]): TestStep
{
  return {
    kind: 'assert',
    label: `Audio tab list includes [${tabRefs.join(', ')}]`,
    run: async (ctx) =>
    {
      const { playingTabIds, historyTabIds } = await lastAudibleTrackerProxy.getAudioTabLists(ctx.windowId);
      const listed = [...playingTabIds, ...historyTabIds];

      const missing = tabRefs.filter(ref => !listed.includes(resolveTabId(ctx, ref)));
      if (missing.length > 0)
      {
        throw new Error(`expected the audio tab list to include [${missing.join(', ')}], but it only has ids [${listed.join(', ')}]`);
      }
    },
  };
}

/**
 * Confirms a keyboard command is registered AND actually bound to a key.
 *
 * Catches the failure modes a message-driven test structurally cannot see:
 * the command renamed or dropped from public/manifest.json's "commands"
 * block, or its shortcut left unassigned / lost to a conflict with another
 * extension. Does NOT prove chrome.commands.onCommand is wired up or that
 * pressing the key does anything - only a real keypress shows that, which is
 * why C.2c still has manual steps.
 */
export function assertCommandShortcutBound(commandName: string): TestStep
{
  return {
    kind: 'assert',
    label: `Keyboard command "${commandName}" is bound to a shortcut`,
    run: async () =>
    {
      const commands = await chrome.commands.getAll();
      const command = commands.find(c => c.name === commandName);
      if (!command) throw new Error(`command "${commandName}" is not registered - check public/manifest.json's "commands" block`);
      if (!command.shortcut) throw new Error(`command "${commandName}" is registered but has no key bound - unassigned, or conflicting with another extension (see chrome://extensions/shortcuts)`);
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
