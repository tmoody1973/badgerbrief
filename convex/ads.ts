import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  MetaAdArchiveEntry,
  MatchCandidate,
  normalizeMetaAd,
  PUBLIC_MATCH_THRESHOLD,
  scoreAdMatch,
  TrackedPage,
} from "./lib/metaAds";

/**
 * Meta Ad Library adapter (MOO-309). Mirrors finance.ts: one file, plain
 * fetch (no "use node"), sync failures logged to alerts rather than crashing.
 * Pure normalize/match logic lives in ./lib/metaAds.ts.
 *
 * Fixture-first: syncMetaAds accepts an injected `fixture` (the raw ads_archive
 * `data` array) so the whole pipeline runs and tests without a live token.
 * Swapping in credentials is config (set META_ADS_ACCESS_TOKEN + curate
 * trackedPages), not a rewrite.
 */

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// ---------- reads for the sync ----------

export const listCandidatesForMatching = internalQuery({
  args: {},
  handler: async (ctx): Promise<MatchCandidate[]> => {
    const candidates = await ctx.db.query("candidates").collect();
    const races = await ctx.db.query("races").collect();
    const raceById = new Map(races.map((r) => [r.raceId, r]));
    return candidates.map((c) => {
      const race = raceById.get(c.raceId);
      return {
        slug: c.slug,
        name: c.name,
        raceId: c.raceId,
        office: race?.office ?? "",
        level: race?.level ?? "",
      };
    });
  },
});

// ---------- writes ----------

const adWriteFields = {
  platform: v.literal("meta"),
  platformAdId: v.string(),
  pageOrCommittee: v.string(),
  candidateSlug: v.optional(v.string()),
  raceId: v.optional(v.string()),
  matchConfidence: v.optional(v.number()),
  creativeText: v.optional(v.string()),
  creativeLinkUrl: v.optional(v.string()),
  snapshotUrl: v.optional(v.string()),
  fundingEntity: v.optional(v.string()),
  status: v.optional(v.string()),
  spendLower: v.optional(v.number()),
  spendUpper: v.optional(v.number()),
  impressionsLower: v.optional(v.number()),
  impressionsUpper: v.optional(v.number()),
};

export const upsertAd = internalMutation({
  args: adWriteFields,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("ads")
      .withIndex("by_platform_ad", (q) =>
        q.eq("platform", args.platform).eq("platformAdId", args.platformAdId),
      )
      .unique();

    // Volatile fields refresh every sync; attribution does not clobber a value
    // already set (a human review resolution, or a prior high-confidence match).
    const volatile = {
      pageOrCommittee: args.pageOrCommittee,
      creativeText: args.creativeText,
      creativeLinkUrl: args.creativeLinkUrl,
      snapshotUrl: args.snapshotUrl,
      fundingEntity: args.fundingEntity,
      status: args.status,
      spendLower: args.spendLower,
      spendUpper: args.spendUpper,
      impressionsLower: args.impressionsLower,
      impressionsUpper: args.impressionsUpper,
      lastSeenAt: now,
    };

    if (existing) {
      const keepAttribution = existing.candidateSlug !== undefined;
      await ctx.db.patch(existing._id, {
        ...volatile,
        ...(keepAttribution
          ? {}
          : {
              candidateSlug: args.candidateSlug,
              raceId: args.raceId,
              matchConfidence: args.matchConfidence,
            }),
      });
      return existing._id;
    }

    return await ctx.db.insert("ads", {
      platform: args.platform,
      platformAdId: args.platformAdId,
      candidateSlug: args.candidateSlug,
      raceId: args.raceId,
      matchConfidence: args.matchConfidence,
      firstSeenAt: now,
      ...volatile,
    });
  },
});

