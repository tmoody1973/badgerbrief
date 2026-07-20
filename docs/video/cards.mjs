import { chromium } from 'playwright';

const DIR = '/private/tmp/claude-502/-Users-tarikmoody-Documents-Projects-badgerbrief/d5dae5ba-5c86-4c83-b602-ceab602e6dd6/scratchpad/video';

// Brand tokens lifted from src/app/globals.css so cards match the product.
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Public+Sans:wght@400;700&family=Geist+Mono:wght@700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1920px;height:1080px;background:#fff7ed;color:#1c1b1a;
       font-family:'Public Sans',sans-serif;display:flex;align-items:center;
       justify-content:center;overflow:hidden}
  .wrap{padding:0 140px;max-width:1500px}
  .kicker{font-family:'Geist Mono',monospace;font-size:26px;font-weight:700;
          text-transform:uppercase;letter-spacing:.22em;color:#4a4742;margin-bottom:28px}
  h1{font-family:'Archivo Black',sans-serif;font-size:112px;line-height:1.02;letter-spacing:-.02em}
  h1 .red{color:#c5050c}
  p.sub{font-size:40px;margin-top:34px;max-width:1100px;line-height:1.35}
  .url{display:inline-block;margin-top:44px;border:5px solid #1c1b1a;background:#c5050c;
       color:#fff;padding:20px 34px;font-family:'Geist Mono',monospace;font-size:36px;
       font-weight:700;box-shadow:12px 12px 0 #1c1b1a}
  .lower{position:absolute;left:110px;bottom:110px;border:5px solid #1c1b1a;background:#f6e7b2;
         padding:24px 36px;box-shadow:12px 12px 0 #1c1b1a;font-size:44px;font-weight:700;
         max-width:1300px}
`;

const cards = {
  '01-open': `<div class="wrap"><div class="kicker">Wisconsin · Partisan Primary</div>
    <h1>August 11.<br/>Do you know<br/>your <span class="red">ballot</span>?</h1></div>`,
  '08-end': `<div class="wrap" style="text-align:center">
    <h1>Badger<span class="red">Brief</span></h1>
    <p class="sub" style="margin-left:auto;margin-right:auto">Non-partisan. Source-linked. No endorsements.</p>
    <div class="url">badgerbrief.vercel.app</div></div>`,
};

// Lower-third overlays burned as separate PNGs with alpha, for ffmpeg overlay.
const lowers = {
  'l-home': 'Every race. Every candidate. Every claim sourced.',
  'l-race': 'Jump straight to what matters — and see who’s actually on the ballot',
  'l-cand': 'Where they stand, with the receipts',
  'l-meth': 'We link every claim. We never endorse.',
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });

for (const [name, html] of Object.entries(cards)) {
  await page.setContent(`<style>${CSS}</style><body>${html}</body>`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/cards/${name}.png` });
}
for (const [name, text] of Object.entries(lowers)) {
  await page.setContent(
    `<style>${CSS} body{background:transparent}</style><body><div class="lower">${text}</div></body>`,
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/cards/${name}.png`, omitBackground: true });
}
await b.close();
console.log('cards rendered');
