// Unit tests for DeletePinnedSiteAction
// Run via the "Unit Test Do/Undo Delete Pinned Sites" menu item (dev mode only)

import { DeletePinnedSiteAction } from '../actions/deletePinnedSiteAction';
import { PinnedSite } from '../hooks/usePinnedSites';
import { TestResult } from './testUtils';

// --- Types ---

interface PinShape
{
  id: string;
  url: string;
  title: string;
  hasCustomIcon: boolean;
  index: number;
}

interface TestPin
{
  id: string;
  url: string;
  title: string;
  favicon?: string;
  customIconName?: string;
  iconColor?: string;
  selected?: boolean;
  withTab?: boolean;       // Create a real tab associated with this pin
}

interface TestCase
{
  name: string;
  pins: TestPin[];
  expectedAfterDo: PinShape[];
}

// --- Helpers ---

const STORAGE_KEY = 'pinnedSites';
const TEST_URL_PREFIX = 'https://example.com/pin-test-';
const SETTLE_MS = 300;

function testUrl(n: number): string
{
  return `${TEST_URL_PREFIX}${n}`;
}

function settle(): Promise<void>
{
  return new Promise(resolve => setTimeout(resolve, SETTLE_MS));
}

function pinToShape(pin: PinnedSite, index: number): PinShape
{
  return {
    id: pin.id,
    url: pin.url,
    title: pin.title,
    hasCustomIcon: !!pin.customIconName,
    index,
  };
}

function testPinToShape(pin: TestPin, index: number): PinShape
{
  return {
    id: pin.id,
    url: pin.url,
    title: pin.title,
    hasCustomIcon: !!pin.customIconName,
    index,
  };
}

async function readPinsFromStorage(): Promise<PinnedSite[]>
{
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] || [];
}

function pinsToShapes(pins: PinnedSite[]): PinShape[]
{
  return pins.map((p, i) => pinToShape(p, i));
}

function shapesEqual(
  expected: PinShape[],
  actual: PinShape[]
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

    if (e.id !== a.id)
    {
      return { equal: false, diff: `${p}id: expected "${e.id}", got "${a.id}"` };
    }
    if (e.url !== a.url)
    {
      return { equal: false, diff: `${p}url: expected "${e.url}", got "${a.url}"` };
    }
    if (e.title !== a.title)
    {
      return { equal: false, diff: `${p}title: expected "${e.title}", got "${a.title}"` };
    }
    if (e.hasCustomIcon !== a.hasCustomIcon)
    {
      return { equal: false, diff: `${p}hasCustomIcon: expected ${e.hasCustomIcon}, got ${a.hasCustomIcon}` };
    }
  }
  return { equal: true };
}

function formatShapes(shapes: PinShape[]): string
{
  if (shapes.length === 0) return '    (empty)';
  return shapes.map((s, i) =>
  {
    const parts = [`id=${s.id}`, s.url.replace(TEST_URL_PREFIX, '#'), `"${s.title}"`];
    if (s.hasCustomIcon) parts.push('custom-icon');
    return `    [${i}] ${parts.join(' ')}`;
  }).join('\n');
}

// --- Test Cases ---

function makePin(n: number, overrides?: Partial<TestPin>): TestPin
{
  return {
    id: `pin_test_${n}`,
    url: testUrl(n),
    title: `Pin ${n}`,
    ...overrides,
  };
}

const TEST_CASES: TestCase[] = [

  // Case 1: Single pin delete
  {
    name: 'Case 1: Single pin delete',
    pins: [
      makePin(1, { selected: true }),
    ],
    expectedAfterDo: [],
  },

  // Case 2: Multiple pins delete (all)
  {
    name: 'Case 2: Multiple pins delete (all)',
    pins: [
      makePin(1, { selected: true }),
      makePin(2, { selected: true }),
      makePin(3, { selected: true }),
    ],
    expectedAfterDo: [],
  },

  // Case 3: Delete first pin (index preservation)
  {
    name: 'Case 3: Delete first pin',
    pins: [
      makePin(1, { selected: true }),
      makePin(2),
      makePin(3),
    ],
    expectedAfterDo: [
      testPinToShape(makePin(2), 0),
      testPinToShape(makePin(3), 1),
    ],
  },

  // Case 4: Delete middle pin (index preservation)
  {
    name: 'Case 4: Delete middle pin',
    pins: [
      makePin(1),
      makePin(2, { selected: true }),
      makePin(3),
    ],
    expectedAfterDo: [
      testPinToShape(makePin(1), 0),
      testPinToShape(makePin(3), 1),
    ],
  },

  // Case 5: Delete last pin (index preservation)
  {
    name: 'Case 5: Delete last pin',
    pins: [
      makePin(1),
      makePin(2),
      makePin(3, { selected: true }),
    ],
    expectedAfterDo: [
      testPinToShape(makePin(1), 0),
      testPinToShape(makePin(2), 1),
    ],
  },

  // Case 6: Pin with associated tab
  {
    name: 'Case 6: Pin with associated tab',
    pins: [
      makePin(1, { selected: true, withTab: true }),
    ],
    expectedAfterDo: [],
  },

  // Case 7: Pin with custom icon (customIconName, iconColor preserved)
  {
    name: 'Case 7: Pin with custom icon',
    pins: [
      makePin(1, {
        selected: true,
        customIconName: 'Star',
        iconColor: '#ef4444',
      }),
    ],
    expectedAfterDo: [],
  },

  // Case 8: Delete two non-adjacent pins
  {
    name: 'Case 8: Delete first and last',
    pins: [
      makePin(1, { selected: true }),
      makePin(2),
      makePin(3),
      makePin(4, { selected: true }),
    ],
    expectedAfterDo: [
      testPinToShape(makePin(2), 0),
      testPinToShape(makePin(3), 1),
    ],
  },

];

