// Unit tests for CloseTabAction
// Run via the "Unit Test Do/Undo Close Tabs" menu item (dev mode only)

import { CloseTabAction } from '../actions/closeTabAction';
import { TestResult } from './testUtils';

// --- Types ---

interface TestTab
{
  url: string;
  group?: string;         // Group label — tabs sharing the same label are grouped together
  pinnedSite?: string;    // Pinned site title — create a pinned site and open as live tab
  bookmark?: string;      // Bookmark title — create a bookmark and open as live tab
  selected?: boolean;     // Mark for closing
}

interface TabShape
{
  url: string;
  group?: string;         // Expected group label (undefined = ungrouped)
  pinnedSite?: boolean;   // Expected pinned site association (presence only)
  bookmark?: string;      // Expected bookmark association (title)
}

interface CloseTabTestCase
{
  name: string;
  tabs: TestTab[];
  selectionOrder?: number[];   // Indices into tabs[] to control ID ordering (default: array order)
  expectedAfterDo: TabShape[];
}

// --- Helpers ---

const TEST_URL_PREFIX = 'https://example.com/close-test-';

function testUrl(n: number): string
{
  return `${TEST_URL_PREFIX}${n}`;
}

const SETTLE_MS = 500;

function settle(): Promise<void>
{
  return new Promise(resolve => setTimeout(resolve, SETTLE_MS));
}

/** Build TabShape from a TestTab (for computing expected original / expected after undo). */
function testTabToShape(t: TestTab): TabShape
{
  const shape: TabShape = { url: t.url };
  if (t.group) shape.group = t.group;
  if (t.bookmark) shape.bookmark = t.bookmark;
  if (t.pinnedSite) shape.pinnedSite = true;
  return shape;
}

interface SetupResult
{
  tabIds: number[];                       // Created tab IDs, in tabs[] order
  tabToItemKey: Map<number, string>;      // tabId → itemKey (for associations)
  bookmarkIds: string[];                  // Created bookmark IDs (for cleanup)
}

/** Create real Chrome tabs with groups and associations for a test case. */
async function setupTestTabs(
  tabs: TestTab[],
  windowId: number
): Promise<SetupResult>
{
  const tabIds: number[] = [];
  const tabToItemKey = new Map<number, string>();
  const bookmarkIds: string[] = [];
  const groupTitleToId = new Map<string, number>();

  for (let i = 0; i < tabs.length; i++)
  {
    const testTab = tabs[i];

    // Create real Chrome tab
    const tab = await chrome.tabs.create({
      url: testTab.url,
      active: false,
      windowId,
    });
    tabIds.push(tab.id!);

    // Group if needed
    if (testTab.group)
    {
      if (groupTitleToId.has(testTab.group))
      {
        await chrome.tabs.group({ tabIds: [tab.id!], groupId: groupTitleToId.get(testTab.group)! });
      }
      else
      {
        const groupId = await chrome.tabs.group({
          tabIds: [tab.id!],
          createProperties: { windowId },
        });
        await chrome.tabGroups.update(groupId, { title: testTab.group });
        groupTitleToId.set(testTab.group, groupId);
      }
    }

    // Create real bookmark and track association
    if (testTab.bookmark)
    {
      const bm = await chrome.bookmarks.create({
        parentId: '2',
        title: testTab.bookmark,
        url: testTab.url,
      });
      bookmarkIds.push(bm.id);
      tabToItemKey.set(tab.id!, `bookmark-${bm.id}`);
    }

    // Track pinned site association (no real pinned site needed — just the itemKey)
    if (testTab.pinnedSite)
    {
      tabToItemKey.set(tab.id!, `pinned-pin_test_${i}`);
    }
  }

  await settle();
  return { tabIds, tabToItemKey, bookmarkIds };
}

/** Query current test tabs in the window and build TabShape[] for comparison. */
async function getTestTabState(
  windowId: number,
  keeperTabId: number,
  tabToItemKey: Map<number, string>
): Promise<TabShape[]>
{
  const allTabs = await chrome.tabs.query({ windowId });
  const testTabs = allTabs
    .filter(t => t.id !== keeperTabId && t.url?.startsWith(TEST_URL_PREFIX))
    .sort((a, b) => a.index - b.index);

  // Build group title map
  const groups = await chrome.tabGroups.query({ windowId });
  const groupTitleMap = new Map<number, string>();
  for (const g of groups)
  {
    groupTitleMap.set(g.id, g.title || '');
  }

  const shapes: TabShape[] = [];
  for (const tab of testTabs)
  {
    const shape: TabShape = { url: tab.url! };

    // Group
    if (tab.groupId && tab.groupId !== -1)
    {
      shape.group = groupTitleMap.get(tab.groupId);
    }

    // Association
    const itemKey = tabToItemKey.get(tab.id!);
    if (itemKey)
    {
      if (itemKey.startsWith('bookmark-'))
      {
        try
        {
          const bmId = itemKey.replace('bookmark-', '');
          const [bm] = await chrome.bookmarks.get(bmId);
          shape.bookmark = bm.title;
        }
        catch { /* bookmark may be gone */ }
      }
      else if (itemKey.startsWith('pinned-'))
      {
        shape.pinnedSite = true;
      }
    }

    shapes.push(shape);
  }

  return shapes;
}

