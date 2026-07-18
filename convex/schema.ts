import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** {name, url} pair — the atomic citation unit used across all civic tables. */
export const sourceLink = v.object({
  name: v.string(),
  url: v.string(),
});

const reviewStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const stanceLabel = v.union(
  v.literal("support"),
  v.literal("oppose"),
  v.literal("mixed"),
  v.literal("evolving"),
  v.literal("unclear"),
);

export default defineSchema({
  // ---------- users & personalization ----------
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  }).index("by_clerk_id", ["clerkId"]),

  user_preferences: defineTable({
    userId: v.id("users"),
    address: v.optional(v.string()),
    congressionalDistrict: v.optional(v.string()),
    stateSenateDistrict: v.optional(v.string()),
    stateAssemblyDistrict: v.optional(v.string()),
    savedRaceIds: v.array(v.string()),
    savedIssues: v.array(v.string()),
    detailLevel: v.union(
      v.literal("short"),
      v.literal("standard"),
      v.literal("deep"),
    ),
  }).index("by_user", ["userId"]),

  voter_briefs: defineTable({
    userId: v.id("users"),
    electionSlug: v.string(),
    openuiSource: v.string(), // OpenUI Lang — components reference entity IDs
    generatedAt: v.number(),
    traceId: v.optional(v.string()), // Arize trace for provenance
  }).index("by_user", ["userId"]),

  // ---------- civic core (seeded from docs/wisconsin_2026_primary_elections.json) ----------
  elections: defineTable({
    slug: v.string(), // e.g. "wi-2026"
    state: v.string(),
    cycle: v.string(),
    primaryDate: v.string(),
    generalDate: v.string(),
    springPrimaryDate: v.optional(v.string()),
    springGeneralDate: v.optional(v.string()),
    filingDeadline: v.optional(v.string()),
    primaryType: v.optional(v.string()),
    dataAsOf: v.string(),
  }).index("by_slug", ["slug"]),

  races: defineTable({
    raceId: v.string(), // e.g. "WI-GOV-2026" — natural key from seed data
    electionSlug: v.string(),
    office: v.string(),
    level: v.string(), // Federal | State Executive | State Judicial | State Legislative
    primaryDate: v.optional(v.string()),
    generalDate: v.optional(v.string()),
    electionType: v.optional(v.string()),
    incumbent: v.optional(v.string()),
    seatHeldBy: v.optional(v.string()),
    officeDescription: v.optional(v.string()),
    districtDescription: v.optional(v.string()),
    notes: v.optional(v.string()),
    seatsUp: v.optional(v.number()),
    // display-only heterogeneous blobs from the seed — rendered, never computed on
    raceRating: v.optional(v.record(v.string(), v.string())),
    currentComposition: v.optional(v.any()),
    competitiveSeatsToWatch: v.optional(v.any()),
    districts: v.optional(v.any()),
    campaignFinanceInfo: v.optional(v.any()),
    sources: v.array(sourceLink),
    dataAsOf: v.string(),
  }).index("by_race_id", ["raceId"]),

  candidates: defineTable({
    slug: v.string(), // kebab-case name — natural key within a race
    raceId: v.string(),
    name: v.string(),
    party: v.optional(v.string()),
    primaryParty: v.optional(v.string()), // which party primary they appear in
    status: v.optional(v.string()),
    incumbent: v.optional(v.boolean()),
    background: v.optional(v.string()),
    currentOccupation: v.optional(v.string()),
    keyPriorities: v.optional(v.array(v.string())),
    notableEndorsements: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    fecCandidateId: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    photoSource: v.optional(v.string()),
    socialMedia: v.optional(v.record(v.string(), v.string())),
    campaignFinanceInfo: v.optional(v.any()),
    sources: v.array(sourceLink),
    dataAsOf: v.string(),
  })
    .index("by_race", ["raceId"])
    .index("by_slug", ["raceId", "slug"])
    .index("by_slug_only", ["slug"])
    .index("by_fec_id", ["fecCandidateId"]),

  sources: defineTable({
    url: v.string(),
    name: v.string(),
    kind: v.union(
      v.literal("official"),
      v.literal("campaign"),
      v.literal("reported"),
      v.literal("ad-library"),
      v.literal("reference"),
    ),
    firstSeenAt: v.number(),
    lastFetchedAt: v.optional(v.number()),
  }).index("by_url", ["url"]),

  voting_info: defineTable({
    electionSlug: v.string(),
    primaryDate: v.string(),
    pollsOpen: v.optional(v.string()),
    pollsClose: v.optional(v.string()),
    timezone: v.optional(v.string()),
    voterRegistration: v.optional(v.any()),
    absenteeRequestDeadline: v.optional(v.any()),
    absenteeReturnDeadline: v.optional(v.any()),
    earlyVoting: v.optional(v.any()),
    voterIdRequired: v.optional(v.boolean()),
    photoIdRequired: v.optional(v.boolean()),
    officialVoterInfoUrl: v.string(), // publish gate: official source required
    officialGuideUrl: v.optional(v.string()),
    sources: v.array(sourceLink),
    lastCheckedAt: v.number(), // publish gate: freshness required
  }).index("by_election", ["electionSlug"]),

  // ---------- finance ----------
  finance_totals: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    source: v.union(v.literal("openfec"), v.literal("sunshine")),
    receipts: v.optional(v.number()),
    disbursements: v.optional(v.number()),
    cashOnHand: v.optional(v.number()),
    debts: v.optional(v.number()),
    coverageEndDate: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_candidate", ["raceId", "candidateSlug"]),

  contributions: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    source: v.union(v.literal("openfec"), v.literal("sunshine")),
    contributorName: v.string(),
    contributorLocation: v.optional(v.string()),
    amount: v.number(),
    date: v.optional(v.string()),
    committee: v.optional(v.string()),
  }).index("by_candidate", ["raceId", "candidateSlug"]),

  // ---------- ads (Meta in M1; Google via same tables in M2) ----------
  ads: defineTable({
    platform: v.union(v.literal("meta"), v.literal("google")),
    platformAdId: v.string(),
    pageOrCommittee: v.string(),
    candidateSlug: v.optional(v.string()),
    raceId: v.optional(v.string()),
    matchConfidence: v.optional(v.number()), // below threshold → review_tasks, not public
    creativeText: v.optional(v.string()),
    creativeLinkUrl: v.optional(v.string()),
    snapshotUrl: v.optional(v.string()),
    fundingEntity: v.optional(v.string()),
    status: v.optional(v.string()),
    spendLower: v.optional(v.number()),
    spendUpper: v.optional(v.number()),
    impressionsLower: v.optional(v.number()),
    impressionsUpper: v.optional(v.number()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_platform_ad", ["platform", "platformAdId"])
    .index("by_candidate", ["raceId", "candidateSlug"]),

  ad_metrics_daily: defineTable({
    platform: v.union(v.literal("meta"), v.literal("google")),
    platformAdId: v.string(),
    date: v.string(), // YYYY-MM-DD snapshot day
    spendLower: v.optional(v.number()),
    spendUpper: v.optional(v.number()),
    impressionsLower: v.optional(v.number()),
    impressionsUpper: v.optional(v.number()),
  }).index("by_ad_date", ["platform", "platformAdId", "date"]),

  // ---------- intelligence: drafts (agent-writable) vs published (gated) ----------
  candidate_positions_drafts: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    issueSlug: v.string(),
    stance: stanceLabel,
    summary: v.string(),
    confidence: v.number(),
    sources: v.array(sourceLink),
    reviewStatus: reviewStatus,
    reviewerNote: v.optional(v.string()),
    extractedAt: v.number(),
    traceId: v.optional(v.string()),
  }).index("by_candidate_issue", ["raceId", "candidateSlug", "issueSlug"]),

  candidate_positions_published: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    issueSlug: v.string(),
    stance: stanceLabel,
    summary: v.string(),
    confidence: v.number(),
    sources: v.array(sourceLink),
    draftId: v.id("candidate_positions_drafts"),
    publishedAt: v.number(),
    lastReviewedAt: v.number(),
  }).index("by_candidate_issue", ["raceId", "candidateSlug", "issueSlug"]),

  quote_drafts: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    speaker: v.string(),
    text: v.string(),
    context: v.optional(v.string()),
    outlet: v.optional(v.string()),
    date: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    reviewStatus: reviewStatus,
    extractedAt: v.number(),
    traceId: v.optional(v.string()),
  }).index("by_candidate", ["raceId", "candidateSlug"]),

  quote_published: defineTable({
    candidateSlug: v.string(),
    raceId: v.string(),
    speaker: v.string(),
    text: v.string(),
    context: v.string(),
    outlet: v.optional(v.string()),
    date: v.string(),
    sourceUrl: v.string(),
    draftId: v.id("quote_drafts"),
    publishedAt: v.number(),
  }).index("by_candidate", ["raceId", "candidateSlug"]),

  // ---------- workflow ----------
  review_tasks: defineTable({
    kind: v.union(
      v.literal("position"),
      v.literal("quote"),
      v.literal("ad_match"),
      v.literal("other"),
    ),
    refTable: v.string(),
    refId: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    qaScores: v.optional(v.any()),
    note: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),

  source_fetch_logs: defineTable({
    url: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")),
    httpStatus: v.optional(v.number()),
    contentHash: v.optional(v.string()),
    error: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_url", ["url"]),

  alerts: defineTable({
    kind: v.string(), // staleness | source_change | sync_failure | eval_regression | ...
    message: v.string(),
    refTable: v.optional(v.string()),
    refId: v.optional(v.string()),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical"),
    ),
    resolved: v.boolean(),
    createdAt: v.number(),
  }).index("by_resolved", ["resolved"]),
});
