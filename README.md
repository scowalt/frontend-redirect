# Frontend Redirect

A Chrome extension that redirects X to Nitter, Reddit to Redlib, Instagram to Kittygram, and
optionally YouTube to Invidious and Imgur to Rimgo. It checks which public instances are online and lets you choose
one from the toolbar popup.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.

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
  working instance. To use one instance every time, pick it in the popup. Your pick stays in
  use even if the instance goes down. To add an instance that isn't on the list, such as your
  own, enter its URL in the field under the list.
- **Redirects.** Redirects use `declarativeNetRequest` rules, so a page goes straight to the
  instance and the original site never loads. Pages that the frontends can't show, such as
  login, settings, and compose, are not redirected.
- **Opening the original site.** When the current tab is on an instance, the popup shows
  **Open on x.com** (or the matching site). This stops redirects in that tab only, until you
  click **Resume** or close the tab.

Settings are saved in `chrome.storage.sync`, so they follow your Chrome profile. Health results
are saved only on this device.

To add another frontend, add an entry to `SERVICES` in `src/services.js`.

## Development

```sh
npm install
npm test        # unit tests: rewrite rules, the skip list, ranking, settings
npm run e2e     # loads the extension in Chromium and runs real redirects against live instances
npm run icons   # rebuilds icons/*.png
npm run zip     # creates frontend-redirect.zip for the Chrome Web Store
```

`npm run e2e` uses `CHROME_PATH`. If `CHROME_PATH` is not set, it uses the newest Chromium build
already downloaded by Playwright.