/** Compare two TabShape arrays. */
function tabShapesEqual(
  expected: TabShape[],
  actual: TabShape[]
): { equal: boolean; diff?: string }
{
  if (expected.length !== actual.length)
  {
    return {
      equal: false,
      diff: `length: expected ${expected.length}, got ${actual.length}`,
    };
  }
  for (let i = 0; i < expected.length; i++)
  {
    const e = expected[i];
    const a = actual[i];
    const p = `[${i}] `;

    if (e.url !== a.url)
    {
      return { equal: false, diff: `${p}url: expected "${e.url}", got "${a.url}"` };
    }
    if ((e.group ?? '') !== (a.group ?? ''))
    {
      return { equal: false, diff: `${p}group: expected "${e.group ?? '(none)'}", got "${a.group ?? '(none)'}"` };
    }
    if ((e.bookmark ?? '') !== (a.bookmark ?? ''))
    {
      return { equal: false, diff: `${p}bookmark: expected "${e.bookmark ?? '(none)'}", got "${a.bookmark ?? '(none)'}"` };
    }
    if (!!e.pinnedSite !== !!a.pinnedSite)
    {
      return { equal: false, diff: `${p}pinnedSite: expected ${e.pinnedSite ? 'yes' : 'no'}, got ${a.pinnedSite ? 'yes' : 'no'}` };
    }
  }
  return { equal: true };
}

/** Format TabShape[] for console output. */
function formatShapes(shapes: TabShape[]): string
{
  if (shapes.length === 0) return '    (empty)';
  return shapes.map((s, i) =>
  {
    const parts = [s.url.replace(TEST_URL_PREFIX, '#')];
    if (s.group) parts.push(`group="${s.group}"`);
    if (s.bookmark) parts.push(`bm="${s.bookmark}"`);
    if (s.pinnedSite) parts.push('pinned');
    return `    [${i}] ${parts.join(' ')}`;
  }).join('\n');
}

/** Clean up test tabs and bookmarks after a test case. */
async function cleanup(
  windowId: number,
  keeperTabId: number,
  bookmarkIds: string[]
): Promise<void>
{
  // Close remaining test tabs
  const allTabs = await chrome.tabs.query({ windowId });
  const testTabIds = allTabs
    .filter(t => t.id !== keeperTabId && t.url?.startsWith(TEST_URL_PREFIX))
    .map(t => t.id!)
    .filter(id => id !== undefined);

  if (testTabIds.length > 0)
  {
    try { await chrome.tabs.remove(testTabIds); }
    catch { /* ignore */ }
  }

  // Remove test bookmarks
  for (const bmId of bookmarkIds)
  {
    try { await chrome.bookmarks.remove(bmId); }
    catch { /* ignore */ }
  }

  await settle();
}

// --- Test Cases ---

