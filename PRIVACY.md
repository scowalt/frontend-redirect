# Sidedoor privacy policy

Sidedoor does not collect, sell or send your personal data anywhere. It has no analytics, no
accounts and no servers of its own.

## What stays in your browser

- **Settings** (which services are on, which instance you picked, instances you added) are saved
  in `chrome.storage.sync`. If you use Chrome sync, Chrome copies them to your other browsers
  signed in to the same profile.
- **Instance health** (whether each instance was up and how fast it answered) is saved in
  `chrome.storage.local` on this device only.
- **The pages you visit** are matched against redirect rules by Chrome itself
  (`declarativeNetRequest`). Sidedoor never reads or stores your browsing history.

## Network requests Sidedoor makes

- It downloads the public instance list from
  `https://raw.githubusercontent.com/libredirect/instances/main/data.json` every 6 hours.
- It loads one public page (for example a subreddit) from each instance of the services you turned
  on, to check that the instance is up. These requests carry no information about you.

## Redirected pages

When Sidedoor redirects a link, your browser loads that page from the instance you chose, such as a
Nitter or Redlib server. That server sees the request like any website you visit, and its own
privacy policy applies.

## Contact

Open an issue at <https://github.com/scowalt/sidedoor/issues>.
