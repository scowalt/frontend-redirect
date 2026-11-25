// Renders icons/*.png and the iOS app icon from the SVG below. Run: npm run icons
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { chromePath } from "./chrome.mjs";

const svg = (tile) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  ${tile}
  <path d="M38 108V24h52v84" fill="none" stroke="#F3F0FF" stroke-width="9" stroke-linejoin="round"/>
  <path d="M48 108V34h32v74z" fill="#FFD84D"/>
  <path d="M48 34l-22 8v74l22-8z" fill="#F3F0FF"/>
  <circle cx="34" cy="76" r="4.5" fill="#4B33C9"/>
</svg>`;
const roundedTile = `<rect x="4" y="4" width="120" height="120" rx="30" fill="#4B33C9"/>`;
// iOS masks app icons itself and rejects transparency, so this tile fills the square.
const squareTile = `<rect width="128" height="128" fill="#4B33C9"/>`;

const renders = [
  ...[16, 32, 48, 128].map((size) => ({ size, tile: roundedTile, path: `../icons/${size}.png` })),
  { size: 1024, tile: squareTile, path: "../safari/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png" },
];

const browser = await chromium.launch({ executablePath: chromePath() });
const page = await browser.newPage();
await mkdir(new URL("../icons/", import.meta.url), { recursive: true });
for (const { size, tile, path } of renders) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg(tile)}`);
  const png = await page.locator("svg").screenshot({ omitBackground: true });
  await writeFile(new URL(path, import.meta.url), png);
}
await browser.close();
