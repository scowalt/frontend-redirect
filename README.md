# Sidedoor

<img src="icons/128.png" width="96" align="right" alt="">

**Read X, Reddit and Instagram without the front door.**

[![CI](https://github.com/scowalt/sidedoor/actions/workflows/ci.yml/badge.svg)](https://github.com/scowalt/sidedoor/actions/workflows/ci.yml)
[![Live instances](https://github.com/scowalt/sidedoor/actions/workflows/live.yml/badge.svg)](https://github.com/scowalt/sidedoor/actions/workflows/live.yml)

Sidedoor is a Chrome extension that redirects X to Nitter, Reddit to Redlib, Instagram to Kittygram, and
optionally YouTube to Invidious and Imgur to Rimgo. It checks which public instances are online and lets you choose
one from the toolbar popup.

## Install

Sidedoor is on its way to the Chrome Web Store. Once it's there, install it once and Chrome sync
adds it, with your settings, to every Chrome signed in to the same profile.

Until then, or to run the latest `main`:

1. Download `sidedoor.zip` from the [latest release](https://github.com/scowalt/sidedoor/releases/latest)
   and unzip it, or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.

### iPhone and iPad (Safari)

The same extension runs in Safari through a small app, `safari/`, delivered with TestFlight.
After installing the app, open **Settings → Apps → Safari → Extensions → Sidedoor**, turn on
**Allow Extension**, and set **All Websites** to **Allow**. The popup is under the page menu
(the button left of the address) → **Sidedoor**.

## How it works

- **Instance list.** The extension fetches LibRedirect's public list
  ([libredirect/instances](https://github.com/libredirect/instances)) on startup and every 6 hours.
- **Health checks.** For each service you turned on, it loads a real page from every instance
  (a profile or a subreddit, not just the home page) and marks each instance:
  - **Green:** working, with the response time.
  - **Amber:** the instance shows a bot check (Anubis, Cloudflare). A normal browser usually
    gets through after a short wait.
  - **Red:** down, rate limited, or suspended.

  Click the refresh button in the popup to check again now.
- **Choosing an instance.** By default each service is set to **Auto**, which uses the fastest
  instance that's up, or one behind a bot check if none are. To use one instance every time, pick it in the popup. Your pick stays in
  use even if the instance goes down. To add an instance that isn't on the list, such as your
  own, enter its URL in the field under the list.
- **Redirects.** Redirects use `declarativeNetRequest` rules, so a page goes straight to the
  instance and the original site never loads. Pages that the frontends can't show, such as
  login, settings, and compose, are not redirected.
- **Opening the original site.** When the current tab is on an instance, the popup shows
  **Open on x.com** (or the matching site). This stops redirects in that tab only, until you
  click **Resume** or close the tab.

Settings are saved in `chrome.storage.sync`, so they follow your Chrome profile. Health results
are saved only on this device. See the [privacy policy](PRIVACY.md).

To add another frontend, add an entry to `SERVICES` in `src/services.js`.

## Development

```sh
npm install
npm test            # unit tests: rewrite rules, the skip list, ranking, settings
npm run test:rules  # loads the extension in Chromium and checks that Chrome accepts every rule
npm run e2e         # runs real redirects against live public instances
npm run icons   # rebuilds icons/*.png
npm run zip     # creates sidedoor.zip for the Chrome Web Store
npm run store   # renders the store screenshots into store/
```

To release, raise `version` in `manifest.json` and push to `main`. See [PUBLISHING.md](PUBLISHING.md).

CI runs `npm test` and `npm run test:rules` on every push and pull request. `npm run e2e`
depends on public instances that often go down, so it runs on a weekly schedule in the
**Live instances** workflow instead. You can also start that workflow manually.

### Safari app

On a Mac with Xcode and `xcodegen`:

```sh
cd safari && xcodegen generate   # Sidedoor.xcodeproj; bundles manifest.json, src, popup, icons
xcodebuild test -project Sidedoor.xcodeproj -scheme Sidedoor \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```

The UI test turns the extension on in the simulator's Settings, opens `x.com/jack`, checks it
lands on a Nitter instance, and that **Open on x.com** goes back. Use a simulator that has
booted before: on a freshly erased one, Settings doesn't list Safari yet.

`scripts/testflight build`, `validate` and `upload` archive the app, sign it for the App Store
and send it to TestFlight. Signing files live in `~/.config/sidedoor/signing`; the script's
header lists them. Over ssh, run it inside the logged-in user's session with
`sudo launchctl asuser "$(id -u)" sudo -u "$USER" scripts/testflight build`, because the
signing identity doesn't verify outside it.

Safari differs from Chrome in two ways the rules depend on: its `regexFilter` rejects
alternation (`a|b`), lookaround and `\d \w \s` (a unit test checks every rule), and it applies
redirects only with the `declarativeNetRequestWithHostAccess` permission.

The browser tests use `CHROME_PATH`. If `CHROME_PATH` is not set, they use the newest Chromium build
already downloaded by Playwright. Run `npx playwright install chromium` if you have none.
