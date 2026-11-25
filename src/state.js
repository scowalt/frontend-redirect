import { SERVICES } from "./services.js";
import { pickInstance } from "./health.js";

/**
 * Settings live in storage.sync (they follow your Chrome profile); check results live in
 * storage.local.
 *
 * @typedef {{ enabled: boolean, choice: "auto" | string, custom: string[] }} ServiceSettings
 * @typedef {Record<string, ServiceSettings>} Settings
 * @typedef {{
 *   lists: Record<string, string[]>,
 *   health: Record<string, import("./health.js").Health>,
 *   checkedAt: number | null,
 *   checkingSince: number | null,
 * }} LocalState
 */

export const INSTANCE_LIST_URL = "https://raw.githubusercontent.com/libredirect/instances/main/data.json";

/** @param {unknown} stored @returns {Settings} */
export function withDefaults(stored) {
  const saved = /** @type {Record<string, Partial<ServiceSettings>>} */ (stored ?? {});
  return Object.fromEntries(
    SERVICES.map((s) => [
      s.id,
      {
        enabled: saved[s.id]?.enabled ?? s.defaultEnabled,
        choice: saved[s.id]?.choice ?? "auto",
        custom: saved[s.id]?.custom ?? [],
      },
    ]),
  );
}

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return withDefaults(settings);
}

/** @param {(settings: Settings) => void} change */
export async function updateSettings(change) {
  const settings = await loadSettings();
  change(settings);
  await chrome.storage.sync.set({ settings });
}

/** @returns {Promise<LocalState>} */
export async function loadLocal() {
  const local = await chrome.storage.local.get(["lists", "health", "checkedAt", "checkingSince"]);
  return {
    lists: local.lists ?? {},
    health: local.health ?? {},
    checkedAt: local.checkedAt ?? null,
    checkingSince: local.checkingSince ?? null,
  };
}

/** Public instances plus the ones you added, without duplicates. */
export function instancesFor(serviceId, settings, local) {
  return [...new Set([...settings[serviceId].custom, ...(local.lists[serviceId] ?? [])])];
}

/**
 * @param {Settings} settings
 * @param {LocalState} local
 * @returns {Record<string, string | null>} the instance each enabled service redirects to
 */
export function activeInstances(settings, local) {
  return Object.fromEntries(
    SERVICES.filter((s) => settings[s.id].enabled).map((s) => [
      s.id,
      pickInstance(instancesFor(s.id, settings, local), local.health, settings[s.id].choice),
    ]),
  );
}

/**
 * declarativeNetRequest dynamic rules for the active instances. Skip rules outrank redirects.
 * @param {Record<string, string | null>} active
 */
export function buildRules(active) {
  const rules = [];
  for (const service of SERVICES) {
    const instance = active[service.id];
    if (!instance) continue;
    for (const path of service.skip) {
      rules.push({
        priority: 2,
        action: { type: "allow" },
        condition: {
          regexFilter: `^https?://[^/]+/${path}([/?#].*)?$`,
          requestDomains: service.domains,
          resourceTypes: ["main_frame"],
        },
      });
    }
    for (const { hosts, path, to } of service.redirects) {
      for (const host of hosts) {
        rules.push({
          priority: 1,
          action: { type: "redirect", redirect: { regexSubstitution: instance + to } },
          condition: { regexFilter: `^https?://${host.replaceAll(".", "\\.")}/${path}`, resourceTypes: ["main_frame"] },
        });
      }
    }
  }
  return rules.map((rule, i) => ({ id: i + 1, ...rule }));
}

/** Session rule that turns redirects off for one tab. Its id is the tab id. */
export function bypassRule(tabId) {
  return {
    id: tabId,
    priority: 3,
    action: { type: "allow" },
    condition: {
      tabIds: [tabId],
      requestDomains: SERVICES.flatMap((s) => s.domains),
      resourceTypes: ["main_frame"],
    },
  };
}
