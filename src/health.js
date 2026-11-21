/**
 * Instance health. "challenge" means the instance answered with a bot check (Anubis, Cloudflare,
 * Gandalf, ...). A real browser usually passes those, so such instances still count as usable.
 *
 * @typedef {"up" | "challenge" | "down"} HealthState
 * @typedef {{ state: HealthState, ms: number | null, reason?: string, checkedAt: number }} Health
 */

const CHALLENGE =
  /just a moment|making sure you(?:&#39;|')re not a bot|checking you are not a bot|prove you(?:&#39;|')re human|verify you are human|gandalf|anubis|cf-chl|ddos-guard|challenge-platform/i;

/**
 * @param {number} status
 * @param {string} body
 * @returns {{ state: HealthState, reason?: string }}
 */
export function classify(status, body) {
  if (status === 429) return { state: "down", reason: "rate limited" };
  if (status === 451) return { state: "down", reason: "suspended" };
  if (CHALLENGE.test(body)) return { state: "challenge", reason: "bot check" };
  if (status >= 200 && status < 300) return { state: "up" };
  return { state: "down", reason: `HTTP ${status}` };
}

/**
 * @param {string} instance origin, e.g. "https://nitter.example"
 * @param {string} path the content page to load, e.g. "/jack"
 * @param {number} timeoutMs
 * @returns {Promise<Health>}
 */
export async function probe(instance, path, timeoutMs = 8000) {
  const started = performance.now();
  try {
    const res = await fetch(instance + path, {
      signal: AbortSignal.timeout(timeoutMs),
      credentials: "include",
      cache: "no-store",
    });
    const body = (await res.text()).slice(0, 50_000);
    return { ...classify(res.status, body), ms: Math.round(performance.now() - started), checkedAt: Date.now() };
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "timeout" : "unreachable";
    return { state: "down", reason, ms: null, checkedAt: Date.now() };
  }
}

const RANK = { up: 0, challenge: 1, unknown: 2, down: 3 };

/**
 * Working instances first, fastest first; unchecked after; down last.
 * @param {string[]} instances
 * @param {Record<string, Health>} health
 */
export function rankInstances(instances, health) {
  return [...instances].sort((a, b) => {
    const ha = health[a];
    const hb = health[b];
    const byState = RANK[ha?.state ?? "unknown"] - RANK[hb?.state ?? "unknown"];
    if (byState !== 0) return byState;
    return (ha?.ms ?? Infinity) - (hb?.ms ?? Infinity);
  });
}

/**
 * The instance to redirect to. A manual pick is always honored; "auto" takes the best ranked
 * instance that isn't known to be down.
 * @param {string[]} instances
 * @param {Record<string, Health>} health
 * @param {"auto" | string} choice
 * @returns {string | null}
 */
export function pickInstance(instances, health, choice) {
  if (choice !== "auto") return choice;
  return rankInstances(instances, health).find((url) => health[url]?.state !== "down") ?? null;
}

/**
 * Run `task` over `items` with at most `limit` in flight.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} task
 */
export async function forEachLimited(items, limit, task) {
  const queue = [...items];
  const worker = async () => {
    while (queue.length > 0) await task(/** @type {T} */ (queue.shift()));
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
