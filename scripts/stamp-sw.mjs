// Stamps public/sw.js with a fresh build id before every `next build`, so
// the service worker's cache name changes on every deploy. That's what
// actually triggers the browser's native "new SW installed, purge old
// caches" flow (see activate handler in sw.js) — without a changing cache
// name, a returning user would keep being served last deploy's cached
// pages/JS forever, since /_next/static/* filenames are content-hashed but
// the cache *name* itself never changed to signal "this is stale."
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = join(__dirname, "..", "public", "sw.js");

function getBuildId() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return String(Date.now());
  }
}

const buildId = getBuildId();
const source = readFileSync(swPath, "utf8");
const stamped = source.replace(
  /const CACHE_NAME = ".*?";/,
  `const CACHE_NAME = "jsms-pwa-${buildId}";`
);

writeFileSync(swPath, stamped);
console.log(`Stamped public/sw.js with build id ${buildId}`);
