import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { logAudit } from "./audit";

/** MOO-312 Task 4: admin review dashboard queries/mutations. */

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("admin queue requires authentication");
  }
  // Same inline shape as convex/audit.ts / convex/publish.ts requireAdmin.
  const role = (identity as { metadata?: { role?: string } }).metadata?.role;
  if (role !== "admin") {
    throw new Error("admin queue requires the admin role");
  }
}

/** A clickable order-PDF URL for a TV ad: our stored copy (never 403s), else the
 * working files.fcc.gov fallback. null for non-TV ads. */
async function tvPdfUrl(
  ctx: QueryCtx | MutationCtx,
  ad: Doc<"ads">,
): Promise<string | null> {
  if (ad.platform !== "tv") return null;
  if (ad.pdfStorageId) return await ctx.storage.getUrl(ad.pdfStorageId);
  const parentId = ad.platformAdId.split("#")[0];
  return `https://files.fcc.gov/download/${parentId}.pdf`;
}

/** Candidate picker options with their race office, for the ad reviewers. */
async function candidatesWithOffice(ctx: QueryCtx | MutationCtx) {
  const cands = await ctx.db.query("candidates").collect();
  const races = await ctx.db.query("races").collect();
  const officeBy = new Map(races.map((r) => [r.raceId, r.office]));
  return cands
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      raceId: c.raceId,
      office: officeBy.get(c.raceId) ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Match a disclosed candidate name (from the NAB form) to one of our tracked
 * candidates by surname — so the reviewer's picker pre-selects who the ad's own
 * FCC disclosure says it's about. */
function matchDisclosedCandidate(
  disclosed: string[] | undefined,
  roster: { slug: string; name: string }[],
): string | undefined {
  if (!disclosed?.length) return undefined;
  const surname = (n: string) =>
    n.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).pop() ?? "";
  for (const name of disclosed) {
    const s = surname(name);
    if (s.length < 4) continue;
    const hit = roster.find((c) => surname(c.name) === s);
    if (hit) return hit.slug;
  }
  return undefined;
}

const stanceLabel = v.union(
  v.literal("support"),
  v.literal("oppose"),
  v.literal("mixed"),
  v.literal("evolving"),
  v.literal("unclear"),
);

type QueueRow =
  | { task: Doc<"review_tasks">; kind: "position"; draft: Doc<"candidate_positions_drafts"> }
  | { task: Doc<"review_tasks">; kind: "quote"; draft: Doc<"quote_drafts"> };

/** Open review tasks joined with their draft docs, newest first. */
/** Open-work counts for the admin tab bar — one cheap query so each tab shows
 * its backlog without mounting the section. `tv` is broken out so the new TV
 * orders are visible at a glance. */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const open = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const adMatchTasks = open.filter((t) => t.kind === "ad_match");
    // How many of those ad_match tasks are TV orders.
    let tv = 0;
    for (const t of adMatchTasks) {
      const id = ctx.db.normalizeId("ads", t.refId);
      const ad = id ? await ctx.db.get(id) : null;
      if (ad?.platform === "tv") tv++;
    }
    const editorial = open.filter(
      (t) => t.kind === "position" || t.kind === "quote",
    ).length;
    const unattributed = (await ctx.db.query("ads").collect()).filter(
      (a) => a.candidateSlug === undefined,
    ).length;
    const sources = (
      await ctx.db
        .query("article_sources")
        .withIndex("by_status", (q) => q.eq("status", "proposed"))
        .collect()
    ).length;
    return { adMatch: adMatchTasks.length, tv, editorial, unattributed, sources };
  },
});

export const list = query({
  args: {},
  handler: async (ctx): Promise<QueueRow[]> => {
    await requireAdmin(ctx);
    const tasks = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const rows: QueueRow[] = [];
    for (const task of tasks) {
      if (task.kind === "position") {
        const id = ctx.db.normalizeId("candidate_positions_drafts", task.refId);
        const draft = id ? await ctx.db.get(id) : null;
        if (draft) rows.push({ task, kind: "position", draft });
      } else if (task.kind === "quote") {
        const id = ctx.db.normalizeId("quote_drafts", task.refId);
        const draft = id ? await ctx.db.get(id) : null;
        if (draft) rows.push({ task, kind: "quote", draft });
      }
      // ad_match / other: no draft table to join yet — surfaced elsewhere.
    }
    return rows.sort((a, b) => b.task.createdAt - a.task.createdAt);
  },
});

