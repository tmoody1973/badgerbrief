import Link from "next/link";
import { raceIdToSlug } from "@/lib/site";

/**
 * The race a candidate is actually running in — opponents, incumbent, dates.
 *
 * WHY THIS EXISTS. Importing every candidate on the ballot from the WEC list
 * created ~220 pages carrying nothing but a name and a party: no positions, no
 * quotes, no finance, no votes. As pages they were close to empty, and a mass
 * of near-identical stubs is assessed site-wide — it can drag down the pages
 * that did the work.
 *
 * The fix is not to hide them. A voter guide that omits a name on the ballot
 * has failed at its one job, and every one of these people IS on the ballot.
 * The fix is that a page about a candidate should answer the question a voter
 * actually arrives with — "who am I choosing between?" — which is answerable
 * for every candidate from data already held, and differs for each of the 116
 * districts.
 *
 * It also links the incumbent's voting record, which is the most defensible
 * thing on the site: 3,000+ roll calls parsed and reconciled per legislator,
 * available nowhere else in this form. A challenger's page is exactly where a
 * voter wants it.
 */
type Opponent = {
  slug: string;
  name: string;
  party?: string;
  incumbent?: boolean;
  status?: string;
  hasRecord?: boolean;
};

const isOnBallot = (status?: string) => (status ?? "Active") === "Active";

const meta =
  "font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground";

export function BallotContext({
  candidateSlug,
  candidateName,
  raceId,
  raceOffice,
  primaryDate,
  opponents,
}: {
  candidateSlug: string;
  candidateName: string;
  raceId: string;
  raceOffice: string;
  primaryDate?: string;
  opponents: Opponent[];
}) {
  const others = opponents.filter((o) => o.slug !== candidateSlug && isOnBallot(o.status));
  const incumbent = opponents.find((o) => o.incumbent && o.slug !== candidateSlug);
  const me = opponents.find((o) => o.slug === candidateSlug);

  return (
    <section id="ballot" className="mt-6 scroll-mt-16 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl">
        What is {candidateName} running for?
      </h2>
      <p className="mt-2 max-w-[54ch]">
        {candidateName} is on the ballot for{" "}
        <Link href={`/races/${raceIdToSlug(raceId)}`} className="font-bold underline decoration-2 underline-offset-2">
          {raceOffice}
        </Link>
        {primaryDate ? ` in the ${primaryDate} Wisconsin partisan primary` : ""}
        {me?.incumbent ? ", as the incumbent" : ""}.
        {others.length === 0
          ? " No other candidate filed for this seat."
          : ` ${others.length === 1 ? "One other candidate is" : `${others.length} other candidates are`} on the ballot.`}
      </p>

      {others.length > 0 && (
        <>
          <p className={`mt-3 ${meta}`}>Also on this ballot</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {others.map((o) => (
              <li key={o.slug} className="text-sm">
                <Link href={`/candidates/${o.slug}`} className="underline decoration-2 underline-offset-2">
                  {o.name}
                </Link>
                {o.party ? <span className="text-muted-foreground"> ({o.party})</span> : null}
                {o.incumbent ? <span className="text-muted-foreground"> · incumbent</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {incumbent?.hasRecord && (
        // The single most useful link on a challenger's page: what the person
        // they are running against actually voted for.
        <p className="mt-3 text-sm">
          <Link
            href={`/candidates/${incumbent.slug}#votes`}
            className="underline decoration-2 underline-offset-2"
          >
            See {incumbent.name}&rsquo;s voting record →
          </Link>
        </p>
      )}
    </section>
  );
}
