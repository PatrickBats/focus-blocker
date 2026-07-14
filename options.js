let messageTimer;

function showMessage(text, isError) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = `message ${isError ? "err" : "ok"}`;
  el.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (el.hidden = true), 4000);
}

function renderDays(selectedDays, disabledDays) {
  const container = document.getElementById("days");
  container.replaceChildren(
    ...DAY_LABELS.map((label, day) => {
      const wrapper = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.day = day;
      box.checked = selectedDays.includes(day);
      // In lockdown, already-selected days can't be unchecked (only additions allowed)
      box.disabled = disabledDays.includes(day);
      wrapper.append(box, label);
      return wrapper;
    })
  );
}

async function refresh() {
  const res = await send("getStatus");
  if (!res?.ok) return;
  const { state, locked } = res;

  document.getElementById("lock-banner").hidden = !locked;

  const list = document.getElementById("site-list");
  list.replaceChildren(
    ...state.blocklist.map((domain) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = domain;
      const btn = document.createElement("button");
      btn.textContent = "Remove";
      btn.disabled = locked;
      btn.addEventListener("click", async () => {
        const r = await send("removeSite", { domain });
        if (!r.ok) showMessage(r.error, true);
        refresh();
      });
      li.append(span, btn);
      return li;
    })
  );
  document.getElementById("empty").hidden = state.blocklist.length > 0;

  renderDays(state.schedule.days, locked ? state.schedule.days : []);
  document.getElementById("start-time").value = state.schedule.start;
  document.getElementById("end-time").value = state.schedule.end;

  document.getElementById("lockdown").checked = state.lockdown;
}

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("add-input");
  const res = await send("addSite", { domain: input.value });
  if (res.ok) {
    input.value = "";
    showMessage("Site added.", false);
  } else {
    showMessage(res.error, true);
  }
  refresh();
});

document.getElementById("save-schedule").addEventListener("click", async () => {
  const days = [...document.querySelectorAll("#days input:checked")].map((b) =>
    Number(b.dataset.day)
  );
  const schedule = {
    days,
    start: document.getElementById("start-time").value,
    end: document.getElementById("end-time").value,
  };
  const res = await send("setSchedule", { schedule });
  showMessage(res.ok ? "Schedule saved." : res.error, !res.ok);
  refresh();
});

document.getElementById("lockdown").addEventListener("change", async (e) => {
  const res = await send("setLockdown", { enabled: e.target.checked });
  if (!res.ok) showMessage(res.error, true);
  else if (e.target.checked) showMessage("Lockdown enabled. Stay strong 💪", false);
  refresh();
});

refresh();
