import Link from "next/link";
import { SourceItems } from "./sources";

/**
 * The close of every race, candidate and compare page: who made it, how the
 * facts got in, where they came from, when, and what is left out (Phase 1b
 * brief, item 6). A ledger of five entries rather than a card of reassurance.
 *
 * Every sentence here is lifted from /about and /methodology, which carry the
 * detail. Funding is stated as "no ads, party, campaign or PAC money" and no
 * further: the site takes reader donations through Ko-fi.
 */
const STAMP = "font-mono text-xs font-bold uppercase tracking-widest";
const link = "underline decoration-2 underline-offset-2";

export function TrustBlock({
  sources,
  updated,
}: {
  sources: { name: string; url: string }[];
  /** Already formatted for reading, e.g. "October 6, 2026". */
  updated: string;
}) {
  const rows: [string, React.ReactNode][] = [
    [
      "Who made this",
      <>
        Tarik Moody, in Milwaukee, independently. No ads, and no party, campaign or PAC money. Nobody has editorial
        input. <Link href="/about" className={link}>About BadgerBrief</Link>
      </>,
    ],
    [
      "How facts get in",
      <>
        Ballot names come from the Wisconsin Elections Commission&rsquo;s certified list, printed as you will see them.
        Votes are read from official roll calls; money from the Ethics Commission and the FEC. Positions and quotes appear
        only after a person checks each one against its source. <Link href="/methodology" className={link}>Methodology</Link>
      </>,
    ],
    [
      "Sources",
      sources.length > 0 ? <SourceItems sources={sources} /> : <>Each sourced entry on this page links its own source.</>,
    ],
    ["Last updated", <time key="t">{updated}</time>],
    [
      "Not covered",
      <>
        BadgerBrief does not rate, endorse or predict. Where a fact could not be sourced it is left out, not guessed.
        Local questions and city or village contests are on{" "}
        <a href="https://myvote.wi.gov" target="_blank" rel="noopener noreferrer" className={link}>
          MyVote&nbsp;↗
        </a>
        .
      </>,
    ],
  ];

  return (
    <section id="sources" aria-labelledby="trust-heading" className="mt-12 scroll-mt-16">
      <h2 id="trust-heading" className="font-display text-2xl">How this page was made</h2>
      <dl className="mt-4 border-y-2 border-border">
        {rows.map(([label, body]) => (
          <div
            key={label}
            className="grid gap-1 border-b-2 border-dashed border-border py-3 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4"
          >
            <dt className={`${STAMP} pt-0.5`}>{label}</dt>
            <dd className="max-w-[65ch] text-sm leading-relaxed">{body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
