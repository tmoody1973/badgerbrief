import { SponsorLink } from "@/components/guide/sponsor-link";
import { StanceTag } from "@/components/guide/race-tv-ads";
import { groupCandidateAds } from "@/lib/candidate-ads";
import type { Doc } from "../../../convex/_generated/dataModel";

/**
 * Ads a human confirmed are about this candidate (MOO-309), one row per
 * sponsor as the race page groups TV orders (Phase 1b: Tiffany's page had 95
 * ad cards). Only attributed ads (candidateSlug set) reach here, so nothing
 * unverified appears. Stance tags match the race page: no red, no blue.
 */

const STAMP = "font-mono text-xs uppercase tracking-widest";

/** Biggest sponsors shown before the fold. */
const FIRST_SPONSORS = 5;

const f = (n: number) => `$${n.toLocaleString()}`;

function spendRange(lo?: number, hi?: number): string {
  if (lo === undefined && hi === undefined) return "spend not disclosed";
  if (lo !== undefined && hi !== undefined) return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
  return hi !== undefined ? `up to ${f(hi)}` : `${f(lo!)}+`;
}

export function CandidateAds({
  ads,
  candidateName,
  enrichedKeys,
}: {
  ads: Doc<"ads">[];
  candidateName: string;
  enrichedKeys: string[];
}) {
  if (ads.length === 0) return null;
  const groups = groupCandidateAds(ads);
  const row = (g: (typeof groups)[number]) => (
          <li key={g.key} className="border-b-2 border-dashed border-border py-4 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h3 className="font-bold leading-snug">
                  <SponsorLink name={g.sponsor} enrichedKeys={enrichedKeys} />
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StanceTag stance={g.stance} target={candidateName} />
                  <span className={`${STAMP} text-muted-foreground`}>
                    {g.ads.length} ad{g.ads.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold">{spendRange(g.spendLower, g.spendUpper)}</span>
            </div>
            <details className="mt-3">
              <summary className={`flex min-h-11 cursor-pointer items-center ${STAMP} font-bold text-muted-foreground`}>
                See the {g.ads.length} ad{g.ads.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-3 text-sm">
                {g.ads.map((ad) => (
                  <li key={ad._id}>
                    {ad.creativeText && <p className="line-clamp-3 max-w-[60ch]">{ad.creativeText}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted-foreground">
                      {g.stance === undefined && ad.stance && <span>{ad.stance === "oppose" ? "Attack" : "Support"}</span>}
                      <span>{spendRange(ad.spendLower, ad.spendUpper)}</span>
                      {ad.fundingEntity && ad.fundingEntity !== ad.pageOrCommittee && <span>Paid for by {ad.fundingEntity}</span>}
                      {ad.snapshotUrl && (
                        <a href={ad.snapshotUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold text-foreground underline decoration-2 underline-offset-2">
                          View ad on Meta<span aria-hidden="true"> ↗</span>
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          </li>

  );

  return (
    <section id="ads" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Political ads about {candidateName}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ads a BadgerBrief editor confirmed are about {candidateName}, from the Meta Ad Library. Spend is the
        range Meta discloses.
      </p>
      <p className={`mt-2 ${STAMP} text-muted-foreground`}>
        {ads.length} ad{ads.length === 1 ? "" : "s"} from {groups.length} sponsor{groups.length === 1 ? "" : "s"}
      </p>

      <ul className="mt-3 border-y-2 border-border">{groups.slice(0, FIRST_SPONSORS).map(row)}</ul>
      {groups.length > FIRST_SPONSORS && (
        <details className="mt-1">
          <summary className={`flex min-h-11 cursor-pointer items-center ${STAMP} font-bold text-muted-foreground`}>
            All {groups.length} sponsors
          </summary>
          <ul className="border-b-2 border-border">{groups.slice(FIRST_SPONSORS).map(row)}</ul>
        </details>
      )}
    </section>
  );
}
