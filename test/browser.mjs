import { chromium } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromePath } from "../scripts/chrome.mjs";
import { SERVICES } from "../src/services.js";
import { buildRules } from "../src/state.js";

export const step = (name) => console.log(`\n▶ ${name}`);
export const ok = (msg) => console.log(`  ✔ ${msg}`);

/** Starts headless Chromium with the unpacked extension and returns its service worker. */
export async function launchExtension() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "fr-e2e-")), {
    executablePath: chromePath(),
    headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 360, height: 640 },
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, worker, id: new URL(worker.url()).host };
}

/**
 * Asks Chrome to compile every rule regex. Chrome rejects regexes that compile past 2 KB, and
 * one rejected rule makes the whole rule update fail, which turns off every redirect.
 */
export async function checkRulesCompile(worker) {
  step("Every rule regex compiles in Chrome");
  const rules = buildRules(Object.fromEntries(SERVICES.map((s) => [s.id, "https://instance.example"])));
  for (const { condition } of rules) {
    const result = await worker.evaluate(
      (regex) => chrome.declarativeNetRequest.isRegexSupported({ regex }),
      condition.regexFilter,
    );
    assert.ok(result.isSupported, `${condition.regexFilter}: ${result.reason}`);
  }
  ok(`${rules.length} rules`);
}
