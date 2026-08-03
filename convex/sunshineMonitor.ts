"use node";
/**
 * Staleness monitor for Wisconsin Sunshine (state) campaign finance.
 *
 * The Sunshine import is manual (scripts/import-sunshine*.mjs) and the weekly
 * completeness audit (finance.financeGapAlert) only catches MISSING data, not
 * STALE data. So when a committee files a new periodic report (e.g. the Fall
 * Pre-Primary covering July) nothing flags that our ingested totals are now
 * behind. This action closes that gap: it asks the live WI CFIS API for each
 * tracked committee's newest PERIODIC report and, if that report's period ends
 * after the coverage we hold, emails the editor to re-run the import.
 *
 * Read-only against prod data + a public API; the only side effect is the email.
 */
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { latestPeriodicReport, isBehind } from "./lib/sunshineStale";

const API = "https://campaignfinance.wi.gov/api/trpc/publicFrontendApi.getReports";
const UA = "BadgerBrief/1.0 (nonpartisan voter guide; +https://badgerbrief.org)";

// ponytail: mirror of scripts/sunshine-committees.json (searchTerm + registrantId
// per tracked state committee). Embedded because a Convex action can't read the
// scripts/ file at runtime; keep in sync when committees are added. A missing
// entry only means that committee isn't watched — never wrong data.
const COMMITTEES: { searchTerm: string; registrantId: string; candidateSlug: string; raceId: string }[] = [
  { searchTerm: "Josh Schoemann for Governor", registrantId: "0106916", candidateSlug: "josh-schoemann", raceId: "WI-GOV-2026" },
  { searchTerm: "Sara Rodriguez For Wisconsin", registrantId: "0106263", candidateSlug: "sara-rodriguez", raceId: "WI-GOV-2026" },
  { searchTerm: "Ryan Strnad for Governor", registrantId: "0103889", candidateSlug: "ryan-strnad", raceId: "WI-GOV-2026" },
  { searchTerm: "Kaul for Attorney General", registrantId: "0105879", candidateSlug: "josh-kaul", raceId: "WI-AG-2026" },
  { searchTerm: "Pete for Wisconsin", registrantId: "0105008", candidateSlug: "pete-karas", raceId: "WI-SOS-2026" },
  { searchTerm: "Friends of John Leiber", registrantId: "0106014", candidateSlug: "john-leiber", raceId: "WI-TREAS-2026" },
  { searchTerm: "Sarah for Wisconsin", registrantId: "0105995", candidateSlug: "sarah-godlewski", raceId: "WI-LTGOV-2026" },
  { searchTerm: "Friends of Kelda Roys", registrantId: "0104606", candidateSlug: "kelda-roys", raceId: "WI-GOV-2026" },
  { searchTerm: "Crowley for Wisconsin", registrantId: "0105751", candidateSlug: "david-crowley", raceId: "WI-GOV-2026" },
  { searchTerm: "Tiffany for Wisconsin", registrantId: "0104212", candidateSlug: "tom-tiffany", raceId: "WI-GOV-2026" },
  { searchTerm: "Brennan for Wisconsin", registrantId: "01072615", candidateSlug: "joel-brennan", raceId: "WI-GOV-2026" },
  { searchTerm: "Missy For Governor", registrantId: "01072544", candidateSlug: "missy-hughes", raceId: "WI-GOV-2026" },
  { searchTerm: "Mandela for Wisconsin", registrantId: "0105266", candidateSlug: "mandela-barnes", raceId: "WI-GOV-2026" },
  { searchTerm: "Friends of Francesca Hong", registrantId: "0106285", candidateSlug: "francesca-hong", raceId: "WI-GOV-2026" },
];

async function fetchReports(searchTerm: string): Promise<unknown[]> {
  const input = encodeURIComponent(
    JSON.stringify({ json: { searchTerm, take: 30, skip: 0, sortBy: "latestSubmissionAt", sortDirection: "desc" } }),
  );
  try {
    const res = await fetch(`${API}?input=${input}`, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: { data?: { json?: { results?: unknown[] } } } };
    return data?.result?.data?.json?.results ?? [];
  } catch {
    return [];
  }
}

export const checkStaleness = internalAction({
  args: {},
  handler: async (ctx): Promise<{ behind: number; alerted: boolean }> => {
    const coverage = await ctx.runQuery(internal.finance.sunshineCoverage, {});
    const covByCand = new Map(coverage.map((c) => [c.candidateSlug, c.coverageEndDate]));

    const behind: string[] = [];
    for (const c of COMMITTEES) {
      const reports = await fetchReports(c.searchTerm);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest = latestPeriodicReport(reports as any, c.registrantId);
      if (!latest) continue;
      const have = covByCand.get(c.candidateSlug);
      if (isBehind(latest.end, have)) {
        behind.push(
          `• ${c.raceId} / ${c.candidateSlug}: "${latest.name}" (period ends ${latest.end}) is filed; ` +
            `we hold "${have ?? "nothing"}"`,
        );
      }
    }

    if (behind.length === 0) return { behind: 0, alerted: false };
    await ctx.runAction(internal.feedback.notify, {
      kind: "data_gap",
      message:
        `${behind.length} WI committee(s) have a newer report filed than what's ingested:\n\n` +
        `${behind.join("\n")}\n\n` +
        `Re-run: node scripts/import-sunshine-balances.mjs --prod --period "<report name>" ` +
        `(cash-on-hand) and node scripts/import-sunshine.mjs <export.csv> --prod ` +
        `--coverage "<period>" (receipts, needs a fresh transactions CSV export).`,
    });
    return { behind: behind.length, alerted: true };
  },
});
