import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How BadgerBrief sources, verifies, and publishes Wisconsin election information: official sources first, every claim linked, human review before anything publishes, and continuous automated quality checks.",
  alternates: { canonical: "/methodology" },
};

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "Non-partisan policy",
    body: (
      <>
        BadgerBrief never endorses, ranks, or recommends candidates or parties.
        Candidate positions are presented descriptively, in the candidate&apos;s
        own words or as attributed by the cited source. Our assistant is
        instructed to refuse endorsement requests and legal advice, and those
        refusals are among the behaviors we test continuously (see
        &ldquo;Quality checks&rdquo; below).
      </>
    ),
  },
  {
    heading: "Where the data comes from",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Voting logistics</strong> (registration, absentee, early
          voting, voter ID, polling hours): Wisconsin Elections Commission and{" "}
          <a href="https://myvote.wi.gov" className="underline" rel="noopener noreferrer" target="_blank">
            MyVote Wisconsin
          </a>
          , which is always the authoritative system for taking action.
        </li>
        <li>
          <strong>Races and candidates</strong>: official filings and public
          reference sources (Ballotpedia, candidate campaign sites, Wisconsin
          news outlets), each linked from the page where it&apos;s used.
        </li>
        <li>
          <strong>Campaign finance</strong>: the FEC API for federal offices and
          the Wisconsin Ethics Commission&apos;s Sunshine database for state
          offices, used for non-commercial voter education only, per Wis. Stat.
          § 11.1304(12).
        </li>
        <li>
          <strong>Political advertising</strong>: public ad archives and FCC
          public inspection files, with the source document linked on every
          record.
        </li>
      </ul>
    ),
  },
  {
    heading: "How candidate positions and quotes get published",
    body: (
      <>
        Software assistants read approved sources (campaign sites and news
        articles a human editor approved first) and extract candidate positions
        and quotes as <em>drafts</em>, each carrying its source link and a
        verbatim evidence excerpt. Nothing a machine writes is published
        automatically: every draft goes through an editorial review queue where
        a human approves, edits, or rejects it. Only approved, source-linked
        records appear on the site, and every published record keeps a full
        audit trail of who approved it and when.
      </>
    ),
  },
  {
    heading: "Quality checks",
    body: (
      <>
        Every assistant run is traced, and a sampled share of production
        activity is scored continuously by automated evaluators for citation
        faithfulness, neutrality, official-source-first behavior, and refusal
        correctness. Before any change to an assistant ships, it must pass a
        fixed test set of voter questions with known-correct properties;
        regressions block the change. Score drops raise internal alerts
        reviewed by the editor.
      </>
    ),
  },
  {
    heading: "Corrections",
    body: (
      <>
        See something wrong? Every fact on the site links to its source so you
        can check it yourself — and if we got it wrong,{" "}
        <a
          href="https://github.com/tmoody1973/badgerbrief/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          open an issue
        </a>{" "}
        with a link to the page and what&apos;s incorrect. We&apos;ll review it
        against the source and correct it.
      </>
    ),
  },
];

export default function MethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="font-display text-3xl">Methodology</h1>
      <p className="mt-3 text-muted-foreground">
        BadgerBrief is a non-partisan, source-linked Wisconsin voter guide.
        This page explains how information gets onto the site and how we keep
        it honest.
      </p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className="font-display text-xl">{heading}</h2>
            <div className="mt-2 text-sm leading-relaxed">{body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
