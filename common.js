async function send(type, payload = {}) {
  try {
    const result = await chrome.runtime.sendMessage({ type, ...payload });
    return result || { ok: false, error: 'The extension did not respond. Please retry.' };
  } catch (e) { return { ok: false, error: e.message }; }
}
function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(timestamp));
}
function showMessage(text, isError = false) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.className = 'message ' + (isError ? 'err' : 'ok');
  el.hidden = !text;
}
function showHealth(result) {
  const el = document.getElementById('health');
  const error = result.enforcementError || (!result.ok ? result.error : null);
  el.hidden = !error;
  document.getElementById('health-text').textContent = error || '';
}
