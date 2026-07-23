"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { OUTLET_TYPES, type OutletType } from "../../../convex/lib/outlets";
import { Button } from "@/components/retroui/Button";
import { asMessage, ErrorLine } from "./draft-row";

type Outlet = {
  key: string;
  displayName: string;
  type: OutletType;
  ownership?: string;
  fundingNote?: string;
  ownershipSourceUrl?: string;
  domain?: string;
  reviewStatus: "draft" | "approved";
};

const TYPE_LABELS: Record<OutletType, string> = {
  nonprofit: "Nonprofit",
  public_media: "Public media",
  corporate_daily: "Corporate daily",
  wire: "Wire",
  trade: "Trade",
  tv: "TV",
  national: "National",
  other: "Other",
};

/**
 * Reviewer panel for one draft outlet's transparency facts (ownership,
 * funding, type). Mirrors SponsorResolver: enrich from the web, edit, save,
 * approve — approving is what makes the outlet visible on public
 * outlet/coverage pages.
 */
export function OutletEditor({ outlet }: { outlet: Outlet }) {
  const enrich = useAction(api.outletEnrich.enrichOutlet);
  const save = useMutation(api.outlets.saveOutlet);
  const approve = useMutation(api.outlets.approveOutlet);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards re-seeding editable state from the live `outlet` prop — only panel
  // open (or a fresh enrich) should overwrite whatever the reviewer typed.
  // Reacting to every reactive push here would revert unsaved edits.
  const [seeded, setSeeded] = useState(false);

  const [displayName, setDisplayName] = useState(outlet.displayName);
  const [type, setType] = useState<OutletType>(outlet.type);
  const [ownership, setOwnership] = useState(outlet.ownership ?? "");
  const [fundingNote, setFundingNote] = useState(outlet.fundingNote ?? "");
  const [ownershipSourceUrl, setOwnershipSourceUrl] = useState(
    outlet.ownershipSourceUrl ?? "",
  );

  function fillFrom(o: Outlet) {
    setDisplayName(o.displayName);
    setType(o.type);
    setOwnership(o.ownership ?? "");
    setFundingNote(o.fundingNote ?? "");
    setOwnershipSourceUrl(o.ownershipSourceUrl ?? "");
  }

  // Seed once per open, and again after `runEnrich` clears `seeded` — by then
  // Convex's read-your-writes guarantee means `outlet` (the parent's live
  // listDraftOutlets row) already reflects the enrich.
  useEffect(() => {
    if (open && !seeded) {
      fillFrom(outlet);
      setSeeded(true);
    }
  }, [open, seeded, outlet]);

  async function runEnrich() {
    setBusy(true);
    setError(null);
    try {
      await enrich({ name: outlet.displayName, url: outlet.domain ? `https://${outlet.domain}` : undefined });
      setSeeded(false);
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
        key: outlet.key,
        displayName,
        type,
        ownership: ownership || undefined,
        fundingNote: fundingNote || undefined,
        ownershipSourceUrl: ownershipSourceUrl || undefined,
        domain: outlet.domain,
      });
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runApprove() {
    setBusy(true);
    setError(null);
    try {
      await approve({ key: outlet.key });
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {open ? "▾" : "▸"} {outlet.displayName} · {TYPE_LABELS[outlet.type]}{" "}
        {outlet.reviewStatus === "approved" ? "✓" : "draft"}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={runEnrich}>
              {busy ? "Enriching…" : "Enrich (web)"}
            </Button>
          </div>
          <ErrorLine message={error} />

          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label="Display name"
            className="w-full border-2 border-border bg-card px-2 py-1.5 font-mono text-sm font-bold"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OutletType)}
            aria-label="Outlet type"
            className="w-full border-2 border-border bg-card px-2 py-1.5 font-mono text-xs"
          >
            {OUTLET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            value={ownership}
            onChange={(e) => setOwnership(e.target.value)}
            placeholder="Ownership (e.g. owned by Gannett)"
            className="w-full border-2 border-border bg-card px-2 py-1.5 font-mono text-xs"
          />
          <textarea
            value={fundingNote}
            onChange={(e) => setFundingNote(e.target.value)}
            placeholder="Funding note (grants, membership, ad revenue…)"
            rows={2}
            className="w-full border-2 border-border bg-card px-2 py-1.5 text-sm"
          />
          <input
            value={ownershipSourceUrl}
            onChange={(e) => setOwnershipSourceUrl(e.target.value)}
            placeholder="Source URL for the ownership/funding claim"
            className="w-full border-2 border-border bg-card px-2 py-1.5 font-mono text-xs"
          />

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !displayName} onClick={persist}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || outlet.reviewStatus === "approved"}
              onClick={runApprove}
            >
              {busy
                ? "Approving…"
                : outlet.reviewStatus === "approved"
                  ? "Approved"
                  : "Approve"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
