import Link from "next/link";
import type { Doc } from "../../../convex/_generated/dataModel";
import { BallotFinder } from "@/components/guide/ballot-finder";
import { RaceCard } from "@/components/guide/cards";
import { DistrictRaces } from "@/components/guide/district-races";
import { raceLevelLabel } from "@/lib/i18n/race-card-dict";
import { LastUpdated, Stamp } from "@/components/guide/labels";
import { splitHomeRaces } from "@/lib/home-races";
import type { HomeDict } from "@/lib/i18n/home-en";
import {
  JsonLd,
  breadcrumbNode,
  electionEventNode,
  organizationNode,
} from "@/lib/jsonld";

export function HomeGuide({
  dict,
  lang,
  election,
  races,
  votingInfo,
}: {
  dict: HomeDict;
  lang: "en" | "es";
  election: Doc<"elections"> | null;
  races: Doc<"races">[];
  votingInfo: Doc<"voting_info"> | null;
}) {
  const { listed, byLevel } = splitHomeRaces(races);
  const homePath = lang === "es" ? "/es" : "/";

  return (
    <main lang={lang} className="mx-auto w-full max-w-5xl px-4 py-10">
      {election && (
        <JsonLd
          nodes={[
            organizationNode(),
            electionEventNode(election),
            breadcrumbNode([{ name: dict.crumbs.home, path: homePath }]),
          ]}
        />
      )}

      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)] sm:p-10">
        <Stamp>{dict.stamp}</Stamp>
        <h1 className="font-display mt-3 max-w-2xl text-4xl leading-none sm:text-5xl">
          {dict.h1}
        </h1>
        <p className="mt-4 max-w-2xl text-lg">
          {dict.introBeforeDate}{" "}
          <strong>{election?.primaryDate ?? dict.primaryDateFallback}</strong>
          {dict.introAfterDate}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={lang === "es" ? "/es/vote" : "/vote"}
            className="border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
          >
            {dict.howToVoteCta}
          </Link>
          <Link
            href="/races/wi-gov-2026"
            className="border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)] press"
          >
            {dict.governorsRaceCta}
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
          <h2 className="font-display text-lg">{dict.deadlines.heading}</h2>
          <p className="mt-1 text-sm">
            {dict.deadlines.pollsOpenPrefix} {votingInfo.pollsOpen}–{votingInfo.pollsClose} on{" "}
            {votingInfo.primaryDate}. {dict.deadlines.detailsPrefix}{" "}
            <Link href={lang === "es" ? "/es/vote" : "/vote"} className="font-bold underline decoration-2">
              {dict.deadlines.linkText}
            </Link>
            {dict.deadlines.suffix}
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl">{dict.races.heading}</h2>
        <p className="mt-2 max-w-2xl">
          {listed.length}
          {dict.races.countSuffix}
        </p>
        {[...byLevel.entries()].map(([level, group]) => (
          <div key={level} className="mt-6">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {raceLevelLabel(level, lang)}
            </h3>
            {level === "State Legislative" ? (
              // 116 near-identical district races, of which exactly two are on
              // any voter's ballot — a card grid here would be ~39 rows and
              // bury everything below it. Collapsed behind <details> on
              // mobile; the links stay in the DOM either way (SEO).
              <>
                <details className="mt-2 border-2 border-border bg-card p-3 sm:hidden">
                  <summary className="cursor-pointer font-bold">
                    {dict.races.districtRacesSummary(group.length)}
                  </summary>
                  <div className="mt-3">
                    <DistrictRaces races={group} />
                  </div>
                </details>
                <div className="hidden sm:block">
                  <DistrictRaces races={group} />
                </div>
              </>
            ) : (
              <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((race) => (
                  <RaceCard key={race.raceId} race={race} locale={lang} />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
