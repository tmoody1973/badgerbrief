import { getTvAdsForRace } from "@/lib/data";

type TvAd = Awaited<ReturnType<typeof getTvAdsForRace>>[number];

function usd(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function flight(a: TvAd): string | null {
  if (!a.flightStart) return null;
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return a.flightEnd
    ? `${fmt(a.flightStart)}–${fmt(a.flightEnd)}`
    : fmt(a.flightStart);
}

function StanceTag({ stance }: { stance?: "support" | "oppose" }) {
  if (!stance) return null;
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-widest ${
        stance === "oppose" ? "text-warning" : "text-secondary-foreground"
      }`}
    >
      {stance === "oppose" ? "Attack" : "Support"}
    </span>
  );
}

function TvAdRow({ a }: { a: TvAd }) {
  const f = flight(a);
  return (
    <div className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold">{a.sponsor}</span>
            <StanceTag stance={a.stance} />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {[a.station, a.dma].filter(Boolean).join(" · ")}
            {a.spotCount ? ` · ${a.spotCount} spots` : ""}
            {f ? ` · ${f}` : ""}
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-lg font-bold">{usd(a.spend)}</span>
          {a.pdfUrl && (
            <a
              href={a.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press border-2 border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-widest"
            >
              FCC order ↗
            </a>
          )}
        </div>
      </div>
      {a.sponsorProfile && <SponsorExplainer p={a.sponsorProfile} />}
    </div>
  );
}

function LeanTag({ lean }: { lean?: string }) {
  const label =
    lean === "supports_d"
      ? "Supports Democrats"
      : lean === "supports_r"
        ? "Supports Republicans"
        : lean === "bipartisan"
          ? "Bipartisan"
          : lean === "issue"
            ? "Issue advocacy"
            : null;
  if (!label) return null;
  return (
    <span className="border-2 border-border bg-secondary px-1.5 font-mono text-[10px] uppercase tracking-widest text-secondary-foreground">
      {label}
    </span>
  );
}

/** "Who is this sponsor" disclosure — reviewer-approved, sourced. Native
 * <details> so it works without client JS on the server-rendered race page. */
function SponsorExplainer({
  p,
}: {
  p: NonNullable<TvAd["sponsorProfile"]>;
}) {
  return (
    <details className="mt-2 border-t-2 border-dashed border-border pt-2">
      <summary className="cursor-pointer font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Who is this? {p.kind ? `· ${p.kind}` : ""}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <LeanTag lean={p.lean} />
          {p.disclosesDonors === false && (
            <span className="border-2 border-border bg-warning px-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground">
              Dark money · donors not disclosed
            </span>
          )}
        </div>
        {p.summary && <p className="text-sm">{p.summary}</p>}
        {p.topDonors && p.topDonors.length > 0 && (
          <p className="font-mono text-[11px] text-muted-foreground">
            Top donors:{" "}
            {p.topDonors
              .slice(0, 3)
              .map((d) => `${d.name} (${usd(d.amount)})`)
              .join(" · ")}
          </p>
        )}
        {p.sources.length > 0 && (
          <p className="font-mono text-[10px] text-muted-foreground">
            Sources:{" "}
            {p.sources.map((s, i) => (
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
      </div>
    </details>
  );
}

/** Race-page broadcast-TV activity: reviewer-approved FCC political-file orders.
 * TV spend is EXACT (stated on the order), framed "reported on FCC orders." */
export function RaceTvAds({ ads }: { ads: TvAd[] }) {
  if (ads.length === 0) return null;
  const total = ads.reduce((s, a) => s + (a.spend ?? 0), 0);
  return (
    <section id="tv-ads" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Broadcast TV ads</h2>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {usd(total)} across {ads.length} order{ads.length === 1 ? "" : "s"} ·
        reported on FCC orders
      </p>
      <div className="mt-3 space-y-2">
        {ads.map((a) => (
          <TvAdRow key={a.id} a={a} />
        ))}
      </div>
    </section>
  );
}
