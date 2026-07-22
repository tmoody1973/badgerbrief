"use client";

import { useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/retroui/Button";
import { asMessage, ErrorLine } from "./draft-row";

type Lean = "supports_d" | "supports_r" | "bipartisan" | "issue";
type Source = { label: string; url: string };

const LEANS: [Lean, string][] = [
  ["supports_d", "Supports D"],
  ["supports_r", "Supports R"],
  ["bipartisan", "Bipartisan"],
  ["issue", "Issue"],
];

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Reviewer-assisted "who is this group" panel for an outside-group ad. Runs
 * full enrichment (FEC exact facts + a Firecrawl/Perplexity-sourced
 * narrative), then lets the reviewer edit + approve before anything
 * publishes. Exact facts (kind, totals, donors) auto-publish; the narrative
 * only ever shows publicly once approved here.
 */
export function SponsorResolver({ advertiser }: { advertiser: string }) {
  const existing = useQuery(api.sponsors.sponsorForName, { advertiser });
  const convex = useConvex();
  const enrich = useAction(api.sponsorEnrich.enrichSponsor);
  const save = useMutation(api.sponsors.saveSponsor);
  const saveNarrativeDraft = useMutation(api.sponsors.saveNarrativeDraft);
  const approveNarrative = useMutation(api.sponsors.approveNarrative);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards re-seeding editable state from `existing` — only the first open
  // (or a fresh save/enrich) should overwrite whatever the reviewer typed.
  const [seeded, setSeeded] = useState(false);

  // Editable draft (manual facts, saved via saveSponsor).
  const [displayName, setDisplayName] = useState(advertiser);
  const [kind, setKind] = useState("");
  const [lean, setLean] = useState<Lean | "">("");
  const [summary, setSummary] = useState("");
  const [fecId, setFecId] = useState("");
  const [disclosesDonors, setDisclosesDonors] = useState<boolean | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  // Narrative draft (saved via saveNarrativeDraft/approveNarrative).
  const [narrative, setNarrative] = useState("");

  // Seed local edit state from a saved row — called only on explicit events
  // (panel open, enrich success), never reactively. Reacting to Convex's live
  // `existing` query here would revert unsaved reviewer edits every time a
  // narrative save/approve/enrich re-pushes the same row.
  function fillFrom(s: {
    displayName?: string;
    kind?: string;
    lean?: Lean;
    summary?: string;
    fecCommitteeId?: string;
    disclosesDonors?: boolean;
    sources?: Source[];
    narrative?: string;
  }) {
    if (s.displayName) setDisplayName(s.displayName);
    if (s.kind) setKind(s.kind);
    if (s.lean) setLean(s.lean);
    if (s.summary) setSummary(s.summary);
    if (s.fecCommitteeId) setFecId(s.fecCommitteeId);
    if (s.disclosesDonors !== undefined) setDisclosesDonors(s.disclosesDonors);
    if (s.sources) setSources(s.sources);
    if (s.narrative) setNarrative(s.narrative);
  }

  const key = existing?.key ?? normalizeKey(advertiser);

  async function runEnrich() {
    setBusy(true);
    setError(null);
    try {
      await enrich({ advertiser, fecCommitteeId: fecId || undefined });
      // enrichSponsor only returns { key }; re-fetch the row it just wrote so
      // the narrative textarea + facts pick up the fresh draft, one-shot.
      const fresh = await convex.query(api.sponsors.sponsorForName, { advertiser });
      if (fresh) {
        fillFrom(fresh);
        setSeeded(true);
      }
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function persist() {
    setBusy(true);
    setError(null);
    try {
      await save({
        key,
        displayName,
        kind: kind || undefined,
        lean: lean || undefined,
        summary: summary || undefined,
        fecCommitteeId: fecId || undefined,
        disclosesDonors: disclosesDonors ?? undefined,
        sources,
      });
      setSeeded(false);
      setOpen(false);
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      await saveNarrativeDraft({ key, narrative, leadership: existing?.leadership });
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!narrative.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Persist exactly what's on screen first — approving must never publish
      // a stale last-saved draft while the textarea shows unsaved edits.
      await saveNarrativeDraft({ key, narrative, leadership: existing?.leadership });
      await approveNarrative({ key });
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Collapsed line: show the saved profile (if any) + a toggle.
  const savedLabel = existing
    ? `${existing.displayName}${existing.kind ? ` · ${existing.kind}` : ""} ${existing.factsFlag ? "⚠" : "✓"}`
    : "No sponsor profile yet";
  const narrativeStatus = existing?.narrativeStatus ?? "none";

  return (
    <div className="mt-2 border-t-2 border-dashed border-border pt-2">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (existing && !seeded) {
            fillFrom(existing);
            setSeeded(true);
          }
        }}
        className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {open ? "▾" : "▸"} Sponsor: {savedLabel}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Decoy-FEC-match warning from auto enrichment — reviewer must see it
              before trusting the published facts. Same alert styling as errors. */}
          <ErrorLine message={existing?.factsFlag ?? null} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={runEnrich}>
              {busy
                ? "Enriching…"
                : existing?.enrichedAt
                  ? "Re-enrich (FEC + web)"
                  : "Enrich (FEC + web)"}
            </Button>
            <input
              value={fecId}
              onChange={(e) => setFecId(e.target.value)}
              placeholder="FEC committee ID (e.g. C00495028)"
              className="min-w-48 flex-1 border-2 border-border bg-card px-2 py-1.5 font-mono text-xs"
            />
          </div>
          <ErrorLine message={error} />

          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label="Display name"
            className="w-full border-2 border-border bg-card px-2 py-1.5 font-mono text-sm font-bold"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="Kind (Super PAC, Dark money…)"
              className="min-w-40 flex-1 border-2 border-border bg-card px-2 py-1.5 font-mono text-xs"
            />
            <div className="flex">
              {LEANS.map(([val, label], i) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={lean === val}
                  onClick={() => setLean(lean === val ? "" : val)}
                  className={`border-2 border-border px-2 py-1.5 font-mono text-[11px] font-bold ${
                    i > 0 ? "-ml-0.5" : ""
                  } ${lean === val ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={disclosesDonors === false}
              onClick={() =>
                setDisclosesDonors(disclosesDonors === false ? null : false)
              }
              className={`border-2 border-border px-2 py-1.5 font-mono text-[11px] font-bold ${
                disclosesDonors === false ? "bg-warning text-foreground" : "bg-card"
              }`}
            >
              Dark money
            </button>
          </div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-sentence, sourced description…"
            rows={3}
            className="w-full border-2 border-border bg-card px-2 py-1.5 text-sm"
          />
          {sources.length > 0 && (
            <p className="font-mono text-[11px] text-muted-foreground">
              Sources:{" "}
              {sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && " · "}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-2 underline-offset-2"
                  >
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
          )}
          <Button disabled={busy || !displayName} onClick={persist}>
            {busy ? "Saving…" : "Save sponsor profile"}
          </Button>

          {existing && (existing.totalRaised !== undefined || existing.totalSpent !== undefined) && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {existing.totalRaised !== undefined && `Raised ${money(existing.totalRaised)}`}
              {existing.totalRaised !== undefined && existing.totalSpent !== undefined && " · "}
              {existing.totalSpent !== undefined && `Spent ${money(existing.totalSpent)}`}
              {existing.financialsAsOf && ` · as of ${existing.financialsAsOf}`}
            </p>
          )}

          <div className="border-t-2 border-dashed border-border pt-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Narrative ({narrativeStatus})
            </p>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Sourced narrative shown on the public sponsor profile once approved…"
              rows={4}
              className="mt-1 w-full border-2 border-border bg-card px-2 py-1.5 text-sm"
            />
            {existing?.leadership && existing.leadership.length > 0 && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Leadership:{" "}
                {existing.leadership.map((p, i) => (
                  <span key={`${p.name}-${p.role}`}>
                    {i > 0 && " · "}
                    {p.name} ({p.role})
                  </span>
                ))}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || !narrative.trim()}
                onClick={saveDraft}
              >
                {busy ? "Saving…" : "Save narrative draft"}
              </Button>
              <Button
                disabled={busy || !narrative.trim() || narrativeStatus === "approved"}
                onClick={approve}
              >
                {busy ? "Approving…" : "Approve narrative"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mirror convex/lib/sponsors.normalizeSponsorKey for the create path. */
function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
