"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
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

/**
 * Reviewer-assisted "who is this group" panel for an outside-group ad. Looks the
 * sponsor up (FEC + Perplexity), pre-fills an editable draft, and saves an
 * approved profile reused across every ad from that sponsor. Nothing publishes
 * until saved here.
 */
export function SponsorResolver({ advertiser }: { advertiser: string }) {
  const existing = useQuery(api.sponsors.sponsorForName, { advertiser });
  const lookup = useAction(api.sponsors.lookupSponsor);
  const save = useMutation(api.sponsors.saveSponsor);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Editable draft.
  const [displayName, setDisplayName] = useState(advertiser);
  const [kind, setKind] = useState("");
  const [lean, setLean] = useState<Lean | "">("");
  const [summary, setSummary] = useState("");
  const [fecId, setFecId] = useState("");
  const [disclosesDonors, setDisclosesDonors] = useState<boolean | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  function fillFrom(s: {
    displayName?: string;
    kind?: string;
    lean?: Lean;
    summary?: string;
    fecCommitteeId?: string;
    disclosesDonors?: boolean;
    sources?: Source[];
  }) {
    if (s.displayName) setDisplayName(s.displayName);
    if (s.kind) setKind(s.kind);
    if (s.lean) setLean(s.lean);
    if (s.summary) setSummary(s.summary);
    if (s.fecCommitteeId) setFecId(s.fecCommitteeId);
    if (s.disclosesDonors !== undefined) setDisclosesDonors(s.disclosesDonors);
    if (s.sources) setSources(s.sources);
  }

  async function runLookup() {
    setBusy(true);
    setError(null);
    try {
      const r = await lookup({ advertiser, fecCommitteeId: fecId || undefined });
      fillFrom({ displayName: r.displayName, ...r.suggested });
      setLoaded(true);
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
        key: existing?.key ?? normalizeKey(advertiser),
        displayName,
        kind: kind || undefined,
        lean: lean || undefined,
        summary: summary || undefined,
        fecCommitteeId: fecId || undefined,
        disclosesDonors: disclosesDonors ?? undefined,
        sources,
      });
      setLoaded(false);
      setOpen(false);
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Collapsed line: show the saved profile (if any) + a toggle.
  const savedLabel = existing
    ? `${existing.displayName}${existing.kind ? ` · ${existing.kind}` : ""} ✓`
    : "No sponsor profile yet";

  return (
    <div className="mt-2 border-t-2 border-dashed border-border pt-2">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (existing && !loaded) fillFrom(existing);
        }}
        className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {open ? "▾" : "▸"} Sponsor: {savedLabel}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={runLookup}>
              {busy ? "Looking up…" : loaded ? "Re-look up" : "Look up (FEC + web)"}
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
