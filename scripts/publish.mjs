// Uploads a zip to the Chrome Web Store and submits it for review.
// Usage: node scripts/publish.mjs sidedoor.zip
// Env: CWS_TOKEN (OAuth access token), CWS_PUBLISHER_ID, CWS_EXTENSION_ID
import { readFile } from "node:fs/promises";

const { CWS_TOKEN, CWS_PUBLISHER_ID, CWS_EXTENSION_ID } = process.env;
const file = process.argv[2];
if (!CWS_TOKEN || !CWS_PUBLISHER_ID || !CWS_EXTENSION_ID || !file) {
  console.error("Need CWS_TOKEN, CWS_PUBLISHER_ID, CWS_EXTENSION_ID and a zip path.");
  process.exit(2);
}

const item = `publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}`;
const api = "https://chromewebstore.googleapis.com";
const { version } = JSON.parse(await readFile("manifest.json", "utf8"));

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${CWS_TOKEN}`,
      ...(typeof body === "string" && { "Content-Type": "application/json" }),
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

const status = () => call("GET", `${api}/v2/${item}:fetchStatus`);
const versions = (revision) => (revision?.distributionChannels ?? []).map((c) => c.crxVersion);

const before = await status();
if (before.takenDown) throw new Error("The item is taken down. Check the Developer Dashboard.");
for (const [label, revision] of [
  ["published", before.publishedItemRevisionStatus],
  ["submitted", before.submittedItemRevisionStatus],
]) {
  if (versions(revision).includes(version)) {
    console.log(`${version} is already ${label} (${revision.state}). Nothing to do.`);
    process.exit(0);
  }
}

console.log(`Uploading ${file} (${version})…`);
// While a version is in review, fetchStatus reports no revisions, and the store refuses uploads.
let upload;
try {
  upload = await call("POST", `${api}/upload/v2/${item}:upload`, await readFile(file));
} catch (e) {
  if (!e.message.includes("in review")) throw e;
  console.log(`::warning::The store is still reviewing a submission, so ${version} wasn't uploaded. ` +
    "It goes up on the next push to main after the review, or when you rerun this job.");
  process.exit(0);
}
let state = upload.uploadState;
for (let i = 0; state?.includes("IN_PROGRESS") && i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  state = (await status()).lastAsyncUploadState;
}
if (state !== "SUCCEEDED") throw new Error(`Upload ended in state ${state}: ${JSON.stringify(upload)}`);

const published = await call("POST", `${api}/v2/${item}:publish`, "{}");
console.log(`Submitted ${version} for review: ${published.state}`);
for (const w of published.warningInfo?.warnings ?? []) console.warn("warning:", JSON.stringify(w));
