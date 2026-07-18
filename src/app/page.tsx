import Link from "next/link";
import { BallotFinder } from "@/components/guide/ballot-finder";
import { RaceCard } from "@/components/guide/cards";
import { LastUpdated, Stamp } from "@/components/guide/labels";
import { getElection, listRaces, getVotingInfo } from "@/lib/data";
import {
  JsonLd,
  breadcrumbNode,
  electionEventNode,
  organizationNode,
} from "@/lib/jsonld";

export const revalidate = 300;

const LEVEL_ORDER = [
  "State Executive",
  "Federal",
  "State Judicial",
  "State Legislative",
];

export default async function Home() {
  const [election, races, votingInfo] = await Promise.all([
    getElection(),
    listRaces(),
    getVotingInfo(),
  ]);

  const byLevel = new Map<string, typeof races>();
  for (const level of LEVEL_ORDER) {
    const group = races.filter((r) => r.level === level);
    if (group.length > 0) byLevel.set(level, group);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {election && (
        <JsonLd
          nodes={[
            organizationNode(),
            electionEventNode(election),
            breadcrumbNode([{ name: "Home", path: "/" }]),
          ]}
        />
      )}

      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)] sm:p-10">
        <Stamp>Wisconsin 2026</Stamp>
        <h1 className="font-display mt-3 max-w-2xl text-4xl leading-none sm:text-5xl">
          Know your ballot before you fill it in.
        </h1>
        <p className="mt-4 max-w-2xl text-lg">
          The Wisconsin partisan primary is{" "}
          <strong>{election?.primaryDate ?? "August 11, 2026"}</strong>. This is
          a non-partisan, source-linked guide to every statewide and
          congressional race on it — who&apos;s running, what they say, and
          exactly how to vote.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/vote"
            className="border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
          >
            How to vote →
          </Link>
          <Link
            href="/races/wi-gov-2026"
            className="border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)] press"
          >
            Governor&apos;s race
          </Link>
        </div>
        {election && (
          <div className="mt-6">
            <LastUpdated date={election.dataAsOf} />
          </div>
        )}
      </section>

      <BallotFinder races={races} />

      {votingInfo && (
        <section className="mt-8 border-2 border-border bg-warning p-4 shadow-[var(--shadow-brutal)]">
          <h2 className="font-display text-lg">
            When are the 2026 Wisconsin primary deadlines?
          </h2>
          <p className="mt-1 text-sm">
            Polls are open {votingInfo.pollsOpen}–{votingInfo.pollsClose} on{" "}
            {votingInfo.primaryDate}. Absentee, registration, and early-voting
            details are on the{" "}
            <Link href="/vote" className="font-bold underline decoration-2">
              how-to-vote page
            </Link>
            , with every deadline linked to its official source.
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl">
          What races are on the Wisconsin 2026 primary ballot?
        </h2>
        <p className="mt-2 max-w-2xl">
          {races.length} races: statewide offices, all eight U.S. House
          districts, the state supreme court, and the legislature.
        </p>
        {[...byLevel.entries()].map(([level, group]) => (
          <div key={level} className="mt-6">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {level}
            </h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((race) => (
                <RaceCard key={race.raceId} race={race} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
