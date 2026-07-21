import { getTvAdTracker } from "@/lib/data";

type Sponsor = Awaited<ReturnType<typeof getTvAdTracker>>[number];

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function leanLabel(lean?: string): string | null {
  return lean === "supports_d"
    ? "Supports Democrats"
    : lean === "supports_r"
      ? "Supports Republicans"
      : lean === "bipartisan"
        ? "Bipartisan"
        : lean === "issue"
          ? "Issue advocacy"
          : null;
}

function SponsorCard({ s }: { s: Sponsor }) {
  const about = [...s.candidates, ...s.issues];
  const lean = leanLabel(s.sponsorProfile?.lean);
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-lg">{s.sponsor}</h3>
        <span className="font-mono text-xl font-bold">{usd(s.totalSpend)}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {s.orderCount} order{s.orderCount === 1 ? "" : "s"}
        {s.stations.length ? ` · ${s.stations.length} stations` : ""}
        {s.dmas.length ? ` · ${s.dmas.join(", ")}` : ""}
      </p>

      {about.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Ads refer to:{" "}
          </span>
          {s.candidates.map((c) => (
            <span
              key={c}
              className="mr-1.5 inline-block border-2 border-border bg-secondary px-1.5 font-bold"
            >
              {c}
            </span>
          ))}
          {s.issues.map((i) => (
            <span
              key={i}
              className="mr-1.5 inline-block border-2 border-border bg-background px-1.5"
            >
              {i}
            </span>
          ))}
        </p>
      )}

      {(s.sponsorProfile || s.pdfUrl) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {s.sponsorProfile?.disclosesDonors === false && (
            <span className="border-2 border-border bg-warning px-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground">
              Dark money
            </span>
          )}
          {lean && (
            <span className="border-2 border-border bg-secondary px-1.5 font-mono text-[10px] uppercase tracking-widest text-secondary-foreground">
              {lean}
            </span>
          )}
          {s.pdfUrl && (
            <a
              href={s.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press border-2 border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-widest"
            >
              FCC order ↗
            </a>
          )}
        </div>
      )}

      {s.sponsorProfile?.summary && (
        <details className="mt-2 border-t-2 border-dashed border-border pt-2">
          <summary className="cursor-pointer font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Who is this?{s.sponsorProfile.kind ? ` · ${s.sponsorProfile.kind}` : ""}
          </summary>
          <p className="mt-2 text-sm">{s.sponsorProfile.summary}</p>
          {s.sponsorProfile.sources.length > 0 && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Sources:{" "}
              {s.sponsorProfile.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && " · "}
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-2 underline-offset-2"
                  >
                    {src.label}
                  </a>
                </span>
              ))}
            </p>
          )}
        </details>
      )}
    </div>
  );
}

/** Broadcast-TV outside-spending on the ad tracker: who's buying Wisconsin's
 * airwaves, by sponsor, with exact spend and what each sponsor's FCC disclosure
 * says the ads are about. */
export function TvAdTracker({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;
  const total = sponsors.reduce((s, x) => s + x.totalSpend, 0);
  return (
    <section id="tv-ads">
      <h2 className="font-display text-2xl">Broadcast TV ads</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Political ad orders on Wisconsin broadcast stations, from the FCC public
        files — <strong>{usd(total)}</strong> tracked so far. TV spend is exact
        (stated on the order). &ldquo;Refers to&rdquo; comes from each
        sponsor&apos;s own required FCC disclosure form.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {sponsors.map((s) => (
          <SponsorCard key={s.key} s={s} />
        ))}
      </div>
    </section>
  );
}
