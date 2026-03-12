/**
 * Compiles markdown files in docs/ into HTML for GitHub Pages.
 * Currently handles: news/news.md, changelog.md
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const manifest = JSON.parse(readFileSync(resolve(rootDir, 'public/manifest.json'), 'utf-8'));
const version = manifest.version;

function compileMarkdown(mdRelPath, htmlRelPath, title)
{
  const mdPath = resolve(rootDir, mdRelPath);
  const htmlPath = resolve(rootDir, htmlRelPath);

  let md = readFileSync(mdPath, 'utf-8');
  md = md.replace(/\{CURRENT_VERSION\}/g, version);
  const body = marked.parse(md);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 680px;
    margin: 0 auto;
    padding: 24px 16px;
    line-height: 1.6;
    color: #374151;
    background: white;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #d1d5db; background: #1f2937; }
    a { color: #60a5fa; }
  }
  h1 { font-size: 1.5em; font-weight: 700; margin: 0 0 24px 0; }
  h2 { font-size: 1.2em; font-weight: 600; margin: 32px 0 8px 0; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 16px 0 4px 0; }
  p { margin: 8px 0; }
  ul { margin: 4px 0; padding-left: 20px; }
  li { margin: 4px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;

  writeFileSync(htmlPath, html);
  console.log(`Generated ${htmlPath}`);
}

compileMarkdown('docs/news/news.md', 'docs/news/news.html', 'Side Bar for Arc Users News');
compileMarkdown('docs/changelog.md', 'docs/changelog.html', 'Side Bar for Arc Users Changelog');
