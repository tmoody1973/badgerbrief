#!/usr/bin/env node
// Fetch WI Sunshine transactions via the public tRPC API (publicFrontendApi.
// getTransactions) and emit a CSV compatible with import-sunshine.mjs — no
// manual "Browse Data → Download Results" export needed.
// Usage: node fetch-sunshine.mjs <output.csv> [--dateFrom 2026-01-01] [--dateTo 2026-08-03] [--only slug]
//
// Established convention (matches the Aug 2026 prod data): dateFrom 2026-01-01,
// dateTo = end of newest filed report period, then:
//   node scripts/import-sunshine.mjs <csv> --prod --coverage "filings through <dateTo>"
// Known source gaps (verified Aug 2026): Crowley's 2026 January Continuing
// (~$600k raised Jul–Dec 2025, balance $430 → $602k) has NO itemized
// transactions in the new CFIS browse data, so cycle-wide (2025+) sums
// understate him vs opponents. 72-hour-report contributions (post-period,
// ≥$1k) DO appear as transactions; watch for double-counting once the next
// periodic report re-itemizes them.
// Data source: campaignfinance.wi.gov, non-commercial use per Wis. Stat. § 11.1304(12).
import { readFileSync, writeFileSync } from "node:fs";

const MAPPING_PATH = new URL("./sunshine-committees.json", import.meta.url).pathname;
const API = "https://campaignfinance.wi.gov/api/trpc/publicFrontendApi";
const UA = "BadgerBrief/1.0 (nonpartisan voter guide; +https://badgerbrief.org)";

const args = process.argv.slice(2);
const outPath = args.find((a) => !a.startsWith("--"));
const dateToIdx = args.indexOf("--dateTo");
const dateTo = dateToIdx >= 0 ? args[dateToIdx + 1] : null;
const dateFromIdx = args.indexOf("--dateFrom");
const dateFrom = dateFromIdx >= 0 ? args[dateFromIdx + 1] : null;
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (!outPath) {
  console.error("Usage: node fetch-sunshine.mjs <output.csv> [--dateTo YYYY-MM-DD] [--only slug]");
  process.exit(2);
}

async function trpc(proc, json) {
  const input = encodeURIComponent(JSON.stringify({ json }));
  const res = await fetch(`${API}.${proc}?input=${input}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${proc} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.result?.data?.json;
}

// Committee name -> {candidateSlug, raceId, registrantId} (only entries with a
// verified registrantId are fetched; the rest are alt names of the same committees).
const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8"));
const committees = Object.entries(mapping)
  .filter(([k, v]) => k !== "_comment" && v.registrantId)
  .filter(([, v]) => !only || v.candidateSlug === only);

// Resolve each committee's numeric entity id (createdByEntityId), matched
// STRICTLY on committee.assignedCommitteeId — never by name. Primary path:
// find one of the committee's own reports, then read createdByEntityId off a
// transaction linked to it. Fallback: scan recent search-matched transactions.
async function resolveEntityId(name, registrantId) {
  const { results: reports = [] } = (await trpc("getReports", {
    searchTerm: name,
    take: 30,
    skip: 0,
    sortBy: "latestSubmissionAt",
    sortDirection: "desc",
  })) ?? {};
  for (const r of reports) {
    if (r?.committee?.assignedCommitteeId !== registrantId) continue;
    const { results: txns = [] } = (await trpc("getTransactions", {
      reportId: [r.id],
      take: 1,
      skip: 0,
      sortBy: "date",
      sortDirection: "desc",
    })) ?? {};
    if (txns[0]?.createdByEntityId) return txns[0].createdByEntityId;
  }
  for (let skip = 0; skip < 500; skip += 100) {
    const { results = [] } = (await trpc("getTransactions", {
      searchTerm: name,
      take: 100,
      skip,
      sortBy: "date",
      sortDirection: "desc",
    })) ?? {};
    for (const r of results) {
      if (r?.createdByEntity?.committee?.assignedCommitteeId === registrantId) {
        return r.createdByEntityId;
      }
    }
    if (results.length < 100) break;
  }
  return null;
}

function csvEscape(s) {
  const v = String(s ?? "");
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const HEADERS = [
  "ID",
  "Transaction Date",
  "Amount",
  "Registrant Name",
  "Transaction Type",
  "Contributor Name",
  "Contributor Entity Type",
  "Contributor City",
  "Contributor State",
  "Related Ballot Event Name",
];

const rows = [HEADERS.join(",")];
const summary = [];
for (const [name, meta] of committees) {
  const entityId = await resolveEntityId(name, meta.registrantId);
  if (!entityId) {
    console.error(`!! could not resolve entityId for ${name} (${meta.registrantId}) — SKIPPED`);
    continue;
  }
  let skip = 0;
  const take = 500;
  let fetched = 0;
  let receipts = 0;
  let disb = 0;
  let maxDate = "";
  for (;;) {
    const params = {
      createdByEntityId: [entityId],
      take,
      skip,
      sortBy: "date",
      sortDirection: "asc",
    };
    if (dateTo) params.dateTo = dateTo;
    if (dateFrom) params.dateFrom = dateFrom;
    const { results = [] } = (await trpc("getTransactions", params)) ?? {};
    for (const t of results) {
      const reportedBy = t?.createdByEntity?.committee?.assignedCommitteeId;
      if (reportedBy !== meta.registrantId) continue; // strict: only this committee's own reports
      const type = t?.transactionType?.name ?? "";
      const dir = t?.transactionType?.direction ?? "";
      const date = (t?.date ?? "").slice(0, 10);
      if (dateTo && date > dateTo) continue;
      // Mirror aggregateSunshine's classification so the validation summary
      // matches what import-sunshine.mjs will compute from this CSV.
      const isIn = /contribution|receipt/i.test(type);
      const isOut = /disbursement|expenditure/i.test(type);
      if (isIn) receipts += t.amount ?? 0;
      else if (isOut) disb += t.amount ?? 0;
      if (date > maxDate) maxDate = date;
      rows.push(
        [
          t.id,
          date,
          t.amount ?? 0,
          name,
          type,
          t?.from_entity?.name ?? "",
          t?.from_entity?.entityType?.name ?? "",
          t?.from_entity?.entityContactProfiles?.[0]?.city ?? "",
          t?.from_entity?.entityContactProfiles?.[0]?.state ?? "",
          t?.relatedEvent?.name ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
      fetched++;
    }
    if (results.length < take) break;
    skip += take;
    if (skip > 60000) throw new Error(`runaway pagination for ${name}`);
  }
  summary.push({ name, entityId, fetched, receipts: Math.round(receipts * 100) / 100, disbursements: Math.round(disb * 100) / 100, maxDate });
  console.error(`${name}: ${fetched} txns, receipts=${receipts.toFixed(2)}, disb=${disb.toFixed(2)}, latest=${maxDate}`);
}

writeFileSync(outPath, rows.join("\n") + "\n");
console.error(`wrote ${rows.length - 1} rows -> ${outPath}`);
console.log(JSON.stringify(summary, null, 2));
