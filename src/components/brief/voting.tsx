"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
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

const rows = (map: unknown): [string, string][] =>
  map && typeof map === "object"
    ? Object.entries(map as Record<string, string>).map(([k, v]) => [
        k.replaceAll("_", " "),
        String(v),
      ])
    : [];

export function BriefHeaderView() {
  const election = useQuery(api.public.getElection, {});
  if (election === undefined) return <BriefSkeleton lines={2} />;
  if (election === null) return <NotFoundCard entity="the election" />;
  const days = Math.ceil(
    (new Date(`${election.primaryDate}T00:00:00-05:00`).getTime() - Date.now()) /
      86_400_000,
  );
  return (
    <header className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Your Wisconsin primary brief
      </p>
      <h1 className="font-display mt-1 text-3xl">
        Primary day: {election.primaryDate}
      </h1>
      {days >= 0 && (
        <p className="mt-2 inline-block border-2 border-border bg-warning px-2 py-0.5 text-sm font-bold">
          {days === 0 ? "Election day is today" : `${days} days to go`}
        </p>
      )}
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
            ☐ Vote on {info.primaryDate}
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
