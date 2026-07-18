import type { Doc } from "../../../convex/_generated/dataModel";

const fmt = (n?: number) =>
  n === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);

function SourceNote({ source }: { source: "openfec" | "sunshine" }) {
  return source === "openfec" ? (
    <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      Source:{" "}
      <a href="https://www.fec.gov/data/" className="underline" rel="noopener noreferrer" target="_blank">
        Federal Election Commission
      </a>
    </p>
  ) : (
    <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      Source:{" "}
      <a href="https://campaignfinance.wi.gov" className="underline" rel="noopener noreferrer" target="_blank">
        WI Ethics Commission (Sunshine)
      </a>{" "}
      · non-commercial voter education use
    </p>
  );
}

export function FinancePanel({
  totals,
  contributions,
  candidateName,
}: {
  totals: Doc<"finance_totals">[];
  contributions?: Doc<"contributions">[];
  candidateName: string;
}) {
  if (totals.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl">
        How much money has {candidateName} raised?
      </h2>
      {totals.map((t) => (
        <div
          key={t._id}
          className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
        >
          <div
            className={`grid gap-3 text-center ${
              t.debts !== undefined ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
            }`}
          >
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Raised
              </p>
              <p className="font-display text-xl">{fmt(t.receipts)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Spent
              </p>
              <p className="font-display text-xl">{fmt(t.disbursements)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Cash on hand
              </p>
              <p className="font-display text-xl">{fmt(t.cashOnHand)}</p>
            </div>
            {t.debts !== undefined && (
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Debts
                </p>
                <p className="font-display text-xl">{fmt(t.debts)}</p>
              </div>
            )}
          </div>
          {t.coverageEndDate && (
            <p className="mt-3 text-center font-mono text-xs text-muted-foreground">
              through {t.coverageEndDate}
            </p>
          )}
          <SourceNote source={t.source} />
        </div>
      ))}
      {contributions && contributions.length > 0 && (() => {
        const ranked = [...contributions].sort((a, b) => b.amount - a.amount);
        const isOrg = (t?: string) =>
          !!t && t.toLowerCase() !== "individual" && t.toLowerCase() !== "anonymous";
        const orgs = ranked.filter((c) => isOrg(c.contributorType)).slice(0, 10);
        return (
          <>
            <div className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
                Top reported contributors
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {ranked.slice(0, 10).map((c) => (
                  <li key={c._id} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
                    <span>
                      {c.contributorName}
                      {c.contributorLocation ? ` (${c.contributorLocation})` : ""}
                    </span>
                    <span className="font-mono">{fmt(c.amount)}</span>
                  </li>
                ))}
              </ul>
              <SourceNote source={contributions[0].source} />
            </div>
            {orgs.length > 0 && (
              <div className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
                <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
                  Top organization &amp; PAC donors
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {orgs.map((c) => (
                    <li key={c._id} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
                      <span>
                        {c.contributorName}
                        {c.contributorLocation ? ` (${c.contributorLocation})` : ""}
                        {c.contributorType && c.contributorType !== "Business" ? (
                          <span className="ml-1 font-mono text-[10px] uppercase text-muted-foreground">
                            {c.contributorType === "Registrant" ? "PAC/Committee" : c.contributorType}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono">{fmt(c.amount)}</span>
                    </li>
                  ))}
                </ul>
                <SourceNote source={contributions[0].source} />
              </div>
            )}
          </>
        );
      })()}
    </section>
  );
}

export function RaceFinanceTable({
  finance,
  candidates,
}: {
  finance: Doc<"finance_totals">[];
  candidates: Doc<"candidates">[];
}) {
  if (finance.length === 0) return null;
  const nameBySlug = new Map(candidates.map((c) => [c.slug, c.name]));
  const rows = [...finance].sort(
    (a, b) => (b.receipts ?? 0) - (a.receipts ?? 0),
  );
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">Who has raised the most money?</h2>
      <div className="mt-3 overflow-x-auto border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-secondary text-left">
              <th className="p-3 font-display text-sm">Candidate</th>
              <th className="p-3 font-mono text-xs font-bold uppercase">Raised</th>
              <th className="p-3 font-mono text-xs font-bold uppercase">Spent</th>
              <th className="p-3 font-mono text-xs font-bold uppercase">Cash on hand</th>
              <th className="p-3 font-mono text-xs font-bold uppercase">Through</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t._id} className="border-b border-dashed border-border">
                <td className="p-3 font-bold">
                  {nameBySlug.get(t.candidateSlug) ?? t.candidateSlug}
                </td>
                <td className="p-3 font-mono">{fmt(t.receipts)}</td>
                <td className="p-3 font-mono">{fmt(t.disbursements)}</td>
                <td className="p-3 font-mono">{fmt(t.cashOnHand)}</td>
                <td className="p-3 font-mono text-xs">{t.coverageEndDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Federal data: FEC. State data: WI Ethics Commission Sunshine
        (non-commercial voter education use).
      </p>
    </section>
  );
}
