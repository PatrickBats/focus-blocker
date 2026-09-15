importScripts('core.js');
const C = FocusCore;
const BLOCKED_URL = chrome.runtime.getURL('blocked.html');
const HOSTS = ['http://*/*', 'https://*/*'];
let queue = Promise.resolve();
let enforcementError = null;

// Mutations and reconciliations share one queue, so newer settings always win.
function enqueue(fn) {
  const task = queue.then(fn);
  queue = task.catch(() => {});
  return task;
}
async function getState() {
  const stored = await chrome.storage.sync.get(['focusState', 'blocklist', 'schedule', 'lockdown']);
  const state = C.migrate(stored);
  let changed = !stored.focusState;
  if (state.pendingSchedule && !C.isActive(state.schedule)) {
    state.schedule = state.pendingSchedule;
    delete state.pendingSchedule;
    changed = true;
  }
  if (changed) await chrome.storage.sync.set({ focusState: state });
  return state;
}
async function ensureAlarm() {
  if (!await chrome.alarms.get('tick')) await chrome.alarms.create('tick', { periodInMinutes: 1 });
}
async function reconcile() {
  const errors = [];
  let state, times;
  try {
    state = await getState();
    times = C.timing(state.schedule);
    try {
      await ensureAlarm();
      if (times.nextChange) await chrome.alarms.create('boundary', { when: times.nextChange });
      else await chrome.alarms.clear('boundary');
    } catch (e) { errors.push('Could not schedule the next blocking change: ' + e.message); }
    const desired = C.buildRules(state, times.active, BLOCKED_URL);
    const current = await chrome.declarativeNetRequest.getDynamicRules();
    const canonical = (value) => JSON.stringify(value, function (_key, v) {
      return v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v;
    });
    if (canonical(current.sort((a, b) => a.id - b.id)) !== canonical(desired)) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: current.map((r) => r.id), addRules: desired,
      });
    }
    if (times.active && state.blocklist.length && !await chrome.permissions.contains({ origins: HOSTS })) {
      errors.push('Allow access to all sites in Chrome’s extension details so the blocked page can work.');
    }
  } catch (e) { errors.push('Could not update blocking: ' + e.message); }
  // A closed/disappearing tab must not prevent network rules from updating.
  if (state && times?.active && state.blocklist.length) {
    try {
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter((t) => C.domainMatches(t.pendingUrl || t.url, state.blocklist))
        .map(async (t) => {
          try {
            const latest = await chrome.tabs.get(t.id);
            if (latest.pendingUrl === BLOCKED_URL || latest.url === BLOCKED_URL) return;
            if (!C.domainMatches(latest.pendingUrl || latest.url, state.blocklist)) return;
            await chrome.tabs.update(t.id, { url: BLOCKED_URL });
          }
          catch (e) {
            try { await chrome.tabs.get(t.id); } catch { return; }
            errors.push('Could not show the blocked page in a tab: ' + e.message);
          }
        }));
    } catch (e) { errors.push('Could not check open tabs: ' + e.message); }
  }
  enforcementError = errors.length ? errors.join(' ') : null;
  return { state, ...times, enforcementError };
}
async function status() {
  const result = await reconcile();
  if (!result.state) throw new Error(result.enforcementError || 'Settings unavailable.');
  return { ok: true, ...result, locked: result.state.lockdown && result.active };
}
async function save(next, old) {
  C.assertAllowed(old, next);
  C.assertFits(next);
  await chrome.storage.sync.set({ focusState: next });
  const result = await reconcile();
  return { ok: !result.enforcementError, saved: true, error: result.enforcementError };
}
const handlers = {
  getStatus: status,
  retry: status,
  async addSite({ domain }) {
    const d = C.normalizeDomain(domain);
    if (!d) throw new Error('Enter a valid website, such as reddit.com.');
    const state = await getState();
    const next = { ...state, blocklist: [...new Set([...state.blocklist, d])].sort() };
    return save(next, state);
  },
  async blockCurrentSite() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return handlers.addSite({ domain: tab?.url });
  },
  async removeSite({ domain }) {
    const state = await getState();
    return save({ ...state, blocklist: state.blocklist.filter((d) => d !== domain) }, state);
  },
  async setSchedule({ schedule }) {
    const state = await getState();
    const next = { ...state, schedule: C.sanitizeSchedule(schedule) };
    delete next.pendingSchedule;
    return save(next, state);
  },
  async setLockdown({ enabled }) {
    if (typeof enabled !== 'boolean') throw new Error('Invalid lockdown setting.');
    const state = await getState();
    return save({ ...state, lockdown: enabled }, state);
  },
  async exportSettings() {
    const state = await getState();
    return { ok: true, backup: { app: 'focus-blocker', version: 2, settings: C.validateState(state) } };
  },
  async previewImport({ backup }) {
    if (backup?.app !== 'focus-blocker' || backup.version !== 2) throw new Error('Not a supported Focus Blocker backup.');
    const next = C.validateState(backup.settings);
    C.assertAllowed(await getState(), next);
    return { ok: true, state: next };
  },
  async importSettings({ backup }) {
    const { state: next } = await handlers.previewImport({ backup });
    return save(next, await getState());
  },
};
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !Object.hasOwn(handlers, msg?.type)) return false;
  enqueue(() => handlers[msg.type](msg)).then(respond)
    .catch((e) => respond({ ok: false, error: e.message }));
  return true;
});
const requestSync = () => { enqueue(reconcile).catch((e) => { enforcementError = e.message; }); };
chrome.runtime.onInstalled.addListener(requestSync);
chrome.runtime.onStartup.addListener(requestSync);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (['tick', 'boundary'].includes(alarm.name)) requestSync();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ['focusState', 'schedule', 'blocklist', 'lockdown'].some((k) => changes[k])) requestSync();
});
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === 'complete') requestSync();
});
chrome.tabs.onActivated.addListener(requestSync);
chrome.permissions.onAdded.addListener(requestSync);
chrome.permissions.onRemoved.addListener(requestSync);
requestSync();
