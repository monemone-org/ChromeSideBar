// Unit tests for searchParser
// Run via the Test button in Settings (dev mode only)

import { parseSearchQuery, matchesSearch, matchesFilter, ASTNode } from './searchParser';

interface TestResult
{
  name: string;
  passed: boolean;
  error?: string;
}

function assert(condition: boolean, message: string): void
{
  if (!condition)
  {
    throw new Error(message);
  }
}

function assertASTType(ast: ASTNode | null, type: string): void
{
  assert(ast !== null, `Expected AST node, got null`);
  assert(ast!.type === type, `Expected type '${type}', got '${ast!.type}'`);
}

// Test cases
const tests: Array<{ name: string; fn: () => void }> = [
  // Basic term parsing
  {
    name: 'parseSearchQuery: single term',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === 'youtube', 'Term value should be "youtube"');
    }
  },
  {
    name: 'parseSearchQuery: empty string returns null',
    fn: () =>
    {
      const ast = parseSearchQuery('');
      assert(ast === null, 'Empty string should return null');
    }
  },
  {
    name: 'parseSearchQuery: whitespace only returns null',
    fn: () =>
    {
      const ast = parseSearchQuery('   ');
      assert(ast === null, 'Whitespace only should return null');
    }
  },

  // AND operator
  {
    name: 'parseSearchQuery: explicit AND (&&)',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube && canada');
      assertASTType(ast, 'AND');
      assert((ast as any).left.type === 'TERM', 'Left should be TERM');
      assert((ast as any).right.type === 'TERM', 'Right should be TERM');
    }
  },
  {
    name: 'parseSearchQuery: implicit AND (space)',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube canada');
      assertASTType(ast, 'AND');
      assert((ast as any).left.value === 'youtube', 'Left should be "youtube"');
      assert((ast as any).right.value === 'canada', 'Right should be "canada"');
    }
  },
  {
    name: 'parseSearchQuery: multiple implicit ANDs',
    fn: () =>
    {
      const ast = parseSearchQuery('a b c');
      assertASTType(ast, 'AND');
      // Should be ((a AND b) AND c)
      assert((ast as any).left.type === 'AND', 'Left should be AND');
      assert((ast as any).right.value === 'c', 'Right should be "c"');
    }
  },

  // OR operator
  {
    name: 'parseSearchQuery: OR operator',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube || instagram');
      assertASTType(ast, 'OR');
      assert((ast as any).left.value === 'youtube', 'Left should be "youtube"');
      assert((ast as any).right.value === 'instagram', 'Right should be "instagram"');
    }
  },

  // NOT operator
  {
    name: 'parseSearchQuery: NOT operator',
    fn: () =>
    {
      const ast = parseSearchQuery('!tutorial');
      assertASTType(ast, 'NOT');
      assert((ast as any).operand.value === 'tutorial', 'Operand should be "tutorial"');
    }
  },
  {
    name: 'parseSearchQuery: double NOT',
    fn: () =>
    {
      const ast = parseSearchQuery('!!term');
      assertASTType(ast, 'NOT');
      assert((ast as any).operand.type === 'NOT', 'Operand should be NOT');
    }
  },

  // Grouping
  {
    name: 'parseSearchQuery: parentheses grouping',
    fn: () =>
    {
      const ast = parseSearchQuery('(youtube || instagram) && news');
      assertASTType(ast, 'AND');
      assert((ast as any).left.type === 'OR', 'Left should be OR');
      assert((ast as any).right.value === 'news', 'Right should be "news"');
    }
  },
  {
    name: 'parseSearchQuery: nested parentheses',
    fn: () =>
    {
      const ast = parseSearchQuery('((a || b) && c)');
      assertASTType(ast, 'AND');
    }
  },

  // Quoted strings
  {
    name: 'parseSearchQuery: double quoted string',
    fn: () =>
    {
      const ast = parseSearchQuery('"react hooks"');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === 'react hooks', 'Value should be "react hooks"');
    }
  },
  {
    name: 'parseSearchQuery: single quoted string',
    fn: () =>
    {
      const ast = parseSearchQuery("'react hooks'");
      assertASTType(ast, 'TERM');
      assert((ast as any).value === 'react hooks', 'Value should be "react hooks"');
    }
  },
  {
    name: 'parseSearchQuery: multi-quote string',
    fn: () =>
    {
      const ast = parseSearchQuery('""say "hello"""');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === 'say "hello"', 'Value should contain quotes');
    }
  },

  // Quoted strings with operators (should be literal)
  {
    name: 'parseSearchQuery: quoted && is literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"foo && bar"');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === 'foo && bar', 'Value should be literal "foo && bar"');
    }
  },
  {
    name: 'parseSearchQuery: quoted || is literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"foo || bar"');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === 'foo || bar', 'Value should be literal "foo || bar"');
    }
  },
  {
    name: 'parseSearchQuery: quoted parentheses is literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"(hello world)"');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === '(hello world)', 'Value should be literal "(hello world)"');
    }
  },
  {
    name: 'parseSearchQuery: quoted ! is literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"!important"');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === '!important', 'Value should be literal "!important"');
    }
  },
  {
    name: 'parseSearchQuery: quoted complex expression is literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"(a || b) && !c"');
      assertASTType(ast, 'TERM');
      assert((ast as any).value === '(a || b) && !c', 'Value should be literal expression');
    }
  },

  // matchesSearch with quoted operators
  {
    name: 'matchesSearch: quoted && matches literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"foo && bar"')!;
      assert(matchesSearch('Title with foo && bar', 'https://example.com', ast), 'Should match literal &&');
      assert(!matchesSearch('Title with foo and bar', 'https://example.com', ast), 'Should not match without &&');
    }
  },
  {
    name: 'matchesSearch: quoted || matches literal',
    fn: () =>
    {
      const ast = parseSearchQuery('"a || b"')!;
      assert(matchesSearch('Expression: a || b', 'https://example.com', ast), 'Should match literal ||');
      assert(!matchesSearch('Expression: a or b', 'https://example.com', ast), 'Should not match without ||');
    }
  },

  // Precedence
  {
    name: 'parseSearchQuery: AND binds tighter than OR',
    fn: () =>
    {
      const ast = parseSearchQuery('a || b && c');
      // Should be: a OR (b AND c)
      assertASTType(ast, 'OR');
      assert((ast as any).left.value === 'a', 'Left should be "a"');
      assert((ast as any).right.type === 'AND', 'Right should be AND');
    }
  },

  // Invalid syntax (should return null)
  {
    name: 'parseSearchQuery: unclosed paren returns null',
    fn: () =>
    {
      const ast = parseSearchQuery('(youtube');
      assert(ast === null, 'Unclosed paren should return null');
    }
  },
  {
    name: 'parseSearchQuery: unclosed quote returns null',
    fn: () =>
    {
      const ast = parseSearchQuery('"unclosed');
      assert(ast === null, 'Unclosed quote should return null');
    }
  },
  {
    name: 'parseSearchQuery: || at start returns null',
    fn: () =>
    {
      const ast = parseSearchQuery('|| youtube');
      assert(ast === null, 'OR at start should return null');
    }
  },

  // matchesSearch tests
  {
    name: 'matchesSearch: simple term match in title',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube')!;
      assert(matchesSearch('YouTube Video', 'https://example.com', ast), 'Should match title');
    }
  },
  {
    name: 'matchesSearch: simple term match in URL',
    fn: () =>
    {
      const ast = parseSearchQuery('example')!;
      assert(matchesSearch('Some Title', 'https://example.com', ast), 'Should match URL');
    }
  },
  {
    name: 'matchesSearch: case insensitive',
    fn: () =>
    {
      const ast = parseSearchQuery('YOUTUBE')!;
      assert(matchesSearch('youtube video', 'https://example.com', ast), 'Should be case insensitive');
    }
  },
  {
    name: 'matchesSearch: AND requires both terms',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube canada')!;
      assert(matchesSearch('YouTube Canada', 'https://example.com', ast), 'Should match both');
      assert(!matchesSearch('YouTube Video', 'https://example.com', ast), 'Should not match one');
    }
  },
  {
    name: 'matchesSearch: OR matches either term',
    fn: () =>
    {
      const ast = parseSearchQuery('youtube || instagram')!;
      assert(matchesSearch('YouTube Video', 'https://example.com', ast), 'Should match youtube');
      assert(matchesSearch('instagram Feed', 'https://example.com', ast), 'Should match instagram');
      assert(!matchesSearch('Facebook Page', 'https://example.com', ast), 'Should not match neither');
    }
  },
  {
    name: 'matchesSearch: NOT excludes term',
    fn: () =>
    {
      const ast = parseSearchQuery('react !tutorial')!;
      assert(matchesSearch('React Docs', 'https://react.dev', ast), 'Should match react without tutorial');
      assert(!matchesSearch('React Tutorial', 'https://example.com', ast), 'Should not match with tutorial');
    }
  },
  {
    name: 'matchesSearch: complex expression',
    fn: () =>
    {
      const ast = parseSearchQuery('(youtube || instagram) && news')!;
      assert(matchesSearch('YouTube News', 'https://example.com', ast), 'Should match youtube + news');
      assert(matchesSearch('instagram News', 'https://example.com', ast), 'Should match instagram + news');
      assert(!matchesSearch('YouTube Video', 'https://example.com', ast), 'Should not match without news');
    }
  },
  {
    name: 'matchesSearch: exact phrase',
    fn: () =>
    {
      const ast = parseSearchQuery('"react hooks"')!;
      assert(matchesSearch('Learn React Hooks', 'https://example.com', ast), 'Should match exact phrase');
      assert(!matchesSearch('React and Hooks', 'https://example.com', ast), 'Should not match separated');
    }
  },

  // matchesFilter tests (convenience function)
  {
    name: 'matchesFilter: empty query matches everything',
    fn: () =>
    {
      assert(matchesFilter('Any Title', 'https://any.com', ''), 'Empty should match');
      assert(matchesFilter('Any Title', 'https://any.com', '   '), 'Whitespace should match');
    }
  },
  {
    name: 'matchesFilter: falls back to literal on invalid syntax',
    fn: () =>
    {
      // "|| youtube" is invalid syntax, should search literally
      assert(matchesFilter('|| youtube', 'https://example.com', '|| youtube'), 'Should find literal');
    }
  },
  {
    name: 'matchesFilter: normal search works',
    fn: () =>
    {
      assert(matchesFilter('YouTube', 'https://youtube.com', 'youtube'), 'Should match');
      assert(!matchesFilter('instagram', 'https://instagram.com', 'youtube'), 'Should not match');
    }
  },
];

// Run all tests
export function runSearchParserTests(): { results: TestResult[]; passed: number; failed: number }
{
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests)
  {
    try
    {
      test.fn();
      results.push({ name: test.name, passed: true });
      passed++;
    }
    catch (e)
    {
      results.push({ name: test.name, passed: false, error: (e as Error).message });
      failed++;
    }
  }

  return { results, passed, failed };
}
