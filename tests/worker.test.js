const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const C = require('../core.js');
process.env.TZ = 'America/Chicago';
function harness({ tabFailure = false, rulesFailure = false, stored = {} } = {}) {
  let now = +new Date('2026-09-19T10:00:00');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const events = {};
  const event = (name) => ({ addListener(fn) { events[name] = fn; } });
  let data = structuredClone(stored), rules = [], log = [], message;
  const context = vm.createContext({ Date: Clock, URL, TextEncoder, structuredClone, console,
    importScripts() { vm.runInContext(fs.readFileSync(require.resolve('../core.js'), 'utf8'), context); },
    chrome: {
      runtime: { id: 'test', getURL: (p) => 'chrome-extension://test/' + p,
        onMessage: { addListener(fn) { message = fn; } }, onStartup: event('startup'), onInstalled: event('install') },
      storage: { sync: { async get() { return structuredClone(data); }, async set(values) { Object.assign(data, structuredClone(values)); } }, onChanged: event('storage') },
      alarms: { async get() { return {}; }, async create() {}, async clear() {}, onAlarm: event('alarm') },
      permissions: { async contains() { return true; }, onAdded: event('permissionAdd'), onRemoved: event('permissionRemove') },
      tabs: { async query() { return [{ id: 1, url: 'https://reddit.com' }]; }, async get() { return { id: 1, url: 'https://reddit.com' }; },
        async update() { log.push('tab'); if (tabFailure) throw new Error('tab failed'); },
        onUpdated: event('tab'), onActivated: event('activated') },
      declarativeNetRequest: { async getDynamicRules() { return rules; }, async updateDynamicRules({ addRules }) {
        log.push('rules'); if (rulesFailure) throw new Error('rules failed'); rules = addRules;
      } },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  return { events, log, data: () => data, rules: () => rules, setTime(t) { now = +new Date(t); },
    async send(type, payload = {}) { return new Promise((resolve) => message({ type, ...payload }, { id: 'test' }, (r) => resolve(structuredClone(r)))); } };
}
test('tab failure cannot prevent network rules and is shown in status', async () => {
  const h = harness({ tabFailure: true });
  const s = await h.send('getStatus');
  assert.equal(s.ok, true);
  assert.match(s.enforcementError, /tab failed/);
  assert.equal(h.rules().length, 10);
  assert.ok(h.log.indexOf('rules') < h.log.indexOf('tab'));
});
test('rule errors make a saved mutation report partial failure', async () => {
  const h = harness({ rulesFailure: true });
  const s = await h.send('addSite', { domain: 'example.com' });
  assert.equal(s.ok, false); assert.equal(s.saved, true); assert.match(s.error, /rules failed/);
});
test('concurrent additions serialize without losing sites or rules', async () => {
  const h = harness();
  const results = await Promise.all(['one.com','two.com','three.com'].map((domain) => h.send('addSite', { domain })));
  assert.ok(results.every((r) => r.ok));
  for (const d of ['one.com','two.com','three.com']) assert.ok(h.data().focusState.blocklist.includes(d));
  assert.equal(h.rules().length, 16);
});
test('backup round trip and invalid import leave stored state intact', async () => {
  const h = harness();
  const { backup } = await h.send('exportSettings');
  await h.send('addSite', { domain: 'example.com' });
  assert.equal((await h.send('importSettings', { backup })).ok, true);
  assert.deepEqual(h.data().focusState, backup.settings);
  assert.equal((await h.send('importSettings', { backup: { ...backup, version: 99 } })).ok, false);
  assert.deepEqual(h.data().focusState, backup.settings);
});
test('lockdown is rechecked after import preview and cannot be bypassed', async () => {
  const h = harness();
  const { backup } = await h.send('exportSettings');
  assert.equal((await h.send('previewImport', { backup })).ok, true);
  await h.send('setLockdown', { enabled: true });
  const res = await h.send('importSettings', { backup });
  assert.equal(res.ok, false); assert.match(res.error, /Lockdown/);
  assert.equal((await h.send('removeSite', { domain: 'reddit.com' })).ok, false);
});
test('deferred weekend migration applies at unlock and rules clear', async () => {
  const h = harness({ stored: { lockdown: true, schedule: { days: [0,1,2,3,4,5,6], start: '08:00', end: '20:00' } } });
  let s = await h.send('getStatus');
  assert.equal(s.state.schedule.weekend.end, '20:00');
  assert.ok(s.state.pendingSchedule);
  h.setTime('2026-09-19T20:00:00');
  s = await h.send('getStatus');
  assert.equal(s.state.schedule.weekend.end, '16:00');
  assert.equal(s.state.pendingSchedule, undefined);
  assert.equal(s.active, false); assert.equal(h.rules().length, 0);
});
test('migration and persisted rules survive a worker restart', async () => {
  const h = harness();
  await h.send('addSite', { domain: 'example.com' });
  const restart = harness({ stored: h.data() });
  const s = await restart.send('getStatus');
  assert.ok(s.state.blocklist.includes('example.com'));
  assert.equal(restart.rules().length, 12);
});
