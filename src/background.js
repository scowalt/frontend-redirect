import { SERVICES } from "./services.js";
import { forEachLimited, probe } from "./health.js";
import {
  INSTANCE_LIST_URL,
  activeInstances,
  buildRules,
  bypassRule,
  instancesFor,
  loadLocal,
  loadSettings,
} from "./state.js";

const CHECK_EVERY_MINUTES = 360;
const PROBES_IN_FLIGHT = 6;

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

async function start() {
  await chrome.alarms.create("check", { periodInMinutes: CHECK_EVERY_MINUTES });
  await applyRules();
  const { checkedAt } = await loadLocal();
  if (!checkedAt || Date.now() - checkedAt > CHECK_EVERY_MINUTES * 60_000) await checkInstances();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check") checkInstances();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    applyRules();
    probeUnchecked();
  }
  if (area === "local" && changes.health) applyRules();
});

/** Probes instances of enabled services that have never been checked (a service just turned on, a custom instance just added). */
async function probeUnchecked() {
  const [settings, local] = await Promise.all([loadSettings(), loadLocal()]);
  const unchecked = SERVICES.filter((s) => settings[s.id].enabled)
    .flatMap((s) => probeTargets(s, instancesFor(s.id, settings, local)))
    .filter(([url]) => !local.health[url]);
  await probeAll(unchecked);
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handlers = {
    check: () => checkInstances(),
    bypass: () => bypassTab(message.tabId, message.url),
    resume: () => resumeTab(message.tabId),
  };
  handlers[message.type]().then(() => reply({ ok: true }), (error) => reply({ ok: false, error: String(error) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
});

let rulesQueue = Promise.resolve();

/** Rebuilds the redirect rules from current settings and health. Calls run one at a time. */
function applyRules() {
  rulesQueue = rulesQueue.then(async () => {
    const [settings, local, current] = await Promise.all([
      loadSettings(),
      loadLocal(),
      chrome.declarativeNetRequest.getDynamicRules(),
    ]);
    const rules = buildRules(activeInstances(settings, local));
    if (JSON.stringify(stripIds(current)) === JSON.stringify(stripIds(rules))) return;
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: current.map((r) => r.id),
      addRules: rules,
    });
  });
  return rulesQueue.catch((error) => console.error("Updating redirect rules failed", error));
}

const stripIds = (rules) => rules.map(({ id, ...rest }) => sortKeys(rest));
const sortKeys = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]))
    : Array.isArray(value)
      ? value.map(sortKeys)
      : value;

let checking = null;

/** Refreshes the public instance list, then probes every instance of the enabled services. */
function checkInstances() {
  checking ??= busy(async () => {
    const lists = await refreshLists();
    const [settings, local] = await Promise.all([loadSettings(), loadLocal()]);
    const enabled = SERVICES.filter((s) => settings[s.id].enabled);
    await probeAll(enabled.flatMap((s) => probeTargets(s, instancesFor(s.id, settings, { ...local, lists }))));
    await chrome.storage.local.set({ checkedAt: Date.now() });
  }).finally(() => {
    checking = null;
  });
  return checking;
}

let busyCount = 0;

/** Runs `work` while storage shows a check in progress, so the popup can show a spinner. */
async function busy(work) {
  if (busyCount++ === 0) await chrome.storage.local.set({ checkingSince: Date.now() });
  try {
    return await work();
  } finally {
    if (--busyCount === 0) await chrome.storage.local.set({ checkingSince: null });
  }
}

async function refreshLists() {
  const { lists: previous = {} } = await chrome.storage.local.get("lists");
  try {
    const res = await fetch(INSTANCE_LIST_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const data = await res.json();
    const lists = Object.fromEntries(
      SERVICES.map((s) => [s.id, (data[s.listKey]?.clearnet ?? []).map((url) => new URL(url).origin)]),
    );
    await chrome.storage.local.set({ lists });
    return lists;
  } catch (error) {
    console.warn("Could not refresh the instance list; keeping the last one", error);
    return previous;
  }
}

let healthWrites = Promise.resolve();

/** @returns {[instance: string, path: string][]} */
const probeTargets = (service, instances) => instances.map((instance) => [instance, service.probePath]);

/** @param {[instance: string, path: string][]} targets */
function probeAll(targets) {
  if (targets.length === 0) return Promise.resolve();
  const unique = [...new Map(targets).entries()];
  return busy(() =>
    forEachLimited(unique, PROBES_IN_FLIGHT, async ([instance, path]) => {
      const result = await probe(instance, path);
      healthWrites = healthWrites.then(async () => {
        const { health = {} } = await chrome.storage.local.get("health");
        await chrome.storage.local.set({ health: { ...health, [instance]: result } });
      });
      await healthWrites;
    }),
  );
}

async function bypassTab(tabId, url) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId], addRules: [bypassRule(tabId)] });
  if (url) await chrome.tabs.update(tabId, { url });
}

async function resumeTab(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) await chrome.tabs.update(tabId, { url: tab.url });
}
