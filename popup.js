async function refresh() {
  const result = await send('getStatus');
  showHealth(result);
  if (!result.ok) {
    document.getElementById('status').textContent = 'Blocking status unavailable';
    return;
  }
  const { state, active, nextUnlock } = result;
  const status = document.getElementById('status');
  status.className = 'status ' + (active ? 'active' : 'inactive');
  status.textContent = result.enforcementError ? 'Blocking needs attention' :
    active && state.blocklist.length ? (nextUnlock ? 'Blocking until ' + formatDate(nextUnlock) : 'Blocking active') :
    active ? 'No sites in your blocklist' : 'Off the clock — nothing blocked';
  document.getElementById('site-list').replaceChildren(...state.blocklist.map((domain) => {
    const li = document.createElement('li');
    li.textContent = domain;
    return li;
  }));
  document.getElementById('empty').hidden = state.blocklist.length > 0;
  const button = document.getElementById('block-current');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = FocusCore.normalizeDomain(tab?.url);
    const covered = FocusCore.domainMatches(tab?.url, state.blocklist);
    button.disabled = !domain || covered;
    button.textContent = covered ? 'Already on your blocklist' : 'Block this site';
    document.getElementById('current-domain').textContent = domain || 'Open a website to block it in one click.';
  } catch {
    button.disabled = true;
    document.getElementById('current-domain').textContent = 'Could not read the current tab.';
  }
}
async function add(type, payload) {
  const res = await send(type, payload);
  showMessage(res.ok ? 'Site added.' : (res.saved ? 'Saved; blocking needs attention: ' : '') + res.error, !res.ok);
  if (res.ok || res.saved) document.getElementById('add-input').value = '';
  await refresh();
}
document.getElementById('block-current').addEventListener('click', () => add('blockCurrentSite'));
document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  add('addSite', { domain: document.getElementById('add-input').value });
});
document.getElementById('retry').addEventListener('click', refresh);
document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
refresh();
setInterval(refresh, 15000);
