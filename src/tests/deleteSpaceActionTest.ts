// Unit tests for DeleteSpaceAction
// Run via the "Unit Test Do/Undo Delete Space" menu item (dev mode only)

import { DeleteSpaceAction } from '../actions/deleteSpaceAction';
import { Space } from '../contexts/SpacesContext';
import { TestResult } from './testUtils';

// --- Types ---

interface SpaceShape
{
  id: string;
  name: string;
  color: chrome.tabGroups.ColorEnum;
  icon: string;
  index: number;
}

interface TabShape
{
  url: string;
  group?: string;
}

interface TestCase
{
  name: string;
  spaces: Space[];
  deleteSpaceId: string;
  tabsInGroup: { url: string }[];   // Tabs to create in the space's Chrome group
  expectedSpacesAfterDo: SpaceShape[];
  expectedTabsAfterDo: TabShape[];   // Test tabs remaining after do
}

// --- Helpers ---

const SPACES_STORAGE_KEY = 'spaces';
const TEST_URL_PREFIX = 'https://example.com/space-test-';
const SETTLE_MS = 500;

function testUrl(n: number): string
{
  return `${TEST_URL_PREFIX}${n}`;
}

function settle(): Promise<void>
{
  return new Promise(resolve => setTimeout(resolve, SETTLE_MS));
}

function spaceToShape(space: Space, index: number): SpaceShape
{
  return {
    id: space.id,
    name: space.name,
    color: space.color,
    icon: space.icon,
    index,
  };
}

async function readSpacesFromStorage(): Promise<Space[]>
{
  const result = await chrome.storage.local.get([SPACES_STORAGE_KEY]);
  return result[SPACES_STORAGE_KEY] || [];
}

function spacesToShapes(spaces: Space[]): SpaceShape[]
{
  return spaces.map((s, i) => spaceToShape(s, i));
}

function spaceShapesEqual(
  expected: SpaceShape[],
  actual: SpaceShape[]
): { equal: boolean; diff?: string }
{
  if (expected.length !== actual.length)
  {
    return {
      equal: false,
      diff: `space count: expected ${expected.length}, got ${actual.length}`,
    };
  }
  for (let i = 0; i < expected.length; i++)
  {
    const e = expected[i];
    const a = actual[i];
    const p = `[${i}] `;

    if (e.id !== a.id)
    {
      return { equal: false, diff: `${p}id: expected "${e.id}", got "${a.id}"` };
    }
    if (e.name !== a.name)
    {
      return { equal: false, diff: `${p}name: expected "${e.name}", got "${a.name}"` };
    }
    if (e.color !== a.color)
    {
      return { equal: false, diff: `${p}color: expected "${e.color}", got "${a.color}"` };
    }
    if (e.icon !== a.icon)
    {
      return { equal: false, diff: `${p}icon: expected "${e.icon}", got "${a.icon}"` };
    }
  }
  return { equal: true };
}

function formatSpaceShapes(shapes: SpaceShape[]): string
{
  if (shapes.length === 0) return '    (empty)';
  return shapes.map((s, i) =>
  {
    return `    [${i}] "${s.name}" (id=${s.id}, color=${s.color}, icon=${s.icon})`;
  }).join('\n');
}

async function getTestTabState(
  windowId: number,
  keeperTabId: number
): Promise<TabShape[]>
{
  const allTabs = await chrome.tabs.query({ windowId });
  const testTabs = allTabs
    .filter(t => t.id !== keeperTabId && t.url?.startsWith(TEST_URL_PREFIX))
    .sort((a, b) => a.index - b.index);

  const groups = await chrome.tabGroups.query({ windowId });
  const groupTitleMap = new Map<number, string>();
  for (const g of groups)
  {
    groupTitleMap.set(g.id, g.title || '');
  }

  return testTabs.map(tab =>
  {
    const shape: TabShape = { url: tab.url! };
    if (tab.groupId && tab.groupId !== -1)
    {
      shape.group = groupTitleMap.get(tab.groupId);
    }
    return shape;
  });
}

