// Run with Playwright available: NODE_PATH=/path/to/node_modules node tests/browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const C = require('../core.js');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-blocker-browser-'));
  const extension = path.resolve(__dirname, '..');
  const output = process.env.FOCUS_QA_OUTPUT || profile;
  const server = http.createServer((req, res) => {
    if (req.url === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(new Response('<h1>Cached page</h1>',{headers:{'Content-Type':'text/html'}}))});");
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Test website</title><h1>Test website</h1>');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const launch = () => chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  });
  let context;
  try {
    context = await launch();
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const base = 'chrome-extension://' + id + '/';
    const options = await context.newPage();
    const errors = [];
    options.on('pageerror', (e) => errors.push(e.message));
    await options.goto(base + 'options.html');
    const send = (type, payload = {}) => options.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, ...payload }), { type, payload });
    let result = await send('getStatus');
    assert.equal(result.ok, true);
    assert.equal(result.state.schedule.weekend.end, '16:00');
    await options.waitForFunction(() => document.getElementById('weekend-end').value === '16:00');
    await options.screenshot({ path: path.join(output, 'settings-desktop.png'), fullPage: true });
    const schedule = structuredClone(C.DEFAULT_STATE.schedule);
    for (const s of Object.values(schedule)) { s.start = '00:00'; s.end = '23:59'; }
    assert.equal((await send('setSchedule', { schedule })).ok, true);

    const website = await context.newPage();
    await website.goto(url);
    await website.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
    await website.reload();
    await website.waitForSelector('h1');
    const popup = await context.newPage();
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.goto(base + 'popup.html');
    await website.bringToFront();
    await popup.evaluate(() => refresh());
    assert.equal(await popup.locator('#block-current').isEnabled(), true);
    assert.equal(await popup.locator('#current-domain').textContent(), '127.0.0.1');
    await popup.evaluate(() => document.getElementById('block-current').click());
    await website.waitForURL(base + 'blocked.html');
    await website.waitForFunction(() => document.getElementById('until').textContent.startsWith('Blocked until'));
    assert.equal(await website.locator('img').evaluate((img) => img.naturalWidth > 0), true);
    await website.screenshot({ path: path.join(output, 'blocked-desktop.png'), fullPage: true });
    const first = await website.locator('#countdown').textContent();
    await website.waitForFunction((first) => document.getElementById('countdown').textContent !== first, first);
    await website.setViewportSize({ width: 375, height: 850 });
    await website.screenshot({ path: path.join(output, 'blocked-mobile.png'), fullPage: true });
    assert.equal(await website.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const fresh = await context.newPage();
    await fresh.goto('https://www.reddit.com').catch(() => {});
    await fresh.locator('#countdown').waitFor();
    assert.equal(fresh.url(), base + 'blocked.html');
    assert.equal(await options.evaluate(async (url) => { try { await fetch(url); return true; } catch { return false; } }, url + '/resource'), false);
    const backup = (await send('exportSettings')).backup;
    assert.equal((await send('previewImport', { backup })).ok, true);
    assert.equal((await send('importSettings', { backup: { ...backup, version: 99 } })).ok, false);
    assert.equal((await send('setLockdown', { enabled: true })).ok, true);
    assert.equal((await send('importSettings', { backup })).ok, false);
    // End the test lock through fixture storage, never the user's profile.
    await worker.evaluate(async () => {
      const { focusState } = await chrome.storage.sync.get('focusState');
      focusState.lockdown = false;
      for (const s of Object.values(focusState.schedule)) s.end = s.start;
      await chrome.storage.sync.set({ focusState });
    });
    assert.equal((await send('getStatus')).active, false);
    await website.evaluate(() => refresh());
    assert.equal(await website.locator('#heading').textContent(), 'You’re free to browse.');
    assert.equal(website.url(), base + 'blocked.html');
    assert.equal(await worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length), 0);
    await options.bringToFront();
    const download = options.waitForEvent('download');
    await options.locator('#export').click();
    const downloaded = await download;
    const exported = JSON.parse(await fs.readFile(await downloaded.path(), 'utf8'));
    assert.equal(exported.app, 'focus-blocker');
    await options.locator('#import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await options.locator('#import-preview').waitFor({ state: 'visible' });
    await options.locator('#confirm-import').click();
    await options.waitForFunction(() => document.getElementById('message').textContent === 'Backup restored.');
    await options.setViewportSize({ width: 375, height: 900 });
    await options.screenshot({ path: path.join(output, 'settings-mobile.png'), fullPage: true });
    assert.equal(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await context.close();
    context = await launch();
    const afterRestart = await context.newPage();
    await afterRestart.goto(base + 'options.html');
    result = await afterRestart.evaluate(() => chrome.runtime.sendMessage({ type: 'getStatus' }));
    assert.ok(result.state.blocklist.includes('127.0.0.1'));
    assert.equal(result.enforcementError, null);
    console.log('PASS: live extension redirects, cached tabs, countdown, responsive layouts, one-click blocking, request blocking, backups, lockdown, unlock, and browser restart.');
    console.log('Screenshots: ' + output);
  } finally {
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
