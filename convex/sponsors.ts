import { v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import {
  normalizeSponsorKey,
  fecCommitteeKind,
  leanFromParty,
  type SponsorLean,
} from "./lib/sponsors";

/** Who is behind an outside-group ad. Reviewer-assisted: FEC facts + a
 * Perplexity-sourced one-liner, human-approved before it ever shows publicly. */

async function requireAdmin(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("sponsors require authentication");
  const role = (identity as { metadata?: { role?: string } }).metadata?.role;
  if (role !== "admin") throw new Error("sponsors require the admin role");
}

const leanValidator = v.union(
  v.literal("supports_d"),
  v.literal("supports_r"),
  v.literal("bipartisan"),
  v.literal("issue"),
);

type FecMatch = {
  fecCommitteeId: string;
  name: string;
  kind: string;
  party?: string;
  lean?: SponsorLean;
};

/** OpenFEC committee search → typed matches. */
async function searchFecCommittees(name: string): Promise<FecMatch[]> {
  const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
  const url = `https://api.open.fec.gov/v1/committees/?q=${encodeURIComponent(
    name,
  )}&api_key=${apiKey}&per_page=5&sort=-receipts`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      committee_id: string;
      name: string;
      committee_type?: string;
      party?: string;
    }[];
  };
  return (data.results ?? []).map((c) => ({
    fecCommitteeId: c.committee_id,
    name: c.name,
    kind: fecCommitteeKind(c.committee_type).kind,
    party: c.party ?? undefined,
    lean: leanFromParty(c.party),
  }));
}

/** Fetch one FEC committee by id — used when the reviewer pastes an ID (the
 * advertised name often differs from the FEC name, e.g. "House Majority PAC" is
 * registered as "HMP", so name search misses it). */
