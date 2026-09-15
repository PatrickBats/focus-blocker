let current = null;
let checking = false;
let lastCheck = 0;
async function refresh() {
  if (checking) return;
  checking = true;
  try {
    const result = await send('getStatus');
    current = result;
    showHealth(result);
    render();
  } finally { checking = false; lastCheck = Date.now(); }
}
function render() {
  const until = document.getElementById('until');
  const countdown = document.getElementById('countdown');
  const note = document.getElementById('timer-note');
  if (!current?.ok || current.enforcementError) {
    until.textContent = 'Checking blocking status';
    countdown.textContent = '—';
    note.textContent = 'Use Retry below to check again.';
    return;
  }
  if (!current.active || !current.state.blocklist.length) {
    document.getElementById('heading').textContent = 'You’re free to browse.';
    document.getElementById('intro').textContent = 'Nice work making a little room for focus.';
    until.textContent = 'Blocking is off';
    countdown.textContent = 'All done';
    note.textContent = 'Open your website whenever you’re ready.';
    return;
  }
  document.getElementById('heading').textContent = 'You’ve got work. So does this cat.';
  document.getElementById('intro').textContent = 'One thing at a time. Your distractions can wait.';
  if (!current.nextUnlock) {
    until.textContent = 'Blocking is active';
    countdown.textContent = 'On duty';
    note.textContent = 'Your schedule has no upcoming break.';
    return;
  }
  until.textContent = 'Blocked until ' + formatDate(current.nextUnlock);
  const remaining = Math.max(0, Math.ceil((current.nextUnlock - Date.now()) / 1000));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  countdown.textContent = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  note.textContent = remaining ? 'HOURS  /  MINUTES  /  SECONDS' : 'Confirming that blocking has ended…';
}
setInterval(() => {
  render();
  const now = Date.now();
  if (now - lastCheck >= 15000 || (current?.nextChange != null && current.nextChange <= now && now - lastCheck >= 1000)) refresh();
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
document.getElementById('retry').addEventListener('click', refresh);
document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
refresh();
