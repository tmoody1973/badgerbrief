#!/usr/bin/env node
/**
 * Proof for decision 018: on My Ballot, a voter's districts and county never
 * leave the browser.
 *
 *   node scripts/privacy-capture.mjs https://badgerbrief.org
 *
 * Opens a ballot by shared link in the Chrome installed on this machine,
 * uses the page the way a voter would, and records every request to every
 * server: its address, body and headers. Exits 1 if any request carries a
 * district number or the county, or asks for one of the voter's own contests
 * before the voter chose to open it.
 *
 * Run it against a production build. A development server does not pre-load
 * links, which is one of the ways districts could leak.
 *
 * The address lookup is not exercised: that would send a real address to the
 * federal service. Its handling is covered by src/app/api/geocode/route.test.ts.
 */
import { chromium, devices } from "playwright-core";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/privacy-capture.mjs <base address, e.g. https://badgerbrief.org>");
  process.exit(2);
}

// Districts no other page on the site refers to by accident: U.S. House 7,
// State Senate 31, Assembly 93, St. Croix County.
const LINK = "#cd=7&sd=31&ad=93&co=st-croix";
const TELLS = [
  { name: "the county", pattern: /st[-. %20]*croix/i },
  { name: "a district number beside its name", pattern: /\b(?:cd|sd|ad|congressional|senate|assembly|district)["'=:\s]{1,4}(?:7|31|93)\b/i },
  { name: "the link's own text", pattern: /cd=7|sd=31|ad=93/ },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext(devices["iPhone 13"]);
await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = await context.newPage();

const requests = [];
page.on("request", (request) => {
  const url = request.url();
  let text = `${url}\n${request.postData() ?? ""}\n${JSON.stringify(request.headers())}`;
  try {
    text += `\n${decodeURIComponent(url)}\n${decodeURIComponent(request.postData() ?? "")}`;
  } catch {
    // not URL-encoded; the raw text above is still checked
  }
  requests.push({ url, host: new URL(url).hostname, path: new URL(url).pathname, text, step });
});

let step = "arriving by a shared link";
const failures = [];
const ready = (mode) => page.waitForFunction((m) => document.querySelector("[data-ballot-ready]")?.getAttribute("data-ballot-ready") === m, mode, { timeout: 30000 });

try {
  await page.goto(`${base}/ballot${LINK}`, { waitUntil: "networkidle", timeout: 60000 });
  await ready("link");
  await page.waitForTimeout(2500);

  // The voter's own contests: nothing may ask the server for these unprompted.
  const ownContests = await page.evaluate(() =>
    [...document.querySelectorAll("#decisions a[href^='/'], #one-name a[href^='/'], #contests a[href^='/']")]
      .map((a) => new URL(a.href).pathname)
      .filter((path) => /-d\d+-2026$/.test(path) || path.startsWith("/candidates/")),
  );
  if (ownContests.length === 0) failures.push("the page showed no contests to protect; the capture proved nothing");

  step = "scrolling the whole ballot into view";
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2000);

  step = "switching to ballot order and back";
  await page.click('button:has-text("Show in ballot order")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Show decisions first")');
  await page.waitForTimeout(800);

  step = "jumping to the questions";
  await page.click('nav[aria-label="Sections on this page"] a[href="#questions"]');
  await page.waitForTimeout(800);

  step = "copying the share link";
  await page.click('button:has-text("Copy link")');
  await page.waitForTimeout(1200);

  step = "choosing districts by hand";
  await page.click('button:has-text("Pick your districts by hand instead")');
  const picks = page.locator("fieldset select");
  await picks.nth(0).selectOption("7");
  await picks.nth(1).selectOption("31");
  await picks.nth(2).selectOption("93");
  await picks.nth(3).selectOption("st-croix");
  await page.click('button:has-text("Show this ballot")');
  await ready("device");
  await page.waitForTimeout(2000);

  step = "coming back later, districts remembered on the device";
  await page.goto(`${base}/ballot`, { waitUntil: "networkidle", timeout: 60000 });
  await ready("device");
  await page.waitForTimeout(2500);

  const unprompted = new Set(ownContests);
  for (const request of requests) {
    for (const tell of TELLS) {
      if (tell.pattern.test(request.text)) {
        const at = request.text.search(tell.pattern);
        failures.push(`${request.host} was sent ${tell.name} while ${request.step}: …${request.text.slice(Math.max(0, at - 50), at + 50).replace(/\s+/g, " ")}…`);
      }
    }
    if (unprompted.has(request.path)) failures.push(`${request.host} was asked for ${request.path} while ${request.step}, before the voter opened it`);
  }

  step = "opening a contest on purpose";
  const before = requests.length;
  await page.click("#decisions article a:has-text('Open this contest')");
  await page.waitForLoadState("networkidle").catch(() => {});
  const analytics = requests.filter((r) => /google-analytics\.com|analytics\.google\.com/.test(r.host));

  const hosts = [...new Set(requests.map((r) => r.host))].filter(Boolean).sort();
  console.log(`requests recorded: ${before} before the voter opened a contest, ${requests.length} in all, to ${hosts.length} servers`);
  console.log(`servers: ${hosts.join(", ")}`);
  console.log(`requests to Google Analytics: ${analytics.length}${analytics.length === 0 ? "  (analytics is off here, so this run says nothing about it)" : ""}`);
  console.log(`the voter's own contest and candidate pages watched: ${unprompted.size}`);
} catch (error) {
  failures.push(`the capture could not finish (${step}): ${String(error).split("\n")[0]}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} problem(s)`);
  for (const failure of [...new Set(failures)].slice(0, 20)) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("\nPASS: no request carried a district, the county, or asked for the voter's contests unprompted");
