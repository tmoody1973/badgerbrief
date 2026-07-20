import { v } from "convex/values";
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  MatchCandidate,
  NormalizedAd,
  PUBLIC_MATCH_THRESHOLD,
  scoreAdMatch,
  TrackedEntity,
} from "./lib/adsMatch";
import { MetaAdArchiveEntry, normalizeMetaAd } from "./lib/metaAds";
import { GooglePoliticalAdRow, normalizeGoogleAd } from "./lib/googleAds";

/**
 * Ad-library adapters: Meta (MOO-309) + Google (MOO-315), same tables. Mirrors
 * finance.ts: plain fetch, failures → alerts (never crash). Pure normalize per
 * platform (lib/metaAds.ts, lib/googleAds.ts); platform-agnostic match/routing
 * in lib/adsMatch.ts; the DB writes + ingest loop are shared here.
 *
 * Fixture-first: each sync accepts an injected `fixture` so the whole pipeline
 * runs and tests without live credentials. Swapping creds in is config
 * (set the token / service account + curate tracked entities), not a rewrite.
 */

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

const platformValidator = v.union(v.literal("meta"), v.literal("google"));
const trackedEntitiesValidator = v.optional(
  v.array(
    v.object({
      entityId: v.string(),
      candidateSlug: v.string(),
      raceId: v.string(),
    }),
  ),
);

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
  platform: platformValidator,
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
    platform: platformValidator,
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
  args: { adId: v.id("ads"), note: v.string() },
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
        message: `Ad sync: ${args.error ?? "unknown"} (${args.url})`,
        severity: args.severity ?? "warning",
        resolved: false,
        createdAt: Date.now(),
      });
    }
  },
});

// ---------- shared ingest (both platforms) ----------

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * The heart of both syncs: for each normalized ad, score the attribution,
 * upsert the ad (public candidateSlug only when it clears the threshold),
 * snapshot today's metrics, and route below-threshold inferences to review.
 */
async function ingestAds(
  ctx: ActionCtx,
  normalized: NormalizedAd[],
  trackedEntities: TrackedEntity[],
  candidates: MatchCandidate[],
  date: string,
): Promise<{ attributed: number; review: number; unmatched: number }> {
  let attributed = 0;
  let review = 0;
  let unmatched = 0;
  for (const ad of normalized) {
    const match = scoreAdMatch(ad, trackedEntities, candidates);
    const isPublic = match.confidence >= PUBLIC_MATCH_THRESHOLD;

    const adId: Id<"ads"> = await ctx.runMutation(internal.ads.upsertAd, {
      platform: ad.platform,
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
      platform: ad.platform,
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
  return { attributed, review, unmatched };
}

// ---------- Meta sync (MOO-309) ----------

async function fetchAdsArchive(
  base: string,
  token: string,
  trackedEntities: TrackedEntity[],
): Promise<
  | { kind: "ok"; entries: MetaAdArchiveEntry[] }
  | { kind: "token_expired" }
  | { kind: "error"; message: string; httpStatus?: number }
> {
  const fields =
    "id,page_id,page_name,bylines,ad_creative_bodies,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,spend,impressions,currency";
  const pageIds = JSON.stringify(trackedEntities.map((p) => p.entityId));
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
    fixture: v.optional(v.array(v.any())), // MetaAdArchiveEntry[]
    trackedEntities: trackedEntitiesValidator,
    token: v.optional(v.string()),
    apiBase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const date = todayISO(Date.now());
    const trackedEntities: TrackedEntity[] = args.trackedEntities ?? [];
    const token = args.token ?? process.env.META_ADS_ACCESS_TOKEN;
    const logUrl = `${args.apiBase ?? GRAPH_API_BASE}/ads_archive`;

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
        trackedEntities,
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
    const normalized = entries
      .map(normalizeMetaAd)
      .filter((a): a is NormalizedAd => a !== null);
    const counts = await ingestAds(
      ctx,
      normalized,
      trackedEntities,
      candidates,
      date,
    );

    await ctx.runMutation(internal.ads.logSync, {
      url: logUrl,
      status: "ok",
      httpStatus: 200,
    });
    return { status: "ok" as const, fetched: entries.length, ...counts };
  },
});

// ---------- Google sync (MOO-315) ----------

const GOOGLE_DATASET = "bigquery://google_political_ads.creative_stats";

export const syncGoogleAds = internalAction({
  args: {
    fixture: v.optional(v.array(v.any())), // GooglePoliticalAdRow[]
    trackedEntities: trackedEntitiesValidator,
  },
  handler: async (ctx, args) => {
    const date = todayISO(Date.now());
    const trackedEntities: TrackedEntity[] = args.trackedEntities ?? [];

    let rows: GooglePoliticalAdRow[];
    if (args.fixture) {
      rows = args.fixture as GooglePoliticalAdRow[];
    } else if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      await ctx.runMutation(internal.ads.logSync, {
        url: GOOGLE_DATASET,
        status: "error",
        error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured — sync skipped",
        severity: "info",
      });
      return { status: "skipped" as const, reason: "no credentials" };
    } else {
      // ponytail: the live BigQuery query is the credentials-gated follow-up.
      // Service-account JWT → OAuth token → jobs.query REST gets wired when the
      // GCP project exists; it's untestable without real creds, so not built
      // blind. Everything downstream (normalize → match → upsert → review) is
      // done and tested via the fixture path. See MOO-315.
      await ctx.runMutation(internal.ads.logSync, {
        url: GOOGLE_DATASET,
        status: "error",
        error: "credentials present but live BigQuery query not yet wired (MOO-315)",
        severity: "info",
      });
      return { status: "pending_live_query" as const };
    }

    const candidates: MatchCandidate[] = await ctx.runQuery(
      internal.ads.listCandidatesForMatching,
      {},
    );
    const normalized = rows
      .map(normalizeGoogleAd)
      .filter((a): a is NormalizedAd => a !== null);
    const counts = await ingestAds(
      ctx,
      normalized,
      trackedEntities,
      candidates,
      date,
    );

    await ctx.runMutation(internal.ads.logSync, {
      url: GOOGLE_DATASET,
      status: "ok",
      httpStatus: 200,
    });
    return { status: "ok" as const, fetched: rows.length, ...counts };
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
  args: { platform: platformValidator, platformAdId: v.string() },
  handler: async (ctx, { platform, platformAdId }) => {
    return await ctx.db
      .query("ad_metrics_daily")
      .withIndex("by_ad_date", (q) =>
        q.eq("platform", platform).eq("platformAdId", platformAdId),
      )
      .take(400);
  },
});
