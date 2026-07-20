import { chromium } from 'playwright';
import fs from 'node:fs';

const DIR = '/private/tmp/claude-502/-Users-tarikmoody-Documents-Projects-badgerbrief/d5dae5ba-5c86-4c83-b602-ceab602e6dd6/scratchpad/video';
const SITE = 'https://badgerbrief.vercel.app';
const W = 1920, H = 1080;

async function seg(name, fn, opts = {}) {
  const ctx = await chromium.launchPersistentContext(`${DIR}/pub-profile`, {
    headless: true,
    viewport: { width: W, height: H },
    deviceScaleFactor: opts.dsf ?? 1,
    recordVideo: { dir: `${DIR}/seg36/${name}`, size: { width: W, height: H } },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await fn(page);
  await page.close();
  await ctx.close();
  console.log('done', name);
}

async function glide(p, y, ms = 1300) {
  await p.evaluate(([t, d]) => new Promise((r) => {
    const s = window.scrollY, dist = t - s, t0 = performance.now();
    const e = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    (function step(n) { const q = Math.min(1, (n - t0) / d); window.scrollTo(0, s + dist * e(q)); q < 1 ? requestAnimationFrame(step) : r(); })(performance.now());
  }), [y, ms]);
}

/** CSS zoom on a target element — a real "up close" push, not a post crop. */
async function pushIn(p, selector, scale = 1.9, ms = 2600) {
  await p.evaluate(([sel, sc, d]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const b = document.body;
    b.style.transition = `transform ${d}ms cubic-bezier(.4,0,.2,1)`;
    b.style.transformOrigin = `${cx + window.scrollX}px ${cy + window.scrollY}px`;
    b.style.transform = `scale(${sc})`;
  }, [selector, scale, ms]);
  await p.waitForTimeout(ms + 700);
}

// B1 — the ballot is crowded (race page)
await seg('b1-race', async (p) => {
  await p.goto(`${SITE}/races/wi-gov-2026`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await glide(p, 430, 1200);
  await p.waitForTimeout(900);
  await glide(p, 980, 2200);
  await p.waitForTimeout(1400);
});

// B2 — sourced: open a source fold, then push in on it
await seg('b2-source', async (p) => {
  await p.goto(`${SITE}/candidates/francesca-hong`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('positions')?.scrollIntoView());
  await p.waitForTimeout(900);
  const d = p.locator('#positions details summary').first();
  await d.click();
  await p.waitForTimeout(1500);
  await pushIn(p, '#positions details', 1.85, 2400);
});

// B4 — macro on a single position card (verbatim excerpt + link)
await seg('b4-macro', async (p) => {
  await p.goto(`${SITE}/candidates/mandela-barnes`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('positions')?.scrollIntoView());
  await p.waitForTimeout(800);
  await p.locator('#positions details summary').first().click();
  await p.waitForTimeout(1200);
  await pushIn(p, '#positions > div > div', 2.1, 2800);
});

// B6 — Voter Help (public view: the ask + the promise), then races grid
await seg('b6-close', async (p) => {
  await p.goto(`${SITE}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1300);
  await glide(p, 900, 1800);
  await p.waitForTimeout(1600);
});

// B3 / B5 — motion-graphic agent cards (animated HTML)
for (const [name, hash] of [['b3-agents', ''], ['b5-gate', '#gate']]) {
  await seg(name, async (p) => {
    await p.goto(`file://${DIR}/agents.html${hash}`, { waitUntil: 'load' });
    await p.waitForTimeout(6200);
  });
}

console.log('36s SEGMENTS COMPLETE');
