const KIND_STYLES: Record<string, string> = {
  official: "bg-accent text-accent-foreground",
  campaign: "bg-secondary text-secondary-foreground",
  reported: "bg-card text-card-foreground",
  reference: "bg-muted text-foreground",
  "ad-library": "bg-warning text-foreground",
};

/** Labels the provenance of a claim: official rule vs campaign claim vs reporting. */
export function SourceTrustLabel({ kind }: { kind: string }) {
  return (
    <span
      className={`inline-block border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${KIND_STYLES[kind] ?? KIND_STYLES.reference}`}
    >
      {kind}
    </span>
  );
}

export function PartyBadge({ party }: { party?: string }) {
  if (!party) return null;
  const styles =
    party === "Democratic"
      ? "bg-accent text-accent-foreground"
      : party === "Republican"
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-foreground";
  return (
    <span
      className={`inline-block border-2 border-border px-2 py-0.5 text-xs font-bold ${styles}`}
    >
      {party}
    </span>
  );
}

export function Stamp({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block -rotate-2 border-2 border-primary px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest text-primary">
      {children}
    </span>
  );
}

export function LastUpdated({ date }: { date: string }) {
  const parsed = new Date(date);
  const iso = isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
  return (
    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
      Last updated: <time dateTime={iso}>{date}</time>
    </p>
  );
}
