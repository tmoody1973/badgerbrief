"use node";
/**
 * Read-only donor tools for the Voter Help agent (spec: 2026-08-07-donor-
 * explorer). Governance: read-only, same as every voterHelp tool. Donor
 * identity is exact-reported-name; multiple spellings return as separate
 * entries, never merged.
 *
 * NOT YET WIRED into voterHelp — deliberately dormant. Wiring + 3 golden
 * questions deferred until the eval gate's pre-existing flaky questions are
 * fixed (see task-8 report for the questions, the takeaways grounding fix,
 * and gate history).
 */
import { z } from "zod";
import { createTool } from "@convex-dev/agent";
import { api } from "./_generated/api";
import { withToolSpan } from "./lib/agentTelemetry";

const SITE = "https://badgerbrief.org";

const donorKeyFor = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const getCandidateDonors = createTool({
  description:
    'Look up who funds a candidate: the full donor roster for a state candidate by slug (e.g. "david-crowley"). Optionally filter by a donor-name search term or a category (individuals | party | union | pac | business | other). Returns top donors with exact totals, the coverage window, and the candidate page URL. Read-only. ALWAYS state the coverage window when quoting these numbers.',
  inputSchema: z.object({
    candidateSlug: z.string().describe('Candidate slug, e.g. "francesca-hong"'),
    searchTerm: z.string().optional().describe("Donor name to search within this candidate"),
    category: z
      .enum(["individuals", "party", "union", "pac", "business", "other"])
      .optional(),
  }),
  execute: async (ctx, { candidateSlug, searchTerm, category }): Promise<string> =>
    withToolSpan("getCandidateDonors", ctx.threadId, { candidateSlug, searchTerm, category }, async () => {
      const data = await ctx.runQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
      if (!data) return JSON.stringify({ error: "unknown candidate slug" });
      const raceId = data.candidate.raceId;
      const rows = searchTerm
        ? await ctx.runQuery(api.donors.searchRoster, { raceId, candidateSlug, term: searchTerm })
        : (
            await ctx.runQuery(api.donors.roster, {
              raceId,
              candidateSlug,
              paginationOpts: { cursor: null, numItems: 50 },
            })
          ).page;
      const filtered = rows.filter((d) => !category || d.category === category).slice(0, 15);
      const breakdown = data.financeBreakdowns.find((b) => b.source === "sunshine");
      return JSON.stringify({
        candidate: candidateSlug,
        candidateUrl: `${SITE}/candidates/${candidateSlug}`,
        coverage: filtered[0]?.coverageEndDate ?? rows[0]?.coverageEndDate ?? null,
        donors: filtered.map((d) => ({
          name: d.donorName,
          category: d.category,
          location: d.location ?? null,
          total: d.total,
          gifts: d.giftCount,
          donorUrl: `${SITE}/donors/${encodeURIComponent(d.donorKey)}`,
        })),
        takeaways: breakdown?.takeaways ?? [],
        note: 'Itemized state contributions only; names exactly as reported — the same person may appear under multiple spellings. Donations under $200 are itemized here too; "small donors" in takeaways means donors whose gifts total under $200.',
      });
    }),
});

export const getDonorProfile = createTool({
  description:
    'Look up a donor by name and see every tracked 2026 campaign they gave to, with totals and the donor page URL. Matches the exact reported name (multiple spellings return as separate donors — present them separately, never merge). Read-only. ALWAYS state the coverage window when quoting these numbers.',
  inputSchema: z.object({
    donorName: z.string().describe('Donor name as reported, e.g. "WEAC PAC" or "Diane Hendricks"'),
  }),
  execute: async (ctx, { donorName }): Promise<string> =>
    withToolSpan("getDonorProfile", ctx.threadId, { donorName }, async () => {
      const exact = await ctx.runQuery(api.donors.profile, { donorKey: donorKeyFor(donorName) });
      const near = exact ? [] : await ctx.runQuery(api.donors.searchDonors, { term: donorName });
      if (!exact && near.length === 0) {
        return JSON.stringify({ found: false, note: "No reported contributions under this name in BadgerBrief's tracked races." });
      }
      const profiles = exact
        ? [exact]
        : await Promise.all(
            [...new Set(near.map((d) => d.donorKey))].slice(0, 3).map((key) =>
              ctx.runQuery(api.donors.profile, { donorKey: key }),
            ),
          );
      return JSON.stringify({
        found: true,
        matches: profiles.filter(Boolean).map((p) => ({
          name: p!.donors[0].donorName,
          donorUrl: `${SITE}/donors/${encodeURIComponent(p!.donors[0].donorKey)}`,
          coverage: p!.donors[0].coverageEndDate ?? null,
          grandTotal: p!.grandTotal,
          byCandidate: p!.donors.map((d) => ({
            candidate: d.candidateSlug,
            candidateUrl: `${SITE}/candidates/${d.candidateSlug}`,
            total: d.total,
            gifts: d.giftCount,
          })),
        })),
        note: 'Separate spellings are separate entries — do not merge them. Donations under $200 are itemized here too; "small donors" in takeaways means donors whose gifts total under $200.',
      });
    }),
});
