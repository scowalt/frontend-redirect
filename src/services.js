/**
 * Every site this extension can redirect. Adding a frontend means adding one entry here.
 *
 * - listKey: the key in LibRedirect's instance list (data.json).
 * - domains: the original site's domains (subdomains included), for per-tab bypass rules.
 * - origin: where "Open original" sends you.
 * - redirects: regexFilter against the full URL, and the path appended to the chosen instance
 *   (`\1` is the first capture group, in declarativeNetRequest syntax).
 * - skip: paths on the original site that the frontend can't show (login, settings, ...). Each is a
 *   regex for the leading path segments and becomes its own small rule: Chrome rejects regex rules
 *   that compile past 2 KB, which one big alternation does.
 *
 * @typedef {{
 *   id: string, name: string, frontend: string, listKey: string, defaultEnabled: boolean,
 *   domains: string[], origin: string,
 *   redirects: { regex: string, to: string }[], skip: string[],
 * }} Service
 */

/** @type {Service[]} */
export const SERVICES = [
  {
    id: "nitter",
    name: "X",
    frontend: "Nitter",
    listKey: "nitter",
    defaultEnabled: true,
    domains: ["x.com", "twitter.com"],
    origin: "https://x.com",
    redirects: [{ regex: "^https?://(?:www\\.|mobile\\.)?(?:x|twitter)\\.com/(.*)$", to: "/\\1" }],
    skip: ["i/flow", "i/oauth2", "login", "logout", "signup", "settings", "compose", "messages", "notifications", "home", "explore", "account"],
  },
  {
    id: "redlib",
    name: "Reddit",
    frontend: "Redlib",
    listKey: "redlib",
    defaultEnabled: true,
    domains: ["reddit.com"],
    origin: "https://www.reddit.com",
    redirects: [
      { regex: "^https?://(?:www\\.|old\\.|new\\.|np\\.|m\\.|amp\\.|i\\.)?reddit\\.com/(.*)$", to: "/\\1" },
    ],
    skip: [
      "login", "register", "logout", "account", "settings", "prefs", "submit", "message", "chat",
      "notifications", "media", "mod", "api", "password", "r/[^/]+/submit",
    ],
  },
  {
    id: "invidious",
    name: "YouTube",
    frontend: "Invidious",
    listKey: "invidious",
    defaultEnabled: false,
    domains: ["youtube.com", "youtu.be"],
    origin: "https://www.youtube.com",
    redirects: [
      { regex: "^https?://(?:www\\.|m\\.)?youtube\\.com/(.*)$", to: "/\\1" },
      { regex: "^https?://youtu\\.be/([^?#]+)\\??([^#]*)", to: "/watch?v=\\1&\\2" },
    ],
    skip: ["account", "upload", "signin", "logout", "premium", "paid_memberships", "channel_switcher", "redirect", "t", "howyoutubeworks"],
  },
  {
    id: "rimgo",
    name: "Imgur",
    frontend: "Rimgo",
    listKey: "rimgo",
    defaultEnabled: false,
    domains: ["imgur.com"],
    origin: "https://imgur.com",
    redirects: [{ regex: "^https?://(?:www\\.|m\\.|i\\.)?imgur\\.com/(.*)$", to: "/\\1" }],
    skip: ["upload", "signin", "register", "account", "emerald"],
  },
];

/** @param {string} id */
export function serviceById(id) {
  const service = SERVICES.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown service ${id}`);
  return service;
}

/** Instance URLs are stored as bare origins: "https://host[:port]". */
export function normalizeInstance(raw) {
  const url = new URL(raw.trim().includes("://") ? raw.trim() : `https://${raw.trim()}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Instance must be http(s)");
  return url.origin;
}

/** The URL on the original site for a page on a frontend instance. */
export function originalUrl(service, frontendUrl) {
  const url = new URL(frontendUrl);
  return service.origin + url.pathname + url.search + url.hash;
}
