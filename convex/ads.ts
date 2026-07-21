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
import {
  deliveredInWisconsin,
  MetaAdArchiveEntry,
  normalizeMetaAd,
} from "./lib/metaAds";
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

/**
 * Wipe all synced ad data (ads + daily metrics + open ad_match review tasks) in
 * batches, self-scheduling until drained. For a clean re-sync after a scoping
 * change — safe while no attribution has been human-resolved. Leaves non-ad
 * review tasks (positions/quotes) untouched.
 */
export const purgeAdData = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ ads: number; metrics: number; tasks: number; more: boolean }> => {
    const B = 300;
    const ads = await ctx.db.query("ads").take(B);
    for (const a of ads) await ctx.db.delete(a._id);
    const metrics = await ctx.db.query("ad_metrics_daily").take(B);
    for (const m of metrics) await ctx.db.delete(m._id);
    // Filter to ad_match in the query, not after take() — otherwise non-ad
    // tasks (positions/quotes) fill the page and we never reach the ad ones.
    const adTasks = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .filter((q) => q.eq(q.field("kind"), "ad_match"))
      .take(B);
    for (const t of adTasks) await ctx.db.delete(t._id);

    const more = ads.length === B || metrics.length === B || adTasks.length === B;
    if (more) await ctx.scheduler.runAfter(0, internal.ads.purgeAdData, {});
    return { ads: ads.length, metrics: metrics.length, tasks: adTasks.length, more };
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

// Only the current election cycle (2025 onward) — the guide tracks 2026 races
// and their 2025 lead-up. Both platforms filter at the source: Meta via
// `ad_delivery_date_min`, Google via the `date_range_start` floor in its SQL.
const AD_CYCLE_START_DATE = "2025-01-01";

const AD_FIELDS =
  "id,page_id,page_name,bylines,ad_creative_bodies,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,spend,impressions,currency,delivery_by_region";

type AdQuery = { searchTerms?: string; searchPageIds?: string[] };
type FetchResult =
  | { kind: "ok"; entries: MetaAdArchiveEntry[] }
  | { kind: "token_expired" }
  | { kind: "error"; message: string; httpStatus?: number };

async function fetchAdsArchive(
  base: string,
  token: string,
  q: AdQuery,
  limit: number,
): Promise<FetchResult> {
  const params = [
    `access_token=${token}`,
    "ad_type=POLITICAL_AND_ISSUE_ADS",
    `ad_reached_countries=${encodeURIComponent('["US"]')}`,
    // Cycle scope: only ads delivered on/after 2025-01-01 (excludes prior cycles).
    `ad_delivery_date_min=${AD_CYCLE_START_DATE}`,
    `fields=${AD_FIELDS}`,
    `limit=${limit}`,
  ];
  if (q.searchTerms) {
    params.push(`search_terms=${encodeURIComponent(q.searchTerms)}`);
  }
  if (q.searchPageIds && q.searchPageIds.length > 0) {
    params.push(
      `search_page_ids=${encodeURIComponent(JSON.stringify(q.searchPageIds))}`,
    );
  }
  try {
    const res = await fetch(`${base}/ads_archive?${params.join("&")}`);
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
    // ponytail: first page per query (limit N). Add paging.next follow when a
    // single candidate's ad count exceeds it.
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export const syncMetaAds = internalAction({
  args: {
    fixture: v.optional(v.array(v.any())), // MetaAdArchiveEntry[]
    trackedEntities: trackedEntitiesValidator,
    // Override discovery terms; default is every candidate's name.
    searchTerms: v.optional(v.array(v.string())),
    perQueryLimit: v.optional(v.number()),
    token: v.optional(v.string()),
    apiBase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const date = todayISO(Date.now());
    const base = args.apiBase ?? GRAPH_API_BASE;
    const logUrl = `${base}/ads_archive`;
    const trackedEntities: TrackedEntity[] = args.trackedEntities ?? [];
    const token = args.token ?? process.env.META_ADS_ACCESS_TOKEN;

    const candidates: MatchCandidate[] = await ctx.runQuery(
      internal.ads.listCandidatesForMatching,
      {},
    );

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
      // Discovery: one query per candidate name (targeted to our guide) plus
      // any curated tracked pages. Deduped by ad id. Term-found ads aren't from
      // a verified page, so downstream scoring routes them to review.
      const limit = args.perQueryLimit ?? 15;
      const terms = args.searchTerms ?? candidates.map((c) => c.name);
      const queries: AdQuery[] = terms.map((t) => ({ searchTerms: t }));
      if (trackedEntities.length > 0) {
        queries.push({ searchPageIds: trackedEntities.map((t) => t.entityId) });
      }
      const seen = new Map<string, MetaAdArchiveEntry>();
      for (const q of queries) {
        const r = await fetchAdsArchive(base, token, q, limit);
        if (r.kind === "token_expired") {
          await ctx.runMutation(internal.ads.logSync, {
            url: logUrl,
            status: "error",
            error:
              "Meta access token expired or invalid (code 190) — data is stale",
            severity: "warning",
          });
          return { status: "token_expired" as const };
        }
        if (r.kind === "error") {
          await ctx.runMutation(internal.ads.logSync, {
            url: logUrl,
            status: "error",
            error: r.message,
            httpStatus: r.httpStatus,
          });
          throw new Error(`Meta ads sync failed: ${r.message}`);
        }
        for (const e of r.entries) if (e.id) seen.set(e.id, e);
      }
      // WI scoping: Meta has no state filter, so name-search drags in national
      // ads. Keep an ad only if it names one of our WI candidates (reliable) or
      // Meta reports real Wisconsin delivery (bonus for WI issue ads).
      entries = [...seen.values()].filter((e) => {
        const ad = normalizeMetaAd(e);
        if (!ad) return false;
        if (deliveredInWisconsin(e)) return true;
        return scoreAdMatch(ad, trackedEntities, candidates).confidence > 0;
      });
    }

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

// geo_targeting_included is a STRING of "zip,State,Country" tuples; WI-targeted
// ads contain "Wisconsin" there (regions is only country-level, "US").
const GOOGLE_ADS_SQL = `
SELECT ad_id, advertiser_id, advertiser_name, ad_type, ad_url,
       date_range_start, date_range_end,
       spend_range_min_usd, spend_range_max_usd, impressions
FROM \`bigquery-public-data.google_political_ads.creative_stats\`
WHERE geo_targeting_included LIKE '%Wisconsin%'
  AND date_range_start >= '${AD_CYCLE_START_DATE}'
ORDER BY spend_range_max_usd DESC
LIMIT 500`;

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id: string;
};

function b64urlStr(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Mint a short-lived OAuth token from the service account (RS256 JWT signed
 * with Web Crypto — no Node runtime, no SDK). */
async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlStr(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/bigquery.readonly",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlBytes(sig)}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    )}&assertion=${jwt}`,
  });
  const body = (await res.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`Google auth failed: ${body.error_description ?? body.error ?? res.status}`);
  }
  return body.access_token;
}

/** Run one BigQuery query, capped at maxBytes so it can never cost money. */
async function queryBigQuery(
  sa: ServiceAccount,
  sql: string,
  maxBytes: number,
): Promise<GooglePoliticalAdRow[]> {
  const token = await googleAccessToken(sa);
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${sa.project_id}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: sql,
        useLegacySql: false,
        maximumBytesBilled: String(maxBytes),
        timeoutMs: 60000,
      }),
    },
  );
  const body = (await res.json()) as {
    schema?: { fields?: { name: string }[] };
    rows?: { f: { v: string }[] }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`BigQuery error: ${body.error?.message ?? res.status}`);
  const names = (body.schema?.fields ?? []).map((f) => f.name);
  return (body.rows ?? []).map((r) => {
    const obj: Record<string, string> = {};
    r.f.forEach((cell, i) => (obj[names[i]] = cell.v));
    return obj as GooglePoliticalAdRow;
  });
}

