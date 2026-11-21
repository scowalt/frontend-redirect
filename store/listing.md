# Chrome Web Store listing

Copy these into the Developer Dashboard. The images in this folder come from `npm run store`.

## Store listing tab

**Description**

```
Read X, Reddit and Instagram without the front door.

Sidedoor sends links to privacy-friendly frontends before the original site loads:

• X (Twitter) → Nitter
• Reddit → Redlib
• Instagram → Kittygram
• YouTube → Invidious (off by default)
• Imgur → Rimgo (off by default)

Public instances come and go, so Sidedoor checks every instance every few hours by loading a real page, and picks the fastest one that works. The toolbar popup shows which instances are up, behind a bot check, or down. You can pick one yourself or add your own instance.

Pages the frontends can't show, such as login and settings, stay on the original site. On any frontend tab, "Open on x.com" (or reddit.com, and so on) opens the original page for that tab only.

No accounts, no analytics, no data collection. Open source under the MIT license: https://github.com/scowalt/sidedoor
```

**Category:** Privacy & Security
**Language:** English
**Store icon:** `icons/128.png`
**Screenshots:** `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png`
**Small promo tile:** `promo-small.png`
**Homepage URL:** https://github.com/scowalt/sidedoor
**Support URL:** https://github.com/scowalt/sidedoor/issues

## Privacy tab

**Single purpose**

```
Redirects X, Reddit, Instagram, YouTube and Imgur links to alternative privacy frontends (Nitter, Redlib, Kittygram, Invidious, Rimgo), and picks a frontend instance that is online.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `declarativeNetRequest` | Redirects requests for x.com, reddit.com, instagram.com, youtube.com and imgur.com to the chosen frontend instance before the original page loads. |
| `storage` | Saves the user's settings (services on or off, chosen and custom instances) and the latest instance health results. |
| `alarms` | Re-checks which frontend instances are online every 6 hours. |
| Host permissions (`<all_urls>`) | Redirect rules need access to the original sites, and the health check loads a page from each frontend instance. Instances come from a public list that changes often, and users can add their own, so their domains are not known in advance. |

**Remote code:** No, I am not using remote code.

**Data usage:** check nothing; Sidedoor collects none of the listed data. Tick the three certifications.

**Privacy policy URL:** https://github.com/scowalt/sidedoor/blob/main/PRIVACY.md