const TEST_CASES: CloseTabTestCase[] = [

  // Case 1: Single tab
  {
    name: 'Case 1: Single tab',
    tabs: [
      { url: testUrl(1), selected: true },
    ],
    expectedAfterDo: [],
  },

  // Case 2: Multiple tabs (all)
  {
    name: 'Case 2: Multiple tabs (all)',
    tabs: [
      { url: testUrl(1), selected: true },
      { url: testUrl(2), selected: true },
      { url: testUrl(3), selected: true },
    ],
    expectedAfterDo: [],
  },

  // Case 3: Close middle tab
  {
    name: 'Case 3: Close middle tab',
    tabs: [
      { url: testUrl(1) },
      { url: testUrl(2), selected: true },
      { url: testUrl(3) },
    ],
    expectedAfterDo: [
      { url: testUrl(1) },
      { url: testUrl(3) },
    ],
  },

  // Case 4: Close first and last, keep middle
  {
    name: 'Case 4: Close first and last',
    tabs: [
      { url: testUrl(1), selected: true },
      { url: testUrl(2) },
      { url: testUrl(3), selected: true },
    ],
    expectedAfterDo: [
      { url: testUrl(2) },
    ],
  },

  // Case 5: Close first 30% (3 of 10)
  {
    name: 'Case 5: Close first 30%',
    tabs: [
      { url: testUrl(1), selected: true },
      { url: testUrl(2), selected: true },
      { url: testUrl(3), selected: true },
      { url: testUrl(4) },
      { url: testUrl(5) },
      { url: testUrl(6) },
      { url: testUrl(7) },
      { url: testUrl(8) },
      { url: testUrl(9) },
      { url: testUrl(10) },
    ],
    expectedAfterDo: [
      { url: testUrl(4) },
      { url: testUrl(5) },
      { url: testUrl(6) },
      { url: testUrl(7) },
      { url: testUrl(8) },
      { url: testUrl(9) },
      { url: testUrl(10) },
    ],
  },

  // Case 6: Close last 30% (3 of 10)
  {
    name: 'Case 6: Close last 30%',
    tabs: [
      { url: testUrl(1) },
      { url: testUrl(2) },
      { url: testUrl(3) },
      { url: testUrl(4) },
      { url: testUrl(5) },
      { url: testUrl(6) },
      { url: testUrl(7) },
      { url: testUrl(8), selected: true },
      { url: testUrl(9), selected: true },
      { url: testUrl(10), selected: true },
    ],
    expectedAfterDo: [
      { url: testUrl(1) },
      { url: testUrl(2) },
      { url: testUrl(3) },
      { url: testUrl(4) },
      { url: testUrl(5) },
      { url: testUrl(6) },
      { url: testUrl(7) },
    ],
  },

  // Case 7: Close middle 30% (3 of 10)
  {
    name: 'Case 7: Close middle 30%',
    tabs: [
      { url: testUrl(1) },
      { url: testUrl(2) },
      { url: testUrl(3) },
      { url: testUrl(4), selected: true },
      { url: testUrl(5), selected: true },
      { url: testUrl(6), selected: true },
      { url: testUrl(7) },
      { url: testUrl(8) },
      { url: testUrl(9) },
      { url: testUrl(10) },
    ],
    expectedAfterDo: [
      { url: testUrl(1) },
      { url: testUrl(2) },
      { url: testUrl(3) },
      { url: testUrl(7) },
      { url: testUrl(8) },
      { url: testUrl(9) },
      { url: testUrl(10) },
    ],
  },

  // Case 8: Reverse selection order (index regression test)
  // IDs passed in descending index order — undo must restore in correct index order
  {
    name: 'Case 8: Reverse selection order',
    tabs: [
      { url: testUrl(1), selected: true },
      { url: testUrl(2), selected: true },
      { url: testUrl(3), selected: true },
      { url: testUrl(4), selected: true },
      { url: testUrl(5), selected: true },
    ],
    selectionOrder: [4, 3, 2, 1, 0],
    expectedAfterDo: [],
  },

  // Case 9: Pinned site tab (from PinnedBar)
  {
    name: 'Case 9: Pinned site tab',
    tabs: [
      { url: testUrl(1), pinnedSite: 'Pinned A', selected: true },
    ],
    expectedAfterDo: [],
  },

  // Case 10: Tab in a group
  {
    name: 'Case 10: Tab in a group',
    tabs: [
      { url: testUrl(1), group: 'Work', selected: true },
    ],
    expectedAfterDo: [],
  },

  // Case 11: All tabs in a group (group destroyed on close, recreated on undo)
  {
    name: 'Case 11: All tabs in group - group destroyed and restored',
    tabs: [
      { url: testUrl(1), group: 'Work', selected: true },
      { url: testUrl(2), group: 'Work', selected: true },
      { url: testUrl(3), group: 'Work', selected: true },
    ],
    expectedAfterDo: [],
  },

  // Case 12: Tabs from different groups — close one from each
  {
    name: 'Case 12: Tabs from different groups',
    tabs: [
      { url: testUrl(1), group: 'Work', selected: true },
      { url: testUrl(2), group: 'Work' },
      { url: testUrl(3), group: 'Personal', selected: true },
      { url: testUrl(4), group: 'Personal' },
    ],
    expectedAfterDo: [
      { url: testUrl(2), group: 'Work' },
      { url: testUrl(4), group: 'Personal' },
    ],
  },

  // Case 13: Single live bookmark tab
  {
    name: 'Case 13: Single live bookmark tab',
    tabs: [
      { url: testUrl(1), bookmark: 'Bookmark A', selected: true },
    ],
    expectedAfterDo: [],
  },

  // Case 14: Multiple live bookmark tabs
  {
    name: 'Case 14: Multiple live bookmark tabs',
    tabs: [
      { url: testUrl(1), bookmark: 'Bookmark A', selected: true },
      { url: testUrl(2), bookmark: 'Bookmark B', selected: true },
      { url: testUrl(3), bookmark: 'Bookmark C' },
    ],
    expectedAfterDo: [
      { url: testUrl(3), bookmark: 'Bookmark C' },
    ],
  },

];

