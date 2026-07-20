import { chromium } from 'playwright';
import fs from 'node:fs';

const DIR = '/private/tmp/claude-502/-Users-tarikmoody-Documents-Projects-badgerbrief/d5dae5ba-5c86-4c83-b602-ceab602e6dd6/scratchpad/video';
const SITE = 'https://badgerbrief.vercel.app';
const W = 1920, H = 1080;

/** Smooth, human-paced scroll — a jump cut reads as a glitch on video. */
async function glide(page, toY, ms = 1400) {
  await page.evaluate(
    ([y, d]) =>
      new Promise((res) => {
        const start = window.scrollY;
        const dist = y - start;
        const t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        function step(now) {
          const p = Math.min(1, (now - t0) / d);
          window.scrollTo(0, start + dist * ease(p));
          p < 1 ? requestAnimationFrame(step) : res();
        }
        requestAnimationFrame(step);
      }),
    [toY, ms],
  );
}

async function segment(name, fn) {
  const out = `${DIR}/seg`;
  fs.mkdirSync(out, { recursive: true });
  const ctx = await chromium.launchPersistentContext(`${DIR}/pub-profile`, {
    headless: true,
    viewport: { width: W, height: H },
    recordVideo: { dir: `${out}/${name}`, size: { width: W, height: H } },
    deviceScaleFactor: 1,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await fn(page);
  await page.close();
  await ctx.close();
  console.log('done', name);
}

// 2 — Home (10s)
await segment('02-home', async (p) => {
  await p.goto(SITE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  await glide(p, 700, 1800);
  await p.waitForTimeout(1500);
  await glide(p, 1500, 1800);
  await p.waitForTimeout(2000);
});

// 3 — Race page: jump nav + not-on-ballot fold (16s)
await segment('03-race', async (p) => {
  await p.goto(`${SITE}/races/wi-gov-2026`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  await glide(p, 420, 1200);
  await p.waitForTimeout(1200);
  // click a jump chip so the sticky nav visibly works
  const chip = p.locator("nav[aria-label='Sections on this page'] a", { hasText: 'Democrats' });
  if (await chip.count()) { await chip.first().click(); await p.waitForTimeout(1800); }
  await glide(p, 1250, 1400);
  await p.waitForTimeout(1000);
  // open the not-on-ballot fold — the honesty feature
  const fold = p.locator('details summary', { hasText: 'Not on the Aug 11 ballot' });
  if (await fold.count()) { await fold.first().click(); await p.waitForTimeout(2200); }
  const money = p.locator("nav[aria-label='Sections on this page'] a", { hasText: 'The money' });
  if (await money.count()) { await money.first().click(); await p.waitForTimeout(2600); }
});

// 4 — Candidate: sourced positions + finance rail (18s)
await segment('04-candidate', async (p) => {
  await p.goto(`${SITE}/candidates/francesca-hong`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2400);
  const issues = p.locator("nav[aria-label='Sections on this page'] a", { hasText: 'Issues' });
  if (await issues.count()) { await issues.first().click(); await p.waitForTimeout(1800); }
  // open a source fold — the whole product claim is "sourced"
  const src = p.locator('#positions details summary').first();
  if (await src.count()) { await src.click(); await p.waitForTimeout(2600); }
  await glide(p, (await p.evaluate(() => document.getElementById('quotes')?.offsetTop ?? 1800)) - 120, 1600);
  await p.waitForTimeout(2200);
  await glide(p, 400, 1400);
  await p.waitForTimeout(2200);
});

// 7 — Methodology (8s)
await segment('07-methodology', async (p) => {
  await p.goto(`${SITE}/methodology`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await glide(p, 600, 1600);
  await p.waitForTimeout(2400);
});

console.log('PUBLIC SEGMENTS COMPLETE');
