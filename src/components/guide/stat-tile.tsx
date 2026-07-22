/** Shared stat tile for the /ads KPI + analytics rows. Value on top in mono
 * (the Stamp Rule — amounts and counts read as record stamps), label below,
 * optional supporting note. break-words so a long range ("$11.5M–$13.7M")
 * wraps instead of overflowing the narrow 4-up analytics tiles. */
export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="break-words font-mono text-2xl font-bold leading-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
