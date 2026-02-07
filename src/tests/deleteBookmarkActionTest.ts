import { DeleteBookmarkAction } from '../actions/deleteBookmarkAction';

// --- Types ---

interface TestNode
{
  title: string;
  url?: string;
  children?: TestNode[];
  selected?: boolean;
}

interface TreeShape
{
  title: string;
  url?: string;
  children?: TreeShape[];
}

interface TestCase
{
  name: string;
  tree: TestNode[];
  selectionOrder?: string[];   // Pass IDs in this title order (default: tree traversal order)
  expectedDescription: string;
  expectedAfterDo: TreeShape[];
}

interface TestResult
{
  name: string;
  passed: boolean;
  error?: string;
}

// --- Helpers ---

async function createTree(
  parentId: string,
  nodes: TestNode[]
): Promise<Map<string, string>>
{
  const idMap = new Map<string, string>();
  for (const node of nodes)
  {
    const isFolder = node.children !== undefined;
    const created = await chrome.bookmarks.create({
      parentId,
      title: node.title,
      url: isFolder ? undefined : node.url,
    });
    idMap.set(node.title, created.id);
    if (isFolder && node.children)
    {
      const childMap = await createTree(created.id, node.children);
      childMap.forEach((v, k) => idMap.set(k, v));
    }
  }
  return idMap;
}

function collectSelectedTitles(nodes: TestNode[]): string[]
{
  const titles: string[] = [];
  for (const node of nodes)
  {
    if (node.selected) titles.push(node.title);
    if (node.children)
    {
      titles.push(...collectSelectedTitles(node.children));
    }
  }
  return titles;
}

function testNodesToShape(nodes: TestNode[]): TreeShape[]
{
  return nodes.map(node =>
  {
    const shape: TreeShape = { title: node.title };
    if (node.url !== undefined) shape.url = node.url;
    if (node.children !== undefined) shape.children = testNodesToShape(node.children);
    return shape;
  });
}

function nodeToTreeShape(node: chrome.bookmarks.BookmarkTreeNode): TreeShape
{
  const shape: TreeShape = { title: node.title };
  if (node.url !== undefined) shape.url = node.url;
  if (node.children !== undefined) shape.children = node.children.map(nodeToTreeShape);
  return shape;
}

async function getSubtreeShape(nodeId: string): Promise<TreeShape[]>
{
  const [subtree] = await chrome.bookmarks.getSubTree(nodeId);
  if (!subtree.children) return [];
  return subtree.children.map(nodeToTreeShape);
}

function shapesEqual(
  expected: TreeShape[],
  actual: TreeShape[],
  path = ''
): { equal: boolean; diff?: string }
{
  if (expected.length !== actual.length)
  {
    return {
      equal: false,
      diff: `${path}length: expected ${expected.length}, got ${actual.length}`
    };
  }
  for (let i = 0; i < expected.length; i++)
  {
    const e = expected[i];
    const a = actual[i];
    const itemPath = `${path}[${i}] `;

    if (e.title !== a.title)
    {
      return { equal: false, diff: `${itemPath}title: expected "${e.title}", got "${a.title}"` };
    }
    if ((e.url ?? '') !== (a.url ?? ''))
    {
      return { equal: false, diff: `${itemPath}url: expected "${e.url}", got "${a.url}"` };
    }

    const eIsFolder = e.children !== undefined;
    const aIsFolder = a.children !== undefined;
    if (eIsFolder !== aIsFolder)
    {
      return {
        equal: false,
        diff: `${itemPath}"${e.title}" type: expected ${eIsFolder ? 'folder' : 'bookmark'}, got ${aIsFolder ? 'folder' : 'bookmark'}`
      };
    }
    if (eIsFolder)
    {
      const childResult = shapesEqual(e.children!, a.children!, `${itemPath}"${e.title}" > `);
      if (!childResult.equal) return childResult;
    }
  }
  return { equal: true };
}

// Format a TreeShape[] as an ASCII tree for console output
function formatTree(nodes: TreeShape[], prefix = ''): string
{
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++)
  {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const isFolder = node.children !== undefined;
    const label = (node.title || '(empty title)') + (isFolder ? '/' : '');
    lines.push(`${prefix}${connector}${label}`);
    if (isFolder && node.children && node.children.length > 0)
    {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(formatTree(node.children, childPrefix));
    }
  }
  return lines.join('\n');
}

