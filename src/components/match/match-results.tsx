"use client";

import Link from "next/link";
import { PartyBadge } from "@/components/guide/labels";
import { SourceList } from "@/components/guide/sources";
import type { IssueMatchGroup } from "@/lib/issue-match";

export function MatchResults({ groups }: { groups: IssueMatchGroup[] }) {
  return (
    <div className="mt-8 space-y-10">
      {groups.map((group) => (
        <section key={group.issueSlug} className="scroll-mt-16">
          <h2 className="font-display text-2xl">{group.label}</h2>
          <div className="mt-3 space-y-5">
            {group.races.map((race) => (
              <div key={race.raceId}>
                <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {race.office}
                </h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {race.onRecord.map(({ candidate, position }) => (
                    <div
                      key={candidate.slug}
                      className="flex flex-col border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/candidates/${candidate.slug}`}
                          className="font-bold underline decoration-2 underline-offset-2"
                        >
                          {candidate.name}
                        </Link>
                        <PartyBadge party={candidate.party} />
                      </div>
                      <span className="mt-2 w-fit border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
                        {position.stance}
                      </span>
                      <p className="mt-2 max-w-[54ch] text-sm">{position.summary}</p>
                      <div className="mt-auto pt-2">
                        <SourceList sources={position.sources} title="Position sources" collapsible />
                      </div>
                    </div>
                  ))}
                </div>
                {race.noRecord.length > 0 && (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    No position on record: {race.noRecord.map((c) => c.name).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
