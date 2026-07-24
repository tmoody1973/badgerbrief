// src/components/guide/voting-record-sessions.tsx
"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type SessionCount = { session: string; count: number };
type PageRow = {
  billNumber: string; billTitle: string; voteType: string; votedOn: string;
  chamber: string; session: string;
  position: "aye" | "nay" | "not_voting";
  ayes: number; nays: number; sourceUrl: string; otherVotesOnBill: number;
  billUrl: string; summary: string | null;
};

const POSITION_LABEL: Record<PageRow["position"], string> = {
  aye: "Voted yes", nay: "Voted no", not_voting: "Did not vote",
};
const FILTERS: { key: PageRow["position"] | null; label: string }[] = [
  { key: null, label: "All" }, { key: "aye", label: "Yes" },
  { key: "nay", label: "No" }, { key: "not_voting", label: "Didn't vote" },
];
const STEP = 25;
const nf = new Intl.NumberFormat("en-US");

const chip = (active: boolean) =>
  `shrink-0 whitespace-nowrap border-2 border-border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${
    active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
  }`;

const linkCls =
  "font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-2 underline-offset-2";

export function VotingRecordSessions({
  candidateSlug, sessions,
}: { candidateSlug: string; sessions: SessionCount[] }) {
  const [openSession, setOpenSession] = useState<string | null>(sessions[0]?.session ?? null);
  return (
    <ol className="mt-3 divide-y-2 divide-border border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      {sessions.map((s) => (
        <SessionGroup
          key={s.session}
          candidateSlug={candidateSlug}
          session={s.session}
          count={s.count}
          open={openSession === s.session}
          onToggle={() => setOpenSession((cur) => (cur === s.session ? null : s.session))}
        />
      ))}
    </ol>
  );
}

function SessionGroup({
  candidateSlug, session, count, open, onToggle,
}: {
  candidateSlug: string; session: string; count: number; open: boolean; onToggle: () => void;
}) {
  const [position, setPosition] = useState<PageRow["position"] | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [limit, setLimit] = useState(STEP);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  // A new search view starts from the first page.
  useEffect(() => { setLimit(STEP); }, [debouncedSearch]);

  const data = useQuery(
    api.votesQueries.votingRecordPage,
    open
      ? { candidateSlug, session, limit, position: position ?? undefined, query: debouncedSearch || undefined }
      : "skip",
  );

  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/40"
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> {session} session
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{nf.format(count)} votes</span>
      </button>

      {open && (
        <div className="border-t-2 border-dashed border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => { setPosition(f.key); setLimit(STEP); }}
                className={chip(position === f.key)}
              >
                {f.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a bill"
              aria-label={`Find a bill in the ${session} session`}
              className="ml-1 min-w-[8rem] flex-1 border-2 border-border bg-card px-2 py-1.5 text-sm"
            />
          </div>

          {data === undefined ? (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Loading…</p>
          ) : data.rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No votes match.</p>
          ) : (
            <>
              <ol className="mt-3 divide-y-2 divide-dashed divide-border">
                {data.rows.map((v) => <Row key={v.sourceUrl} v={v} />)}
              </ol>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Showing {nf.format(data.rows.length)} of {nf.format(data.total)}
                </span>
                {data.hasMore && (
                  <button
                    onClick={() => setLimit((l) => l + STEP)}
                    className="border-2 border-border px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-secondary/40"
                  >
                    Load {Math.min(STEP, data.total - data.rows.length)} more
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Row({ v }: { v: PageRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {v.billNumber} · {v.voteType} · {v.votedOn}
      </p>
      <p className="mt-1 max-w-[62ch] text-sm">{v.billTitle}</p>
      <p className="mt-1 text-sm">
        <span className="font-bold">{POSITION_LABEL[v.position]}</span>
        <span className="text-muted-foreground">
          {" "}· {v.ayes} ayes, {v.nays} nays
          {v.otherVotesOnBill > 0
            ? ` · ${v.otherVotesOnBill} other recorded vote${v.otherVotesOnBill === 1 ? "" : "s"} on this bill`
            : ""}
        </span>
      </p>
      {v.summary && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground underline decoration-dotted underline-offset-2"
          >
            {expanded ? "Hide summary" : "What this bill does"}
          </button>
          {expanded && (
            <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
              &ldquo;{v.summary}&rdquo;{" "}
              <span className="font-mono text-[10px] uppercase tracking-[0.1em]">— LRB analysis</span>
            </p>
          )}
        </div>
      )}
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <a href={v.billUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>Full bill ↗</a>
        <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>Official roll call ↗</a>
      </p>
    </li>
  );
}
