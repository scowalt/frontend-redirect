// Loads the unpacked extension in Chromium, waits for the first real instance check, then
// drives redirects, the skip list, a manual pick in the popup, and the per-tab bypass.
// Run: npm run e2e   (SHOTS=dir saves popup screenshots there)
import { chromium } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromePath } from "../scripts/chrome.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const shots = process.env.SHOTS;
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "fr-e2e-")), {
  executablePath: chromePath(),
  headless: true,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  viewport: { width: 360, height: 640 },
});

const step = (name) => console.log(`\n▶ ${name}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const storage = () => worker.evaluate(() => chrome.storage.local.get(null));
  const instanceFor = async (host) => {
    const rules = await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    const rule = rules.find((r) => r.action.type === "redirect" && r.condition.regexFilter.includes(host));
    return rule && new URL(rule.action.redirect.regexSubstitution.replace(/\\\d/g, "")).origin;
  };
  /**
   * Navigates and returns the URL the main frame ended up requesting. Read from requests, not
   * page.url(): sites that refuse headless Chrome leave page.url() on the previous page.
   */
  const go = async (page, url) => {
    let last = null;
    const onRequest = (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) last = r.url();
    };
    page.on("request", onRequest);
    await page.goto(url, { waitUntil: "commit", timeout: 20_000 }).catch(() => {});
    page.off("request", onRequest);
    return last;
  };

  step("Every rule regex compiles in Chrome");
  const { SERVICES } = await import("../src/services.js");
  const { buildRules } = await import("../src/state.js");
  const allRules = buildRules(Object.fromEntries(SERVICES.map((s) => [s.id, "https://instance.example"])));
  for (const { condition } of allRules) {
    const result = await worker.evaluate((regex) => chrome.declarativeNetRequest.isRegexSupported({ regex }), condition.regexFilter);
    assert.ok(result.isSupported, `${condition.regexFilter}: ${result.reason}`);
  }
  ok(`${allRules.length} rules`);

  step("First instance check");
  const started = Date.now();
  while (!(await storage()).checkedAt) {
    if (Date.now() - started > 120_000) throw new Error("check did not finish in 2 min");
    await new Promise((r) => setTimeout(r, 1000));
  }
  const local = await storage();
  for (const [service, list] of Object.entries(local.lists)) {
    const states = list.map((u) => local.health[u]?.state ?? "unchecked");
    const count = (s) => states.filter((x) => x === s).length;
    console.log(`  ${service}: ${list.length} listed, up ${count("up")}, bot check ${count("challenge")}, down ${count("down")}, unchecked ${count("unchecked")}`);
  }
  ok(`checked in ${Math.round((Date.now() - started) / 1000)} s`);

  const page = await context.newPage();

  step("Redirects");
  const nitter = await instanceFor("twitter");
  const redlib = await instanceFor("reddit");
  assert.ok(nitter, "a nitter instance is active");
  assert.ok(redlib, "a redlib instance is active");
  assert.equal(await go(page, "https://x.com/jack/status/20"), `${nitter}/jack/status/20`);
  ok(`x.com/jack/status/20 → ${nitter}/jack/status/20`);
  assert.equal(await go(page, "https://old.reddit.com/r/linux/top?t=week"), `${redlib}/r/linux/top?t=week`);
  ok(`old.reddit.com/r/linux/top?t=week → ${redlib}/r/linux/top?t=week`);
  assert.ok(!(await instanceFor("youtube")), "YouTube is off by default");
  ok("YouTube is off by default (no rule)");

  step("Skip list");
  assert.match(await go(page, "https://www.reddit.com/login/"), /^https:\/\/www\.reddit\.com\/login/);
  ok("reddit.com/login stays on reddit.com");

  step("Popup: pick an instance");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.getByRole("button", { name: /Reddit/ }).click();
  if (shots) await popup.screenshot({ path: join(shots, "popup-reddit.png"), fullPage: true });
  const ranked = local.lists.redlib.filter((u) => u !== redlib && local.health[u]?.state !== "down");
  const pick = ranked[0] ?? local.lists.redlib.find((u) => u !== redlib);
  await popup.locator(".choice", { hasText: new URL(pick).host }).click();
  await popup.locator(".choice.selected", { hasText: new URL(pick).host }).waitFor();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await instanceFor("reddit"), pick);
  assert.equal(await go(page, "https://www.reddit.com/r/linux"), `${pick}/r/linux`);
  ok(`picked ${new URL(pick).host}; reddit.com/r/linux → ${pick}/r/linux`);
  if (shots) await popup.screenshot({ path: join(shots, "popup-picked.png"), fullPage: true });

  step("Popup: add a custom instance");
  await popup.getByPlaceholder("Add a Redlib instance URL").fill("redlib.mine.example/");
  await popup.getByRole("button", { name: "Add" }).click();
  await popup.locator(".choice.selected", { hasText: "redlib.mine.example" }).waitFor();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await instanceFor("reddit"), "https://redlib.mine.example");
  ok("custom instance added, selected, and used for redirects");
  await popup.getByRole("button", { name: "Remove redlib.mine.example" }).click();
  await popup.locator(".choice.selected", { hasText: "Auto" }).waitFor();
  ok("removing it falls back to Auto");

  step("Per-tab bypass");
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(url))?.id,
    pick,
  );
  await popup.evaluate(
    ([tabId]) => chrome.runtime.sendMessage({ type: "bypass", tabId, url: "https://www.reddit.com/r/linux" }),
    [tabId],
  );
  await page.waitForURL(/^https:\/\/www\.reddit\.com\/r\/linux/, { waitUntil: "commit", timeout: 20_000 });
  assert.match(await go(page, "https://x.com/jack"), /^https:\/\/x\.com\/jack/);
  ok("after Open original, the tab stays on reddit.com and x.com links aren't redirected");
  const other = await context.newPage();
  assert.equal(await go(other, "https://x.com/jack"), `${await instanceFor("twitter")}/jack`);
  ok("other tabs still redirect");
  await popup.evaluate(([tabId]) => chrome.runtime.sendMessage({ type: "resume", tabId }), [tabId]);
  assert.equal(await go(page, "https://x.com/jack"), `${await instanceFor("twitter")}/jack`);
  ok("Resume turns redirects back on for the tab");

  step("Popup over a frontend tab");
  // The popup reads the active tab, so load it in a background tab while the instance tab is active.
  const nitterTab = await context.newPage();
  const nitterPopup = await context.newPage();
  const before = await instanceFor("twitter");
  await go(nitterTab, "https://x.com/jack");
  await nitterTab.bringToFront();
  await nitterPopup.goto(`chrome-extension://${id}/popup/popup.html`);
  await nitterPopup.locator("#tab", { hasText: `This tab is on ${new URL(before).host}` }).waitFor();
  if (shots) await nitterPopup.screenshot({ path: join(shots, "popup-on-instance.png"), fullPage: true });
  ok("shows which instance the tab is on, and opens that service's list");
  const switchTo = (await storage()).lists.nitter.find((u) => u !== before);
  await nitterPopup.locator(".choice").filter({ has: nitterPopup.locator(".host", { hasText: new URL(switchTo).host }) }).click();
  await nitterTab.waitForURL(`${switchTo}/jack`, { waitUntil: "commit", timeout: 20_000 }).catch(() => {});
  const moved = await worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl || t.url));
  assert.ok(moved.includes(`${switchTo}/jack`), `tab moved to ${switchTo}/jack (tabs: ${moved})`);
  ok(`picking ${new URL(switchTo).host} moves the open tab to ${switchTo}/jack`);
  await nitterPopup.getByRole("button", { name: "Open on x.com" }).click();
  await new Promise((r) => setTimeout(r, 1500));
  const after = await worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl || t.url));
  assert.ok(after.some((u) => u?.startsWith("https://x.com/jack")), `a tab is on x.com/jack (tabs: ${after})`);
  ok("Open on x.com takes the tab to x.com/jack");

  console.log("\nAll end-to-end checks passed.");
} finally {
  await context.close();
}
