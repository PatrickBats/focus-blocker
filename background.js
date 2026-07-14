// Focus Blocker — service worker.
// Owns all state mutations (so lockdown can't be bypassed) and keeps
// declarativeNetRequest dynamic rules in sync with the schedule.

const DEFAULT_STATE = {
  blocklist: [
    "instagram.com",
    "reddit.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
  ],
  schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: "08:00", end: "20:00" },
  lockdown: false,
};

async function getState() {
  const stored = await chrome.storage.sync.get(DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...stored };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinWorkHours(schedule, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  if (start === end) return false;
  const day = now.getDay();
  if (start < end) {
    return schedule.days.includes(day) && mins >= start && mins < end;
  }
  // Overnight window (e.g. 22:00–06:00): either it started today,
  // or it started yesterday and hasn't ended yet.
  return (
    (schedule.days.includes(day) && mins >= start) ||
    (schedule.days.includes((day + 6) % 7) && mins < end)
  );
}

// ---- Rule sync -------------------------------------------------------------

async function syncRules() {
  const state = await getState();
  const active = isWithinWorkHours(state.schedule);
  const desired = active
    ? [...state.blocklist].sort().map((domain, i) => ({
        id: i + 1,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame"],
        },
      }))
    : [];

  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const key = (rules) =>
    rules.map((r) => `${r.id}:${r.condition.urlFilter}`).sort().join("|");
  if (key(current) === key(desired)) return;

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map((r) => r.id),
    addRules: desired,
  });
}

function ensureAlarm() {
  chrome.alarms.create("tick", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  syncRules();
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  syncRules();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") syncRules();
});
chrome.storage.onChanged.addListener(() => syncRules());

// Also runs each time the service worker wakes up for any reason.
ensureAlarm();
syncRules();

// ---- State mutations (with lockdown enforcement) ---------------------------

function isLocked(state) {
  return state.lockdown && isWithinWorkHours(state.schedule);
}

function normalizeDomain(input) {
  let d = String(input || "").trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split("/")[0].split(":")[0];
  d = d.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null;
  return d;
}

function sanitizeSchedule(schedule) {
  if (!schedule || !Array.isArray(schedule.days)) return null;
  const days = [...new Set(schedule.days)]
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort();
  const timeOk = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (!timeOk(schedule.start) || !timeOk(schedule.end)) return null;
  return { days, start: schedule.start, end: schedule.end };
}

// A schedule change is an "expansion" if it only ever blocks MORE:
// same-or-more days, same-or-earlier start, same-or-later end.
// Overnight windows are too ambiguous to compare, so they never count.
function isExpansion(oldS, newS) {
  const oldStart = toMinutes(oldS.start);
  const oldEnd = toMinutes(oldS.end);
  const newStart = toMinutes(newS.start);
  const newEnd = toMinutes(newS.end);
  if (oldStart > oldEnd || newStart > newEnd) return false;
  return (
    oldS.days.every((d) => newS.days.includes(d)) &&
    newStart <= oldStart &&
    newEnd >= oldEnd
  );
}

const handlers = {
  async getStatus() {
    const state = await getState();
    const active = isWithinWorkHours(state.schedule);
    return { ok: true, state, active, locked: state.lockdown && active };
  },

  async addSite({ domain }) {
    const d = normalizeDomain(domain);
    if (!d) {
      return { ok: false, error: "That doesn't look like a valid domain (try e.g. reddit.com)." };
    }
    const state = await getState();
    if (!state.blocklist.includes(d)) {
      await chrome.storage.sync.set({ blocklist: [...state.blocklist, d].sort() });
    }
    return { ok: true };
  },

  async removeSite({ domain }) {
    const state = await getState();
    if (isLocked(state)) {
      return { ok: false, error: "Lockdown is on — sites can't be removed until work hours end." };
    }
    await chrome.storage.sync.set({
      blocklist: state.blocklist.filter((x) => x !== domain),
    });
    return { ok: true };
  },

  async setSchedule({ schedule }) {
    const clean = sanitizeSchedule(schedule);
    if (!clean) return { ok: false, error: "Invalid schedule." };
    const state = await getState();
    if (isLocked(state) && !isExpansion(state.schedule, clean)) {
      return { ok: false, error: "Lockdown is on — the schedule can only be expanded until work hours end." };
    }
    await chrome.storage.sync.set({ schedule: clean });
    return { ok: true };
  },

  async setLockdown({ enabled }) {
    const state = await getState();
    if (!enabled && isLocked(state)) {
      return { ok: false, error: "Nice try 🙂 Lockdown turns off after work hours end." };
    }
    await chrome.storage.sync.set({ lockdown: !!enabled });
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message: ${msg?.type}` });
    return false;
  }
  handler(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true; // keep the message channel open for the async response
});
