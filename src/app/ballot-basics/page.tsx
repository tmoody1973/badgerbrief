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
          <strong>labels people use to describe themselves</strong> — not separate parties on
          the ballot. Here&apos;s roughly what each means to the people who use it:
        </p>
        <ul className="space-y-2">
          <li>
            <strong>Progressive</strong> — favors active government, stronger public programs,
            and civil-rights protections to reduce economic and social inequality;
            left-of-center. Most progressives in Wisconsin run as Democrats.
          </li>
          <li>
            <strong>Moderate / centrist</strong> — mixes positions from each side and steers
            away from the far ends of either party.
          </li>
          <li>
            <strong>Conservative</strong> — favors limited government, lower taxes, free
            markets, and traditional values to expand individual freedom and economic growth;
            right-of-center. Most conservatives here run as Republicans.
          </li>
          <li>
            <strong>Libertarian</strong> — wants the smallest possible government in both
            economic and personal life. There is also a{" "}
            <a
              href="https://www.lp.org/platform/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2"
            >
              Libertarian Party
            </a>{" "}
            some candidates run under.
          </li>
        </ul>
        <p>
          A label is a self-description on the ballot — it never changes which party line a
          candidate runs on, and it doesn&apos;t pin down their specific positions.
        </p>
      </Section>

      <Section
        eyebrow="Step 3"
        heading="Socialist, democratic socialist, communist — what's the difference?"
      >
        <p>
          These words get used a lot right now — sometimes as real description, sometimes as an
          insult — and they don&apos;t all mean the same thing. Here&apos;s what each actually
          refers to, so you can judge a candidate on what they support rather than on a label
          aimed at them.
        </p>
        <ul className="space-y-2">
          <li>
            <strong>Socialism</strong> — a broad umbrella for the idea that the public, rather
            than private owners, should own or control major parts of the economy. It spans a
            wide range: some versions work through democracy and elections, others through
            one-party control. On its own, &ldquo;socialist&rdquo; is a broad word that
            doesn&apos;t tell you which.
          </li>
          <li>
            <strong>Communism</strong> — in practice, the 20th-century communist states (such
            as the Soviet Union, China, Cuba, or North Korea) were run by a single ruling party
            that controlled both the government and the economy, without competitive, multiparty
            elections. Ownership was concentrated in the state.
          </li>
          <li>
            <strong>Democratic socialism</strong> — the &ldquo;democratic&rdquo; part is the
            point: it commits to democracy — free, competitive elections, civil liberties, and
            more than one party — while pushing for a larger public and worker role in the
            economy. It rejects the one-party model. Its aims can include public programs, labor
            rights, and forms of public or worker ownership. Because it works through elections,
            its candidates in the U.S.
            usually run inside the Democratic Party, and the label is tied to the{" "}
            <a
              href="https://www.dsausa.org/about-us/what-is-democratic-socialism/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2"
            >
              Democratic Socialists of America (DSA)
            </a>
            .
          </li>
          <li>
            <strong>Social democracy</strong> (easy to mix up with the last one) — keeps a
            private, market economy but pairs it with a strong safety net and public services —
            the model often associated with countries like Denmark, Sweden, or Norway.
          </li>
        </ul>
        <p>
          One clear difference between communism as it has actually been practiced and
          democratic socialism is who holds power: communist states have been one-party systems
          without competitive elections, while democratic socialists run in elections and
          support multiparty democracy. So the two terms are not interchangeable.
        </p>
        <p>
          Heated labels get thrown in every direction, and they&apos;re often used loosely as
          attacks rather than descriptions. Our answer doesn&apos;t change no matter which way
          they fly: don&apos;t vote a label. Read what a candidate actually supports, linked to
          the source, on their page.
        </p>
      </Section>

      <Section eyebrow="Step 4" heading="What does each party stand for? Read it in their words">
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

      <Section eyebrow="Step 5" heading="A label is a starting point, not the whole story">
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
