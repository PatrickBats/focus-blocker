# Focus Blocker

**A little help staying on task.**

Focus Blocker is a lightweight Chrome extension that puts distracting websites
on a schedule. Choose your sites and hours, then get back to what you meant to
do. When you visit a blocked site, a dedicated page shows a live countdown
to your next unlock.

## What it does

- **Scheduled blocking:** separate weekday and weekend hours, with overnight support.
- **A friendly blocked page:** cat artwork, the exact next unlock time, and a live countdown.
- **One-click blocking:** add the website you're visiting from the extension popup.
- **Optional lockdown:** keep yourself from reducing blocking during work hours.
- **Portable settings:** export a backup and restore it with a preview before replacing anything.
- **Simple setup:** no build step, runtime dependencies, or separate service account.

## Install in Chrome

You do not need to know how to code. This repository contains the extension
ready to load.

### 1. Download the extension

On the [GitHub repository](https://github.com/PatrickBats/focus-blocker), click
**Code → Download ZIP**, then extract the ZIP file. Move the extracted folder
somewhere you plan to keep it, such as your Documents folder.

If you prefer Git:

```sh
git clone https://github.com/PatrickBats/focus-blocker.git
```

### 2. Load it into Chrome

1. Type `chrome://extensions` into Chrome's address bar and press Enter.
2. Turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select the extracted or cloned folder that contains `manifest.json`.
   Select the folder itself, not the ZIP or an individual file.
5. If Chrome requests website access, allow it. In the extension's
   **Details → Site access**, choose **On all sites** so the blocked page works
   for every website you add.

Keep the extension folder in that location: Chrome loads its files from there.
Blocking follows the default schedule immediately after installation.

### 3. Pin it for easy access

Click Chrome's **Extensions** puzzle-piece icon, find **Focus Blocker**, and
click the pin. Its toolbar icon opens your blocking status and quick controls.

## Your first setup

### Choose the websites you want to block

The starter list includes **Instagram, Reddit, TikTok, and X/Twitter**.

- To add the website you're visiting, click the extension icon, then
  **Block this site**.
- To add another website, enter a domain such as `youtube.com` in the popup
  or settings and click **Add** or **Add site**. You can paste a full URL too;
  the extension blocks its domain, not just that one page.
- To remove a website, open **Schedule & settings** and click **Remove** beside it.

Adding `reddit.com` also covers `www.reddit.com`, `old.reddit.com`, and its other
subdomains. Browser pages such as `chrome://extensions` cannot be added.

### Set your weekday and weekend hours

Open **Schedule & settings** and scroll to **Blocking hours**.

| Schedule | Default days | Default hours |
| --- | --- | --- |
| Weekdays | Monday–Friday | 8 AM–8 PM |
| Weekend | Saturday–Sunday | 8 AM–4 PM |

1. Check the days you want blocking to start.
2. Set **From** and **Until** for each group.
3. Click **Save schedule**.

For example, set weekdays to **9 AM–5 PM** and uncheck Saturday and Sunday
for a workweek-only schedule. Or keep the shorter weekend window for study time.

Times follow your computer's local time. A window such as **10 PM–6 AM**
continues into the following morning: checking Friday blocks Friday night
through Saturday at 6 AM. Equal start and end times mean **off**, not 24 hours.

### Decide whether to enable lockdown

Once you're happy with your sites and hours, optionally turn on
**Enable lockdown** in settings.

During an active blocking window, lockdown lets you add sites or expand hours,
but prevents removing sites, shortening blocked hours, or turning lockdown off.
Those changes become available again when the blocking window ends. Backup
imports follow the same restrictions.

Lockdown is a commitment aid. It does not prevent uninstalling or disabling the
extension, and it does not block other browsers.

### Let the cat take over

During blocking hours, visiting a blocked site opens the cat page. Already-open
blocked tabs are redirected there too. The page shows **Blocked until [day/time]**
and a countdown in hours, minutes, and seconds.

When blocking ends, the page changes to **You're free to browse**. Open the
website again whenever you're ready; Focus Blocker does not reopen it for you.

Want a look first? Click **Preview the cat page** at the bottom of settings.
The preview reflects your real schedule, so outside blocking hours it shows
the unlocked state.

## Back up or restore your setup

To save a copy, open **Schedule & settings → Back up your settings → Export backup**.
Keep the downloaded JSON file somewhere safe. It contains your blocklist,
active schedule, and lockdown setting.

To restore it:

1. Click **Import backup** and choose your saved JSON file.
2. Review the preview of its sites, hours, and lockdown setting.
3. Click **Replace settings**, or **Cancel** to leave your current setup as it is.

Importing replaces your current settings rather than merging them. Export a copy
first if you want to keep both. Invalid backups are rejected before settings change.

## Updating an existing installation

Replace the extension files in the same folder with the new version, then open
`chrome://extensions` and click **Reload** on Focus Blocker. If you installed
with Git and have no local edits, update the folder with `git pull` first.

Version 2 adds website access for redirects; allow the new permission if Chrome
prompts you. Your existing sites and weekday hours are preserved. Weekend hours
become 8 AM–4 PM. If that change would weaken an active lockdown, it waits until
unlock, and settings shows a banner explaining the pending change.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Chrome cannot load the extension | Extract the ZIP and select the folder containing `manifest.json`. |
| A site is not blocked | Check that it is on your list, today's window is active, and the extension is enabled in this Chrome profile. |
| The cat page does not appear | Check **Details → Site access → On all sites**, then reload the extension. |
| A setting cannot be changed | Look for the lockdown banner and its unlock time. |
| A blocking error appears | Use the **Retry** button; the message explains which operation failed. |
| It does not work in Incognito | Enable **Allow in Incognito** in the extension's Chrome details page. |

## Privacy and permissions

Focus Blocker has no analytics, external server, or browsing-history upload.
The cat image is included in the extension and loads locally.

- **Website access** lets Chrome redirect blocked visits to the local cat page.
- **Tabs** lets the extension identify the current site and redirect open blocked tabs.
- **Storage** saves your settings using Chrome sync, subject to your Chrome account's settings.
- **Alarms** checks schedule boundaries; **declarativeNetRequest** enforces network rules.

The extension does not require an AI account or make AI requests while you use it.

## Enforcement and recovery

The background worker owns settings changes, serializes updates, and installs
`declarativeNetRequest` rules before handling tabs. Main-frame requests redirect
to the bundled page; other requests to blocked domains stay blocked. Tab events
and periodic scans also catch pages served from a site's service-worker cache.

Boundary alarms handle schedule changes, with a one-minute fallback and checks on
startup, settings changes, and tab activity. Chrome may delay alarms or suspend
the computer; exact second-level enforcement while asleep is not guaranteed.
The countdown checks with the worker before declaring an unlock.

Errors appear in the popup, settings, and blocked page with a Retry action.
If settings were saved but enforcement failed, the UI says so explicitly.

Settings use `chrome.storage.sync` under a versioned `focusState` key. Version 1
settings migrate once; legacy keys are retained for recovery. Sync is subject to
Chrome's account, quota, and conflict behavior. Very large lists are rejected
before exceeding the per-item sync limit. Uninstalling, disabling the extension,
using another browser/profile, or external sync edits are not tamper-proofed.
Incognito requires Chrome's separate **Allow in Incognito** setting.

## Development and verification

Run the dependency-free scheduling and worker tests:

```sh
node --test tests/*.test.js
```

An optional browser smoke test uses Playwright with its Chromium build and a
fresh temporary profile; it never changes your normal Chrome profile:

```sh
NODE_PATH=/path/to/playwright/node_modules node tests/browser.cjs
```

Install Playwright and its Chromium browser separately first. Set
`FOCUS_QA_OUTPUT` to an existing directory to choose where screenshots are saved.
The test covers redirects, cached tabs, request blocking, countdowns, narrow and
wide layouts, one-click blocking, backup import/export, lockdown, unlocking, and
persisted settings after browser restart. Unit tests cover schedule boundaries,
overnight windows, DST, migration, validation, serialized writes, and failures.

## Artwork

`assets/working-cat.png` was generated with the built-in image-generation tool.
It is bundled locally; no image-generation calls occur while using the extension.
See [the artwork notes](assets/ARTWORK.md) for the exact prompt.

## License

MIT — see [LICENSE](LICENSE).
