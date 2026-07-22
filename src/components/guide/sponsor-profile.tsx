import Link from "next/link";

type Profile = Awaited<ReturnType<typeof import("@/lib/data").getSponsorProfile>>;
type Scorecard = Awaited<ReturnType<typeof import("@/lib/data").getSponsorScorecard>>;
type Ads = Awaited<ReturnType<typeof import("@/lib/data").getSponsorAds>>;

function usd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function leanLabel(lean?: string): string | null {
  return lean === "supports_d"
    ? "Supports D"
    : lean === "supports_r"
      ? "Supports R"
      : lean === "bipartisan"
        ? "Bipartisan"
        : lean === "issue"
          ? "Issue"
          : null;
}

export function SponsorProfile({
  profile, scorecard, ads, names,
}: { profile: NonNullable<Profile>; scorecard: Scorecard; ads: Ads; names: Record<string, string> }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl leading-none sm:text-4xl">{profile.displayName}</h1>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs font-bold uppercase tracking-widest">
          {profile.kind && <span className="border-2 border-border bg-card px-2 py-1">{profile.kind}</span>}
          {profile.lean && leanLabel(profile.lean) && (
            <span className="border-2 border-border bg-card px-2 py-1">{leanLabel(profile.lean)}</span>
          )}
          {profile.disclosesDonors === false && (
            <span className="border-2 border-border bg-warning px-2 py-1 text-foreground">Does not disclose donors</span>
          )}
        </div>
      </header>

      {profile.narrative ? (
        <section>
          <h2 className="font-display text-xl">Who&apos;s behind it</h2>
          <div className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <p className="max-w-2xl">{profile.narrative}</p>
            {profile.leadership && profile.leadership.length > 0 && (
              <ul className="mt-3 font-mono text-xs text-muted-foreground">
                {profile.leadership.map((l, i) => <li key={`${l.name}-${i}`}>{l.name} — {l.role}</li>)}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Profile in review</p>
      )}

      <section>
        <h2 className="font-display text-xl">The money</h2>
        <div className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
          <p className="text-sm text-muted-foreground">
            {profile.disclosesDonors === false
              ? "This group does not disclose its funders."
              : `Raised ${profile.totalRaised ? usd(profile.totalRaised) : "—"} · spent ${profile.totalSpent ? usd(profile.totalSpent) : "—"}${profile.financialsAsOf ? ` (as of ${profile.financialsAsOf})` : ""}.`}
          </p>
          {profile.topDonors && profile.topDonors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {profile.topDonors.map((d) => (
                <li key={d.name} className="flex justify-between border-b-2 border-dashed border-border py-1 text-sm">
                  <span>{d.name}</span><span className="font-mono font-bold">{usd(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl">Who they support &amp; attack</h2>
        <div className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
          {scorecard.supported.length === 0 && scorecard.attacked.length === 0 &&
            (!profile.independentExpenditures || profile.independentExpenditures.length === 0) ? (
            <p className="text-sm text-muted-foreground">No candidate spending we&apos;ve tracked yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">In Wisconsin (our tracked ads)</p>
                {scorecard.supported.length === 0 && scorecard.attacked.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No Wisconsin ad spend tracked yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {scorecard.supported.map((r) => (
                      <li key={`s-${r.candidateSlug}`}>
                        <span className="text-accent">Backed</span>{" "}
                        <Link href={`/candidates/${r.candidateSlug}`} className="underline decoration-2 underline-offset-2">{names[r.candidateSlug] ?? r.candidateSlug}</Link>{" "}
                        · {usd(r.spend)}
                      </li>
                    ))}
                    {scorecard.attacked.map((r) => (
                      <li key={`a-${r.candidateSlug}`}>
                        <span className="text-primary">Attacked</span>{" "}
                        <Link href={`/candidates/${r.candidateSlug}`} className="underline decoration-2 underline-offset-2">{names[r.candidateSlug] ?? r.candidateSlug}</Link>{" "}
                        · {usd(r.spend)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {profile.independentExpenditures && profile.independentExpenditures.length > 0 && (
                <div>
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Largest national expenditures (FEC)</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {profile.independentExpenditures.map((ie) => (
                      <li key={`${ie.candidate}-${ie.supportOppose}`}>
                        <span className={ie.supportOppose === "support" ? "text-accent" : "text-primary"}>
                          {ie.supportOppose === "support" ? "Backed" : "Attacked"}
                        </span>{" "}{ie.candidate} · {usd(ie.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {ads.length > 0 && (
        <section>
          <h2 className="font-display text-xl">Their tracked ads</h2>
          <div className="mt-3 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <ul className="space-y-1 text-sm">
              {ads.map((ad) => {
                const link = ad.snapshotUrl ?? ad.creativeLinkUrl ?? ad.fccDocUrl;
                const low = ad.spendLower ?? 0;
                const high = ad.spendUpper ?? 0;
                const spend = high > low ? `${usd(low)}–${usd(high)}` : high > 0 ? usd(high) : "—";
                return (
                  <li key={ad._id} className="flex justify-between border-b-2 border-dashed border-border py-1">
                    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{ad.platform}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono font-bold">{spend}</span>
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2">View ad ↗</a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {profile.sources.length > 0 && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Sources:{" "}
          {profile.sources.map((s, i) => (
            <span key={s.url}>{i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2">{s.label}</a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
