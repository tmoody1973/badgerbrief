import { getTvAdsForRace } from "@/lib/data";
import { groupTvAds, type TvSponsorGroup } from "@/lib/tv-ads";

type TvAd = Awaited<ReturnType<typeof getTvAdsForRace>>[number];

const STAMP = "font-mono text-xs uppercase tracking-widest";

function usd(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function span(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  return end && end !== start ? `${day(start)}–${day(end)}` : day(start);
}

/** "Attack on Tom Tiffany" / "Support for …". Charcoal on alert yellow: readable on white. */
export function StanceTag({ stance, target }: { stance?: "support" | "oppose"; target?: string }) {
  if (!stance) return null;
  const text = stance === "oppose" ? `Attack${target ? ` on ${target}` : ""}` : `Support${target ? ` for ${target}` : ""}`;
  return (
    <span
      className={`border-2 border-border px-1.5 py-0.5 ${STAMP} font-bold ${stance === "oppose" ? "bg-warning text-foreground" : "bg-secondary text-secondary-foreground"}`}
    >
      {text}
    </span>
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
  return <span className={`border-2 border-border bg-secondary px-1.5 ${STAMP} text-secondary-foreground`}>{label}</span>;
}

/** "Who is this sponsor" disclosure — reviewer-approved, sourced. Native
 * <details> so it works without client JS on the server-rendered race page. */
function SponsorExplainer({ p }: { p: NonNullable<TvAd["sponsorProfile"]> }) {
  return (
    <details className="mt-3">
      <summary className={`cursor-pointer font-bold ${STAMP} text-muted-foreground`}>
        Who is this? {p.kind ? `· ${p.kind}` : ""}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <LeanTag lean={p.lean} />
          {p.disclosesDonors === false && (
            <span className={`border-2 border-border bg-warning px-1.5 ${STAMP} text-foreground`}>Dark money · donors not disclosed</span>
          )}
        </div>
        {p.summary && <p className="text-sm">{p.summary}</p>}
        {p.topDonors && p.topDonors.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Top donors:{" "}
            {p.topDonors
              .slice(0, 3)
              .map((d) => `${d.name} (${usd(d.amount)})`)
              .join(" · ")}
          </p>
        )}
        {p.sources.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Sources:{" "}
            {p.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && " · "}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2">
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

function SponsorRow({ g, names }: { g: TvSponsorGroup<TvAd>; names: Record<string, string> }) {
  const dates = span(g.flightStart, g.flightEnd);
  const profile = g.orders.find((o) => o.sponsorProfile)?.sponsorProfile;
  return (
    <li className="border-b-2 border-dashed border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-bold leading-snug">{g.sponsor}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StanceTag stance={g.stance} target={g.candidateSlug ? names[g.candidateSlug] : undefined} />
            <span className={`${STAMP} text-muted-foreground`}>
              {g.orders.length} order{g.orders.length === 1 ? "" : "s"}
              {dates ? ` · ${dates}` : ""}
            </span>
          </div>
        </div>
        <span className="font-mono text-xl font-bold">{usd(g.total)}</span>
      </div>
      {profile && <SponsorExplainer p={profile} />}
      <details className="mt-3">
        <summary className={`cursor-pointer ${STAMP} font-bold text-muted-foreground`}>
          See the {g.orders.length} FCC order{g.orders.length === 1 ? "" : "s"}
        </summary>
        <ul className="mt-2 space-y-1.5 text-sm">
          {g.orders.map((o) => {
            const label = [o.station, o.dma].filter(Boolean).join(", ") || "FCC filing";
            const when = span(o.flightStart, o.flightEnd);
            return (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>
                  {label}
                  {o.spotCount ? ` · ${o.spotCount} spots` : ""}
                  {when ? ` · ${when}` : ""}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="font-mono">{usd(o.spend)}</span>
                  {o.pdfUrl && (
                    <a href={o.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-2">
                      FCC order: {o.station ?? "filing"}
                      {when ? <span className="sr-only">, {when}</span> : null}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

/** Race-page broadcast-TV activity: reviewer-approved FCC political-file orders,
 * one row per sponsor. TV spend is EXACT (stated on the order), framed
 * "reported on FCC orders." */
export function RaceTvAds({ ads, names = {} }: { ads: TvAd[]; names?: Record<string, string> }) {
  if (ads.length === 0) return null;
  const groups = groupTvAds(ads);
  const total = groups.reduce((s, g) => s + g.total, 0);
  return (
    <section id="tv-ads" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Broadcast TV ads</h2>
      <p className={`mt-1 ${STAMP} text-muted-foreground`}>
        {usd(total)} from {groups.length} sponsor{groups.length === 1 ? "" : "s"} across {ads.length} order
        {ads.length === 1 ? "" : "s"} · reported on FCC orders
      </p>
      <ul className="mt-3 border-y-2 border-border">
        {groups.map((g) => (
          <SponsorRow key={g.key} g={g} names={names} />
        ))}
      </ul>
    </section>
  );
}
