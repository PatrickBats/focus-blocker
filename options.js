const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GROUPS = { weekday: [1, 2, 3, 4, 5], weekend: [6, 0] };
let backupToImport = null;
let scheduleDirty = false;
let rendered = false;

function buildScheduleControls() {
  const container = document.getElementById('schedule-groups');
  for (const [group, days] of Object.entries(GROUPS)) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group === 'weekday' ? 'Weekdays' : 'Weekend';
    const row = document.createElement('div');
    row.className = 'days';
    for (const day of days) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = group + '-day-' + day;
      box.dataset.day = day;
      box.dataset.group = group;
      label.append(box, DAY_LABELS[day]);
      row.append(label);
    }
    const times = document.createElement('div');
    times.className = 'times';
    for (const key of ['start', 'end']) {
      const label = document.createElement('label');
      label.append(key === 'start' ? 'From ' : 'Until ');
      const input = document.createElement('input');
      input.type = 'time';
      input.id = group + '-' + key;
      label.append(input);
      times.append(label);
    }
    fieldset.append(legend, row, times);
    fieldset.addEventListener('change', () => { scheduleDirty = true; });
    container.append(fieldset);
  }
}
async function refresh(force = false) {
  const result = await send('getStatus');
  showHealth(result);
  if (!result.ok) return;
  const { state, locked } = result;
  document.getElementById('lock-banner').hidden = !locked;
  document.getElementById('lock-banner').textContent = result.nextUnlock
    ? 'Lockdown active until ' + formatDate(result.nextUnlock) + '.'
    : 'Lockdown active. Your schedule has no upcoming break.';
  document.getElementById('pending').hidden = !state.pendingSchedule;
  const list = document.getElementById('site-list');
  list.replaceChildren(...state.blocklist.map((domain) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = domain;
    const button = document.createElement('button');
    button.textContent = 'Remove';
    button.className = 'remove';
    button.disabled = locked;
    button.setAttribute('aria-label', 'Remove ' + domain);
    button.addEventListener('click', () => run('removeSite', { domain }, 'Site removed.'));
    li.append(name, button);
    return li;
  }));
  document.getElementById('empty').hidden = state.blocklist.length > 0;
  if (!rendered || force || !scheduleDirty) {
    for (const [group, days] of Object.entries(GROUPS)) {
      const s = state.schedule[group];
      for (const day of days) document.getElementById(group + '-day-' + day).checked = s.days.includes(day);
      document.getElementById(group + '-start').value = s.start;
      document.getElementById(group + '-end').value = s.end;
    }
    scheduleDirty = false;
    rendered = true;
  }
  document.getElementById('lockdown').checked = state.lockdown;
  document.getElementById('lockdown').disabled = locked;
}
async function run(type, payload, success, force = false) {
  const res = await send(type, payload);
  showMessage(res.ok ? success : (res.saved ? 'Saved, but blocking needs attention: ' : '') + res.error, !res.ok);
  await refresh(force && (res.ok || res.saved));
  return res;
}
document.getElementById('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('add-input');
  const res = await run('addSite', { domain: input.value }, 'Site added.');
  if (res.ok || res.saved) input.value = '';
});
document.getElementById('save-schedule').addEventListener('click', async () => {
  const schedule = Object.fromEntries(Object.keys(GROUPS).map((group) => [group, {
    days: [...document.querySelectorAll('input[data-group="' + group + '"]:checked')].map((el) => Number(el.dataset.day)),
    start: document.getElementById(group + '-start').value,
    end: document.getElementById(group + '-end').value,
  }]));
  await run('setSchedule', { schedule }, 'Schedule saved.', true);
});
document.getElementById('lockdown').addEventListener('change', (e) =>
  run('setLockdown', { enabled: e.target.checked }, 'Lockdown setting saved.'));
document.getElementById('retry').addEventListener('click', () => refresh());
document.getElementById('export').addEventListener('click', async () => {
  const res = await send('exportSettings');
  if (!res.ok) return showMessage(res.error, true);
  const url = URL.createObjectURL(new Blob([JSON.stringify(res.backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'focus-blocker-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showMessage('Backup download started.');
});
function cancelImport() {
  backupToImport = null;
  document.getElementById('import-preview').hidden = true;
  document.getElementById('import').value = '';
}
document.getElementById('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  cancelImport();
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('That backup file is too large.');
    const backup = JSON.parse(await file.text());
    const res = await send('previewImport', { backup });
    if (!res.ok) throw new Error(res.error);
    backupToImport = backup;
    const describe = (group, label) => {
      const s = res.state.schedule[group];
      return label + ': ' + (s.days.length && s.start !== s.end
        ? s.days.map((d) => DAY_LABELS[d]).join(', ') + ' ' + formatTime(s.start) + '–' + formatTime(s.end) : 'off');
    };
    document.getElementById('import-summary').textContent = res.state.blocklist.length + ' sites (' +
      res.state.blocklist.join(', ') + '). ' + describe('weekday', 'Weekdays') + '. ' +
      describe('weekend', 'Weekend') + '. Lockdown ' + (res.state.lockdown ? 'on.' : 'off.');
    document.getElementById('import-preview').hidden = false;
  } catch (e) { showMessage(e.message, true); }
});
document.getElementById('cancel-import').addEventListener('click', cancelImport);
document.getElementById('confirm-import').addEventListener('click', async () => {
  if (!backupToImport) return;
  const res = await run('importSettings', { backup: backupToImport }, 'Backup restored.', true);
  if (res.ok || res.saved) cancelImport();
});
buildScheduleControls();
refresh();
setInterval(() => refresh(), 15000);
