import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Ballot basics: parties and the primary",
  description:
    "A plain-language, nonpartisan guide to Wisconsin's August 11 partisan primary — how it works, what the party and ideology labels on your ballot mean, and where to read each party's positions in its own words.",
  alternates: { canonical: "/ballot-basics" },
};

const MYVOTE = "https://myvote.wi.gov";

function Section({
  eyebrow,
  heading,
  children,
}: {
  eyebrow: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 border-2 border-border bg-card p-5 shadow-[var(--shadow-brutal)] sm:p-6">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-2xl">{heading}</h2>
      <div className="mt-3 max-w-[62ch] space-y-3 text-[0.975rem] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function BallotBasicsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)] sm:p-10">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Ballot basics
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none sm:text-5xl">
          Parties and the primary, explained.
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg">
          Two things trip people up at the ballot: how Wisconsin&apos;s August 11 partisan
          primary actually works, and what the party and ideology labels on the ballot mean.
          Here&apos;s the plain-language version. It&apos;s nonpartisan — we explain how the
          ballot works and point you to each party&apos;s own words. We never tell you who to
          vote for.
        </p>
      </section>

      <Section eyebrow="Step 1" heading="How the August 11 primary works">
        <p>
          August 11 is a <strong>partisan primary</strong>. Its job is to narrow each
          party&apos;s field down to one candidate per office, who then advances to the
          November general election.
        </p>
        <p>
          <strong>You don&apos;t register by party in Wisconsin.</strong> But when you get
          your ballot, you pick <strong>one party&apos;s section</strong> and vote only
          within it for partisan offices — governor, U.S. House, the legislature.
        </p>
        <p>
          <strong>You can&apos;t split across parties.</strong> If you mark a candidate from
          one party for one office and another party for a different office, the partisan
          part of your ballot won&apos;t count. Pick one party&apos;s column and stay in it.
        </p>
        <p>
          Any <strong>nonpartisan races or referendums</strong> on the ballot are open to
          everyone — no matter which party&apos;s section you used, or even if you skip the
          partisan part entirely.
        </p>
        <p className="text-sm text-muted-foreground">
          Source:{" "}
          <a
            href={MYVOTE}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline decoration-2"
          >
            MyVote Wisconsin
          </a>{" "}
          — the state&apos;s official system for what&apos;s on your ballot and how to vote.
        </p>
      </Section>

      <Section eyebrow="Step 2" heading="Party vs. label — what the words mean">
        <p>
          On the ballot, candidates for partisan offices run under a <strong>party</strong>.
          In Wisconsin that&apos;s almost always <strong>Democratic</strong> or{" "}
          <strong>Republican</strong>, with the occasional third-party or independent
          candidate.
        </p>
        <p>
          Words like <em>progressive</em>, <em>moderate</em>, <em>conservative</em>,{" "}
          <em>libertarian</em>, or <em>democratic socialist</em> are{" "}
          <strong>labels people use to describe themselves</strong> — a candidate&apos;s own
          words, or a group they belong to. They are <strong>not separate parties</strong> on
          the ballot.
        </p>
        <p>
          For example: a candidate who calls themselves a <em>democratic socialist</em> — say,
          a member of the Democratic Socialists of America — still appears on the ballot on the{" "}
          <strong>Democratic</strong> line, not a &ldquo;Socialist&rdquo; line. The label
          describes their politics; the party is the line they run on.
        </p>
        <p>
          So a label tells you how someone describes themselves. It doesn&apos;t tell you their
          specific positions. For that, keep going.
        </p>
      </Section>

      <Section eyebrow="Step 3" heading="What does each party stand for? Read it in their words">
        <p>
          We don&apos;t summarize the parties for you — that&apos;s not our job, and any short
          version would flatten a lot of disagreement. Here&apos;s where to read it straight
          from the source, plus a neutral third-party overview:
        </p>
        <ul className="space-y-2">
          <li>
            <a
              href="https://wisdems.org"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2"
            >
              Democratic Party of Wisconsin
            </a>{" "}
            — their platform and values, in their own words.
          </li>
          <li>
            <a
              href="https://wisgop.org"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2"
            >
              Republican Party of Wisconsin
            </a>{" "}
            — their platform and values, in their own words.
          </li>
          <li>
            <a
              href="https://ballotpedia.org/Political_parties_in_Wisconsin"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2"
            >
              Ballotpedia
            </a>{" "}
            — a neutral, nonpartisan overview of Wisconsin&apos;s parties.
          </li>
        </ul>
      </Section>

      <Section eyebrow="Step 4" heading="A label is a starting point, not the whole story">
        <p>
          Two candidates in the same party can disagree on plenty. A party label is a
          shortcut — useful, but it doesn&apos;t tell you where a specific candidate stands on
          the things you care about.
        </p>
        <p>
          That&apos;s what this guide is for. Every candidate&apos;s page shows their
          positions <strong>linked to the source</strong>, so you can see what{" "}
          <strong>they</strong> actually said — not what a label implies.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/match"
            className="press inline-block border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]"
          >
            See where candidates stand on your issues →
          </Link>
          <Link
            href="/"
            className="press inline-block border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)]"
          >
            Find your ballot →
          </Link>
        </div>
      </Section>
    </main>
  );
}
