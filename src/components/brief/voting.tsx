"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CURRENT_ELECTION } from "@/lib/election";
import { BriefSkeleton, NotFoundCard } from "./chrome";

export type DeadlineKind =
  | "registration"
  | "absentee_request"
  | "absentee_return"
  | "early_voting";

const KIND_LABEL: Record<DeadlineKind, string> = {
  registration: "Voter registration",
  absentee_request: "Absentee ballot request",
  absentee_return: "Absentee ballot return",
  early_voting: "Early voting",
};

// A flag such as earlyVoting.available is not a fact to print ("Available: true").
const rows = (map: unknown): [string, string][] =>
  map && typeof map === "object"
    ? Object.entries(map as Record<string, unknown>)
        .filter(([, v]) => typeof v !== "boolean")
        .map(([k, v]) => [k.replaceAll("_", " "), String(v)])
    : [];

// No countdown: the Phase 1b design rules out countdown clocks and other
// urgency devices. The date comes from src/lib/election.ts, the one place it lives.
export function BriefHeaderView() {
  return (
    <header className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Your Wisconsin ballot brief
      </p>
      <h1 className="font-display mt-1 text-3xl">
        Election day: {CURRENT_ELECTION.longDate}
      </h1>
    </header>
  );
}

export function DeadlineBannerView({ kind }: { kind: DeadlineKind }) {
  const info = useQuery(api.public.getVotingInfo, {});
  if (info === undefined) return <BriefSkeleton lines={2} />;
  if (info === null) return <NotFoundCard entity="voting information" />;
  const map: Record<DeadlineKind, unknown> = {
    registration: info.voterRegistration,
    absentee_request: info.absenteeRequestDeadline,
    absentee_return: info.absenteeReturnDeadline,
    early_voting: info.earlyVoting,
  };
  const entries = rows(map[kind]);
  if (entries.length === 0) return <NotFoundCard entity={KIND_LABEL[kind]} />;
  return (
    <div className="border-2 border-border bg-warning p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest">
        Deadline — {KIND_LABEL[kind]}
      </p>
      <dl className="mt-2 text-sm">
        {entries.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="capitalize">{label}</dt>
            <dd className="font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide">
        Source:{" "}
        <a href={info.officialVoterInfoUrl} className="underline" rel="noopener noreferrer" target="_blank">
          official election info
        </a>
      </p>
    </div>
  );
}

export function VotingChecklistView() {
  const info = useQuery(api.public.getVotingInfo, {});
  if (info === undefined) return <BriefSkeleton lines={5} />;
  if (info === null) return <NotFoundCard entity="voting information" />;
  const items: [string, [string, string][]][] = [
    ["Register to vote", rows(info.voterRegistration)],
    ["Request an absentee ballot", rows(info.absenteeRequestDeadline)],
    ["Return your absentee ballot", rows(info.absenteeReturnDeadline)],
    ["Vote early in person", rows(info.earlyVoting)],
  ];
  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl">Your voting checklist</h2>
      <ol className="mt-3 space-y-3">
        {items
          .filter(([, entries]) => entries.length > 0)
          .map(([title, entries]) => (
            <li key={title} className="border-b border-border pb-2 last:border-b-0">
              <p className="font-bold">☐ {title}</p>
              <dl className="mt-1 text-sm text-muted-foreground">
                {entries.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="capitalize">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        <li>
          <p className="font-bold">
            ☐ Vote on {CURRENT_ELECTION.longDate}
            {info.pollsOpen && info.pollsClose && (
              <span className="font-normal text-muted-foreground">
                {" "}
                — polls {info.pollsOpen}–{info.pollsClose}
              </span>
            )}
          </p>
        </li>
      </ol>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Source:{" "}
        <a href={info.officialVoterInfoUrl} className="underline" rel="noopener noreferrer" target="_blank">
          official election info
        </a>
      </p>
    </section>
  );
}
