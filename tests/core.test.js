const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
process.env.TZ = 'America/Chicago';
const state = () => structuredClone(C.DEFAULT_STATE);
const date = (text) => new Date(text);

test('weekday and weekend boundaries, with Saturday and Sunday ending at 4 PM', () => {
  const s = state().schedule;
  for (const [time, active] of [
    ['2026-09-18T07:59:59', false], ['2026-09-18T08:00:00', true],
    ['2026-09-18T19:59:59', true], ['2026-09-18T20:00:00', false],
    ['2026-09-19T08:00:00', true], ['2026-09-19T16:00:00', false],
    ['2026-09-20T15:59:59', true], ['2026-09-20T16:00:00', false],
  ]) assert.equal(C.isActive(s, date(time)), active, time);
  assert.equal(C.timing(s, date('2026-09-19T10:30:00')).nextUnlock, +date('2026-09-19T16:00:00'));
});
test('overnight windows use the starting day and join adjacent weekend windows', () => {
  const s = state().schedule;
  s.weekday = { days: [5], start: '22:00', end: '08:00' };
  assert.equal(C.isActive(s, date('2026-09-19T07:30:00')), true);
  assert.equal(C.timing(s, date('2026-09-18T23:00:00')).nextUnlock, +date('2026-09-19T16:00:00'));
  s.weekend.days = [];
  assert.equal(C.timing(s, date('2026-09-18T23:00:00')).nextUnlock, +date('2026-09-19T08:00:00'));
});
test('equal times and no selected days mean off', () => {
  const s = state().schedule;
  s.weekday.end = s.weekday.start;
  s.weekend.days = [];
  assert.deepEqual(C.timing(s, date('2026-09-18T12:00:00')), { active: false, nextChange: null, nextUnlock: null });
});
test('DST spring forward and fall back countdowns reflect elapsed real time', () => {
  const s = state().schedule;
  s.weekend = { days: [0], start: '00:00', end: '04:00' };
  const spring = date('2026-03-08T00:00:00-06:00');
  const fall = date('2026-11-01T00:00:00-05:00');
  assert.equal(C.timing(s, spring).nextUnlock - spring, 3 * 3600000);
  assert.equal(C.timing(s, fall).nextUnlock - fall, 5 * 3600000);
  s.weekend = { days: [0], start: '01:30', end: '02:30' };
  assert.equal(C.timing(s, date('2026-11-01T01:45:00-05:00')).nextUnlock, +date('2026-11-01T01:00:00-06:00'));
});
test('migration preserves weekday choices and sites, sets weekend defaults', () => {
  const old = { blocklist: ['example.com'], lockdown: false,
    schedule: { days: [1, 3, 5], start: '09:30', end: '18:00' } };
  const s = C.migrate(old, date('2026-09-18T10:00:00'));
  assert.deepEqual(s.schedule.weekday, old.schedule);
  assert.deepEqual(s.schedule.weekend, state().schedule.weekend);
  assert.deepEqual(s.blocklist, ['example.com']);
});
test('migration defers a reduction during active lockdown and is idempotent', () => {
  const old = { lockdown: true, schedule: { days: [0,1,2,3,4,5,6], start: '08:00', end: '20:00' } };
  const now = date('2026-09-19T17:00:00');
  const migrated = C.migrate(old, now);
  assert.equal(migrated.schedule.weekend.end, '20:00');
  assert.equal(migrated.pendingSchedule.weekend.end, '16:00');
  assert.deepEqual(C.migrate({ focusState: migrated }, now), migrated);
});
test('lockdown blocks weakening via every state change including imports', () => {
  const old = state(); old.lockdown = true;
  const now = date('2026-09-19T10:00:00');
  for (const change of [
    (s) => { s.lockdown = false; },
    (s) => { s.blocklist = []; },
    (s) => { s.schedule.weekend.end = '14:00'; },
    (s) => { s.schedule.weekday.days = []; },
  ]) {
    const next = structuredClone(old); change(next);
    assert.throws(() => C.assertAllowed(old, next, now), /Lockdown/);
    assert.doesNotThrow(() => C.assertAllowed(old, next, date('2026-09-19T17:00:00')));
  }
  const next = structuredClone(old); next.schedule.weekend.end = '18:00'; next.blocklist.push('example.com');
  assert.doesNotThrow(() => C.assertAllowed(old, next, now));
});
test('overnight expansion compares the whole weekly coverage', () => {
  const old = state().schedule; old.weekday = { days: [5], start: '22:00', end: '06:00' };
  const next = structuredClone(old); next.weekday.start = '21:00'; next.weekday.end = '07:00';
  assert.equal(C.isExpansion(old, next), true);
  next.weekday.start = '23:00';
  assert.equal(C.isExpansion(old, next), false);
});
test('validation handles URLs and subdomains but rejects malformed input', () => {
  assert.equal(C.normalizeDomain('https://www.Example.com/path?q=1'), 'example.com');
  assert.equal(C.normalizeDomain('example.com?x=2'), 'example.com');
  for (const v of ['chrome://extensions', 'file:///tmp/a', 'bad domain.com', '-bad.com', 'a..com', 'https://user:pass@example.com']) {
    assert.equal(C.normalizeDomain(v), null, v);
  }
  assert.equal(C.domainMatches('https://a.example.com/test', ['example.com']), true);
  assert.equal(C.domainMatches('https://notexample.com', ['example.com']), false);
});
test('backup round trip, malformed versions, domains, times and quota', () => {
  assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(state()))), state());
  for (const change of [
    (s) => { s.version = 3; }, (s) => { s.lockdown = 'yes'; },
    (s) => { s.blocklist = ['bad']; }, (s) => { s.schedule.weekend.start = '25:00'; },
    (s) => { s.schedule.weekday.days = [6]; },
    (s) => { s.blocklist = Array.from({ length: 1000 }, (_, i) => 'site' + i + '.com'); },
  ]) { const s = state(); change(s); assert.throws(() => C.validateState(s)); }
});
test('rules redirect navigation and retain background blocking without overlap', () => {
  const s = state(); s.blocklist = ['example.com'];
  const rules = C.buildRules(s, true, 'chrome-extension://test/blocked.html');
  assert.equal(rules.length, 2);
  assert.equal(rules[0].action.type, 'redirect');
  assert.deepEqual(rules[0].condition.resourceTypes, ['main_frame']);
  assert.deepEqual(rules[1].condition.excludedResourceTypes, ['main_frame']);
  assert.deepEqual(C.buildRules(s, false, 'unused'), []);
});
