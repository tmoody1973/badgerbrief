#!/usr/bin/env node
/**
 * Import cash-on-hand + debts for state candidates from Wisconsin Sunshine
 * report summaries (MOO-319). The transactions export has no balances; the
 * Sunshine site's own public tRPC API does: publicFrontendApi.getReports rows
 * embed reportSubmissions with calculatedEndBalance / calculatedEndDebtBalance.
 *
 * Usage: node scripts/import-sunshine-balances.mjs [--prod] [--period "2026 July Continuing"]
 *
 * Only committees with a verified `registrantId` in sunshine-committees.json
 * are imported (matched against committee.assignedCommitteeId — never by name
 * alone). Data source: campaignfinance.wi.gov, non-commercial use per
 * Wis. Stat. § 11.1304(12).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const periodIdx = args.indexOf("--period");
const PERIOD = periodIdx >= 0 ? args[periodIdx + 1] : "2026 July Continuing";

const mapping = JSON.parse(
  readFileSync(new URL("./sunshine-committees.json", import.meta.url), "utf8"),
);

const API = "https://campaignfinance.wi.gov/api/trpc/publicFrontendApi.getReports";

async function fetchReports(searchTerm) {
  const input = encodeURIComponent(
    JSON.stringify({
      json: {
        searchTerm,
        take: 20,
        skip: 0,
        sortBy: "latestSubmissionAt",
        sortDirection: "desc",
      },
    }),
  );
  const res = await fetch(`${API}?input=${input}`);
  if (!res.ok) throw new Error(`Sunshine API HTTP ${res.status} for "${searchTerm}"`);
  const data = await res.json();
  return data?.result?.data?.json?.results ?? [];
}

function run(fn, payload) {
  const argv = ["convex", "run", fn, JSON.stringify(payload), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

let imported = 0;
const skipped = [];
for (const [committee, match] of Object.entries(mapping)) {
  if (committee.startsWith("_") || !match.registrantId) continue;
  const rows = await fetchReports(committee);
  const report = rows.find(
    (r) =>
      r.reportTemplate?.name === PERIOD &&
      r.committee?.assignedCommitteeId === match.registrantId &&
      r.submitted,
  );
  if (!report) {
    skipped.push(`${committee}: no submitted "${PERIOD}" report for registrant ${match.registrantId}`);
    continue;
  }
  const submissions = [...(report.reportSubmissions ?? [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  const latest = submissions[0];
  if (!latest || latest.calculatedEndBalance === undefined) {
    skipped.push(`${committee}: report ${report.id} has no submission balances`);
    continue;
  }
  run("finance:upsertTotals", {
    candidateSlug: match.candidateSlug,
    raceId: match.raceId,
    source: "sunshine",
    cashOnHand: Math.round(latest.calculatedEndBalance * 100) / 100,
    debts: Math.round(latest.calculatedEndDebtBalance * 100) / 100,
  });
  console.log(
    `✓ ${committee} → ${match.candidateSlug}: cash $${latest.calculatedEndBalance.toLocaleString()}, ` +
      `debts $${latest.calculatedEndDebtBalance.toLocaleString()} (report ${report.id}, ` +
      `start $${latest.calculatedStartBalance.toLocaleString()})`,
  );
  imported++;
}

console.log(`\nImported balances for ${imported} committees.`);
for (const s of skipped) console.log(`⚠ ${s}`);