// --- Test Runner ---

export async function runDeletePinnedSiteTests(
  onShowToast: (message: string) => void
): Promise<void>
{
  console.log('=== DeletePinnedSiteAction Tests ===');

  const windowId = await new Promise<number>((resolve) =>
  {
    chrome.windows.getCurrent((win) => resolve(win.id!));
  });

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES)
  {
    console.log(`\n--- ${testCase.name} ---`);

    // Track tabs created for this test
    const testTabIds: number[] = [];
    const pinToTabId = new Map<string, number>();

    try
    {
      // Setup: write test pins to storage
      const testPins: PinnedSite[] = testCase.pins.map(p => ({
        id: p.id,
        url: p.url,
        title: p.title,
        favicon: p.favicon,
        customIconName: p.customIconName,
        iconColor: p.iconColor,
      }));
      await chrome.storage.local.set({ [STORAGE_KEY]: testPins });
      await settle();

      // Create tabs for pins that need them
      for (const pin of testCase.pins)
      {
        if (pin.withTab)
        {
          const tab = await chrome.tabs.create({
            url: pin.url,
            active: false,
            windowId,
          });
          if (tab.id)
          {
            testTabIds.push(tab.id);
            pinToTabId.set(pin.id, tab.id);
          }
        }
      }
      if (testTabIds.length > 0) await settle();

      // Verify setup
      const setupPins = await readPinsFromStorage();
      const setupShapes = pinsToShapes(setupPins);
      const originalShapes = testCase.pins.map((p, i) => testPinToShape(p, i));
      console.log(`  Setup:\n${formatShapes(setupShapes)}`);

      const setupCheck = shapesEqual(originalShapes, setupShapes);
      if (!setupCheck.equal)
      {
        console.error(`  FAIL Setup: ${setupCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Setup: ${setupCheck.diff}` });
        continue;
      }

      // Collect selected pin IDs
      const selectedIds = testCase.pins
        .filter(p => p.selected)
        .map(p => p.id);

      // Create action
      const action = new DeletePinnedSiteAction(
        selectedIds,
        () => [...testPins],
        (pinnedId) => pinToTabId.get(pinnedId)
      );

      // --- do() ---
      await action.do();
      await settle();

      const afterDoPins = await readPinsFromStorage();
      const afterDoShapes = pinsToShapes(afterDoPins);
      console.log(`  After do():\n${formatShapes(afterDoShapes)}`);
      console.log(`  Description: "${action.description}"`);

      const doCheck = shapesEqual(testCase.expectedAfterDo, afterDoShapes);
      if (!doCheck.equal)
      {
        console.error(`  FAIL After do(): ${doCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `After do(): ${doCheck.diff}` });
        continue;
      }

      // --- undo() ---
      await action.undo();
      await settle();

      const afterUndoPins = await readPinsFromStorage();
      const afterUndoShapes = pinsToShapes(afterUndoPins);
      console.log(`  After undo():\n${formatShapes(afterUndoShapes)}`);

      const undoCheck = shapesEqual(originalShapes, afterUndoShapes);
      if (!undoCheck.equal)
      {
        console.error(`  FAIL After undo(): ${undoCheck.diff}`);
        results.push({ name: testCase.name, passed: false, error: `After undo(): ${undoCheck.diff}` });
        continue;
      }

      // Verify custom icon preservation
      const customIconPin = testCase.pins.find(p => p.selected && p.customIconName);
      if (customIconPin)
      {
        const restoredPin = afterUndoPins.find(p => p.id === customIconPin.id);
        if (!restoredPin || restoredPin.customIconName !== customIconPin.customIconName
          || restoredPin.iconColor !== customIconPin.iconColor)
        {
          const error = `Custom icon not preserved: expected ${customIconPin.customIconName}/${customIconPin.iconColor}, `
            + `got ${restoredPin?.customIconName}/${restoredPin?.iconColor}`;
          console.error(`  FAIL ${error}`);
          results.push({ name: testCase.name, passed: false, error });
          continue;
        }
      }

      // Verify tabs were closed on do() for withTab pins
      for (const pin of testCase.pins)
      {
        if (pin.selected && pin.withTab)
        {
          const tabId = pinToTabId.get(pin.id);
          if (tabId !== undefined)
          {
            try
            {
              await chrome.tabs.get(tabId);
              // Tab still exists — fail
              const error = `Tab for "${pin.title}" (tabId=${tabId}) should have been closed`;
              console.error(`  FAIL ${error}`);
              results.push({ name: testCase.name, passed: false, error });
              continue;
            }
            catch
            {
              // Tab was closed — expected
            }
          }
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
      // Cleanup: close test tabs
      for (const tabId of testTabIds)
      {
        try { await chrome.tabs.remove(tabId); }
        catch { /* ignore */ }
      }
      // Cleanup: clear test pins from storage
      await chrome.storage.local.set({ [STORAGE_KEY]: [] });
      await settle();
    }
  }

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
