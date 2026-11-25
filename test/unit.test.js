import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICES, normalizeInstance, originalUrl, serviceById } from "../src/services.js";
import { classify, pickInstance, rankInstances } from "../src/health.js";
import { activeInstances, buildRules, withDefaults } from "../src/state.js";

const INSTANCE = "https://front.example";

/** Applies the rules the way declarativeNetRequest would for a main_frame request. */
function navigate(url) {
  const active = Object.fromEntries(SERVICES.map((s) => [s.id, INSTANCE]));
  const matching = buildRules(active)
    .filter((r) => new RegExp(r.condition.regexFilter).test(url))
    .filter((r) => {
      const domains = r.condition.requestDomains;
      if (!domains) return true;
      const { hostname } = new URL(url);
      return domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
    })
    .sort((a, b) => b.priority - a.priority);
  const rule = matching[0];
  if (!rule || rule.action.type === "allow") return url;
  const sub = rule.action.redirect.regexSubstitution.replace(/\\(\d)/g, "$$$1");
  return url.replace(new RegExp(rule.condition.regexFilter), sub);
}

test("redirects pages to the same path on the instance", () => {
  const cases = {
    "https://x.com/jack/status/20?s=20": `${INSTANCE}/jack/status/20?s=20`,
    "https://twitter.com/jack": `${INSTANCE}/jack`,
    "https://mobile.twitter.com/jack": `${INSTANCE}/jack`,
    "https://x.com/": `${INSTANCE}/`,
    "https://x.com/homer": `${INSTANCE}/homer`,
    "https://www.reddit.com/r/linux/comments/abc/title/": `${INSTANCE}/r/linux/comments/abc/title/`,
    "https://old.reddit.com/r/linux?sort=top": `${INSTANCE}/r/linux?sort=top`,
    "https://www.youtube.com/watch?v=abc&t=5": `${INSTANCE}/watch?v=abc&t=5`,
    "https://youtu.be/abc?t=10": `${INSTANCE}/watch?v=abc&t=10`,
    "https://i.imgur.com/abc.png": `${INSTANCE}/abc.png`,
    "https://www.instagram.com/instagram/": `${INSTANCE}/instagram/`,
    "https://www.instagram.com/p/Df-eXldGxRb/?img_index=1": `${INSTANCE}/p/Df-eXldGxRb/?img_index=1`,
    "https://instagram.com/reel/Df-eXldGxRb/": `${INSTANCE}/reel/Df-eXldGxRb/`,
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(navigate(from), to, from);
});

test("leaves login, settings and other unsupported pages alone", () => {
  for (const url of [
    "https://x.com/i/flow/login",
    "https://x.com/home",
    "https://twitter.com/settings/account",
    "https://www.reddit.com/login/",
    "https://www.reddit.com/r/linux/submit",
    "https://www.youtube.com/account",
    "https://www.instagram.com/accounts/login/",
    "https://www.instagram.com/stories/instagram/123/",
    "https://www.instagram.com/explore/tags/cats/",
    "https://unrelated.example/x.com/jack",
    "https://notreddit.com/r/linux",
    "https://help.x.com/en",
  ]) {
    assert.equal(navigate(url), url, url);
  }
});

test("every rule regex uses only syntax Safari accepts", () => {
  // Safari compiles declarativeNetRequest regexes with WebKit's content blocker parser
  // (URLFilterParser.cpp), which rejects these and drops the whole rule update.
  const unsupported = { alternation: /\|/, "counted repetition": /\{\d/, "\\d, \\w, \\s or \\b": /\\[dDwWsSbB]/, lookaround: /\(\?[=!<]/ };
  const rules = buildRules(Object.fromEntries(SERVICES.map((s) => [s.id, INSTANCE])));
  for (const { condition } of rules) {
    for (const [name, pattern] of Object.entries(unsupported)) {
      assert.doesNotMatch(condition.regexFilter, pattern, `${condition.regexFilter} uses ${name}`);
    }
  }
});

test("disabled services and services with no instance get no rules", () => {
  const rules = buildRules({ nitter: null, redlib: INSTANCE });
  assert.ok(rules.every((r) => !r.condition.requestDomains?.includes("x.com")));
  assert.ok(rules.some((r) => r.action.redirect?.regexSubstitution.startsWith(INSTANCE)));
  assert.deepEqual(new Set(rules.map((r) => r.id)).size, rules.length);
});

test("classify tells working instances from bot checks and failures", () => {
  assert.equal(classify(200, "<title>Nitter</title>").state, "up");
  assert.equal(classify(200, "<title>Making sure you&#39;re not a bot!</title>").state, "challenge");
  assert.equal(classify(403, "<title>Just a moment...</title>").state, "challenge");
  assert.equal(classify(403, '<link href="/.bunny-shield/assets/challenge-styles.css" rel="stylesheet" />').state, "challenge");
  assert.equal(classify(401, "<title>mod_pow_captcha</title>").state, "challenge");
  assert.equal(classify(418, '<title>pow!</title> <meta name="tc-challenge" content="dac9.1795351203.14.fff9">').state, "challenge");
  assert.equal(classify(429, "Oh noes").state, "down");
  assert.equal(classify(451, "suspended").state, "down");
  assert.equal(classify(502, "").state, "down");
});

test("auto picks the fastest working instance and skips down ones", () => {
  const health = {
    "https://a": { state: "down", ms: 10 },
    "https://b": { state: "up", ms: 400 },
    "https://c": { state: "up", ms: 90 },
    "https://d": { state: "challenge", ms: 5 },
  };
  const all = ["https://a", "https://b", "https://c", "https://d", "https://e"];
  assert.deepEqual(rankInstances(all, health), ["https://c", "https://b", "https://d", "https://e", "https://a"]);
  assert.equal(pickInstance(all, health, "auto"), "https://c");
  assert.equal(pickInstance(["https://a"], health, "auto"), null);
  assert.equal(pickInstance(all, health, "https://a"), "https://a", "a manual pick is honored even when down");
});

test("settings default sensibly and custom instances join the public list", () => {
  const settings = withDefaults({ redlib: { choice: "https://mine.example", custom: ["https://mine.example"] } });
  assert.equal(settings.nitter.enabled, true);
  assert.equal(settings.invidious.enabled, false);
  const active = activeInstances(settings, {
    lists: { nitter: ["https://n1", "https://n2"], redlib: ["https://r1"] },
    health: { "https://n1": { state: "down" }, "https://n2": { state: "up", ms: 50 } },
  });
  assert.deepEqual(active, { nitter: "https://n2", redlib: "https://mine.example", kittygram: null });
});

test("instance URLs and links back to the original site", () => {
  assert.equal(normalizeInstance(" nitter.example/some/path "), "https://nitter.example");
  assert.equal(normalizeInstance("http://10.0.0.2:8080/"), "http://10.0.0.2:8080");
  assert.throws(() => normalizeInstance("ftp://x"));
  assert.equal(
    originalUrl(serviceById("redlib"), "https://redlib.example/r/linux?sort=top#c"),
    "https://www.reddit.com/r/linux?sort=top#c",
  );
});