// Print the live bookmark tree under a node to console
async function printLiveTree(nodeId: string, label: string): Promise<void>
{
  const shape = await getSubtreeShape(nodeId);
  if (shape.length === 0)
  {
    console.log(`${label}:\n    (empty)`);
  }
  else
  {
    console.log(`${label}:\n${formatTree(shape, '    ')}`);
  }
}

async function cleanupTestFolders(): Promise<void>
{
  const children = await chrome.bookmarks.getChildren('2');
  for (const child of children)
  {
    if (child.title === 'test root')
    {
      try { await chrome.bookmarks.removeTree(child.id); }
      catch { /* ignore */ }
    }
  }
}

// --- Test Cases ---

const TEST_CASES: TestCase[] = [

  // Case 1: Single bookmark
  {
    name: 'Case 1: Single bookmark',
    tree: [
      { title: 'bookmark a', url: 'https://test.com/a', selected: true },
    ],
    expectedDescription: 'Deleted "bookmark a"',
    expectedAfterDo: [],
  },

  // Case 2: Multiple bookmarks (flat)
  {
    name: 'Case 2: Multiple bookmarks (flat)',
    tree: [
      { title: 'bookmark a', url: 'https://test.com/a', selected: true },
      { title: 'bookmark b', url: 'https://test.com/b', selected: true },
      { title: 'bookmark c', url: 'https://test.com/c', selected: true },
    ],
    expectedDescription: 'Deleted 3 bookmarks',
    expectedAfterDo: [],
  },

  // Case 3: Single folder with children
  {
    name: 'Case 3: Single folder with children',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          { title: 'bookmark a', url: 'https://test.com/a' },
          { title: 'bookmark b', url: 'https://test.com/b' },
          { title: 'bookmark c', url: 'https://test.com/c' },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 4: Folder and some of its direct children
  {
    name: 'Case 4: Folder and some direct children',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          { title: 'bookmark a', url: 'https://test.com/a', selected: true },
          { title: 'bookmark b', url: 'https://test.com/b', selected: true },
          { title: 'bookmark c', url: 'https://test.com/c' },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 5: Folder and all its direct children
  {
    name: 'Case 5: Folder and all direct children',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          { title: 'bookmark a', url: 'https://test.com/a', selected: true },
          { title: 'bookmark b', url: 'https://test.com/b', selected: true },
          { title: 'bookmark c', url: 'https://test.com/c', selected: true },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 6: Folder, some children, and a subfolder
  {
    name: 'Case 6: Folder, some children, and subfolder',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          { title: 'bookmark a', url: 'https://test.com/a', selected: true },
          { title: 'bookmark b', url: 'https://test.com/b' },
          {
            title: 'folder 12', selected: true, children: [
              { title: 'bookmark d', url: 'https://test.com/d' },
            ]
          },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 7: Folder selected, scattered deep descendants selected
  {
    name: 'Case 7: Folder + scattered deep descendants',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          {
            title: 'folder 12', children: [
              { title: 'bookmark d', url: 'https://test.com/d', selected: true },
              { title: 'bookmark e', url: 'https://test.com/e', selected: true },
              { title: 'bookmark f', url: 'https://test.com/f', selected: true },
              {
                title: 'folder 123', children: [
                  {
                    title: 'folder 1234', children: [
                      {
                        title: 'folder 12345', children: [
                          { title: 'bookmark g', url: 'https://test.com/g', selected: true },
                        ]
                      },
                    ]
                  },
                ]
              },
            ]
          },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 8: Folder selected, deep descendant folder also selected
  {
    name: 'Case 8: Folder + deep descendant folder selected',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          {
            title: 'folder 12', children: [
              { title: 'bookmark d', url: 'https://test.com/d', selected: true },
              { title: 'bookmark e', url: 'https://test.com/e', selected: true },
              { title: 'bookmark f', url: 'https://test.com/f', selected: true },
              {
                title: 'folder 123', children: [
                  {
                    title: 'folder 1234', selected: true, children: [
                      {
                        title: 'folder 12345', children: [
                          { title: 'bookmark g', url: 'https://test.com/g' },
                        ]
                      },
                    ]
                  },
                ]
              },
            ]
          },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 9: Two sibling folders with some children selected
  {
    name: 'Case 9: Two sibling folders + children',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          { title: 'bookmark a', url: 'https://test.com/a' },
          { title: 'bookmark b', url: 'https://test.com/b', selected: true },
          { title: 'bookmark c', url: 'https://test.com/c', selected: true },
        ]
      },
      {
        title: 'folder 2', selected: true, children: [
          { title: 'bookmark d', url: 'https://test.com/d' },
          { title: 'bookmark e', url: 'https://test.com/e' },
          { title: 'bookmark f', url: 'https://test.com/f' },
        ]
      },
    ],
    expectedDescription: 'Deleted 2 bookmarks',
    expectedAfterDo: [],
  },

  // Case 10: Asymmetric subtrees, both top folders selected
  {
    name: 'Case 10: Asymmetric subtrees, both selected',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          {
            title: 'folder 12', children: [
              {
                title: 'folder 123', children: [
                  { title: 'bookmark d', url: 'https://test.com/d', selected: true },
                  { title: 'bookmark e', url: 'https://test.com/e', selected: true },
                  { title: 'bookmark f', url: 'https://test.com/f' },
                ]
              },
            ]
          },
        ]
      },
      {
        title: 'folder 2', selected: true, children: [
          { title: 'bookmark g', url: 'https://test.com/g' },
          { title: 'bookmark h', url: 'https://test.com/h' },
          { title: 'bookmark i', url: 'https://test.com/i' },
        ]
      },
    ],
    expectedDescription: 'Deleted 2 bookmarks',
    expectedAfterDo: [],
  },

  // Case 11: Asymmetric, folder 1 NOT selected
  {
    name: 'Case 11: Asymmetric, folder 1 not selected',
    tree: [
      {
        title: 'folder 1', children: [
          {
            title: 'folder 12', selected: true, children: [
              { title: 'bookmark d', url: 'https://test.com/d', selected: true },
              { title: 'bookmark e', url: 'https://test.com/e' },
              { title: 'bookmark f', url: 'https://test.com/f' },
            ]
          },
        ]
      },
      {
        title: 'folder 2', selected: true, children: [
          { title: 'bookmark g', url: 'https://test.com/g' },
          { title: 'bookmark h', url: 'https://test.com/h' },
          { title: 'bookmark i', url: 'https://test.com/i' },
        ]
      },
    ],
    expectedDescription: 'Deleted 2 bookmarks',
    expectedAfterDo: [
      { title: 'folder 1', children: [] },
    ],
  },

  // Case 12: Empty ID list (nothing selected)
  {
    name: 'Case 12: Empty ID list',
    tree: [
      { title: 'bookmark a', url: 'https://test.com/a' },
    ],
    expectedDescription: 'Deleted 0 bookmarks',
    expectedAfterDo: [
      { title: 'bookmark a', url: 'https://test.com/a' },
    ],
  },

  // Case 13: Empty folder (no children)
  {
    name: 'Case 13: Empty folder',
    tree: [
      { title: 'folder 1', selected: true, children: [] },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 14: Index preservation - middle bookmark
  {
    name: 'Case 14: Index preservation - middle bookmark',
    tree: [
      { title: 'bookmark x', url: 'https://test.com/x' },
      { title: 'bookmark a', url: 'https://test.com/a', selected: true },
      { title: 'bookmark y', url: 'https://test.com/y' },
    ],
    expectedDescription: 'Deleted "bookmark a"',
    expectedAfterDo: [
      { title: 'bookmark x', url: 'https://test.com/x' },
      { title: 'bookmark y', url: 'https://test.com/y' },
    ],
  },

  // Case 15: Multiple from same parent - index ordering
  {
    name: 'Case 15: Multiple from same parent - index ordering',
    tree: [
      { title: 'bookmark a', url: 'https://test.com/a' },
      { title: 'bookmark b', url: 'https://test.com/b', selected: true },
      { title: 'bookmark c', url: 'https://test.com/c' },
      { title: 'bookmark d', url: 'https://test.com/d', selected: true },
      { title: 'bookmark e', url: 'https://test.com/e' },
    ],
    expectedDescription: 'Deleted 2 bookmarks',
    expectedAfterDo: [
      { title: 'bookmark a', url: 'https://test.com/a' },
      { title: 'bookmark c', url: 'https://test.com/c' },
      { title: 'bookmark e', url: 'https://test.com/e' },
    ],
  },

  // Case 16: Chain of empty nested folders
  {
    name: 'Case 16: Chain of empty nested folders',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          {
            title: 'folder 12', children: [
              {
                title: 'folder 123', children: [
                  { title: 'folder 1234', children: [] },
                ]
              },
            ]
          },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 17: Bookmark with empty title
  {
    name: 'Case 17: Bookmark with empty title',
    tree: [
      { title: '', url: 'https://test.com/notitle', selected: true },
    ],
    expectedDescription: 'Deleted "bookmark"',
    expectedAfterDo: [],
  },

  // Case 18: Interleaved folders and bookmarks - order preservation
  {
    name: 'Case 18: Interleaved folders and bookmarks',
    tree: [
      {
        title: 'folder 1', selected: true, children: [
          { title: 'bookmark a', url: 'https://test.com/a' },
          {
            title: 'folder 12', children: [
              { title: 'bookmark d', url: 'https://test.com/d' },
            ]
          },
          { title: 'bookmark b', url: 'https://test.com/b' },
          {
            title: 'folder 13', children: [
              { title: 'bookmark e', url: 'https://test.com/e' },
              { title: 'bookmark f', url: 'https://test.com/f' },
            ]
          },
          { title: 'bookmark c', url: 'https://test.com/c' },
        ]
      },
    ],
    expectedDescription: 'Deleted "folder 1"',
    expectedAfterDo: [],
  },

  // Case 19: Reverse selection order - undo "Index out of bounds" regression
  // When a higher-index sibling (DEF at idx=1) is selected before a lower-index
  // sibling (C at idx=0), the snapshot order causes undo to try creating at
  // index=1 in an empty folder.
  {
    name: 'Case 19: Reverse selection order - index out of bounds',
    tree: [
      {
        title: 'folder ABC', children: [
          { title: 'bookmark C', url: 'https://test.com/c', selected: true },
          {
            title: 'folder DEF', selected: true, children: [
              { title: 'bookmark A', url: 'https://test.com/a', selected: true },
            ]
          },
        ]
      },
      {
        title: 'folder HIJ', children: [
          { title: 'bookmark B', url: 'https://test.com/b', selected: true },
        ]
      },
    ],
    // DEF before C — this is the order that triggers the bug
    selectionOrder: ['folder DEF', 'bookmark C', 'bookmark A', 'bookmark B'],
    expectedDescription: 'Deleted 3 bookmarks',
    expectedAfterDo: [
      { title: 'folder ABC', children: [] },
      { title: 'folder HIJ', children: [] },
    ],
  },

];

// --- Random Test Case Generator ---

function generateRandomTestCases(count: number): TestCase[]
{
  let nodeId = 0;

  function generateTree(maxDepth: number, maxBreadth: number): TestNode[]
  {
    const childCount = 1 + Math.floor(Math.random() * maxBreadth);
    const nodes: TestNode[] = [];

    for (let i = 0; i < childCount; i++)
    {
      const id = ++nodeId;
      const isFolder = maxDepth > 0 && Math.random() < 0.4;

      if (isFolder)
      {
        nodes.push({
          title: `folder-${id}`,
          children: generateTree(maxDepth - 1, maxBreadth),
        });
      }
      else
      {
        nodes.push({
          title: `bm-${id}`,
          url: `https://test.com/${id}`,
        });
      }
    }
    return nodes;
  }

  function randomlySelect(nodes: TestNode[], prob: number): void
  {
    for (const node of nodes)
    {
      if (Math.random() < prob)
      {
        node.selected = true;
      }
      if (node.children)
      {
        randomlySelect(node.children, prob);
      }
    }
  }

  function hasAnySelected(nodes: TestNode[]): boolean
  {
    for (const node of nodes)
    {
      if (node.selected) return true;
      if (node.children && hasAnySelected(node.children)) return true;
    }
    return false;
  }

  function selectFirstLeaf(nodes: TestNode[]): boolean
  {
    for (const node of nodes)
    {
      if (!node.children)
      {
        node.selected = true;
        return true;
      }
      if (node.children && selectFirstLeaf(node.children)) return true;
    }
    return false;
  }

  function shuffleArray<T>(arr: T[]): T[]
  {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--)
    {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Collect titles of "deletion roots" — selected nodes with no selected ancestor.
  // When a node is selected, skip its children (they're dominated).
  function computeDedupedTitles(nodes: TestNode[]): string[]
  {
    const result: string[] = [];
    for (const node of nodes)
    {
      if (node.selected)
      {
        result.push(node.title);
      }
      else if (node.children)
      {
        result.push(...computeDedupedTitles(node.children));
      }
    }
    return result;
  }

  // Compute tree shape after do(): selected nodes and all their descendants are removed.
  function computeExpectedAfterDo(nodes: TestNode[]): TreeShape[]
  {
    const result: TreeShape[] = [];
    for (const node of nodes)
    {
      if (node.selected)
      {
        continue; // Deletion root — skip this node and all descendants
      }
      const shape: TreeShape = { title: node.title };
      if (node.url !== undefined) shape.url = node.url;
      if (node.children !== undefined)
      {
        shape.children = computeExpectedAfterDo(node.children);
      }
      result.push(shape);
    }
    return result;
  }

  const cases: TestCase[] = [];
  for (let i = 0; i < count; i++)
  {
    nodeId = 0;
    const tree = generateTree(3, 4);
    randomlySelect(tree, 0.35);

    if (!hasAnySelected(tree))
    {
      selectFirstLeaf(tree);
    }

    const selectedTitles = collectSelectedTitles(tree);
    const selectionOrder = shuffleArray(selectedTitles);
    const dedupedTitles = computeDedupedTitles(tree);
    const expectedAfterDo = computeExpectedAfterDo(tree);
    const expectedDescription = dedupedTitles.length === 1
      ? `Deleted "${dedupedTitles[0] || 'bookmark'}"`
      : `Deleted ${dedupedTitles.length} bookmarks`;

    cases.push({
      name: `Random ${i + 1}`,
      tree,
      selectionOrder,
      expectedDescription,
      expectedAfterDo,
    });
  }

  return cases;
}

// --- Test Runner ---

export async function runDeleteBookmarkTests(
  onShowToast: (message: string) => void
): Promise<void>
{
  console.log('=== DeleteBookmarkAction Tests ===');

  // Pre-cleanup leftover test folders from previous runs
  await cleanupTestFolders();

  const TestCaseRandom = generateRandomTestCases(10);
  const allCases = [...TEST_CASES, ...TestCaseRandom];
  const results: TestResult[] = [];

  for (const testCase of allCases)
  {
    console.log(`\n--- ${testCase.name} ---`);

    const testRoot = await chrome.bookmarks.create({
      parentId: '2',
      title: 'test root',
    });

    try
    {
      // Setup: create bookmark tree
      const idMap = await createTree(testRoot.id, testCase.tree);

      // Verify setup matches expected structure
      const setupShape = await getSubtreeShape(testRoot.id);
      const originalShape = testNodesToShape(testCase.tree);
      const setupResult = shapesEqual(originalShape, setupShape);
      if (!setupResult.equal)
      {
        console.error(`  FAIL Setup: ${setupResult.diff}`);
        results.push({ name: testCase.name, passed: false, error: `Setup: ${setupResult.diff}` });
        continue;
      }

      await printLiveTree(testRoot.id, '  Setup');

      // Collect selected IDs (use selectionOrder if provided to control ID ordering)
      const selectedTitles = testCase.selectionOrder ?? collectSelectedTitles(testCase.tree);
      const selectedIds = selectedTitles.map(t => idMap.get(t)!).filter(Boolean);
      console.log(`  Selected: [${selectedTitles.join(', ')}]`);

      // Run do()
      const action = new DeleteBookmarkAction(selectedIds);
      await action.do();

      await printLiveTree(testRoot.id, '  After do()');
      console.log(`  Description: "${action.description}"`);

      // Verify description
      if (action.description !== testCase.expectedDescription)
      {
        const error = `Description: expected "${testCase.expectedDescription}", got "${action.description}"`;
        console.error(`  FAIL ${error}`);
        results.push({ name: testCase.name, passed: false, error });
        continue;
      }

      // Verify tree after do()
      const afterDoShape = await getSubtreeShape(testRoot.id);
      const doResult = shapesEqual(testCase.expectedAfterDo, afterDoShape);
      if (!doResult.equal)
      {
        console.error(`  FAIL After do(): ${doResult.diff}`);
        results.push({ name: testCase.name, passed: false, error: `After do(): ${doResult.diff}` });
        continue;
      }

      // Run undo()
      await action.undo();

      await printLiveTree(testRoot.id, '  After undo()');

      // Verify tree after undo() matches original
      const afterUndoShape = await getSubtreeShape(testRoot.id);
      const undoResult = shapesEqual(originalShape, afterUndoShape);
      if (!undoResult.equal)
      {
        console.error(`  FAIL After undo(): ${undoResult.diff}`);
        results.push({ name: testCase.name, passed: false, error: `After undo(): ${undoResult.diff}` });
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
      try { await chrome.bookmarks.removeTree(testRoot.id); }
      catch { /* ignore - test root may already be gone */ }
    }
  }

  // Report results
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('--- Results ---');
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
