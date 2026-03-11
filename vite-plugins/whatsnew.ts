import { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { marked } from 'marked';

/**
 * Vite plugin that converts docs/whatsnew.md into whatsnew.html.
 * Substitutes {CURRENT_VERSION} with the version from manifest.json.
 * Emits the HTML as a static asset in the build output.
 */
export function whatsnewPlugin(): Plugin
{
  const mdPath = resolve(__dirname, '../docs/whatsnew.md');
  const manifestPath = resolve(__dirname, '../public/manifest.json');

  function generateHtml(): string
  {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const version = manifest.version;

    let md = readFileSync(mdPath, 'utf-8');
    md = md.replace(/\{CURRENT_VERSION\}/g, version);

    const body = marked.parse(md) as string;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 16px;
    line-height: 1.5;
    color: #374151;
    background: white;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #d1d5db; background: #1f2937; }
    a { color: #60a5fa; }
  }
  h1 { display: none; }
  h2 { font-size: 1.3em; font-weight: 600; margin: 0 0 12px 0; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 16px 0 4px 0; }
  p { margin: 4px 0; }
  ul { margin: 4px 0; padding-left: 20px; }
  li { margin: 4px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  }

  return {
    name: 'whatsnew',

    // Serve whatsnew.html in dev mode
    configureServer(server)
    {
      server.middlewares.use((req, res, next) =>
      {
        if (req.url?.startsWith('/whatsnew.html'))
        {
          res.setHeader('Content-Type', 'text/html');
          res.end(generateHtml());
          return;
        }
        next();
      });
    },

    // Emit whatsnew.html as a build asset
    generateBundle()
    {
      this.emitFile({
        type: 'asset',
        fileName: 'whatsnew.html',
        source: generateHtml(),
      });
    },
  };
}
