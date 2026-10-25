// Real Chromium smoke tests against the compiled C# server and embedded assets.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fixture = JSON.parse(fs.readFileSync('frontend/demo.json'));
const server = spawn(process.env.DOTNET_BIN || 'dotnet', ['bridge/ProtocolTests/bin/Debug/net9.0/ProtocolTests.dll', '--serve-fixture', 'frontend/demo.json'], { stdio: ['pipe', 'pipe', 'inherit'] });
let browser;
try {
  const lines = createInterface({ input: server.stdout });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Fixture server startup timeout')), 10000);
    lines.on('line', line => { if (line.startsWith('PORT=')) { clearTimeout(timeout); resolve(Number(line.slice(5))); } });
    server.once('exit', code => { clearTimeout(timeout); reject(Error(`Fixture server exited ${code}`)); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/coach`);
  await page.getByText('Live run', { exact: true }).waitFor();
  assert.equal(await page.locator('.strategy').count(), 3);
  assert.equal(await page.locator('.map-node').count(), 21);
  assert.match(await page.locator('#run-stats').textContent(), /46 \/ 80 HP/);
  await page.locator('[data-mode="safe"]').click();
  assert.equal(await page.locator('[data-mode="safe"]').getAttribute('aria-pressed'), 'true');
  await page.selectOption('#horizon', '4');
  assert.equal(await page.locator('[data-mode="safe"] .route-sequence > span:not(.route-arrow)').count(), 4);
  await page.selectOption('#horizon', '6');
  await page.locator('[data-mode="balanced"]').click();
  await page.screenshot({ path: 'artifacts/coach-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'artifacts/coach-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Explore demo' }).click();
  await page.getByText('Demo · not live', { exact: true }).waitFor();
  assert.equal(await page.locator('#demo-notice').isVisible(), true);
  await page.screenshot({ path: 'artifacts/coach-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Return to live run' }).click();
  await page.getByText('Live run', { exact: true }).waitFor();
  async function inject(value, expected, code = 200) {
    await page.unroute('**/coach/v1/state');
    await page.route('**/coach/v1/state', route => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ ...value, timestamp: value.timestamp || new Date().toISOString() }) }));
    await page.waitForFunction(text => document.getElementById('route-status').textContent.includes(text), expected);
    assert.equal(await page.locator('.strategy').count(), 0);
  }
  const coop = structuredClone(fixture); coop.timestamp = null; coop.is_multiplayer = true; coop.players.push({ ...coop.players[0], slot: 1 });
  await inject(coop, 'Co-op');
  const closed = structuredClone(fixture); closed.timestamp = null; closed.map.decision_ready = false; closed.map.notice = 'Open the map in the game';
  await inject(closed, 'Open the map');
  const unsupported = structuredClone(fixture); unsupported.timestamp = null; unsupported.compatibility = 'unsupported_game_build';
  await inject(unsupported, 'unsupported');
  const malformed = structuredClone(fixture); malformed.timestamp = null; malformed.map.nodes[0].children.push('99:99');
  await inject(malformed, 'Incomplete');
  await inject({ ...fixture, timestamp: '2000-01-01T00:00:00Z' }, 'stale');
  await inject({}, 'fresh game observation', 503);
  assert.equal(await page.locator('.map-node').count(), 0);
  await page.unroute('**/coach/v1/state');
  await page.getByText('Live run', { exact: true }).waitFor();
  assert.equal(await page.locator('.strategy').count(), 3);
  assert.deepEqual(errors, []);
  console.log('PASS: Chromium dashboard live fixture, strategies, lookahead, map, mobile, demo, co-op gate, map gate, compatibility, invalid map, stale/disconnect clearing, recovery; no JS errors.');
} finally {
  if (browser) await browser.close();
  server.stdin.end('\n');
  server.kill();
}
