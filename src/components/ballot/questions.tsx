import type { StatewideQuestions } from "../../../convex/lib/ballotExtras";

/**
 * The three statewide questions, in the state's words only. The guide writes
 * no summary of what a question does (Tarik's ruling, brief section 8.3). The
 * one sentence of its own is labelled as its own.
 */

const LINK = "font-bold underline decoration-2 underline-offset-2";

export function BallotQuestions({ questions }: { questions: StatewideQuestions }) {
  if (questions.status !== "ok") {
    return (
      <p className="mt-3 max-w-2xl">
        The statewide questions aren’t loaded yet. You can read them on{" "}
        <a href="https://myvote.wi.gov/en-us/Whats-On-My-Ballot" target="_blank" rel="noopener noreferrer" className={LINK}>
          MyVote Wisconsin
        </a>
        .
      </p>
    );
  }
  const { source } = questions;
  return (
    <>
      <p className="mt-2 max-w-2xl">
        These three questions are on every Wisconsin ballot. The text and the explanations are the state’s own words, from the{" "}
        <a href={source.documentUrl ?? source.url} target="_blank" rel="noopener noreferrer" className={LINK}>
          {source.name}
        </a>
        .
      </p>
      <div className="mt-4 space-y-5">
        {questions.questions.map((question) => (
          <article key={question.number} className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <h3 className="font-display text-xl leading-tight text-balance">
              Question {question.number}: {question.title}
            </h3>
            <p className="mt-3 border-2 border-border bg-background p-3">
              <span className="font-bold">On the ballot: </span>
              {question.ballotText}
            </p>
            <p className="mt-3 max-w-2xl">{question.yesVote}</p>
            <p className="mt-2 max-w-2xl">{question.noVote}</p>
            <details className="mt-3 border-t-2 border-dashed border-border pt-3">
              <summary className="min-h-11 cursor-pointer content-center font-bold">The state’s full explanation</summary>
              {question.explanation.map((paragraph) => (
                <p key={paragraph} className="mt-2 max-w-2xl text-sm">
                  {paragraph}
                </p>
              ))}
            </details>
            {question.note && (
              <p className="mt-3 border-2 border-border bg-secondary p-3 text-sm">
                <span className="font-bold">BadgerBrief’s note: </span>
                {question.note}
              </p>
            )}
            <p className="mt-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">Placed on the ballot by {question.resolution}</p>
          </article>
        ))}
      </div>
    </>
  );
}