async function getFecCommittee(id: string): Promise<FecMatch | null> {
  const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
  const res = await fetch(
    `https://api.open.fec.gov/v1/committee/${encodeURIComponent(id)}/?api_key=${apiKey}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: {
      committee_id: string;
      name: string;
      committee_type?: string;
      party?: string;
    }[];
  };
  const c = data.results?.[0];
  if (!c) return null;
  return {
    fecCommitteeId: c.committee_id,
    name: c.name,
    kind: fecCommitteeKind(c.committee_type).kind,
    party: c.party ?? undefined,
    lean: leanFromParty(c.party),
  };
}

/** Perplexity (web-grounded) → a sourced one-line description + citations.
 * Exported for reuse as sponsorEnrich.ts's narrative fallback when Firecrawl
 * finds nothing. */
export async function perplexityDescribe(
  name: string,
): Promise<{ summary?: string; sources: { label: string; url: string }[] }> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { sources: [] };
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You describe U.S. political ad sponsors for a nonpartisan voter guide. Answer in ONE neutral sentence: what kind of organization it is, its partisan lean if clearly established, and who funds it. Base it only on reliable sources. If you are not confident which group this is, reply exactly 'Unknown — needs manual research.'",
          },
          { role: "user", content: `Who is the political ad sponsor "${name}"?` },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) return { sources: [] };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    const summary = data.choices?.[0]?.message?.content?.trim();
    const sources = (data.citations ?? []).slice(0, 5).map((url) => {
      let label = url;
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep url */
      }
      return { label, url };
    });
    return { summary, sources };
  } catch {
    return { sources: [] };
  }
}

/** Reviewer tool: research a sponsor (FEC + web) without writing anything.
 * Pass fecCommitteeId to fetch a specific committee (name search often misses). */
export const lookupSponsor = action({
  args: { advertiser: v.string(), fecCommitteeId: v.optional(v.string()) },
  handler: async (ctx, { advertiser, fecCommitteeId }) => {
    await requireAdmin(ctx);
    const [searched, described, direct] = await Promise.all([
      searchFecCommittees(advertiser),
      perplexityDescribe(advertiser),
      fecCommitteeId ? getFecCommittee(fecCommitteeId) : Promise.resolve(null),
    ]);
    const fecMatches = direct ? [direct, ...searched] : searched;
    const best = fecMatches[0];
    return {
      key: normalizeSponsorKey(advertiser),
      displayName: advertiser,
      fecMatches,
      // A pre-filled draft the reviewer edits — never auto-saved.
      suggested: {
        kind: best?.kind,
        lean: best?.lean,
        summary: described.summary,
        fecCommitteeId: best?.fecCommitteeId,
        disclosesDonors: best ? true : undefined,
        sources: described.sources,
      },
    };
  },
});

/** Reviewer approves/edits → upsert an approved sponsor profile. */
export const saveSponsor = mutation({
  args: {
    key: v.string(),
    displayName: v.string(),
    kind: v.optional(v.string()),
    lean: v.optional(leanValidator),
    summary: v.optional(v.string()),
    fecCommitteeId: v.optional(v.string()),
    disclosesDonors: v.optional(v.boolean()),
    topDonors: v.optional(
      v.array(v.object({ name: v.string(), amount: v.number() })),
    ),
    totalRaised: v.optional(v.number()),
    sources: v.array(v.object({ label: v.string(), url: v.string() })),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const doc = { ...args, reviewStatus: "approved" as const, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("sponsors", doc);
  },
});

/** The already-saved profile for a sponsor name, if any (draft or approved). */
export const sponsorForName = query({
  args: { advertiser: v.string() },
  handler: async (ctx, { advertiser }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("sponsors")
      .withIndex("by_key", (q) => q.eq("key", normalizeSponsorKey(advertiser)))
      .unique();
  },
});

/** Public: approved sponsor profiles for a set of sponsor names (race pages). */
export const approvedForNames = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const keys = new Set(names.map(normalizeSponsorKey));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const s = await ctx.db
        .query("sponsors")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (s && s.reviewStatus === "approved") out[key] = s;
    }
    return out;
  },
});

/** Enrichment writer: exact facts publish immediately; a fresh narrative lands
 * as a draft (narrativeStatus:"draft") unless one is already approved. */
export const upsertEnrichment = internalMutation({
  args: {
    key: v.string(), displayName: v.string(),
    kind: v.optional(v.string()), lean: v.optional(leanValidator),
    fecCommitteeId: v.optional(v.string()), disclosesDonors: v.optional(v.boolean()),
    totalRaised: v.optional(v.number()), totalSpent: v.optional(v.number()),
    topDonors: v.optional(v.array(v.object({ name: v.string(), amount: v.number() }))),
    independentExpenditures: v.optional(v.array(v.object({
      candidate: v.string(), office: v.optional(v.string()),
      supportOppose: v.union(v.literal("support"), v.literal("oppose")), amount: v.number(),
    }))),
    financialsAsOf: v.optional(v.string()),
    narrativeDraft: v.optional(v.string()),
    leadership: v.optional(v.array(v.object({ name: v.string(), role: v.string() }))),
    sources: v.array(v.object({ label: v.string(), url: v.string() })),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("sponsors").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const keepNarrative = existing?.narrativeStatus === "approved";
    const doc = {
      key: a.key, displayName: existing?.displayName ?? a.displayName,
      kind: a.kind ?? existing?.kind, lean: a.lean ?? existing?.lean,
      summary: existing?.summary, fecCommitteeId: a.fecCommitteeId ?? existing?.fecCommitteeId,
      disclosesDonors: a.disclosesDonors ?? existing?.disclosesDonors,
      topDonors: a.topDonors, totalRaised: a.totalRaised, totalSpent: a.totalSpent,
      independentExpenditures: a.independentExpenditures, financialsAsOf: a.financialsAsOf,
      leadership: keepNarrative ? existing?.leadership : a.leadership,
      narrative: keepNarrative ? existing?.narrative : a.narrativeDraft,
      narrativeStatus: keepNarrative ? existing?.narrativeStatus : (a.narrativeDraft ? ("draft" as const) : existing?.narrativeStatus),
      sources: a.sources.length ? a.sources : (existing?.sources ?? []),
      reviewStatus: existing?.reviewStatus ?? ("draft" as const),
      enrichedAt: Date.now(), updatedAt: Date.now(),
    };
    if (existing) { await ctx.db.patch(existing._id, doc); return existing._id; }
    return ctx.db.insert("sponsors", doc);
  },
});
