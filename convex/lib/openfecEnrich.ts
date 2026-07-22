import { fecCommitteeKind, leanFromParty, type SponsorLean } from "./sponsors";

export type OpenFecFacts = {
  fecCommitteeId?: string; kind?: string; lean?: SponsorLean;
  disclosesDonors: boolean; totalRaised?: number; totalSpent?: number;
  topDonors?: { name: string; amount: number }[];
  independentExpenditures?: { candidate: string; office?: string; supportOppose: "support" | "oppose"; amount: number }[];
  financialsAsOf?: string; sources: { label: string; url: string }[];
};

const OPENFEC = "https://api.open.fec.gov/v1";
const key = () => process.env.OPENFEC_API_KEY ?? "DEMO_KEY";

export function parseCommitteeTotals(json: unknown) {
  const r = (json as { results?: any[] }).results?.[0];
  if (!r) return {};
  return {
    totalRaised: typeof r.receipts === "number" ? r.receipts : undefined,
    totalSpent: typeof r.disbursements === "number" ? r.disbursements : undefined,
    financialsAsOf: typeof r.coverage_end_date === "string" ? r.coverage_end_date.slice(0, 10) : undefined,
  };
}

export function parseTopDonors(json: unknown, limit = 10) {
  const rows = (json as { results?: any[] }).results ?? [];
  return rows
    .map((r) => ({ name: String(r.contributor_name ?? "").trim(), amount: Number(r.contribution_receipt_amount ?? 0) }))
    .filter((d) => d.name && d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
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
    getJson(`${OPENFEC}/committee/${encodeURIComponent(fecCommitteeId)}/totals/?api_key=${k}&per_page=1&sort=-cycle`),
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
