#!/usr/bin/env node
/**
 * Second-hop money tracing (MOO-320): pull a committee's own receipts from the
 * Wisconsin Sunshine tRPC API and store its top funding sources, so candidate
 * pages can show where a big committee donor's money comes from.
 *
 * Usage: node scripts/import-committee-funding.mjs [--prod] [--since 2026-01-01]
 *
 * Committees are traced ONLY from the explicit registry below (verified
 * Sunshine entity ids — never matched by name). The registry key must equal
 * the contributor name exactly as it appears in our `contributions` rows.
 * Data source: campaignfinance.wi.gov, non-commercial use per
 * Wis. Stat. § 11.1304(12).
 */
import { execFileSync } from "node:child_process";

// committeeName (as it appears in contributions.contributorName) → entity id,
// verified via entity.searchEntities + the Sunshine UI.
const REGISTRY = {
  "Republican Party of Wisconsin": 16896,
};

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const sinceIdx = args.indexOf("--since");
const SINCE = sinceIdx >= 0 ? args[sinceIdx + 1] : "2026-01-01";
const TOP_N = 10;
const API =
  "https://campaignfinance.wi.gov/api/trpc/publicFrontendApi.getTransactions";

async function fetchPage(entityId, skip, take) {
  const input = encodeURIComponent(
    JSON.stringify({
      json: {
        createdByEntityId: [entityId],
        take,
        skip,
        sortBy: "date",
        sortDirection: "desc",
      },
    }),
  );
  const res = await fetch(`${API}?input=${input}`);
  if (!res.ok) throw new Error(`Sunshine API HTTP ${res.status} (skip=${skip})`);
  const data = await res.json();
  return data?.result?.data?.json?.results ?? [];
}

function run(fn, payload) {
  const argv = ["convex", "run", fn, JSON.stringify(payload), "--typecheck", "disable"];
  if (PROD) argv.push("--prod");
  return execFileSync("npx", argv, { stdio: ["ignore", "pipe", "inherit"] }).toString();
}

for (const [committeeName, entityId] of Object.entries(REGISTRY)) {
  const sources = new Map();
  let receiptsTotal = 0;
  let receiptsCount = 0;
  let skip = 0;
  let done = false;
  while (!done && skip < 60000) {
    const rows = await fetchPage(entityId, skip, 500);
    if (rows.length === 0) break;
    for (const t of rows) {
      if ((t.date ?? "") < SINCE) {
        done = true;
        break;
      }
      if (t.transactionType?.name !== "Contribution") continue;
      const from = t.from_entity;
      const name = (
        from?.name ||
        [from?.firstName, from?.lastName].filter(Boolean).join(" ")
      ).trim();
      if (!name) continue;
      const e = sources.get(name) ?? {
        amount: 0,
        count: 0,
        entityType: from?.entityType?.name || undefined,
      };
      e.amount += t.amount;
      e.count++;
      sources.set(name, e);
      receiptsTotal += t.amount;
      receiptsCount++;
    }
    skip += 500;
  }
  const topSources = [...sources.entries()]
    .map(([name, e]) => ({
      name,
      entityType: e.entityType,
      amount: Math.round(e.amount * 100) / 100,
      count: e.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_N);

  run("finance:upsertCommitteeFunding", {
    committeeName,
    sunshineEntityId: entityId,
    periodStart: SINCE,
    periodLabel: `since Jan 1, 2026`,
    receiptsTotal: Math.round(receiptsTotal * 100) / 100,
    receiptsCount,
    topSources,
    sourceNote:
      "WI Ethics Commission (Sunshine) filings, campaignfinance.wi.gov",
  });
  console.log(
    `✓ ${committeeName} (entity ${entityId}): $${Math.round(receiptsTotal).toLocaleString()} across ${receiptsCount} receipts; top: ${topSources
      .slice(0, 3)
      .map((s) => `${s.name} $${Math.round(s.amount).toLocaleString()}`)
      .join(", ")}`,
  );
}
