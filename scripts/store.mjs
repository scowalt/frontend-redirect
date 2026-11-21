// Renders the Chrome Web Store images into store/: 1280x800 screenshots of the real popup
// (after a live instance check) and the 440x280 promo tile.
// Run: npm run store
import { mkdir, readFile } from "node:fs/promises";
import { launchExtension } from "../test/browser.mjs";

const out = new URL("../store/", import.meta.url);
await mkdir(out, { recursive: true });
const icon = `data:image/png;base64,${(await readFile(new URL("../icons/128.png", import.meta.url))).toString("base64")}`;

const { context, worker, id } = await launchExtension({ deviceScaleFactor: 2 });
const popupUrl = `chrome-extension://${id}/popup/popup.html`;
const shots = [];

try {
  const started = Date.now();
  while (!(await worker.evaluate(() => chrome.storage.local.get("checkedAt"))).checkedAt) {
    if (Date.now() - started > 120_000) throw new Error("instance check did not finish in 2 min");
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Crop to the popup's content, as Chrome sizes the real popup to fit it.
  const capture = async (page) => {
    const height = await page.evaluate(() => Math.ceil(document.querySelector("main").getBoundingClientRect().bottom));
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 360, height }, fullPage: true });
    return `data:image/png;base64,${png.toString("base64")}`;
  };

  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.locator(".service").first().waitFor();
  shots.push({
    title: "X, Reddit and Instagram open in Nitter, Redlib and Kittygram",
    body: "Links redirect before the original site loads. YouTube → Invidious and Imgur → Rimgo are one switch away.",
    image: await capture(popup),
  });

  await popup.getByRole("button", { name: /^X/ }).click();
  shots.push({
    title: "Always lands on an instance that's up",
    body: "Sidedoor checks every public instance every few hours and picks the best one. Pick your own or add a private instance any time.",
    image: await capture(popup),
  });

  // The popup reads the active tab, so open it in a background tab while the Nitter tab is active.
  const tab = await context.newPage();
  const onTab = await context.newPage();
  await tab.goto("https://x.com/jack", { waitUntil: "commit", timeout: 20_000 }).catch(() => {});
  await tab.bringToFront();
  await onTab.emulateMedia({ colorScheme: "dark" });
  await onTab.goto(popupUrl);
  await onTab.locator("#tab:not([hidden])").waitFor({ timeout: 10_000 });
  shots.push({
    title: "Switch instance, or open the original",
    body: "From any frontend tab, move to another instance or open the page on the original site for that tab only.",
    image: await capture(onTab),
  });
} finally {
  await context.close();
}

const { chromium } = await import("playwright");
const { chromePath } = await import("./chrome.mjs");
const browser = await chromium.launch({ executablePath: chromePath() });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const font = `Futura, "Century Gothic", "Trebuchet MS", system-ui, sans-serif`;

for (const [i, shot] of shots.entries()) {
  await page.setContent(`<!doctype html><style>
    body { margin: 0; width: 1280px; height: 800px; display: flex; align-items: center; gap: 72px;
      padding: 0 96px; box-sizing: border-box; overflow: hidden;
      background: radial-gradient(circle at 85% 20%, #6a52e8, #4b33c9 60%); color: #f3f0ff; font-family: system-ui, sans-serif; }
    .text { flex: 1; }
    .brand { display: flex; align-items: center; gap: 14px; font: 600 26px/1 ${font}; margin-bottom: 40px; }
    .brand img { width: 48px; height: 48px; }
    h1 { font: 700 46px/1.15 ${font}; margin: 0 0 24px; letter-spacing: -0.01em; }
    h1::after { content: ""; display: block; width: 72px; height: 6px; border-radius: 3px; background: #ffd84d; margin-top: 24px; }
    p { font-size: 22px; line-height: 1.5; opacity: 0.88; margin: 0; }
    .shot { width: 400px; border-radius: 16px; box-shadow: 0 30px 80px rgba(20, 8, 70, 0.55); max-height: 700px;
      object-fit: cover; object-position: top; }
  </style><div class="text"><div class="brand"><img src="${icon}">Sidedoor</div>
  <h1>${shot.title}</h1><p>${shot.body}</p></div><img class="shot" src="${shot.image}">`);
  await page.screenshot({ path: new URL(`screenshot-${i + 1}.png`, out).pathname });
}

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<!doctype html><style>
  body { margin: 0; width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 14px; padding: 0 24px; box-sizing: border-box; text-align: center; background: radial-gradient(circle at 80% 15%, #6a52e8, #4b33c9 65%); color: #f3f0ff; }
  img { width: 104px; height: 104px; filter: drop-shadow(0 10px 24px rgba(20, 8, 70, 0.5)); }
  b { font: 700 38px/1 ${font}; }
  span { font: 15px/1.3 system-ui, sans-serif; opacity: 0.9; text-wrap: balance; max-width: 300px; }
</style><img src="${icon}"><b>Sidedoor</b><span>Read X, Reddit and Instagram without the front door</span>`);
await page.screenshot({ path: new URL("promo-small.png", out).pathname });
await browser.close();
console.log(`Wrote ${shots.length} screenshots and the promo tile to store/`);
