"use node";
/**
 * MOO-318 Task 5: Broadcast-TV ad sync. For each curated Wisconsin station,
 * drive a Browserbase browser to enumerate its FCC 2026 political-file folders
 * (the API is Akamai-blocked to plain requests — verified 2026-07-21), download
 * the in-scope order PDFs, extract each with Sonnet (Task 4), and land them as
 * human-reviewed `ads` rows (platform:"tv"). Idempotent by fileManagerId.
 *
 * Trust posture (inviolable): TV name matches cap below the public threshold, so
 * nothing auto-attributes — every ingested order routes to a review task (with a
 * candidate suggestion when a surname matched) for human approval.
 *
 * All Browserbase/playwright imports are dynamic (inside handlers): a top-level
 * import trips Convex's push-time analyze on playwright's browser registry.
 * playwright-core is externalized via convex.json (node.externalPackages).
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  scoreAdMatch,
  PUBLIC_MATCH_THRESHOLD,
  normalizeText,
  type NormalizedAd,
} from "./lib/adsMatch";
import { toAdWrite, type TvAdExtraction } from "./lib/tvExtract";

const YEAR = 2026;
const FCC_BASE = "https://publicfiles.fcc.gov";
const DOWNLOAD_HOST = "https://files.fcc.gov/download";

/** Curated ad-relevant full-power stations (CSV `ad_relevant=yes`, 3 DMAs).
 * PBS/religious/Ion/shopping omitted — their political folders are empty. */
type Station = { callSign: string; dma: string; network: string };
const TV_STATIONS: Station[] = [
  // Milwaukee DMA
  { callSign: "WTMJ-TV", dma: "Milwaukee", network: "NBC" },
  { callSign: "WITI", dma: "Milwaukee", network: "Fox" },
  { callSign: "WISN-TV", dma: "Milwaukee", network: "ABC" },
  { callSign: "WDJT-TV", dma: "Milwaukee", network: "CBS" },
  { callSign: "WVTV", dma: "Milwaukee", network: "CW" },
  { callSign: "WMLW-TV", dma: "Milwaukee", network: "Independent" },
  // Madison DMA
  { callSign: "WISC-TV", dma: "Madison", network: "CBS" },
  { callSign: "WMTV", dma: "Madison", network: "NBC" },
  { callSign: "WKOW", dma: "Madison", network: "ABC" },
  { callSign: "WMSN-TV", dma: "Madison", network: "Fox" },
  // Green Bay–Appleton DMA
  { callSign: "WBAY-TV", dma: "Green Bay-Appleton", network: "ABC" },
  { callSign: "WFRV-TV", dma: "Green Bay-Appleton", network: "CBS" },
  { callSign: "WLUK-TV", dma: "Green Bay-Appleton", network: "Fox" },
  { callSign: "WGBA-TV", dma: "Green Bay-Appleton", network: "NBC" },
  { callSign: "WCWF", dma: "Green Bay-Appleton", network: "CW" },
  { callSign: "WACY-TV", dma: "Green Bay-Appleton", network: "Independent" },
];

// In-scope FCC political-file categories. State/Federal are filtered to tracked
// candidates (by surname in the folder name); issue ads are all included.
const CANDIDATE_CATEGORIES = ["state", "federal"];
const ISSUE_CATEGORY_MATCH = /non.?candidate|issue/i;
const SKIP_CATEGORIES = ["local", "terms"];

type EnumeratedDoc = {
  name: string;
  fileManagerId: string;
  fccDocUrl: string;
  category: string;
};

// ---------- ingest core (testable, no network) ----------

/**
 * Score + upsert one extracted TV order, routing to human review. Its own
 * internalAction so the sync (network) and the unit test (no network) share one
 * entry. platformAdId = fileManagerId → idempotent upsert.
 */