/** Only the provided fields are changed; undefined means "leave alone". */
function changedFields<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) changed[key] = patch[key];
  }
  return changed;
}

export const editPositionDraft = mutation({
  args: {
    draftId: v.id("candidate_positions_drafts"),
    summary: v.optional(v.string()),
    stance: v.optional(stanceLabel),
    issueSlug: v.optional(v.string()),
  },
  handler: async (ctx, { draftId, ...patch }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new Error("position draft not found");
    const changed = changedFields(patch);
    await ctx.db.patch(draftId, { ...changed, reviewStatus: "pending" });
    await logAudit(ctx, {
      action: "edit",
      refTable: "candidate_positions_drafts",
      refId: draftId,
      detail: JSON.stringify(Object.keys(changed)),
    });
  },
});

export const editQuoteDraft = mutation({
  args: {
    draftId: v.id("quote_drafts"),
    text: v.optional(v.string()),
    context: v.optional(v.string()),
    date: v.optional(v.string()),
    outlet: v.optional(v.string()),
  },
  handler: async (ctx, { draftId, ...patch }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new Error("quote draft not found");
    const changed = changedFields(patch);
    await ctx.db.patch(draftId, { ...changed, reviewStatus: "pending" });
    await logAudit(ctx, {
      action: "edit",
      refTable: "quote_drafts",
      refId: draftId,
      detail: JSON.stringify(Object.keys(changed)),
    });
  },
});

/** Close a review task so the queue drains (resolved after publish, dismissed after reject). */
export const resolveTask = mutation({
  args: {
    taskId: v.id("review_tasks"),
    outcome: v.union(v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, { taskId, outcome }) => {
    await requireAdmin(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("review task not found");
    await ctx.db.patch(taskId, { status: outcome, resolvedAt: Date.now() });
    await logAudit(ctx, {
      action: `task:${outcome}`,
      refTable: "review_tasks",
      refId: taskId,
    });
  },
});

/** Open (unresolved) alerts, newest first. */
export const alerts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_resolved", (q) => q.eq("resolved", false))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const resolveAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    await requireAdmin(ctx);
    const alert = await ctx.db.get(alertId);
    if (!alert) throw new Error("alert not found");
    await ctx.db.patch(alertId, { resolved: true });
    await logAudit(ctx, {
      action: "resolve",
      refTable: "alerts",
      refId: alertId,
      detail: alert.message,
    });
  },
});

/**
 * Sources needing the editor's eye, newest first, with candidate name joined in:
 * article sources awaiting approval, plus own-site subpages the campaign-site
 * mapper auto-registered (MOO-326) — those skip per-URL approval, so this list
 * is the only place an editor can see and dismiss what is being read.
 */
export const listArticleSources = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const proposed = await ctx.db
      .query("article_sources")
      .withIndex("by_status", (q) => q.eq("status", "proposed"))
      .collect();
    const ownSite = (
      await ctx.db
        .query("article_sources")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .collect()
    ).filter((r) => r.sourceKind === "campaign_site");
    const sorted = [...proposed, ...ownSite].sort(
      (a, b) => b.proposedAt - a.proposedAt,
    );

    const out = [];
    for (const row of sorted) {
      const candidate = await ctx.db
        .query("candidates")
        .withIndex("by_slug_only", (q) => q.eq("slug", row.candidateSlug))
        .first();
      out.push({
        ...row,
        sourceKind: row.sourceKind ?? ("article" as const),
        candidateName: candidate?.name ?? row.candidateSlug,
      });
    }
    return out;
  },
});

// ---------- ad → candidate attribution review (MOO-309) ----------

/**
 * Open ad_match tasks joined with their ad, plus the candidate list for the
 * picker and a real open count. `list` skips ad_match (no draft table); this
 * is where a human confirms which candidate an ad actually backs.
 */
export const adQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const allOpen = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const adTasks = allOpen.filter((t) => t.kind === "ad_match");
    const roster = await candidatesWithOffice(ctx);

    // Join EVERY ad_match task, then sort by spend, then cap. Slicing before the
    // sort (the old bug) truncated in insertion order, so the biggest spenders —
    // notably the ~dozens of TV orders — fell outside the cap and vanished.
    const rows = [];
    for (const task of adTasks) {
      const id = ctx.db.normalizeId("ads", task.refId);
      const ad = id ? await ctx.db.get(id) : null;
      if (!ad) continue;
      // Prefer the ad's own FCC disclosure (who it says it's about) over the
      // sponsor-name surname guess — that's the one-click race attribution.
      const suggestedSlug =
        matchDisclosedCandidate(ad.disclosure?.candidates, roster) ??
        task.note?.match(/suggested: ([a-z0-9-]+)/)?.[1];
      const pdfUrl = await tvPdfUrl(ctx, ad);
      rows.push({ task, ad, suggestedSlug, pdfUrl });
    }
    // Biggest spenders first — the highest-impact ads to triage. The client
    // adds search + platform + a likely-attacks filter over this set.
    rows.sort((a, b) => (b.ad.spendUpper ?? 0) - (a.ad.spendUpper ?? 0));

    return {
      rows: rows.slice(0, 300),
      candidates: roster,
      openCount: adTasks.length,
    };
  },
});

