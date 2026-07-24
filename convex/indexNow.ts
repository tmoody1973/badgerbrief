"use node";
/**
 * IndexNow — tell Bing (and everything on the IndexNow network, which includes
 * the index ChatGPT search reads) the moment content changes, instead of
 * waiting for a crawl.
 *
 * Why this lives in Convex: content changes HERE — the scout adds news, the
 * date verifier confirms it, roll calls and polls land. A ping fired from the
 * same cron that changes the data is the natural "notify" event, and it needs
 * no separate scheduler.
 *
 * The key file (`https://badgerbrief.org/{key}.txt`, served by Next from
 * `public/`) proves we own the host. The key value lives in one place —
 * `INDEXNOW_KEY` — and is used both to name that file and in the POST below;
 * they must match or IndexNow silently rejects every submission.
 *
 * Fails SOFT: a voter guide's job does not depend on Bing being notified
 * promptly, so a failed ping logs and returns rather than throwing and aborting
 * whatever cron called it.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const HOST = "badgerbrief.org";
const ENDPOINT = "https://api.indexnow.org/IndexNow";
// The network caps a single submission at 10,000 URLs.
const MAX_URLS = 10_000;

export const submit = internalAction({
  args: { urls: v.array(v.string()) },
  handler: async (_ctx, { urls }): Promise<{ submitted: number; status: number | null }> => {
    const key = process.env.INDEXNOW_KEY;
    if (!key) {
      console.warn("INDEXNOW_KEY not set — skipping IndexNow submission");
      return { submitted: 0, status: null };
    }

    // Only our own canonical URLs. Submitting a host you don't own gets the key
    // penalised, so anything not on badgerbrief.org is dropped rather than sent.
    const clean = [...new Set(urls)]
      .filter((u) => {
        try {
          return new URL(u).hostname === HOST;
        } catch {
          return false;
        }
      })
      .slice(0, MAX_URLS);

    if (clean.length === 0) return { submitted: 0, status: null };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key,
          keyLocation: `https://${HOST}/${key}.txt`,
          urlList: clean,
        }),
      });
      // 200 = accepted, 202 = accepted pending key validation. Both are success;
      // 403 means the key file isn't reachable, 422 a URL/key mismatch — worth
      // seeing in logs rather than swallowing.
      if (res.status >= 400) {
        console.error(`IndexNow rejected ${clean.length} urls: HTTP ${res.status}`);
      } else {
        console.log(`IndexNow: submitted ${clean.length} urls (HTTP ${res.status})`);
      }
      return { submitted: clean.length, status: res.status };
    } catch (err) {
      console.error(`IndexNow submission failed: ${err instanceof Error ? err.message : err}`);
      return { submitted: 0, status: null };
    }
  },
});

/**
 * Ping the pages that change most: the news hub and its home. The scout adds
 * articles daily, and /news is the page whose freshness a reader most notices,
 * so telling Bing right after the daily sweep keeps it current without crawling
 * the whole site. Individual race/candidate pages change rarely and ride the
 * sitemap's normal crawl.
 */
export const pingDaily = internalAction({
  args: {},
  handler: async (ctx): Promise<{ submitted: number; status: number | null }> => {
    const { internal } = await import("./_generated/api");
    return await ctx.runAction(internal.indexNow.submit, {
      urls: [`https://${HOST}/`, `https://${HOST}/news`],
    });
  },
});

/**
 * One-shot: submit the whole site once, right after the key is first set up, so
 * IndexNow learns about all 589 pages immediately instead of only on their next
 * change. Reads the public race and candidate slugs (no auth) and builds the
 * same URL set the sitemap advertises. Run manually; the daily ping handles
 * steady state.
 */
export const submitAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ submitted: number; status: number | null }> => {
    const { api, internal } = await import("./_generated/api");
    const [races, candidateSlugs] = await Promise.all([
      ctx.runQuery(api.public.listRaces, {}),
      ctx.runQuery(api.public.listCandidateSlugs, {}),
    ]);
    // Superseded chamber-wide races 301 elsewhere; keep them out of IndexNow too.
    const superseded = new Set(["WI-STATE-SENATE-2026", "WI-STATE-ASSEMBLY-2026"]);
    const slugFor = (raceId: string) => raceId.toLowerCase();
    const urls = [
      `https://${HOST}/`,
      `https://${HOST}/vote`,
      `https://${HOST}/news`,
      `https://${HOST}/about`,
      `https://${HOST}/methodology`,
      ...races
        .filter((r: { raceId: string }) => !superseded.has(r.raceId))
        .map((r: { raceId: string }) => `https://${HOST}/races/${slugFor(r.raceId)}`),
      ...candidateSlugs.map((s: string) => `https://${HOST}/candidates/${s}`),
    ];
    return await ctx.runAction(internal.indexNow.submit, { urls });
  },
});
