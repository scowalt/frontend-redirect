import { SERVICES, normalizeInstance, originalUrl } from "../src/services.js";
import { rankInstances } from "../src/health.js";
import { activeInstances, instancesFor, loadLocal, loadSettings, updateSettings } from "../src/state.js";

const open = new Set();
const errors = new Map();
let tab = null;
let bypassed = false;

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};
const host = (url) => new URL(url).host;
const send = (message) => chrome.runtime.sendMessage(message);

function describe(health) {
  if (!health) return { state: "unknown", text: "not checked" };
  if (health.state === "up") return { state: "up", text: `${health.ms} ms` };
  if (health.state === "challenge") return { state: "challenge", text: "bot check" };
  return { state: "down", text: health.reason ?? "down" };
}

function ago(time) {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "Checked just now";
  if (minutes < 60) return `Checked ${minutes} min ago`;
  return `Checked ${Math.round(minutes / 60)} h ago`;
}

/** The service and instance the active tab is on, if it's a frontend instance we know. */
function tabFrontend(settings, local) {
  if (!tab?.url?.startsWith("http")) return null;
  const origin = new URL(tab.url).origin;
  const service = SERVICES.find((s) => instancesFor(s.id, settings, local).includes(origin));
  return service ? { service, origin } : null;
}

function tabOnOriginal() {
  if (!tab?.url?.startsWith("http")) return null;
  const { hostname } = new URL(tab.url);
  return SERVICES.find((s) => s.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) ?? null;
}

function renderTab(settings, local) {
  const section = document.getElementById("tab");
  const frontend = tabFrontend(settings, local);
  const original = tabOnOriginal();
  section.replaceChildren();
  if (frontend) {
    const target = originalUrl(frontend.service, tab.url);
    section.append(
      el("span", { textContent: `This tab is on ${host(frontend.origin)}` }),
      el("button", {
        className: "link",
        textContent: `Open on ${host(frontend.service.origin)}`,
        onclick: () => send({ type: "bypass", tabId: tab.id, url: target }).then(() => window.close()),
      }),
    );
  } else if (original && bypassed) {
    section.append(
      el("span", { textContent: "Redirects are paused in this tab" }),
      el("button", {
        className: "link",
        textContent: "Resume",
        onclick: () => send({ type: "resume", tabId: tab.id }).then(() => window.close()),
      }),
    );
  }
  section.hidden = section.childElementCount === 0;
}

function renderService(service, settings, local, active) {
  const config = settings[service.id];
  const instances = rankInstances(instancesFor(service.id, settings, local), local.health);
  const current = active[service.id];
  const isOpen = config.enabled && open.has(service.id);
  const status = current ? describe(local.health[current]) : null;

  const summary = !config.enabled
    ? el("div", { className: "current", textContent: "Off" })
    : current
      ? el(
          "div",
          { className: "current" },
          el("span", { className: `dot ${status.state}` }),
          `${host(current)}${config.choice === "auto" ? " · auto" : ""}`,
        )
      : el("div", { className: "current", textContent: "No working instance yet" });

  const head = el(
    "div",
    { className: "service-head" },
    el(
      "button",
      {
        className: "expand",
        disabled: !config.enabled,
        ariaExpanded: String(isOpen),
        onclick: () => {
          open.has(service.id) ? open.delete(service.id) : open.add(service.id);
          render();
        },
      },
      chevron(),
      el(
        "div",
        { className: "titles" },
        el("div", { className: "name" }, service.name, el("span", { className: "muted", textContent: ` → ${service.frontend}` })),
        summary,
      ),
    ),
    el(
      "label",
      { className: "switch", title: `Redirect ${service.name} to ${service.frontend}` },
      el("input", {
        type: "checkbox",
        checked: config.enabled,
        ariaLabel: `Redirect ${service.name} to ${service.frontend}`,
        onchange: (event) => {
          if (event.target.checked) open.add(service.id);
          updateSettings((s) => (s[service.id].enabled = event.target.checked));
        },
      }),
    ),
  );

  const article = el("article", { className: `service${isOpen ? " open" : ""}` }, head);
  if (!isOpen) return article;

  const best = rankInstances(instances, local.health).find((url) => local.health[url]?.state !== "down");
  const autoText = !best ? "none working" : `${local.health[best]?.state === "up" ? "fastest" : "best available"} · ${host(best)}`;
  const list = el("ul", { className: "instances", role: "radiogroup" });
  list.append(choiceRow(service, "auto", config.choice === "auto", "Auto", autoText, null));
  for (const url of instances) {
    const { state, text } = describe(local.health[url]);
    list.append(
      choiceRow(service, url, config.choice === url, host(url), text, state, config.custom.includes(url)),
    );
  }

  const input = el("input", { placeholder: `Add a ${service.frontend} instance URL`, spellcheck: false });
  const form = el(
    "form",
    {
      className: "add",
      onsubmit: (event) => {
        event.preventDefault();
        try {
          const url = normalizeInstance(input.value);
          errors.delete(service.id);
          updateSettings((s) => {
            s[service.id].custom = [...new Set([url, ...s[service.id].custom])];
            s[service.id].choice = url;
          });
        } catch {
          errors.set(service.id, "That doesn't look like a URL.");
          render();
        }
      },
    },
    input,
    el("button", { type: "submit", textContent: "Add" }),
  );
  article.append(list, form);
  if (errors.has(service.id)) article.append(el("div", { className: "error", textContent: errors.get(service.id) }));
  return article;
}