/**
 * Confirm an ad belongs to a candidate: attribute it publicly (human-verified,
 * confidence 1 — so it shows on that candidate's page) and resolve the task.
 * Dismissing an ad_match uses the generic resolveTask (ad stays unattributed).
 */
export const confirmAdMatch = mutation({
  args: {
    taskId: v.id("review_tasks"),
    candidateSlug: v.string(),
    stance: v.union(v.literal("support"), v.literal("oppose")),
  },
  handler: async (ctx, { taskId, candidateSlug, stance }) => {
    await requireAdmin(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.kind !== "ad_match") {
      throw new Error("ad_match task not found");
    }
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", candidateSlug))
      .first();
    if (!candidate) throw new Error(`candidate not found: ${candidateSlug}`);
    const adId = ctx.db.normalizeId("ads", task.refId);
    if (!adId || !(await ctx.db.get(adId))) throw new Error("ad not found");

    await ctx.db.patch(adId, {
      candidateSlug: candidate.slug,
      raceId: candidate.raceId,
      matchConfidence: 1, // human-verified
      stance,
    });
    await ctx.db.patch(taskId, { status: "resolved", resolvedAt: Date.now() });
    await logAudit(ctx, {
      action: "ad:attributed",
      refTable: "ads",
      refId: adId,
      detail: `${candidate.slug} (${stance})`,
    });
  },
});

/**
 * Un-attribute an ad from a candidate: clear candidateSlug/raceId/stance so it
 * leaves the candidate page and returns to the unattributed pool. Use to undo a
 * wrong match (e.g. a hostile attack ad mislabeled as "support"). The ad row
 * survives on the outside-spending tracker under its own sponsor/committee.
 */
export const unattributeAd = mutation({
  args: { adId: v.id("ads") },
  handler: async (ctx, { adId }) => {
    await requireAdmin(ctx);
    const ad = await ctx.db.get(adId);
    if (!ad) throw new Error("ad not found");
    await ctx.db.patch(adId, {
      candidateSlug: undefined,
      raceId: undefined,
      stance: undefined,
      matchConfidence: undefined,
    });
    await logAudit(ctx, {
      action: "ad:unattributed",
      refTable: "ads",
      refId: adId,
      detail: `was ${ad.candidateSlug ?? "?"} (${ad.stance ?? "?"}) — ${ad.pageOrCommittee}`,
    });
  },
});

/**
 * Confirm a TV ad as an ISSUE ad — a national-issue buy with no candidate to
 * attribute (e.g. "Tariffs"). Stamps issueTopic + resolves the task, so it
 * clears the queue and reads as human-reviewed on the outside-spending tracker.
 */
export const publishTvIssueAd = mutation({
  args: { taskId: v.id("review_tasks"), issueTopic: v.string() },
  handler: async (ctx, { taskId, issueTopic }) => {
    await requireAdmin(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.kind !== "ad_match") {
      throw new Error("ad_match task not found");
    }
    const adId = ctx.db.normalizeId("ads", task.refId);
    if (!adId || !(await ctx.db.get(adId))) throw new Error("ad not found");
    await ctx.db.patch(adId, { issueTopic: issueTopic.trim() || "Issue ad" });
    await ctx.db.patch(taskId, { status: "resolved", resolvedAt: Date.now() });
    await logAudit(ctx, {
      action: "ad:issue_published",
      refTable: "ads",
      refId: adId,
      detail: issueTopic,
    });
  },
});

/**
 * Bulk-resolve the SAFE subset of the attribution queue: an ad whose sponsor
 * bears the candidate's own name (both names, or surname + a "for <office>"
 * committee pattern) is unambiguously that campaign's own ad → attribute as
 * "support". Outside-group/attack ads never match this and stay open for human
 * judgment. Reads all open ad_match tasks at once (bounded ~hundreds).
 */