export const ingestTvDoc = internalAction({
  args: {
    extraction: v.any(),
    fileManagerId: v.string(),
    fccDocUrl: v.string(),
    year: v.number(),
  },
  handler: async (
    ctx,
    { extraction, fileManagerId, fccDocUrl, year },
  ): Promise<{ adId: Id<"ads">; isPublic: boolean; confidence: number }> => {
    const x = extraction as TvAdExtraction;
    const candidates = await ctx.runQuery(
      internal.ads.listCandidatesForMatching,
      {},
    );
    const write = toAdWrite(x, { fileManagerId, fccDocUrl, year });

    // Match on the advertiser string. No curated TV entities exist, so a name
    // match only ever *suggests* — it never clears the public threshold.
    const normalized: NormalizedAd = {
      platform: "tv",
      platformAdId: write.platformAdId,
      entityId: "",
      pageOrCommittee: write.pageOrCommittee,
      fundingEntity: x.agency,
    };
    const match = scoreAdMatch(normalized, [], candidates);
    const isPublic = match.confidence >= PUBLIC_MATCH_THRESHOLD;

    const adId: Id<"ads"> = await ctx.runMutation(internal.ads.upsertAd, {
      ...write,
      candidateSlug: isPublic ? match.candidateSlug : undefined,
      raceId: isPublic ? match.raceId : undefined,
      matchConfidence: match.confidence,
    });

    // Every non-public TV order gets a review task: volume is low and each buy
    // is a real, expensive order worth a human's eyes (candidate confirmation or
    // issue-ad race assignment).
    if (!isPublic) {
      await ctx.runMutation(internal.ads.openAdReviewTask, {
        adId,
        note: `${write.pageOrCommittee} (TV/${write.station}): ${match.reason}${
          match.suggestedSlug ? ` → suggested: ${match.suggestedSlug}` : ""
        }`,
      });
    }
    return { adId, isPublic, confidence: match.confidence };
  },
});

// ---------- Browserbase enumeration + download (network) ----------

type BbPage = any; // playwright Page — typed `any` to keep the import dynamic.

/** session create → connectOverCDP → download behavior → fn(page, sessionId) → close. */
async function withBrowserbase<T>(
  fn: (page: BbPage, sessionId: string) => Promise<T>,
): Promise<T> {
  const { Browserbase } = await import("@browserbasehq/sdk");
  const { chromium } = await import("playwright-core");
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: "downloads",
      eventsEnabled: true,
    });
    return await fn(page, session.id);
  } finally {
    await browser.close();
  }
}

/** Scrape doc-download anchors (leaf folder) and folder anchors from the page. */
async function scrapeLinks(page: BbPage): Promise<
  { docs: { name: string; fileManagerId: string; fccDocUrl: string }[]; folders: { name: string; href: string }[] }