export const syncGoogleAds = internalAction({
  args: {
    fixture: v.optional(v.array(v.any())), // GooglePoliticalAdRow[]
    trackedEntities: trackedEntitiesValidator,
  },
  handler: async (ctx, args) => {
    const date = todayISO(Date.now());
    const trackedEntities: TrackedEntity[] = args.trackedEntities ?? [];
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    let rows: GooglePoliticalAdRow[];
    if (args.fixture) {
      rows = args.fixture as GooglePoliticalAdRow[];
    } else if (!saJson) {
      await ctx.runMutation(internal.ads.logSync, {
        url: GOOGLE_DATASET,
        status: "error",
        error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured — sync skipped",
        severity: "info",
      });
      return { status: "skipped" as const, reason: "no credentials" };
    } else {
      try {
        const sa = JSON.parse(saJson) as ServiceAccount;
        // 10 GB cap (well inside BigQuery's 1 TB/month free tier) — the geo
        // column scan is larger than the tiny output.
        rows = await queryBigQuery(sa, GOOGLE_ADS_SQL, 10_000_000_000);
      } catch (e) {
        await ctx.runMutation(internal.ads.logSync, {
          url: GOOGLE_DATASET,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
          severity: "warning",
        });
        throw new Error(`Google ads sync failed: ${e instanceof Error ? e.message : e}`);
      }
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
    return await ctx.db.query("ads").order("desc").take(2000);
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
