// Advanced search parser with boolean operators
// Supports: && (AND), || (OR), ! (NOT), (), "quoted strings", 'single quotes'
// Space between terms is implicit AND

// AST Node Types
export type ASTNode =
  | { type: 'TERM'; value: string }
  | { type: 'AND'; left: ASTNode; right: ASTNode }
  | { type: 'OR'; left: ASTNode; right: ASTNode }
  | { type: 'NOT'; operand: ASTNode };

// Token Types
type TokenType = 'TERM' | 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token
{
  type: TokenType;
  value: string;
}

// Tokenizer: Convert query string to tokens
function tokenize(query: string): Token[] | null
{
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < query.length)
  {
    // Skip whitespace (but remember it for implicit AND)
    if (/\s/.test(query[pos]))
    {
      pos++;
      continue;
    }

    // Multi-quote strings: ""..."" or '''...'''
    if (query.slice(pos, pos + 2) === '""' || query.slice(pos, pos + 3) === "'''")
    {
      const isDouble = query.slice(pos, pos + 2) === '""';
      const delimiter = isDouble ? '""' : "'''";
      const delimLen = delimiter.length;
      const quoteChar = delimiter[0];
      const start = pos + delimLen;

      // Find closing delimiter: look for sequence of quotes followed by non-quote or end
      let end = -1;
      let searchPos = start;
      while (searchPos < query.length)
      {
        if (query[searchPos] === quoteChar)
        {
          // Count consecutive quotes
          let quoteCount = 0;
          const quoteStart = searchPos;
          while (searchPos < query.length && query[searchPos] === quoteChar)
          {
            quoteCount++;
            searchPos++;
          }
          // Closing delimiter is the last delimLen quotes in this run
          if (quoteCount >= delimLen)
          {
            end = quoteStart + quoteCount - delimLen;
            break;
          }
        }
        else
        {
          searchPos++;
        }
      }

      if (end === -1)
      {
        return null; // Unclosed multi-quote
      }

      tokens.push({ type: 'TERM', value: query.slice(start, end) });
      pos = end + delimLen;
      continue;
    }

    // Single or double quoted strings
    if (query[pos] === '"' || query[pos] === "'")
    {
      const quote = query[pos];
      const start = pos + 1;
      const end = query.indexOf(quote, start);

      if (end === -1)
      {
        return null; // Unclosed quote
      }

      tokens.push({ type: 'TERM', value: query.slice(start, end) });
      pos = end + 1;
      continue;
    }

    // OR operator
    if (query.slice(pos, pos + 2) === '||')
    {
      tokens.push({ type: 'OR', value: '||' });
      pos += 2;
      continue;
    }

    // AND operator
    if (query.slice(pos, pos + 2) === '&&')
    {
      tokens.push({ type: 'AND', value: '&&' });
      pos += 2;
      continue;
    }

    // NOT operator
    if (query[pos] === '!')
    {
      tokens.push({ type: 'NOT', value: '!' });
      pos++;
      continue;
    }

    // Parentheses
    if (query[pos] === '(')
    {
      tokens.push({ type: 'LPAREN', value: '(' });
      pos++;
      continue;
    }

    if (query[pos] === ')')
    {
      tokens.push({ type: 'RPAREN', value: ')' });
      pos++;
      continue;
    }

    // Term: anything else until whitespace or special char
    const termMatch = query.slice(pos).match(/^[^\s()"'|&!]+/);
    if (termMatch)
    {
      tokens.push({ type: 'TERM', value: termMatch[0] });
      pos += termMatch[0].length;
      continue;
    }

    // Single | or & - treat as part of term
    tokens.push({ type: 'TERM', value: query[pos] });
    pos++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// Parser: Recursive descent parser
class Parser
{
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[])
  {
    this.tokens = tokens;
    this.pos = 0;
  }

  private current(): Token
  {
    return this.tokens[this.pos];
  }

  private advance(): Token
  {
    const token = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1)
    {
      this.pos++;
    }
    return token;
  }

  // expression → orExpr
  parse(): ASTNode | null
  {
    const result = this.parseOr();

    if (this.current().type !== 'EOF')
    {
      return null; // Unexpected token at end
    }

    return result;
  }

  // orExpr → andExpr ('||' andExpr)*
  private parseOr(): ASTNode | null
  {
    let left = this.parseAnd();
    if (!left) return null;

    while (this.current().type === 'OR')
    {
      this.advance(); // consume '||'
      const right = this.parseAnd();
      if (!right) return null;
      left = { type: 'OR', left, right };
    }

    return left;
  }

  // andExpr → unaryExpr (('&&' | implicit) unaryExpr)*
  private parseAnd(): ASTNode | null
  {
    let left = this.parseUnary();
    if (!left) return null;

    while (true)
    {
      // Explicit &&
      if (this.current().type === 'AND')
      {
        this.advance(); // consume '&&'
        const right = this.parseUnary();
        if (!right) return null;
        left = { type: 'AND', left, right };
        continue;
      }

      // Implicit AND: next token is TERM, NOT, or LPAREN
      const next = this.current().type;
      if (next === 'TERM' || next === 'NOT' || next === 'LPAREN')
      {
        const right = this.parseUnary();
        if (!right) return null;
        left = { type: 'AND', left, right };
        continue;
      }

      break;
    }

    return left;
  }

  // unaryExpr → '!'* primaryExpr
  private parseUnary(): ASTNode | null
  {
    if (this.current().type === 'NOT')
    {
      this.advance(); // consume '!'
      const operand = this.parseUnary(); // Allow chained negation
      if (!operand) return null;
      return { type: 'NOT', operand };
    }

    return this.parsePrimary();
  }

  // primaryExpr → '(' expression ')' | term
  private parsePrimary(): ASTNode | null
  {
    if (this.current().type === 'LPAREN')
    {
      this.advance(); // consume '('
      const expr = this.parseOr();
      if (!expr) return null;

      if (this.current().type !== 'RPAREN')
      {
        return null; // Missing closing paren
      }
      this.advance(); // consume ')'
      return expr;
    }

    if (this.current().type === 'TERM')
    {
      const token = this.advance();
      return { type: 'TERM', value: token.value };
    }

    return null; // Unexpected token
  }
}

// Parse a search query into an AST
export function parseSearchQuery(query: string): ASTNode | null
{
  const trimmed = query.trim();
  if (!trimmed)
  {
    return null;
  }

  const tokens = tokenize(trimmed);
  if (!tokens)
  {
    return null; // Tokenization failed
  }

  // Check for empty token list (only EOF)
  if (tokens.length === 1 && tokens[0].type === 'EOF')
  {
    return null;
  }

  const parser = new Parser(tokens);
  return parser.parse();
}

// Evaluate an AST against title and URL
export function matchesSearch(title: string, url: string, ast: ASTNode): boolean
{
  const text = (title + ' ' + url).toLowerCase();

  function evaluate(node: ASTNode): boolean
  {
    switch (node.type)
    {
      case 'TERM':
        return text.includes(node.value.toLowerCase());

      case 'AND':
        return evaluate(node.left) && evaluate(node.right);

      case 'OR':
        return evaluate(node.left) || evaluate(node.right);

      case 'NOT':
        return !evaluate(node.operand);
    }
  }

  return evaluate(ast);
}

// Convenience function: parse query and match against title/url
// Falls back to literal search if parsing fails
export function matchesFilter(title: string, url: string, query: string): boolean
{
  const trimmed = query.trim();
  if (!trimmed)
  {
    return true; // Empty query matches everything
  }

  const ast = parseSearchQuery(trimmed);

  if (ast)
  {
    return matchesSearch(title, url, ast);
  }

  // Fallback: literal search (original behavior)
  const searchTerm = trimmed.toLowerCase();
  return title.toLowerCase().includes(searchTerm) ||
         url.toLowerCase().includes(searchTerm);
}
