import { chromium } from 'playwright';

const DIR = '/private/tmp/claude-502/-Users-tarikmoody-Documents-Projects-badgerbrief/d5dae5ba-5c86-4c83-b602-ceab602e6dd6/scratchpad/video';
const SITE = 'https://badgerbrief.vercel.app';
const W = 1920, H = 1080;

async function seg(name, fn) {
  const ctx = await chromium.launchPersistentContext(`${DIR}/pub-profile`, {
    headless: true, viewport: { width: W, height: H },
    recordVideo: { dir: `${DIR}/seg90/${name}`, size: { width: W, height: H } },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await fn(page);
  await page.close(); await ctx.close();
  console.log('done', name);
}
async function glide(p, y, ms = 1300) {
  await p.evaluate(([t, d]) => new Promise((r) => {
    const s = window.scrollY, dist = t - s, t0 = performance.now();
    const e = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    (function st(n){const q=Math.min(1,(n-t0)/d);window.scrollTo(0,s+dist*e(q));q<1?requestAnimationFrame(st):r();})(performance.now());
  }), [y, ms]);
}
async function pushIn(p, sel, sc = 1.8, ms = 2400) {
  await p.evaluate(([s, k, d]) => {
    const el = document.querySelector(s); if (!el) return;
    const r = el.getBoundingClientRect();
    document.body.style.transition = `transform ${d}ms cubic-bezier(.4,0,.2,1)`;
    document.body.style.transformOrigin = `${r.left + r.width/2 + scrollX}px ${r.top + r.height/2 + scrollY}px`;
    document.body.style.transform = `scale(${k})`;
  }, [sel, sc, ms]);
  await p.waitForTimeout(ms + 600);
}

// --- Campaign finance: totals, then top donors, then the funding trace ---
await seg('f1-totals', async (p) => {
  await p.goto(`${SITE}/candidates/tom-tiffany`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  await p.evaluate(() => document.getElementById('money')?.scrollIntoView());
  await p.waitForTimeout(1200);
  await pushIn(p, '#money .grid', 1.7, 2400);
});

await seg('f2-donors', async (p) => {
  await p.goto(`${SITE}/candidates/mandela-barnes`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  await p.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((x) => /top reported contributors/i.test(x.textContent));
    h?.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(1600);
  await glide(p, (await p.evaluate(() => scrollY)) + 420, 1800);
  await p.waitForTimeout(1800);
});

// The funding trace — "where this money comes from" — is the strongest
// finance beat: it opens a committee's own top sources.
await seg('f3-trace', async (p) => {
  await p.goto(`${SITE}/candidates/kelda-roys`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  const t = p.locator('details summary', { hasText: 'Where this money comes from' }).first();
  if (await t.count()) {
    await t.scrollIntoViewIfNeeded();
    await p.waitForTimeout(900);
    await t.click();
    await p.waitForTimeout(2000);
    await pushIn(p, 'details[open] div', 1.55, 2200);
  } else {
    await p.evaluate(() => document.getElementById('money')?.scrollIntoView());
    await p.waitForTimeout(3200);
  }
});

// --- Ads: explicitly labelled as not shipped ---
await seg('f4-upcoming', async (p) => {
  await p.goto(`file://${DIR}/upcoming.html`, { waitUntil: 'load' });
  await p.waitForTimeout(6400);
});

console.log('90s EXTRA SEGMENTS COMPLETE');