> {
  return await page.evaluate(() => {
    // Folder/doc rows live inside the DataTable — scope to it to skip nav chrome.
    const anchors = Array.from(
      document.querySelectorAll("table a"),
    ) as HTMLAnchorElement[];
    const docs: { name: string; fileManagerId: string; fccDocUrl: string }[] = [];
    const folders: { name: string; href: string }[] = [];
    for (const a of anchors) {
      const href = a.href;
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (/\/api\/manager\/download\//.test(href)) {
        const id = href.split("/").pop()!.replace(/\.pdf$/, "");
        docs.push({ name: text, fileManagerId: id, fccDocUrl: href });
      } else if (/\/political-files\/\d{4}\/[^#?]+/.test(href)) {
        folders.push({ name: text, href });
      }
    }
    return { docs, folders };
  });
}

/**
 * Load an FCC folder page and wait for its DataTable to populate. The SPA
 * renders folder/doc rows via a slower XHR than DOMContentLoaded, and the
 * Political Files landing needs a "Browse" click to reveal the year tree.
 * Returns once the table has real anchors (or is confirmed empty).
 */
async function gotoFolder(page: BbPage, url: string): Promise<void> {
  // Swallow goto timeouts — a slow folder should skip, not abort the station.
  // Whatever DOM did render is still scraped by the table-populate wait below.
  await page
    .goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    .catch(() => null);
  const tablePopulated = () =>
    page
      .waitForFunction(
        () => {
          const body = document.body?.innerText || "";
          const hasRows = document.querySelectorAll("table a").length > 0;
          const emptyKnown = /Showing 0 to 0 of 0 entries/i.test(body);
          const hasDocs = Array.from(document.querySelectorAll("a")).some((a) =>
            /\/api\/manager\/download\//.test((a as HTMLAnchorElement).href),
          );
          return hasRows || hasDocs || emptyKnown;
        },
        { timeout: 30000, polling: 500 },
      )
      .catch(() => null);
  await tablePopulated();
  // If the table is still empty-by-default (landing page), a Browse click opens
  // the tree; re-wait afterward.
  const stillEmpty = await page.evaluate(() =>
    /No data available in table/i.test(document.body?.innerText || ""),
  );
  if (stillEmpty) {
    await page
      .getByText("Browse", { exact: false })
      .first()
      .click({ timeout: 6000 })
      .catch(() => null);
    await tablePopulated();
  }
}

/**
 * Walk a station's 2026 political files: category folders → in-scope subfolders
 * → doc rows. State/Federal subfolders are kept only when the folder name
 * carries a tracked surname; issue-ad subfolders are all kept. Bounded depth.
 */
async function enumerateStation(
  page: BbPage,
  station: Station,
  trackedSurnames: string[],
): Promise<EnumeratedDoc[]> {
  // 1) Political Files landing → year folder rows (each with its real UUID URL).
  // The landing table is the flakiest render (needs a Browse click); retry it a
  // few times so a slow load doesn't silently yield zero docs for the station.
  const landingUrl = `${FCC_BASE}/tv-profile/${station.callSign}/political-files`;
  let yearRow: { name: string; href: string } | undefined;
  for (let attempt = 0; attempt < 3 && !yearRow; attempt++) {
    await gotoFolder(page, landingUrl);
    const { folders: years } = await scrapeLinks(page);
    yearRow = years.find((f) => f.name.trim() === String(YEAR));
    if (!yearRow) await page.waitForTimeout(2000);
  }
  if (!yearRow) throw new Error(`year ${YEAR} folder not found for ${station.callSign}`);

  // 2) Year folder → category rows (Federal/Local/State/Non-Candidate/Terms).
  await gotoFolder(page, yearRow.href);
  const { folders: categories } = await scrapeLinks(page);

  const out: EnumeratedDoc[] = [];
  const seenFolders = new Set<string>();

  for (const cat of categories) {
    const slug = normalizeText(cat.name).replace(/\s+/g, "-");
    if (SKIP_CATEGORIES.some((s) => slug.includes(s))) continue;
    const isIssue = ISSUE_CATEGORY_MATCH.test(cat.name);
    const isCandidate = CANDIDATE_CATEGORIES.some((c) => slug.includes(c));
    if (!isIssue && !isCandidate) continue;
    if (seenFolders.has(cat.href)) continue;
    seenFolders.add(cat.href);

    try {
      await gotoFolder(page, cat.href);
      const { docs: catDocs, folders: subfolders } = await scrapeLinks(page);
      // Some categories list docs directly; keep those (issue cats especially).
      for (const d of catDocs) out.push({ ...d, category: slug });

      for (const sub of subfolders) {
        if (seenFolders.has(sub.href)) continue;
        seenFolders.add(sub.href);
        // Candidate categories: only tracked surnames. Issue: all.
        if (isCandidate && !isIssue) {
          const folderText = normalizeText(sub.name);
          const matched = trackedSurnames.some((s) => folderText.includes(s));
          if (!matched) continue;
        }
        try {
          await gotoFolder(page, sub.href);
          const { docs: subDocs } = await scrapeLinks(page);
          for (const d of subDocs) out.push({ ...d, category: slug });
        } catch {
          // one bad subfolder shouldn't drop the rest of the category
        }
      }
    } catch {
      // one bad category shouldn't drop the rest of the station
    }
  }

  // Dedup by fileManagerId (a doc can appear via multiple anchors).
  const byId = new Map(out.map((d) => [d.fileManagerId, d]));
  return [...byId.values()];
}

/**
 * Many issue-ad "documents" are PDF Portfolios: a container whose visible page
 * is just an Adobe splash, with the real order(s) as embedded file attachments.
 * Claude only sees the splash → empty extraction. Unwrap with mupdf: if the PDF
 * has an EmbeddedFiles name tree, return each embedded order's bytes; else null
 * (a plain order, extract directly). mupdf is a pure-WASM package — dynamic
 * import keeps it out of Convex's push-time analyze.
 */
async function unwrapPortfolio(
  pdf: Uint8Array,
): Promise<Uint8Array[] | null> {
  const mupdf: any = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  const asPdf = doc.asPDF ? doc.asPDF() : doc;
  const ef = asPdf
    .getTrailer()
    .get("Root")
    .get("Names")
    .get("EmbeddedFiles");
  if (!ef || ef.isNull?.()) return null;
  const names = ef.get("Names");
  const len = names.length ?? 0;
  const out: Uint8Array[] = [];
  for (let i = 0; i + 1 < len; i += 2) {
    try {
      const filespec = names.get(i + 1);
      const stream = filespec.get("EF").get("F");
      const buf = stream.readStream();
      const bytes: Uint8Array = buf.asUint8Array
        ? buf.asUint8Array()
        : new Uint8Array(buf);
      // Only keep real PDF attachments (skip signatures/NAB xml, etc.).
      if (bytes.length > 2000 && bytes[0] === 0x25 && bytes[1] === 0x50)
        out.push(bytes);
    } catch {
      // skip a bad attachment
    }
  }
  return out.length ? out : null;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Download each doc via the alternate host, then retrieve the session ZIP and
 * unzip. Browserbase names zip entries after the PDF's *suggested filename*
 * (not the fileManagerId), so we capture each download's suggestedFilename at
 * trigger time and correlate to zip entries by slug prefix. Returns id → bytes.
 */
async function downloadDocs(
  page: BbPage,
  sessionId: string,
  fileManagerIds: string[],
): Promise<Record<string, Uint8Array>> {
  if (fileManagerIds.length === 0) return {};
  const idBySlug: { id: string; slug: string }[] = [];
  for (const id of fileManagerIds) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
      page.goto(`${DOWNLOAD_HOST}/${id}.pdf`).catch(() => null),
    ]);
    if (download) {
      const suggested = download.suggestedFilename?.() ?? "";
      idBySlug.push({ id, slug: slugify(suggested.replace(/\.pdf$/i, "")) });
    }
  }
  await page.waitForTimeout(3000); // let Browserbase persist the files
  const res = await fetch(
    `https://api.browserbase.com/v1/sessions/${sessionId}/downloads`,
    { headers: { "X-BB-API-Key": process.env.BROWSERBASE_API_KEY! } },
  );
  if (!res.ok) throw new Error(`downloads retrieve HTTP ${res.status}`);
  const zipBuf = new Uint8Array(await res.arrayBuffer());
  const { unzipSync } = await import("fflate");
  const files = unzipSync(zipBuf);
  const entries = Object.entries(files).map(([name, bytes]) => ({
    key: slugify(name.split("/").pop()!.replace(/\.pdf$/i, "")),
    bytes,
  }));

  // Correlate by slug prefix (the zip key = slug + "-" + browserbase timestamp).
  const out: Record<string, Uint8Array> = {};
  const used = new Set<number>();
  for (const { id, slug } of idBySlug) {
    if (!slug) continue;
    const idx = entries.findIndex(
      (e, i) => !used.has(i) && e.key.startsWith(slug),
    );
    if (idx >= 0) {
      used.add(idx);
      out[id] = entries[idx].bytes;
    }
  }
  return out;
}

