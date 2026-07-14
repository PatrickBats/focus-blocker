async function refresh() {
  const res = await send("getStatus");
  if (!res?.ok) return;
  const { state, active, locked } = res;

  const statusEl = document.getElementById("status");
  const icon = document.getElementById("status-icon");
  const text = document.getElementById("status-text");
  statusEl.classList.toggle("active", active);
  statusEl.classList.toggle("inactive", !active);
  if (active) {
    icon.textContent = locked ? "🔒" : "⛔";
    text.textContent = `Blocking active — ends at ${formatTime(state.schedule.end)}`;
  } else {
    icon.textContent = "🟢";
    text.textContent = "Off the clock — nothing blocked";
  }

  const list = document.getElementById("site-list");
  list.replaceChildren(
    ...state.blocklist.map((domain) => {
      const li = document.createElement("li");
      li.textContent = domain;
      return li;
    })
  );
  document.getElementById("empty").hidden = state.blocklist.length > 0;
}

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("add-input");
  const errEl = document.getElementById("add-error");
  const res = await send("addSite", { domain: input.value });
  if (res.ok) {
    input.value = "";
    errEl.hidden = true;
    refresh();
  } else {
    errEl.textContent = res.error;
    errEl.hidden = false;
  }
});

document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
