// Renders icons/*.png from the SVG below. Run: npm run icons
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { chromePath } from "./chrome.mjs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="28" fill="#2f6fed"/>
  <path d="M30 84c0-26 18-42 46-42h10" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/>
  <path d="M76 24l22 18-22 18" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="34" cy="98" r="9" fill="#fff"/>
</svg>`;

const browser = await chromium.launch({ executablePath: chromePath() });
const page = await browser.newPage();
await mkdir(new URL("../icons/", import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  const png = await page.locator("svg").screenshot({ omitBackground: true });
  await writeFile(new URL(`../icons/${size}.png`, import.meta.url), png);
}
await browser.close();