export const bulkConfirmOwnCommittee = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .filter((q) => q.eq(q.field("kind"), "ad_match"))
      .take(1000);

    let confirmed = 0;
    let leftForHuman = 0;
    for (const task of tasks) {
      const slug = task.note?.match(/suggested: ([a-z0-9-]+)/)?.[1];
      const adId = slug ? ctx.db.normalizeId("ads", task.refId) : null;
      const ad = adId ? await ctx.db.get(adId) : null;
      const cand = slug
        ? await ctx.db
            .query("candidates")
            .withIndex("by_slug_only", (q) => q.eq("slug", slug))
            .first()
        : null;
      if (!ad || !cand || !adId) {
        leftForHuman++;
        continue;
      }
      const parts = cand.name.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
      const hay = `${ad.pageOrCommittee} ${ad.fundingEntity ?? ""}`.toLowerCase();
      const first = parts[0];
      const last = parts[parts.length - 1];
      const committeeish =
        /\bfor (congress|governor|senate|assembly|wisconsin|lieutenant|attorney|state|us house|treasurer|secretary)\b/.test(
          hay,
        );
      const ownCommittee =
        !!last && hay.includes(last) && (!!first && hay.includes(first) || committeeish);
      if (!ownCommittee) {
        leftForHuman++;
        continue;
      }
      await ctx.db.patch(adId, {
        candidateSlug: cand.slug,
        raceId: cand.raceId,
        matchConfidence: 1,
        stance: "support",
      });
      await ctx.db.patch(task._id, { status: "resolved", resolvedAt: Date.now() });
      confirmed++;
    }
    return { confirmed, leftForHuman, scanned: tasks.length };
  },
});

/**
 * The biggest ads NOT attributed to any candidate — mostly issue ads / PACs
 * whose name doesn't contain a candidate (so they never got a review task), but
 * which a human may still want to attribute (e.g. "A Better Wisconsin Together"
 * → Tiffany, as an attack). Both platforms, biggest spenders first.
 */
export const unattributedAds = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // Bounded scan (admin-only). Grows with the ads table; paginate if it gets large.
    const all = await ctx.db.query("ads").collect();
    const un = all.filter((a) => a.candidateSlug === undefined);
    const top = un
      .sort((a, b) => (b.spendUpper ?? 0) - (a.spendUpper ?? 0))
      .slice(0, 60);
    const rows = [];
    for (const ad of top) rows.push({ ...ad, pdfUrl: await tvPdfUrl(ctx, ad) });
    return {
      rows,
      candidates: await candidatesWithOffice(ctx),
      unattributedCount: un.length,
    };
  },
});

/** Attribute an ad directly by id (for the unattributed reviewer — these ads
 * have no review task). Resolves any stray ad_match task for the ad too. */
export const attributeAd = mutation({
  args: {
    adId: v.id("ads"),
    candidateSlug: v.string(),
    stance: v.union(v.literal("support"), v.literal("oppose")),
  },
  handler: async (ctx, { adId, candidateSlug, stance }) => {
    await requireAdmin(ctx);
    const ad = await ctx.db.get(adId);
    if (!ad) throw new Error("ad not found");
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", candidateSlug))
      .first();
    if (!candidate) throw new Error(`candidate not found: ${candidateSlug}`);
    await ctx.db.patch(adId, {
      candidateSlug: candidate.slug,
      raceId: candidate.raceId,
      matchConfidence: 1,
      stance,
    });
    const openForAd = (
      await ctx.db
        .query("review_tasks")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .filter((q) => q.eq(q.field("kind"), "ad_match"))
        .collect()
    ).filter((t) => t.refId === adId);
    for (const t of openForAd) {
      await ctx.db.patch(t._id, { status: "resolved", resolvedAt: Date.now() });
    }
    await logAudit(ctx, {
      action: "ad:attributed",
      refTable: "ads",
      refId: adId,
      detail: `${candidate.slug} (${stance})`,
    });
  },
});

/** Approve or reject a proposed article source (human source-approval gate). */
export const decideArticleSource = mutation({
  args: {
    sourceId: v.id("article_sources"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { sourceId, decision }) => {
    await requireAdmin(ctx);
    const source = await ctx.db.get(sourceId);
    if (!source) throw new Error("article source not found");
    await ctx.db.patch(sourceId, { status: decision, decidedAt: Date.now() });
    await logAudit(ctx, {
      action: `source:${decision}`,
      refTable: "article_sources",
      refId: sourceId,
    });
  },
});
