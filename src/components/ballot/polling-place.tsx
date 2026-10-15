import type { PollingPlace } from "@/lib/districts";

/**
 * Where a City of Milwaukee voter goes on Election Day, from the city's own
 * ward and polling-place data (our nightly copy, convex/mkeWards.ts). The
 * state's MyVote is the authority, so the card always sends the voter there to
 * confirm. Election Day only: early in-person voting is at other sites.
 */

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const LINK = `font-bold underline decoration-2 underline-offset-2 ${FOCUS}`;
const MYVOTE = "https://myvote.wi.gov/en-us/Find-My-Polling-Place";

const directions = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Milwaukee, WI`)}`;

export function PollingPlaceCard({ place }: { place: PollingPlace }) {
  const access = [
    ["Entrance", place.mainEntrance],
    ["Accessible entrance", place.accessibleEntrance],
    ["Parking", place.mainParking],
    ["Accessible parking", place.accessibleParking],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <section aria-labelledby="polling-place" className="mt-5 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)] sm:p-6">
      <h2 id="polling-place" className="font-display text-2xl">
        Where you vote on Nov 3
      </h2>
      <p className="mt-3 text-lg font-bold leading-snug">{place.pollingPlace}</p>
      <p className="mt-1">
        {place.address}, Milwaukee ·{" "}
        <a href={directions(place.address)} target="_blank" rel="noopener noreferrer" className={LINK}>
          Directions
        </a>
      </p>
      <p className="mt-1 font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">Ward {place.ward}</p>

      {access.length > 0 && (
        <dl className="mt-4 grid gap-x-4 gap-y-2 border-t-2 border-dashed border-border pt-4 text-sm sm:grid-cols-[11rem_1fr]">
          {access.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-bold">{label}</dt>
              <dd className="mb-2 sm:mb-0">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-sm">
        Polls are open 7 a.m. to 8 p.m. on Election Day. Voting early in person, Oct. 20 to Nov. 1, happens at other sites:{" "}
        <a href="/vote" className={LINK}>
          how to vote early
        </a>
        .
      </p>
      <p className="mt-3 border-t-2 border-border pt-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
        From the City of Milwaukee’s ward and polling-place data, updated nightly.{" "}
        <a href={MYVOTE} target="_blank" rel="noopener noreferrer" className={LINK}>
          Confirm at MyVote before you go
        </a>
      </p>
    </section>
  );
}