function choiceRow(service, value, selected, label, detail, state, removable = false) {
  const row = el(
    "li",
    { className: `choice${selected ? " selected" : ""}${state === "down" ? " is-down" : ""}` },
    el("input", {
      type: "radio",
      name: service.id,
      value,
      checked: selected,
      onchange: () => choose(service, value),
    }),
    state ? el("span", { className: `dot ${state}` }) : el("span", { className: "dot", style: "visibility:hidden" }),
    el("span", { className: "host", textContent: label }),
    el("span", { className: "detail", textContent: detail }),
    removable
      ? el("button", {
          className: "remove",
          title: "Remove",
          ariaLabel: `Remove ${label}`,
          textContent: "×",
          onclick: (event) => {
            event.stopPropagation();
            updateSettings((s) => {
              s[service.id].custom = s[service.id].custom.filter((u) => u !== value);
              if (s[service.id].choice === value) s[service.id].choice = "auto";
            });
          },
        })
      : null,
  );
  row.addEventListener("click", (event) => {
    if (event.target.closest(".remove") || event.target.tagName === "INPUT") return;
    row.querySelector("input").click();
  });
  return row;
}

/** Saves the pick, and moves the active tab over if it's on this service's old instance. */
async function choose(service, choice) {
  const before = await loadSettings();
  const local = await loadLocal();
  const frontend = tabFrontend(before, local);
  await updateSettings((s) => (s[service.id].choice = choice));
  if (frontend?.service.id !== service.id) return;
  const next = activeInstances(await loadSettings(), local)[service.id];
  if (next && next !== frontend.origin) {
    const url = new URL(tab.url);
    await chrome.tabs.update(tab.id, { url: next + url.pathname + url.search + url.hash });
    tab = { ...tab, url: next + url.pathname + url.search + url.hash };
  }
}

function chevron() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 10 10");
  svg.setAttribute("class", "chevron");
  svg.innerHTML = '<path d="M3.5 1.5 7 5l-3.5 3.5" />';
  return svg;
}

let pending = false;

async function render() {
  if (document.activeElement?.matches(".add input")) {
    pending = true;
    return;
  }
  const [settings, local] = await Promise.all([loadSettings(), loadLocal()]);
  const active = activeInstances(settings, local);
  const checking = local.checkingSince && Date.now() - local.checkingSince < 120_000;
  document.body.classList.toggle("checking", Boolean(checking));
  document.getElementById("checked").textContent = checking
    ? "Checking…"
    : local.checkedAt
      ? ago(local.checkedAt)
      : "Not checked yet";
  renderTab(settings, local);
  const scroll = new Map([...document.querySelectorAll(".instances")].map((l) => [l.closest("article").dataset.id, l.scrollTop]));
  document.getElementById("services").replaceChildren(
    ...SERVICES.map((s) => {
      const node = renderService(s, settings, local, active);
      node.dataset.id = s.id;
      return node;
    }),
  );
  for (const list of document.querySelectorAll(".instances")) list.scrollTop = scroll.get(list.closest("article").dataset.id) ?? 0;
}

document.addEventListener("focusout", () => {
  if (pending) {
    pending = false;
    setTimeout(render);
  }
});
document.getElementById("refresh").addEventListener("click", () => send({ type: "check" }));
chrome.storage.onChanged.addListener(() => render());

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.id != null) {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  bypassed = rules.some((r) => r.id === tab.id);
}
const tabService = tabFrontend(await loadSettings(), await loadLocal())?.service ?? tabOnOriginal();
if (tabService) open.add(tabService.id);
render();
