import { generalParty, generalPersonName } from "../../../convex/lib/ballot";
import { WISCONSIN_WATCH, questionnaireStatus, type QuestionnaireStatus } from "../../../convex/lib/wisconsinWatch";

/**
 * Whether each candidate answered Wisconsin Watch's 2026 questionnaire, with a
 * link to the answers. Server components: they read the checked-in link list.
 *
 * Every candidate gets one row of the same weight. "Did not answer" is a plain
 * statement. Nothing here says why, and nothing compares candidates.
 */

type OnBallot = {
  slug: string;
  name: string;
  general?: { onBallot: boolean; ballotName?: string; party?: string };
};

export type QuestionnaireRow = { slug: string; name: string; party?: string; status: QuestionnaireStatus };

// A link standing on its own gets a 44px target. A link inside a sentence keeps the line's height.
const LINK = "inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-2";
const INLINE_LINK = "font-bold underline decoration-2 underline-offset-2";
const STATUS = "mt-1 text-sm";

/** A link to Wisconsin Watch, tagged so the newsroom can count readers we send. */
export const guideLink = (url: string) => `${url}?utm_source=badgerbrief&utm_medium=referral`;

const guideUpdated = new Date(`${WISCONSIN_WATCH.guideUpdated}T12:00:00Z`).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** One row per candidate, in the order given. Empty when their guide does not cover the race. */
export function questionnaireRows(raceId: string, candidates: readonly OnBallot[]): QuestionnaireRow[] {
  return candidates.flatMap((candidate) => {
    const status = questionnaireStatus(raceId, candidate.slug);
    return status ? [{ slug: candidate.slug, name: generalPersonName(candidate), party: generalParty(candidate), status }] : [];
  });
}

function Status({ row }: { row: QuestionnaireRow }) {
  const { status } = row;
  if (status.status === "answered") {
    return (
      <p className={STATUS} data-status="answered">
        Answered {status.answered} question{status.answered === 1 ? "" : "s"}.{" "}
        <a href={guideLink(status.url)} target="_blank" rel="noopener noreferrer" className={LINK}>
          Read {row.name}’s answers on Wisconsin Watch
        </a>
      </p>
    );
  }
  return (
    <p className={STATUS} data-status={status.status}>
      {status.status === "did-not-answer" ? "Did not answer the questionnaire." : "Not in Wisconsin Watch’s guide."}
    </p>
  );
}

function Credit() {
  return (
    <p className="mt-3 font-mono text-xs text-muted-foreground">
      Wisconsin Watch 2026 Voter Guide, last updated {guideUpdated}. Whether a candidate answered is as that guide reports it.
    </p>
  );
}

export function RaceQuestionnaire({ raceId, candidates }: { raceId: string; candidates: readonly OnBallot[] }) {
  const rows = questionnaireRows(raceId, candidates);
  if (rows.length === 0) return null;
  return (
    <section id="questionnaire" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">In their own words</h2>
      <p className="mt-2 max-w-2xl text-sm">
        <a href={guideLink(WISCONSIN_WATCH.url)} target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
          Wisconsin Watch
        </a>
        , a nonprofit newsroom, sent every candidate for this office the same questions. The answers are the candidates’
        own words, published on its site.
      </p>
      <ul className="mt-3 max-w-2xl border-t-2 border-border">
        {rows.map((row) => (
          <li key={row.slug} className="border-b-2 border-border py-3">
            <p className="font-bold">
              {row.name}
              {row.party && <span className="font-normal text-muted-foreground"> · {row.party}</span>}
            </p>
            <Status row={row} />
          </li>
        ))}
      </ul>
      <Credit />
    </section>
  );
}

export function CandidateQuestionnaire({ raceId, candidate }: { raceId: string; candidate: OnBallot }) {
  const [row] = questionnaireRows(raceId, [candidate]);
  if (!row) return null;
  return (
    <section id="questionnaire" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Wisconsin Watch’s questionnaire</h2>
      <p className="mt-2 max-w-2xl text-sm">
        Wisconsin Watch, a nonprofit newsroom, sent every candidate for this office the same questions.
      </p>
      <Status row={row} />
      <Credit />
    </section>
  );
}
