/**
 * Social-media follower tracking via SocialFetch (socialfetch.dev).
 *
 * SocialFetch returns a POINT-IN-TIME follower count, not history — so a daily
 * cron logs one `social_snapshots` row per candidate/platform, and growth is
 * computed from our own accumulated rows over time.
 *
 * Trust posture: buzz != votes (age skew, bots). This is attention/momentum
 * CONTEXT for the forecast, never a predictor of who wins.
 *
 * Gated on SOCIALFETCH_API_KEY (Convex deployment env). No key -> no-op, so the
 * cron is safe to deploy before the key exists. Set it with:
 *   npx convex env set SOCIALFETCH_API_KEY <key> --prod
 */
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

// Prototype scope: the active WI-GOV Democratic field. Extend the slug list (or
// drop the filter) to track more candidates once the approach is proven.
const TRACK_RACE = "WI-GOV-2026";
const TRACK_SLUGS = [
  // Active Democratic field
  "francesca-hong", "david-crowley", "kelda-roys", "joel-brennan",
  // Republican frontrunner (for the general-election matchup)
  "tom-tiffany",
];
const API = "https://api.socialfetch.dev/v1";

/** Last path segment of a profile URL: ".../FrancescaHongWI/" -> "FrancescaHongWI". */
function handleSeg(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

// Each platform has a DIFFERENT SocialFetch request shape + follower field.
// Keyed by our candidates.socialMedia key.
type Spec = {
  platform: string;
  buildUrl: (profileUrl: string) => string | null;
  parse: (json: { data?: { metrics?: Record<string, number | null> } }) => number | undefined;
};
const followersOf = (j: { data?: { metrics?: Record<string, number | null> } }) => {
  const f = j.data?.metrics?.followers;
  return typeof f === "number" ? f : undefined;
};
const SPECS: Record<string, Spec> = {
  // X / Instagram: handle in the path.
  twitter_x: {
    platform: "twitter",
    buildUrl: (u) => (handleSeg(u) ? `${API}/twitter/profiles/${handleSeg(u)!.replace(/^@/, "")}` : null),
    parse: followersOf,
  },
  instagram: {
    platform: "instagram",
    buildUrl: (u) => (handleSeg(u) ? `${API}/instagram/profiles/${handleSeg(u)!.replace(/^@/, "")}` : null),
    parse: followersOf,
  },
  // Facebook: full URL as a query param.
  facebook: {
    platform: "facebook",
    buildUrl: (u) => `${API}/facebook/profiles?url=${encodeURIComponent(u)}`,
    parse: followersOf,
  },
  // YouTube: /channel with channelId (…/channel/{id}) or @handle; count is "subscribers".
  youtube: {
    platform: "youtube",
    buildUrl: (u) => {
      const chan = u.match(/\/channel\/([^/?#]+)/);
      if (chan) return `${API}/youtube/channel?channelId=${encodeURIComponent(chan[1])}`;
      const seg = handleSeg(u);
      if (!seg) return null;
      const handle = seg.startsWith("@") ? seg : `@${seg}`;
      return `${API}/youtube/channel?handle=${encodeURIComponent(handle)}`;
    },
    parse: (j) => {
      const m = j.data?.metrics;
      const s = m?.subscribers ?? m?.followers;
      return typeof s === "number" ? s : undefined;
    },
  },
};

export const candidatesToTrack = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("candidates")
      .withIndex("by_race", (q) => q.eq("raceId", TRACK_RACE))
      .collect();
    return rows
      .filter((c) => TRACK_SLUGS.includes(c.slug) && c.socialMedia)
      .map((c) => ({
        slug: c.slug,
        raceId: c.raceId,
        socialMedia: c.socialMedia as Record<string, string>,
      }));
  },
});

/** Prototype reset — wipe all snapshots (e.g. after fixing the parser). */
export const clearSocialSnapshots = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("social_snapshots").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length };
  },
});

export const insertSnapshot = internalMutation({
  args: {
    candidateSlug: v.string(),
    raceId: v.string(),
    platform: v.string(),
    handle: v.string(),
    followers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("social_snapshots", { ...args, capturedAt: Date.now() });
  },
});

/** Daily cron entry. One SocialFetch lookup per candidate/platform. */
export const syncSocial = internalAction({
  args: {},
  handler: async (ctx): Promise<{ stored: number; skipped?: boolean }> => {
    const key = process.env.SOCIALFETCH_API_KEY;
    if (!key) {
      console.log("SocialFetch: SOCIALFETCH_API_KEY not set — skipping (no-op).");
      return { stored: 0, skipped: true };
    }
    const cands = await ctx.runQuery(internal.social.candidatesToTrack, {});
    let stored = 0;
    for (const c of cands) {
      for (const [smKey, spec] of Object.entries(SPECS)) {
        const profileUrl = c.socialMedia[smKey];
        if (!profileUrl) continue;
        const reqUrl = spec.buildUrl(profileUrl);
        if (!reqUrl) continue;
        try {
          const res = await fetch(reqUrl, { headers: { "x-api-key": key } });
          if (!res.ok) {
            console.error(`SocialFetch ${spec.platform} ${profileUrl} HTTP ${res.status}`);
            continue;
          }
          const json = (await res.json()) as { data?: { metrics?: Record<string, number | null> } };
          await ctx.runMutation(internal.social.insertSnapshot, {
            candidateSlug: c.slug,
            raceId: c.raceId,
            platform: spec.platform,
            handle: handleSeg(profileUrl) ?? profileUrl,
            followers: spec.parse(json),
          });
          stored++;
        } catch (e) {
          console.error("SocialFetch error", spec.platform, profileUrl, (e as Error).message);
        }
      }
    }
    return { stored };
  },
});

/**
 * Public read for the forecast page: per candidate/platform, the latest
 * follower count plus growth since the earliest snapshot we have (and the span
 * in days, so the UI can say "over N days").
 */
export const socialForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = await ctx.db
      .query("social_snapshots")
      .withIndex("by_candidate", (q) => q.eq("raceId", raceId))
      .collect();
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.candidateSlug}|${r.platform}`;
      const g = groups.get(k) ?? [];
      g.push(r);
      groups.set(k, g);
    }
    const out: {
      candidateSlug: string;
      platform: string;
      handle: string;
      followers?: number;
      growth?: number;
      spanDays: number;
    }[] = [];
    for (const g of groups.values()) {
      g.sort((a, b) => a.capturedAt - b.capturedAt);
      const first = g[0];
      const last = g[g.length - 1];
      const growth =
        first.followers != null && last.followers != null
          ? last.followers - first.followers
          : undefined;
      out.push({
        candidateSlug: last.candidateSlug,
        platform: last.platform,
        handle: last.handle,
        followers: last.followers,
        growth,
        spanDays: Math.round((last.capturedAt - first.capturedAt) / 86400000),
      });
    }
    return out;
  },
});
