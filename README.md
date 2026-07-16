# Focus Blocker

A minimal Chrome extension that hard-blocks distracting websites during your
work hours, with an optional lockdown mode so you can't talk yourself out of it
mid-workday. Plain HTML/CSS/JS, Manifest V3, no build step, no dependencies.

## Features

- **Hard block** — blocked sites fail to load entirely (`ERR_BLOCKED_BY_CLIENT`),
  enforced natively by Chrome's `declarativeNetRequest` API. Covers `www.` and
  other subdomains automatically. All request types are blocked (not just page
  loads), which defeats sites like X and YouTube that serve themselves from a
  service-worker cache — and any tab already open on a blocked site is closed
  automatically when blocking kicks in.
- **Work-hours schedule** — pick the days and start/end times when blocking is
  active. Outside those hours, everything is unblocked. Overnight windows
  (e.g. 10 PM–6 AM) work too.
- **Lockdown mode** — while work hours are active, you cannot remove sites,
  shrink the schedule, or turn lockdown off. Adding sites and expanding the
  schedule are always allowed. Enforcement lives in the background service
  worker, not just the UI.
- Blocklist and settings sync across your Chrome profiles via
  `chrome.storage.sync`.

## Install

1. Clone or download this repository:
   ```
   git clone https://github.com/PatrickBats/focus-blocker.git
   ```
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned folder
5. Pin the extension, click its icon, and you're set

## Usage

- **Popup** (toolbar icon): see current status, quick-add a site
- **Settings** (popup → "Schedule & settings"): manage the blocklist, work
  hours, and lockdown mode

The extension ships with a starter blocklist (Reddit, X/Twitter, Instagram,
TikTok) and a default schedule of every day, 8 AM–8 PM — change both from the
settings page, or edit `DEFAULT_STATE` at the top of `background.js` before
loading.

## How it works

- `background.js` (service worker) owns all state and converts the blocklist
  into `declarativeNetRequest` dynamic rules whenever the schedule says
  blocking should be active. A `chrome.alarms` tick re-checks every minute and
  on browser startup, so the rules flip on/off at the schedule boundaries.
- The popup and options pages never write settings directly — every change is
  a message to the service worker, which enforces the lockdown rules before
  accepting it. The UI disabling is cosmetic; the service worker is the
  authority.

## Honest limitation

Chrome can't stop you from uninstalling the extension itself, so lockdown makes
cheating *inconvenient* (a deliberate, multi-step act) rather than impossible.
That friction is usually enough to break the reflexive open-a-tab habit.

## License

MIT — see [LICENSE](LICENSE).
