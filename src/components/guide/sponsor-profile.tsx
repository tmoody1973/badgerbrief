import Link from "next/link";

type Profile = Awaited<ReturnType<typeof import("@/lib/data").getSponsorProfile>>;
type Scorecard = Awaited<ReturnType<typeof import("@/lib/data").getSponsorScorecard>>;

function usd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function SponsorProfile({
  profile, scorecard, names,
}: { profile: NonNullable<Profile>; scorecard: Scorecard; names: Record<string, string> }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl leading-none sm:text-4xl">{profile.displayName}</h1>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs font-bold uppercase tracking-widest">
          {profile.kind && <span className="border-2 border-border bg-card px-2 py-1">{profile.kind}</span>}
          {profile.disclosesDonors === false && (
            <span className="border-2 border-border bg-warning px-2 py-1 text-foreground">Does not disclose donors</span>
          )}
        </div>
      </header>

      {profile.narrative ? (
        <section>
          <h2 className="font-display text-xl">Who&apos;s behind it</h2>
          <p className="mt-2 max-w-2xl">{profile.narrative}</p>
          {profile.leadership && profile.leadership.length > 0 && (
            <ul className="mt-3 font-mono text-xs text-muted-foreground">
              {profile.leadership.map((l) => <li key={l.name}>{l.name} — {l.role}</li>)}
            </ul>
          )}
        </section>
      ) : (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Profile in review</p>
      )}

      <section>
        <h2 className="font-display text-xl">The money</h2>
        <p className="mt-1 text-sm text-muted-foreground">
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
      </section>

      <section>
        <h2 className="font-display text-xl">Who they support &amp; attack</h2>
        {scorecard.supported.length === 0 && scorecard.attacked.length === 0 &&
          (!profile.independentExpenditures || profile.independentExpenditures.length === 0) ? (
          <p className="mt-1 text-sm text-muted-foreground">No candidate spending we&apos;ve tracked yet.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">In Wisconsin (our tracked ads)</p>
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
            </div>
            {profile.independentExpenditures && profile.independentExpenditures.length > 0 && (
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Nationally (FEC Schedule E)</p>
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
      </section>

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
