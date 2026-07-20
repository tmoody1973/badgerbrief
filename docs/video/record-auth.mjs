import { chromium } from 'playwright';
import fs from 'node:fs';

const DIR = '/private/tmp/claude-502/-Users-tarikmoody-Documents-Projects-badgerbrief/d5dae5ba-5c86-4c83-b602-ceab602e6dd6/scratchpad/video';
const SITE = 'https://badgerbrief.vercel.app';

/**
 * Attaches to Tarik's own Chrome over CDP (he is already signed in there).
 * Privacy contract: we open ONE new tab and only ever touch that tab. We never
 * enumerate, read, or screenshot his other tabs, and we close ours at the end.
 * Playwright's recordVideo is unavailable over connectOverCDP, so we use
 * Chrome's native Page.startScreencast and rebuild real-time pacing from the
 * frame timestamps.
 */
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage(); // our own tab — his stay untouched

const client = await ctx.newCDPSession(page);
await client.send('Emulation.setDeviceMetricsOverride', {
  width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false,
});

async function capture(name, drive, prepare) {
  const out = `${DIR}/frames/${name}`;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  if (prepare) await prepare(page); // page is settled + masked before we film
  const stamps = [];
  let i = 0;
  const onFrame = async ({ data, sessionId, metadata }) => {
    const n = String(i++).padStart(5, '0');
    fs.writeFileSync(`${out}/f${n}.jpg`, Buffer.from(data, 'base64'));
    stamps.push(metadata?.timestamp ?? 0);
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
  };
  client.on('Page.screencastFrame', onFrame);
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1,
  });
  await drive(page);
  await client.send('Page.stopScreencast');
  client.off('Page.screencastFrame', onFrame);

  // Real-time pacing: per-frame durations from CDP timestamps.
  const lines = [];
  for (let k = 0; k < stamps.length; k++) {
    const dur = k < stamps.length - 1 ? Math.min(2.5, Math.max(0.016, stamps[k + 1] - stamps[k])) : 3.2;
    lines.push(`file 'f${String(k).padStart(5, '0')}.jpg'`, `duration ${dur.toFixed(4)}`);
  }
  if (stamps.length) lines.push(`file 'f${String(stamps.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(`${out}/concat.txt`, lines.join('\n'));
  console.log(name, 'frames:', stamps.length);
}

async function glide(p, toY, ms = 1400) {
  await p.evaluate(([y, d]) => new Promise((res) => {
    const s = window.scrollY, dist = y - s, t0 = performance.now();
    const e = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    (function step(now) {
      const q = Math.min(1, (now - t0) / d);
      window.scrollTo(0, s + dist * e(q));
      q < 1 ? requestAnimationFrame(step) : res();
    })(performance.now());
  }), [toY, ms]);
}

// --- Segment 5: Voter Help chat (~14s) ---
await capture('05-chat', async (p) => {
  const box = p.locator('input[placeholder*="voting question"]').first();
  const settle = async () => {
    let prev = -1, stable = 0;
    for (let i = 0; i < 60; i++) {
      await p.waitForTimeout(700);
      const len = await p.evaluate(() => document.body.innerText.length);
      if (len === prev) { if (++stable >= 4) break; } else { stable = 0; prev = len; }
    }
  };
  // Two DIFFERENT questions: shows range, and scrolls earlier duplicate takes
  // (created by re-recording against a permanent thread) off screen.
  await box.click();
  await box.type("What's the deadline to register to vote in Wisconsin?", { delay: 40 });
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await settle();
  await p.waitForTimeout(1600);
  await box.click();
  await box.type('How do I vote absentee?', { delay: 40 });
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await settle();
  await p.waitForTimeout(2000);
}, async (p) => {
  await p.goto(`${SITE}/chat`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4500);
  await p.locator('input[placeholder*="voting question"]').first()
    .waitFor({ state: 'visible', timeout: 20000 });
});

/**
 * The brief renders the signed-in user's real home address. This is going on
 * YouTube, so swap it for a public landmark in the DOM only — his stored
 * preference is never touched, just the pixels we film.
 */
async function maskAddress(p) {
  await p.evaluate(() => {
    const FAKE = '200 E WELLS ST, MILWAUKEE, WI, 53202';
    // NOTE: no /g on the tester — a global regex makes .test() stateful via
    // lastIndex and it silently skips every other match. That bug is what let
    // a real home address through on the first take.
    const probe = /\d+\s+[A-Z0-9.\-']+\s+(ST|AVE|RD|BLVD|DR|LN|CT|PL|WAY)\b/i;
    const scrub = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (w.nextNode()) if (probe.test(w.currentNode.nodeValue || '')) hits.push(w.currentNode);
      hits.forEach((n) => {
        n.nodeValue = n.nodeValue.replace(
          /\d+\s+[A-Z0-9.\-']+\s+(ST|AVE|RD|BLVD|DR|LN|CT|PL|WAY)\b[^·|\n]*/gi,
          FAKE,
        );
      });
      document.querySelectorAll('input').forEach((i) => {
        if (probe.test(i.value || '')) i.value = FAKE;
      });
    };
    scrub();
    // React re-renders after hydration/query resolution would restore it.
    const mo = new MutationObserver(scrub);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__maskOn = true;
  });
}

/** Fail loudly rather than film someone's home address. */
async function assertMasked(p) {
  const leak = await p.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/\d+\s+[A-Z0-9.\-']+\s+(ST|AVE|RD|BLVD|DR|LN|CT|PL|WAY)\b[^·|\n]*/i);
    return m && !/200 E WELLS/i.test(m[0]) ? m[0] : null;
  });
  if (leak) throw new Error('ADDRESS LEAK STILL ON SCREEN: ' + leak);
}

// --- Segment 6: My Brief (~12s) ---
await capture('06-brief', async (p) => {
  await p.waitForTimeout(1600);
  await glide(p, 1500, 1800);
  await p.waitForTimeout(2400);
  await glide(p, 2400, 1800);
  await p.waitForTimeout(2400);
  await assertMasked(p);
}, async (p) => {
  await p.goto(`${SITE}/brief`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  await maskAddress(p);
  await p.waitForTimeout(800);
  await assertMasked(p);   // nothing is filmed until this passes
  // Belt and braces: the mask can lose a race with React re-render, so we also
  // park the viewport BELOW the preferences card where the address renders,
  // then assert nothing address-shaped is on screen before a frame is filmed.
  await p.evaluate(() => window.scrollTo(0, 760));
  await p.waitForTimeout(900);
  const onScreen = await p.evaluate(() => {
    const re = /\d+\s+[A-Z0-9.\-']+\s+(ST|AVE|RD|BLVD|DR|LN|CT|PL|WAY)\b/i;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll('p,span,div,li')) {
      if (el.children.length) continue;
      const t = el.textContent || '';
      if (!re.test(t) || /200 E WELLS/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) return t.trim().slice(0, 80);
    }
    return null;
  });
  if (onScreen) throw new Error('ADDRESS VISIBLE IN VIEWPORT: ' + onScreen);
});

await page.close();
await browser.close();
console.log('AUTH SEGMENTS COMPLETE');
