import { fecCommitteeKind, leanFromParty, type SponsorLean } from "./sponsors";

export type OpenFecFacts = {
  fecCommitteeId?: string; kind?: string; lean?: SponsorLean;
  disclosesDonors: boolean; totalRaised?: number; totalSpent?: number;
  topDonors?: { name: string; amount: number }[];
  independentExpenditures?: { candidate: string; office?: string; supportOppose: "support" | "oppose"; amount: number }[];
  financialsAsOf?: string; sources: { label: string; url: string }[];
  /** Largest single-cycle receipts across the cycles fetched. Not displayed —
   * the decoy guard tests tracked spend against what a committee EVER raised. */
  peakReceipts?: number;
};

const OPENFEC = "https://api.open.fec.gov/v1";
const key = () => process.env.OPENFEC_API_KEY ?? "DEMO_KEY";

export function parseCommitteeTotals(json: unknown): Pick<
  OpenFecFacts,
  "totalRaised" | "totalSpent" | "financialsAsOf" | "peakReceipts"
> {
  const rows = (json as { results?: any[] }).results ?? [];
  const r = rows[0];
  if (!r) return {};
  // Displayed figures are the CURRENT cycle (what voters should see for "this
  // election's money"); peakReceipts is the committee's largest cycle across
  // the rows fetched — the decoy guard needs scale-ever, not scale-this-cycle.
  const receipts = rows.map((x) => x.receipts).filter((n) => typeof n === "number");
  return {
    totalRaised: typeof r.receipts === "number" ? r.receipts : undefined,
    totalSpent: typeof r.disbursements === "number" ? r.disbursements : undefined,
    financialsAsOf: typeof r.coverage_end_date === "string" ? r.coverage_end_date.slice(0, 10) : undefined,
    ...(receipts.length ? { peakReceipts: Math.max(...receipts) } : {}),
  };
}

/** Collapse FEC contributor-name variants of the same entity to one key:
 * drop punctuation and common corporate suffixes/articles so
 * "KOCH INDUSTRIES INC." and "KOCH INDUSTRIES INC" aggregate together. */
export function donorKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,&]/g, " ")
    .replace(/\b(inc|llc|l l c|corp|corporation|co|company|ltd|lp|l p|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Decoy-match guard: the biggest political ad spenders are often dark-money
// 501(c)(4)/527 groups that DON'T file as FEC PACs, so an FEC name-search can
// match a small, coincidentally same-named committee and publish its (wrong)
// facts. You can't spend more on ads than a committee ever raised, so when
// tracked ad spend dwarfs a name-matched committee's receipts, the match is
// implausible — hold the facts and flag for verification.
const FEC_MISMATCH_FACTOR = 2;
const FEC_MISMATCH_MIN_SPEND = 50_000;

/** True when a NAME-matched FEC committee is too small to be the real sponsor
 * (tracked ad spend far exceeds its receipts). Only applies to auto/name-search
 * matches — a reviewer-verified committee id is trusted regardless. */
export function isFecMatchImplausible(
  trackedAdSpend: number,
  committeeReceipts: number | undefined,
): boolean {
  if (committeeReceipts === undefined) return false;
  return (
    trackedAdSpend >= FEC_MISMATCH_MIN_SPEND &&
    trackedAdSpend > committeeReceipts * FEC_MISMATCH_FACTOR
  );
}

export function parseTopDonors(json: unknown, limit = 10) {
  const rows = (json as { results?: any[] }).results ?? [];
  const by = new Map<string, { name: string; amount: number }>();
  for (const r of rows) {
    const name = String(r.contributor_name ?? "").trim();
    const amount = Number(r.contribution_receipt_amount ?? 0);
    if (!name || amount <= 0) continue;
    const key = donorKey(name) || name.toLowerCase();
    const cur = by.get(key) ?? { name, amount: 0 };
    cur.amount += amount;
    // Keep the fullest variant as the display name (most informative).
    if (name.length > cur.name.length) cur.name = name;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export function parseIndependentExpenditures(json: unknown, limit = 10): OpenFecFacts["independentExpenditures"] {
  const rows = (json as { results?: any[] }).results ?? [];
  const by = new Map<string, { candidate: string; office?: string; supportOppose: "support" | "oppose"; amount: number }>();
  for (const r of rows) {
    const candidate = String(r.candidate_name ?? "").trim();
    if (!candidate) continue;
    const supportOppose = String(r.support_oppose_indicator ?? "").toUpperCase() === "S" ? "support" : "oppose";
    const office = r.candidate_office ? String(r.candidate_office) : undefined;
    const k = `${candidate}|${supportOppose}`;
    const cur = by.get(k) ?? { candidate, office, supportOppose, amount: 0 };
    cur.amount += Number(r.expenditure_amount ?? 0);
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) return { results: [] };
  return res.json();
}

/** Fetch all OpenFEC exact facts for a known committee id. */
export async function fetchOpenFecFacts(fecCommitteeId: string): Promise<OpenFecFacts> {
  const k = key();
  const [committee, totals, scheduleA, scheduleE] = await Promise.all([
    getJson(`${OPENFEC}/committee/${encodeURIComponent(fecCommitteeId)}/?api_key=${k}`),
    getJson(`${OPENFEC}/committee/${encodeURIComponent(fecCommitteeId)}/totals/?api_key=${k}&per_page=3&sort=-cycle`),
    getJson(`${OPENFEC}/schedules/schedule_a/?committee_id=${fecCommitteeId}&api_key=${k}&per_page=10&sort=-contribution_receipt_amount`),
    getJson(`${OPENFEC}/schedules/schedule_e/?committee_id=${fecCommitteeId}&api_key=${k}&per_page=100&sort=-expenditure_amount`),
  ]);
  const c = (committee as { results?: any[] }).results?.[0];
  const { kind } = fecCommitteeKind(c?.committee_type);
  return {
    fecCommitteeId,
    kind: c ? kind : undefined,
    lean: leanFromParty(c?.party),
    disclosesDonors: true,
    ...parseCommitteeTotals(totals),
    topDonors: parseTopDonors(scheduleA),
    independentExpenditures: parseIndependentExpenditures(scheduleE),
    sources: [{ label: "fec.gov", url: `https://www.fec.gov/data/committee/${fecCommitteeId}/` }],
  };
}
