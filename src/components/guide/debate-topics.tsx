"use client";

import { useState } from "react";
import { youtubeAt } from "@/lib/youtube";
import { DebateClip } from "./debate-clip";

/**
 * The core of the debate page: ten issues, five candidates, one issue on screen
 * at a time.
 *
 * Why a switcher rather than a long scroll. Ten topics × five candidates is
 * fifty near-identical cards — the most repetitive content on this site, and
 * exactly the case where folding earns its keep (a flat render runs past forty
 * screens on a phone). Showing one issue at a time cuts that to about three,
 * and it matches how someone actually reads a debate: they care about schools,
 * or they care about data centres, not about all ten in order.
 *
 * Switching is React state, not an anchor and not a `:checked` radio — both of
 * those move the viewport when the control sits below the fold, so the reader
 * loses their place every time they change issue.
 */

export type DebateCandidate = { slug: string; name: string; title: string; short: string };
export type DebateTopic = { id: string; label: string; blurb: string; start: number };
/** Why a candidate has no quote on a topic. Derived, never assumed. */
export type DebateParticipation = Record<
  string,
  { notAsked: string[]; namedButSilent: string[] }
>;
export type DebateQuote = {
  topicId: string;
  personSlug: string;
  quote: string;
  fullAnswer: string;
  question: string;
  askedBy: string;
  startSec: number;
  clip: string;
  sentimentScore: number | null;
  clipVerified: boolean | null;
};

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Sentiment is reported as the tone of the language in one answer on one issue
 * — never summed into a per-candidate figure. "Who sounded most negative
 * tonight" is a verdict, and this site does not publish verdicts. The number is
 * always shown next to a word so meaning never rides on a colour.
 */
function toneLabel(score: number | null): { word: string; value: string } | null {
  if (score === null) return null;
  if (score <= -0.25) return { word: "Critical", value: score.toFixed(2) };
  if (score >= 0.25) return { word: "Affirmative", value: `+${score.toFixed(2)}` };
  return { word: "Neutral", value: score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2) };
}

