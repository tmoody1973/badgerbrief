import Link from "next/link";
import { isOnBallot } from "@/lib/ballot-status";
import { getRace } from "@/lib/data";
import { raceIdToSlug } from "@/lib/site";

/**
 * Who was on that stage, and — the part that matters more — who a voter will
 * find on the ballot that ISN'T here.
 *
 * A debate page is a selection made by a broadcaster, not by us, and
 * republishing it without saying so quietly adopts their selection as ours.
 * Two gaps need naming:
 *
 *   1. The August 11 Democratic ballot carries more names than the five who
 *      debated. Withdrawn and suspended candidates stay on the printed ballot
 *      (see lib/ballot-status.ts — WEC's contest list, verified in MOO-314),
 *      so a voter opening the ballot sees names this page never mentions.
 *   2. There is no Republican equivalent of this page because there was no
 *      Republican debate. Saying that plainly is better than letting the
 *      absence read as a choice we made.
 *
 * Everything here reads from Convex at build time rather than being written
 * into prose, so it cannot go stale the next time a candidate's status moves.
 */
export async function DebateWhoWasThere({
  raceId,
  onStage,
}: {
  raceId: string;
  /** personSlugs of the candidates who actually debated. */
  onStage: string[];
}) {
  const data = await getRace(raceId);
  if (!data) return null;

  const onBallot = data.candidates.filter((c) => isOnBallot(c.status));
  const dems = onBallot.filter((c) => c.party === "Democratic");
  const missing = dems.filter((c) => !onStage.includes(c.slug));
  const reps = onBallot.filter((c) => c.party === "Republican");

  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl" style={{ overflowWrap: "anywhere" }}>
        Who was on stage — and who wasn&apos;t
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        The broadcaster invited five candidates. Your ballot will have more names
        than that.
      </p>

      <div className="mt-4 grid gap-4 border-t-2 border-dashed border-border pt-4 sm:grid-cols-2">
        {missing.length > 0 && (
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              On the Democratic ballot, not at this debate
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {missing.map((c) => (
                <li key={c.slug} className="max-w-[60ch]">
                  <Link
                    className="font-bold underline decoration-2 underline-offset-2"
                    href={`/candidates/${c.slug}`}
                  >
                    {c.name}
                  </Link>
                  {c.status && c.status !== "Active" ? (
                    <span className="text-muted-foreground"> — {c.status}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
              Candidates who withdraw after the filing deadline stay on the
              printed ballot, so you will still see their names on August 11.
            </p>
          </div>
        )}

        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Why there is no Republican debate page
          </p>
          <p className="mt-2 max-w-[60ch] text-sm">
            No televised Republican primary debate was held. Josh Schoemann
            withdrew in January after President Trump endorsed Tom Tiffany,
            leaving the Republican primary effectively settled before it began.
          </p>
          {reps.length > 0 && (
            <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
              On the Republican ballot:{" "}
              {reps.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 ? ", " : ""}
                  <Link
                    className="underline decoration-2 underline-offset-2"
                    href={`/candidates/${c.slug}`}
                  >
                    {c.name}
                  </Link>
                  {/* Statuses already read "Withdrew (January 28, 2026)", so
                      wrapping them in another pair nests brackets. */}
                  {c.status && c.status !== "Active" ? ` — ${c.status}` : ""}
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 border-t-2 border-dashed border-border pt-4 text-sm">
        <Link
          className="font-mono underline decoration-2 underline-offset-2"
          href={`/races/${raceIdToSlug(raceId)}`}
        >
          See every candidate on the August 11 ballot →
        </Link>
      </p>
    </div>
  );
}
