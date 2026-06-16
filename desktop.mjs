// Desktop launcher for Hotzonex Daily Expenses.
// Starts the local server (if not already running) and opens the app in its own
// window (Microsoft Edge "app mode" — no tabs or address bar), falling back to
// the default browser. Run via: node desktop.mjs  (or the Hotzonex.vbs shortcut)
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4100;
const URL = `http://localhost:${PORT}`;

const portUp = () => new Promise((res) => {
  const s = net.connect(PORT, '127.0.0.1');
  s.setTimeout(600);
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  s.on('timeout', () => { s.destroy(); res(false); });
});

async function waitUp(ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await portUp()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// 1) Start the server in the background if it isn't already running
if (!(await portUp())) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(__dirname, 'server', 'index.js')], {
    detached: true, stdio: 'ignore', cwd: __dirname,
  });
  child.unref();
  await waitUp();
}

// 2) Open the app in its own window
const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft Edge\\Application\\msedge.exe',
];
const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const appBrowser = [...edgePaths, ...chromePaths].find((p) => existsSync(p));

if (appBrowser) {
  spawn(appBrowser, [`--app=${URL}`, '--window-size=1200,840'], { detached: true, stdio: 'ignore' }).unref();
} else {
  // no Edge/Chrome found — just open the default browser
  spawn('cmd', ['/c', 'start', '', URL], { detached: true, stdio: 'ignore' }).unref();
}

setTimeout(() => process.exit(0), 1500);