// --- Test Runner ---

export async function runCloseTabTests(
  onShowToast: (message: string) => void
): Promise<void>
{
  console.log('=== CloseTabAction Tests ===');

  const windowId = await new Promise<number>((resolve) =>
  {
    chrome.windows.getCurrent((win) => resolve(win.id!));
  });

  // Create a keeper tab so the window survives when all test tabs are closed
  const keeper = await chrome.tabs.create({ url: 'about:blank', active: false, windowId });
  const keeperTabId = keeper.id!;

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES)
  {
    console.log(`\n--- ${testCase.name} ---`);

    let setup: SetupResult | null = null;

    try
    {
      // Setup: create real tabs with groups and associations
      setup = await setupTestTabs(testCase.tabs, windowId);

      // Build expected original shape (for undo verification)
      const originalShape = testCase.tabs.map(testTabToShape);

      // Verify setup
      const setupState = await getTestTabState(windowId, keeperTabId, setup.tabToItemKey);
      console.log(`  Setup:\n${formatShapes(setupState)}`);

      const setupCheck = tabShapesEqual(originalShape, setupState);
      if (!setupCheck.equal)
      {
        console.error(`  FAIL Setup: ${setupCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Setup: ${setupCheck.diff}` });
        continue;
      }

      // Collect selected tab IDs
      const selectedIndices = testCase.selectionOrder
        ?? testCase.tabs.reduce<number[]>((acc, t, i) => t.selected ? [...acc, i] : acc, []);
      const selectedTabIds = selectedIndices.map(i => setup!.tabIds[i]);

      console.log(`  Selected: [${selectedIndices.join(', ')}] → tabIds [${selectedTabIds.join(', ')}]`);

      // Create action with callbacks that use our local association map
      const action = new CloseTabAction(
        selectedTabIds,
        windowId,
        (tabId) => setup!.tabToItemKey.get(tabId) ?? null,
        async (tabId, itemKey) =>
        {
          // Track restored associations (maps new tabId → itemKey)
          setup!.tabToItemKey.set(tabId, itemKey);
        }
      );

      // --- do() ---
      await action.do();
      await settle();

      const afterDoState = await getTestTabState(windowId, keeperTabId, setup.tabToItemKey);
      console.log(`  After do():\n${formatShapes(afterDoState)}`);
      console.log(`  Description: "${action.description}"`);

      const doCheck = tabShapesEqual(testCase.expectedAfterDo, afterDoState);
      if (!doCheck.equal)
      {
        console.error(`  FAIL After do(): ${doCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `After do(): ${doCheck.diff}` });
        continue;
      }

      // --- undo() ---
      await action.undo();
      await settle();

      const afterUndoState = await getTestTabState(windowId, keeperTabId, setup.tabToItemKey);
      console.log(`  After undo():\n${formatShapes(afterUndoState)}`);

      const undoCheck = tabShapesEqual(originalShape, afterUndoState);
      if (!undoCheck.equal)
      {
        console.error(`  FAIL After undo(): ${undoCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `After undo(): ${undoCheck.diff}` });
        continue;
      }

      console.log('  PASS');
      results.push({ name: testCase.name, passed: true });
    }
    catch (err)
    {
      const error = `Exception: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  FAIL ${error}`);
      results.push({ name: testCase.name, passed: false, error });
    }
    finally
    {
      // Cleanup test tabs and bookmarks
      await cleanup(windowId, keeperTabId, setup?.bookmarkIds ?? []);
    }
  }

  // Close keeper tab
  try { await chrome.tabs.remove(keeperTabId); }
  catch { /* ignore */ }

  // Report results
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n--- Results ---');
  for (const r of results)
  {
    if (r.passed)
    {
      console.log(`✓ ${r.name}`);
    }
    else
    {
      console.error(`✗ ${r.name}: ${r.error}`);
    }
  }
  console.log(`${passed}/${results.length} passed`);

  if (failed === 0)
  {
    onShowToast(`All ${passed} tests passed`);
  }
  else
  {
    onShowToast(`${failed}/${results.length} tests failed — see console`);
  }
}