// ---------- orchestration ----------

/** Daily TV ad sync. Optional narrowing for verification runs. */
export const syncTvAds = internalAction({
  args: {
    callSigns: v.optional(v.array(v.string())),
    stationLimit: v.optional(v.number()),
    docLimit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { callSigns, stationLimit, docLimit },
  ): Promise<{
    stations: number;
    enumerated: number;
    downloaded: number;
    ingested: number;
    extractionFailed: number;
    errors: number;
  }> => {
    const candidates = await ctx.runQuery(
      internal.ads.listCandidatesForMatching,
      {},
    );
    const trackedSurnames = candidates
      .map((c) => normalizeText(c.name).split(" ").pop() ?? "")
      .filter((s) => s.length >= 4);

    // Stored TV platformAdIds may carry a "#<embeddedIndex>" suffix (portfolio
    // orders); dedup on the parent fileManagerId so re-syncs skip whole docs.
    const seen = new Set(
      (await ctx.runQuery(internal.ads.existingTvIds, {})).map(
        (id) => id.split("#")[0],
      ),
    );

    let stations = TV_STATIONS;
    if (callSigns?.length)
      stations = stations.filter((s) => callSigns.includes(s.callSign));
    if (stationLimit) stations = stations.slice(0, stationLimit);

    const totals = {
      stations: stations.length,
      enumerated: 0,
      downloaded: 0,
      ingested: 0,
      extractionFailed: 0,
      errors: 0,
    };
    const perDocCap = docLimit ?? 25;

    for (const station of stations) {
      const stationUrl = `${FCC_BASE}/tv-profile/${station.callSign}/political-files/${YEAR}`;
      try {
        const { docs, files } = await withBrowserbase(async (page, sid) => {
          const all = await enumerateStation(page, station, trackedSurnames);
          const fresh = all
            .filter((d) => !seen.has(d.fileManagerId))
            .slice(0, perDocCap);
          const files = await downloadDocs(
            page,
            sid,
            fresh.map((d) => d.fileManagerId),
          );
          return { docs: all, fresh, files } as any;
        });
        totals.enumerated += docs.length;

        // `files` keyed by fileManagerId; ingest each downloaded doc.
        const fresh = docs.filter(
          (d: EnumeratedDoc) => files[d.fileManagerId],
        );
        for (const d of fresh) {
          const bytes = files[d.fileManagerId];
          totals.downloaded++;

          // Many issue-ad docs are PDF portfolios wrapping the real order(s) as
          // attachments. Unwrap → a unit per embedded order; else the doc itself.
          const embedded = await unwrapPortfolio(bytes);
          const units = embedded
            ? embedded.map((b, i) => ({ bytes: b, idSuffix: `#${i}`, isEmbedded: true }))
            : [{ bytes, idSuffix: "", isEmbedded: false }];

          for (const u of units) {
            const extraction = await ctx.runAction(
              internal.tvExtractAgent.extractTvAd,
              {
                pdfBase64: Buffer.from(u.bytes).toString("base64"),
                hintName: d.name,
                year: YEAR,
              },
            );
            // Skip junk: no advertiser (unreadable) — and, for a portfolio's
            // embedded units, no gross (NAB forms / revisions carry no dollars).
            if (
              !extraction?.advertiser?.trim() ||
              (u.isEmbedded && !extraction.grossSpend)
            ) {
              totals.extractionFailed++;
              continue;
            }
            // TV orders don't carry the market; stamp it from the station.
            const withDma = { ...extraction, station: station.callSign, dma: station.dma };
            await ctx.runAction(internal.adsTv.ingestTvDoc, {
              extraction: withDma,
              fileManagerId: d.fileManagerId + u.idSuffix,
              fccDocUrl: d.fccDocUrl,
              year: YEAR,
            });
            totals.ingested++;
          }
          seen.add(d.fileManagerId);
        }
        await ctx.runMutation(internal.ads.logSync, {
          url: stationUrl,
          status: "ok",
        });
      } catch (err) {
        totals.errors++;
        await ctx.runMutation(internal.ads.logSync, {
          url: stationUrl,
          status: "error",
          error: (err as Error).message?.slice(0, 400),
          severity: "warning",
        });
      }
    }
    return totals;
  },
});