export function DebateTopics({
  topics,
  candidates,
  quotes,
  youtubeId,
  participation,
  handVotes,
}: {
  topics: DebateTopic[];
  candidates: DebateCandidate[];
  quotes: DebateQuote[];
  /** When present, each quote also links into the broadcaster's video. */
  youtubeId?: string | null;
  participation?: DebateParticipation;
  /**
   * Hand votes, so a candidate the moderators never questioned on a topic can
   * still show the position they registered by raising (or not raising) a hand.
   * Without this, "not asked" reads as "we have nothing from them", when on the
   * tax deal we have an explicit yes or no from all five.
   */
  handVotes?: { id: string; topicId: string; yes: string[]; no: string[] }[];
}) {
  const [activeId, setActiveId] = useState(topics[0]?.id ?? "");
  const active = topics.find((t) => t.id === activeId) ?? topics[0];
  const index = topics.findIndex((t) => t.id === active?.id);

  if (!active) return null;
  const onTopic = quotes.filter((q) => q.topicId === active.id);

  return (
    <div>
      {/* Issue rail. Horizontal at every width: ten chips cost one row of
          vertical space, where a stacked list would cost ten. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0">
        <ul
          className="flex w-max gap-2 lg:w-full lg:flex-wrap"
          role="tablist"
          aria-label="Debate issues"
        >
          {topics.map((t) => {
            const isActive = t.id === active.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="debate-issue-panel"
                  onClick={() => setActiveId(t.id)}
                  className={`press inline-block whitespace-nowrap border-2 border-border px-3 py-2 text-sm font-bold shadow-[var(--shadow-brutal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
                    isActive ? "bg-foreground text-background" : "bg-card"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        id="debate-issue-panel"
        role="tabpanel"
        aria-label={active.label}
        className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {/* overflow-wrap so a long topic name can't push the card wide at 320px. */}
          <h3
            className="font-display text-xl"
            style={{ overflowWrap: "anywhere", minWidth: 0 }}
          >
            {active.label}
          </h3>
          <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            From {mmss(active.start)} · {index + 1} of {topics.length}
          </span>
        </div>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{active.blurb}</p>

        {onTopic.length === 0 ? (
          <p className="mt-4 border-t-2 border-dashed border-border pt-4 text-sm text-muted-foreground">
            No candidate answered at length in this block.
          </p>
        ) : (
          /* minmax(0,1fr) rather than 1fr: a bare 1fr track refuses to shrink
             below its content and produces a horizontally scrolling page. */
          <ul className="mt-4 grid grid-cols-1 gap-4 border-t-2 border-dashed border-border pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 [&>li]:min-w-0">
            {candidates.map((c) => {
              const q = onTopic.find((x) => x.personSlug === c.slug);
              if (!q) {
                // "Did not answer" reads as evasion. Every gap on this page is
                // a candidate the moderators never called on, so say that
                // instead — and only claim silence when they were addressed.
                const notAsked = participation?.[active.id]?.notAsked.includes(c.slug);
                const vote = handVotes?.find((v) => v.topicId === active.id);
                const handed = vote?.yes.includes(c.slug)
                  ? "Yes"
                  : vote?.no.includes(c.slug)
                    ? "No"
                    : null;
                return (
                  <li key={c.slug} className="min-w-0">
                    <p className="font-bold">{c.short}</p>
                    <p className="mt-1 font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                      {notAsked ? "Not asked on this topic" : "Addressed but did not answer"}
                    </p>
                    {handed && (
                      <p className="mt-1 font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                        Hand vote: {handed}
                      </p>
                    )}
                  </li>
                );
              }
              const tone = toneLabel(q.sentimentScore);
              return (
                /* flex-col + mt-auto on the controls: quotes differ in length,
                   so without this the five play buttons sit at five different
                   heights and the row stops reading as a comparison. */
                <li key={c.slug} className="flex min-w-0 flex-col">
                  <p className="font-bold" style={{ overflowWrap: "anywhere" }}>
                    {c.name}
                  </p>
                  <p className="font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                    {c.title}
                  </p>

                  {/* Clamped, not truncated: the complete answer is one tap
                      away under "Full answer". Five stacked candidates with
                      unclamped quotes runs to four phone screens for a single
                      issue, which defeats the point of the switcher. */}
                  <blockquote className="mt-2 line-clamp-6 border-l-2 border-border pl-3 text-sm leading-relaxed">
                    “{q.quote}”
                  </blockquote>

                  <div className="mt-auto pt-3">
                    <DebateClip
                      src={q.clip}
                      label={c.name}
                      atSec={q.startSec}
                    />
                  </div>

                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                    {tone && (
                      <span>
                        Tone: {tone.word} {tone.value}
                      </span>
                    )}
                    {youtubeId && (
                      <a
                        href={youtubeAt(youtubeId, q.startSec)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-2 underline-offset-2"
                      >
                        Watch ↗
                      </a>
                    )}
                  </p>

                  <details className="mt-2">
                    <summary className="press inline-block cursor-pointer border-2 border-border bg-background px-2 py-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                      Full answer
                    </summary>
                    <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                      Asked by {q.askedBy}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground italic">
                      {q.question}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">{q.fullAnswer}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        {/* Stepping through issues without scrolling back to the rail. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-border pt-4">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setActiveId(topics[index - 1].id)}
            className="press border-2 border-border bg-card px-3 py-2 text-sm font-bold shadow-[var(--shadow-brutal)] disabled:opacity-50 disabled:shadow-none"
          >
            ← Previous
          </button>
          <button
            type="button"
            disabled={index === topics.length - 1}
            onClick={() => setActiveId(topics[index + 1].id)}
            className="press border-2 border-border bg-card px-3 py-2 text-sm font-bold shadow-[var(--shadow-brutal)] disabled:opacity-50 disabled:shadow-none"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