export const recordDailyMetric = internalMutation({
  args: {
    platform: v.literal("meta"),
    platformAdId: v.string(),
    date: v.string(),
    spendLower: v.optional(v.number()),
    spendUpper: v.optional(v.number()),
    impressionsLower: v.optional(v.number()),
    impressionsUpper: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ad_metrics_daily")
      .withIndex("by_ad_date", (q) =>
        q
          .eq("platform", args.platform)
          .eq("platformAdId", args.platformAdId)
          .eq("date", args.date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("ad_metrics_daily", args);
  },
});

export const openAdReviewTask = internalMutation({
  args: {
    adId: v.id("ads"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    // Dedupe: one open ad_match task per ad, so re-syncs don't pile up.
    const open = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const already = open.find(
      (t) => t.kind === "ad_match" && t.refId === args.adId,
    );
    if (already) return already._id;
    return await ctx.db.insert("review_tasks", {
      kind: "ad_match",
      refTable: "ads",
      refId: args.adId,
      status: "open",
      note: args.note,
      createdAt: Date.now(),
    });
  },
});

export const logSync = internalMutation({
  args: {
    url: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
    severity: v.optional(
      v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("source_fetch_logs", {
      url: args.url,
      status: args.status,
      httpStatus: args.httpStatus,
      error: args.error,
      fetchedAt: Date.now(),
    });
    if (args.status === "error") {
      await ctx.db.insert("alerts", {
        kind: "sync_failure",
        message: `Meta ads sync: ${args.error ?? "unknown"}`,
        severity: args.severity ?? "warning",
        resolved: false,
        createdAt: Date.now(),
      });
    }
  },
});

// ---------- sync action ----------

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Fetch a page of ads_archive for the tracked pages. Only reached when a live
 * token is present. Detects an expired/invalid token (Graph error code 190)
 * and signals it to the caller so the sync degrades gracefully.
 */
async function fetchAdsArchive(
  base: string,
  token: string,
  trackedPages: TrackedPage[],
): Promise<
  | { kind: "ok"; entries: MetaAdArchiveEntry[] }
  | { kind: "token_expired" }
  | { kind: "error"; message: string; httpStatus?: number }
> {
  const fields =
    "id,page_id,page_name,bylines,ad_creative_bodies,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,spend,impressions,currency";
  const pageIds = JSON.stringify(trackedPages.map((p) => p.pageId));
  const url =
    `${base}/ads_archive?access_token=${token}` +
    `&ad_type=POLITICAL_AND_ISSUE_ADS&ad_reached_countries=${encodeURIComponent(
      '["US"]',
    )}&search_page_ids=${encodeURIComponent(pageIds)}` +
    `&fields=${fields}&limit=100`;
  try {
    const res = await fetch(url);
    const body = (await res.json()) as {
      data?: MetaAdArchiveEntry[];
      error?: { code?: number; message?: string };
    };
    if (body.error || !res.ok) {
      const code = body.error?.code;
      if (code === 190 || res.status === 401) return { kind: "token_expired" };
      return {
        kind: "error",
        message: body.error?.message ?? `HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }
    return { kind: "ok", entries: body.data ?? [] };
    // ponytail: single page (limit 100). Add paging.next follow when a real
    // page count exceeds it — untestable until live creds exist.
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export const syncMetaAds = internalAction({
  args: {
    // Inject the raw ads_archive `data` array to run without a live token.
    fixture: v.optional(v.array(v.any())),
    // Curated Meta pages we know belong to a candidate → verified attribution.
    trackedPages: v.optional(
      v.array(
        v.object({
          pageId: v.string(),
          candidateSlug: v.string(),
          raceId: v.string(),
        }),
      ),
    ),
    token: v.optional(v.string()),
    apiBase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const date = todayISO(now);
    const trackedPages: TrackedPage[] = args.trackedPages ?? [];
    const token = args.token ?? process.env.META_ADS_ACCESS_TOKEN;
    const logUrl = `${args.apiBase ?? GRAPH_API_BASE}/ads_archive`;

    // Resolve the ad entries: fixture (dev/test) → live fetch → graceful skip.
    let entries: MetaAdArchiveEntry[];
    if (args.fixture) {
      entries = args.fixture as MetaAdArchiveEntry[];
    } else if (!token) {
      await ctx.runMutation(internal.ads.logSync, {
        url: logUrl,
        status: "error",
        error: "META_ADS_ACCESS_TOKEN not configured — sync skipped",
        severity: "info",
      });
      return { status: "skipped" as const, reason: "no token" };
    } else {
      const result = await fetchAdsArchive(
        args.apiBase ?? GRAPH_API_BASE,
        token,
        trackedPages,
      );
      if (result.kind === "token_expired") {
        await ctx.runMutation(internal.ads.logSync, {
          url: logUrl,
          status: "error",
          error: "Meta access token expired or invalid (code 190) — data is stale",
          severity: "warning",
        });
        return { status: "token_expired" as const };
      }
      if (result.kind === "error") {
        await ctx.runMutation(internal.ads.logSync, {
          url: logUrl,
          status: "error",
          error: result.message,
          httpStatus: result.httpStatus,
        });
        throw new Error(`Meta ads sync failed: ${result.message}`);
      }
      entries = result.entries;
    }

    const candidates: MatchCandidate[] = await ctx.runQuery(
      internal.ads.listCandidatesForMatching,
      {},
    );

    let attributed = 0;
    let review = 0;
    let unmatched = 0;
    for (const entry of entries) {
      const ad = normalizeMetaAd(entry);
      if (!ad) continue;
      const match = scoreAdMatch(ad, trackedPages, candidates);
      const isPublic = match.confidence >= PUBLIC_MATCH_THRESHOLD;

      const adId = await ctx.runMutation(internal.ads.upsertAd, {
        platform: "meta",
        platformAdId: ad.platformAdId,
        pageOrCommittee: ad.pageOrCommittee,
        candidateSlug: isPublic ? match.candidateSlug : undefined,
        raceId: isPublic ? match.raceId : undefined,
        matchConfidence: match.confidence,
        creativeText: ad.creativeText,
        creativeLinkUrl: ad.creativeLinkUrl,
        snapshotUrl: ad.snapshotUrl,
        fundingEntity: ad.fundingEntity,
        status: ad.status,
        spendLower: ad.spendLower,
        spendUpper: ad.spendUpper,
        impressionsLower: ad.impressionsLower,
        impressionsUpper: ad.impressionsUpper,
      });

      await ctx.runMutation(internal.ads.recordDailyMetric, {
        platform: "meta",
        platformAdId: ad.platformAdId,
        date,
        spendLower: ad.spendLower,
        spendUpper: ad.spendUpper,
        impressionsLower: ad.impressionsLower,
        impressionsUpper: ad.impressionsUpper,
      });

      if (isPublic) {
        attributed++;
      } else if (match.review) {
        review++;
        await ctx.runMutation(internal.ads.openAdReviewTask, {
          adId,
          note: `${ad.pageOrCommittee}: ${match.reason}${
            match.suggestedSlug ? ` → suggested: ${match.suggestedSlug}` : ""
          }`,
        });
      } else {
        unmatched++;
      }
    }

    await ctx.runMutation(internal.ads.logSync, {
      url: logUrl,
      status: "ok",
      httpStatus: 200,
    });
    return {
      status: "ok" as const,
      fetched: entries.length,
      attributed,
      review,
      unmatched,
    };
  },
});

// ---------- public reads (consumed by the /ads page + race modules) ----------

/** All tracked ads for the /ads page. Bounded; the page filters client-side. */
export const listAds = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("ads").order("desc").take(500);
  },
});

/** Ads publicly attributed to a candidate. Rows below the match threshold have
 * no candidateSlug, so they never appear here — attribution stays human-gated. */
export const adsForCandidate = query({
  args: { raceId: v.string(), candidateSlug: v.string() },
  handler: async (ctx, { raceId, candidateSlug }) => {
    return await ctx.db
      .query("ads")
      .withIndex("by_candidate", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .take(50);
  },
});

/** Daily spend/impression snapshots for one ad, oldest→newest (timeline). */
export const adSpendTimeline = query({
  args: { platformAdId: v.string() },
  handler: async (ctx, { platformAdId }) => {
    return await ctx.db
      .query("ad_metrics_daily")
      .withIndex("by_ad_date", (q) =>
        q.eq("platform", "meta").eq("platformAdId", platformAdId),
      )
      .take(400);
  },
});
