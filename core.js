// Pure scheduling and validation logic, shared by the worker and Node tests.
(function (root) {
  const GROUPS = { weekday: [1, 2, 3, 4, 5], weekend: [0, 6] };
  const DEFAULT_STATE = {
    version: 2,
    blocklist: ['instagram.com', 'reddit.com', 'tiktok.com', 'twitter.com', 'x.com'],
    schedule: {
      weekday: { days: [1, 2, 3, 4, 5], start: '08:00', end: '20:00' },
      weekend: { days: [0, 6], start: '08:00', end: '16:00' },
    },
    lockdown: false,
  };
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  function sanitizeSchedule(schedule) {
    if (!schedule || typeof schedule !== 'object') throw new Error('Invalid schedule.');
    const clean = {};
    for (const [group, allowed] of Object.entries(GROUPS)) {
      const s = schedule[group];
      const timeOk = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      if (!s || !Array.isArray(s.days) || s.days.some((d) => !allowed.includes(d)) ||
          !timeOk(s.start) || !timeOk(s.end)) throw new Error('Invalid schedule.');
      clean[group] = { days: [...new Set(s.days)].sort(), start: s.start, end: s.end };
    }
    return clean;
  }
  function activeAt(schedule, day, minute) {
    return Object.values(schedule).some((s) => {
      const start = minutes(s.start), end = minutes(s.end);
      if (start === end) return false;
      if (start < end) return s.days.includes(day) && minute >= start && minute < end;
      return (s.days.includes(day) && minute >= start) ||
        (s.days.includes((day + 6) % 7) && minute < end);
    });
  }
  function isActive(schedule, now = new Date()) {
    return activeAt(schedule, now.getDay(), now.getHours() * 60 + now.getMinutes());
  }
  function timing(schedule, now = new Date()) {
    const active = isActive(schedule, now);
    // Real minutes handle local-clock daylight-saving jumps and repeated hours.
    const first = Math.floor(now.getTime() / 60000) * 60000 + 60000;
    let nextChange = null;
    for (let t = first; t <= first + 8 * 86400000; t += 60000) {
      if (isActive(schedule, new Date(t)) !== active) { nextChange = t; break; }
    }
    return { active, nextChange, nextUnlock: active ? nextChange : null };
  }
  function isExpansion(oldSchedule, newSchedule) {
    for (let day = 0; day < 7; day++) {
      for (let m = 0; m < 1440; m++) {
        if (activeAt(oldSchedule, day, m) && !activeAt(newSchedule, day, m)) return false;
      }
    }
    return true;
  }
  function normalizeDomain(input) {
    if (typeof input !== 'string' || !input.trim()) return null;
    try {
      const value = input.trim();
      const url = new URL(value.includes('://') ? value : 'https://' + value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
      if (host.length > 253 || !host.includes('.') || host.split('.').some((s) =>
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s))) return null;
      return host;
    } catch { return null; }
  }
  function domainMatches(url, blocklist) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
      return blocklist.some((d) => host === d || host.endsWith('.' + d));
    } catch { return false; }
  }
  function validateState(input) {
    if (!input || input.version !== 2 || !Array.isArray(input.blocklist) ||
        typeof input.lockdown !== 'boolean') throw new Error('Unsupported or invalid backup.');
    const domains = input.blocklist.map(normalizeDomain);
    if (domains.some((d) => !d)) throw new Error('The backup contains an invalid domain.');
    const state = { version: 2, blocklist: [...new Set(domains)].sort(),
      schedule: sanitizeSchedule(input.schedule), lockdown: input.lockdown };
    assertFits(state);
    return state;
  }
  function assertFits(state) {
    if (new TextEncoder().encode(JSON.stringify(state)).length > 7600) {
      throw new Error('Settings are too large for Chrome sync. Remove some sites and try again.');
    }
  }
  function assertAllowed(oldState, next, now = new Date()) {
    if (!oldState.lockdown || !isActive(oldState.schedule, now)) return;
    if (!next.lockdown || !isExpansion(oldState.schedule, next.schedule) ||
        oldState.blocklist.some((d) => !domainMatches('https://' + d, next.blocklist))) {
      throw new Error('Lockdown is active. Sites and blocked hours cannot be reduced until unlock.');
    }
  }
  function migrate(stored, now = new Date()) {
    if (stored.focusState) {
      const state = validateState(stored.focusState);
      if (stored.focusState.pendingSchedule) {
        state.pendingSchedule = sanitizeSchedule(stored.focusState.pendingSchedule);
      }
      return state;
    }
    const state = structuredClone(DEFAULT_STATE);
    if (stored.blocklist !== undefined) state.blocklist = stored.blocklist;
    if (stored.lockdown !== undefined) state.lockdown = stored.lockdown;
    if (stored.schedule) {
      const legacy = stored.schedule;
      const previous = Object.fromEntries(Object.entries(GROUPS).map(([group, days]) =>
        [group, { days: legacy.days.filter((d) => days.includes(d)), start: legacy.start, end: legacy.end }]));
      state.schedule.weekday = previous.weekday;
      if (state.lockdown && isActive(previous, now) && !isExpansion(previous, state.schedule)) {
        state.pendingSchedule = structuredClone(state.schedule);
        state.schedule = previous;
      }
    }
    const clean = validateState(state);
    if (state.pendingSchedule) clean.pendingSchedule = state.pendingSchedule;
    return clean;
  }
  function buildRules(state, active, blockedUrl) {
    if (!active) return [];
    return [...state.blocklist].sort().flatMap((domain, i) => [
      { id: i * 2 + 1, priority: 2, action: { type: 'redirect', redirect: { url: blockedUrl } },
        condition: { urlFilter: '||' + domain + '^', resourceTypes: ['main_frame'] } },
      { id: i * 2 + 2, priority: 1, action: { type: 'block' },
        condition: { urlFilter: '||' + domain + '^', excludedResourceTypes: ['main_frame'] } },
    ]);
  }
  const api = { GROUPS, DEFAULT_STATE, sanitizeSchedule, isActive, timing, isExpansion,
    normalizeDomain, domainMatches, validateState, assertFits, assertAllowed, migrate, buildRules };
  if (typeof module !== 'undefined') module.exports = api;
  root.FocusCore = api;
})(globalThis);