function tabShapesEqual(
  expected: TabShape[],
  actual: TabShape[]
): { equal: boolean; diff?: string }
{
  if (expected.length !== actual.length)
  {
    return {
      equal: false,
      diff: `tab count: expected ${expected.length}, got ${actual.length}`,
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
  }
  return { equal: true };
}

function formatTabShapes(shapes: TabShape[]): string
{
  if (shapes.length === 0) return '    (empty)';
  return shapes.map((s, i) =>
  {
    const parts = [s.url.replace(TEST_URL_PREFIX, '#')];
    if (s.group) parts.push(`group="${s.group}"`);
    return `    [${i}] ${parts.join(' ')}`;
  }).join('\n');
}

// --- Test Space Definitions ---

function makeSpace(n: number, overrides?: Partial<Space>): Space
{
  return {
    id: `space_test_${n}`,
    name: `TestSpace${n}`,
    icon: 'Folder',
    color: 'blue' as chrome.tabGroups.ColorEnum,
    bookmarkFolderPath: '',
    ...overrides,
  };
}

// --- Test Cases ---

const TEST_CASES: TestCase[] = [

  // Case 1: Space with no tabs in group (metadata-only)
  {
    name: 'Case 1: Space with no tabs',
    spaces: [makeSpace(1)],
    deleteSpaceId: 'space_test_1',
    tabsInGroup: [],
    expectedSpacesAfterDo: [],
    expectedTabsAfterDo: [],
  },

  // Case 2: Space with tabs in group
  {
    name: 'Case 2: Space with tabs',
    spaces: [makeSpace(1)],
    deleteSpaceId: 'space_test_1',
    tabsInGroup: [
      { url: testUrl(1) },
      { url: testUrl(2) },
    ],
    expectedSpacesAfterDo: [],
    expectedTabsAfterDo: [],
  },

  // Case 3: Space with specific color/icon
  {
    name: 'Case 3: Space with color and icon',
    spaces: [makeSpace(1, { color: 'red', icon: 'Star' })],
    deleteSpaceId: 'space_test_1',
    tabsInGroup: [{ url: testUrl(1) }],
    expectedSpacesAfterDo: [],
    expectedTabsAfterDo: [],
  },

  // Case 4: Delete first space (index preservation)
  {
    name: 'Case 4: Delete first space',
    spaces: [
      makeSpace(1),
      makeSpace(2, { color: 'green' }),
      makeSpace(3, { color: 'red' }),
    ],
    deleteSpaceId: 'space_test_1',
    tabsInGroup: [],
    expectedSpacesAfterDo: [
      spaceToShape(makeSpace(2, { color: 'green' }), 0),
      spaceToShape(makeSpace(3, { color: 'red' }), 1),
    ],
    expectedTabsAfterDo: [],
  },

  // Case 5: Delete middle space (index preservation)
  {
    name: 'Case 5: Delete middle space',
    spaces: [
      makeSpace(1),
      makeSpace(2, { color: 'green' }),
      makeSpace(3, { color: 'red' }),
    ],
    deleteSpaceId: 'space_test_2',
    tabsInGroup: [],
    expectedSpacesAfterDo: [
      spaceToShape(makeSpace(1), 0),
      spaceToShape(makeSpace(3, { color: 'red' }), 1),
    ],
    expectedTabsAfterDo: [],
  },

  // Case 6: Delete last space (index preservation)
  {
    name: 'Case 6: Delete last space',
    spaces: [
      makeSpace(1),
      makeSpace(2, { color: 'green' }),
      makeSpace(3, { color: 'red' }),
    ],
    deleteSpaceId: 'space_test_3',
    tabsInGroup: [],
    expectedSpacesAfterDo: [
      spaceToShape(makeSpace(1), 0),
      spaceToShape(makeSpace(2, { color: 'green' }), 1),
    ],
    expectedTabsAfterDo: [],
  },

];

// --- Test Runner ---

export async function runDeleteSpaceTests(
  onShowToast: (message: string) => void
): Promise<void>
{
  console.log('=== DeleteSpaceAction Tests ===');

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

    const testTabIds: number[] = [];

    try
    {
      // Setup: write test spaces to storage
      await chrome.storage.local.set({ [SPACES_STORAGE_KEY]: testCase.spaces });
      await settle();

      // Create tabs in a Chrome group matching the target space name
      const targetSpace = testCase.spaces.find(s => s.id === testCase.deleteSpaceId);
      let groupId: number | undefined;

      if (targetSpace && testCase.tabsInGroup.length > 0)
      {
        for (const tabDef of testCase.tabsInGroup)
        {
          const tab = await chrome.tabs.create({
            url: tabDef.url,
            active: false,
            windowId,
          });
          if (tab.id)
          {
            testTabIds.push(tab.id);

            if (groupId === undefined)
            {
              groupId = await chrome.tabs.group({
                tabIds: [tab.id],
                createProperties: { windowId },
              });
              await chrome.tabGroups.update(groupId, {
                title: targetSpace.name,
                color: targetSpace.color,
              });
            }
            else
            {
              await chrome.tabs.group({ tabIds: [tab.id], groupId });
            }
          }
        }
        await settle();
      }

      // Verify setup
      const setupSpaces = await readSpacesFromStorage();
      const setupSpaceShapes = spacesToShapes(setupSpaces);
      const originalSpaceShapes = spacesToShapes(testCase.spaces);
      console.log(`  Spaces setup:\n${formatSpaceShapes(setupSpaceShapes)}`);

      const setupSpaceCheck = spaceShapesEqual(originalSpaceShapes, setupSpaceShapes);
      if (!setupSpaceCheck.equal)
      {
        console.error(`  FAIL Setup spaces: ${setupSpaceCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Setup spaces: ${setupSpaceCheck.diff}` });
        continue;
      }

      const setupTabs = await getTestTabState(windowId, keeperTabId);
      console.log(`  Tabs setup:\n${formatTabShapes(setupTabs)}`);

      // Build original tab shapes for undo verification
      const originalTabShapes: TabShape[] = testCase.tabsInGroup.map(t => ({
        url: t.url,
        group: targetSpace?.name,
      }));

      // Create action
      const action = new DeleteSpaceAction(
        testCase.deleteSpaceId,
        () => [...testCase.spaces],
        windowId
      );

      // --- do() ---
      await action.do();
      await settle();

      const afterDoSpaces = await readSpacesFromStorage();
      const afterDoSpaceShapes = spacesToShapes(afterDoSpaces);
      console.log(`  Spaces after do():\n${formatSpaceShapes(afterDoSpaceShapes)}`);
      console.log(`  Description: "${action.description}"`);

      const doSpaceCheck = spaceShapesEqual(testCase.expectedSpacesAfterDo, afterDoSpaceShapes);
      if (!doSpaceCheck.equal)
      {
        console.error(`  FAIL Spaces after do(): ${doSpaceCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Spaces after do(): ${doSpaceCheck.diff}` });
        continue;
      }

      const afterDoTabs = await getTestTabState(windowId, keeperTabId);
      console.log(`  Tabs after do():\n${formatTabShapes(afterDoTabs)}`);

      const doTabCheck = tabShapesEqual(testCase.expectedTabsAfterDo, afterDoTabs);
      if (!doTabCheck.equal)
      {
        console.error(`  FAIL Tabs after do(): ${doTabCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Tabs after do(): ${doTabCheck.diff}` });
        continue;
      }

      // --- undo() ---
      await action.undo();
      await settle();

      const afterUndoSpaces = await readSpacesFromStorage();
      const afterUndoSpaceShapes = spacesToShapes(afterUndoSpaces);
      console.log(`  Spaces after undo():\n${formatSpaceShapes(afterUndoSpaceShapes)}`);

      const undoSpaceCheck = spaceShapesEqual(originalSpaceShapes, afterUndoSpaceShapes);
      if (!undoSpaceCheck.equal)
      {
        console.error(`  FAIL Spaces after undo(): ${undoSpaceCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Spaces after undo(): ${undoSpaceCheck.diff}` });
        continue;
      }

      // Verify tabs restored in group
      if (testCase.tabsInGroup.length > 0)
      {
        const afterUndoTabs = await getTestTabState(windowId, keeperTabId);
        console.log(`  Tabs after undo():\n${formatTabShapes(afterUndoTabs)}`);

        const undoTabCheck = tabShapesEqual(originalTabShapes, afterUndoTabs);
        if (!undoTabCheck.equal)
        {
          console.error(`  FAIL Tabs after undo(): ${undoTabCheck.diff}`);
          results.push({ name: testCase.name, passed: false, error: `Tabs after undo(): ${undoTabCheck.diff}` });
          continue;
        }
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
      // Cleanup: close remaining test tabs
      const allTabs = await chrome.tabs.query({ windowId });
      const remainingTestTabIds = allTabs
        .filter(t => t.id !== keeperTabId && t.url?.startsWith(TEST_URL_PREFIX))
        .map(t => t.id!)
        .filter(id => id !== undefined);

      if (remainingTestTabIds.length > 0)
      {
        try { await chrome.tabs.remove(remainingTestTabIds); }
        catch { /* ignore */ }
      }

      // Cleanup: clear test spaces from storage
      await chrome.storage.local.set({ [SPACES_STORAGE_KEY]: [] });
      await settle();
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
      console.log(`\u2713 ${r.name}`);
    }
    else
    {
      console.error(`\u2717 ${r.name}: ${r.error}`);
    }
  }
  console.log(`${passed}/${results.length} passed`);

  if (failed === 0)
  {
    onShowToast(`All ${passed} tests passed`);
  }
  else
  {
    onShowToast(`${failed}/${results.length} tests failed \u2014 see console`);
  }
}
