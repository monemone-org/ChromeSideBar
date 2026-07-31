// Diagnostic: spawn Chrome directly (not via Playwright's launch wrapper) so
// we can see its actual stdout/stderr and exit code, to figure out why
// launchPersistentContext's browser process was dying silently.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.resolve(__dirname, '../tools/tmp/chrome-test-profile');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

console.log(`Spawning: ${CHROME_PATH} --user-data-dir=${USER_DATA_DIR} --remote-debugging-port=${PORT}`);

const child = spawn(CHROME_PATH, [
  `--user-data-dir=${USER_DATA_DIR}`,
  `--remote-debugging-port=${PORT}`,
  '--no-first-run',
  '--no-default-browser-check',
], { stdio: ['ignore', 'pipe', 'pipe'] });

child.stdout.on('data', d => process.stdout.write(`[chrome stdout] ${d}`));
child.stderr.on('data', d => process.stderr.write(`[chrome stderr] ${d}`));
child.on('exit', (code, signal) => console.log(`\n[diag] Chrome process exited: code=${code} signal=${signal}`));
child.on('error', err => console.log(`\n[diag] Chrome spawn error: ${err.message}`));

// Poll the CDP endpoint for up to 10s to see if it ever comes up
const deadline = Date.now() + 10000;
async function pollCdp()
{
  while (Date.now() < deadline)
  {
    try
    {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      const json = await res.json();
      console.log('\n[diag] CDP endpoint is up:', json);
      return true;
    }
    catch
    {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.log('\n[diag] CDP endpoint never came up within 10s.');
  return false;
}

await pollCdp();

console.log('[diag] Leaving Chrome running for 5 more seconds, then killing it...');
await new Promise(r => setTimeout(r, 5000));
child.kill();
