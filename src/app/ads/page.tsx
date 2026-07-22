import type { Metadata } from "next";
import Link from "next/link";
import { AdsAnalytics } from "@/components/guide/ads-analytics";
import { AdsBrowser } from "@/components/guide/ads-browser";
import { AdsOverview } from "@/components/guide/ads-overview";
import { YourRaces } from "@/components/guide/your-races";
import { TvAdTracker } from "@/components/guide/tv-ad-tracker";
import {
  candidateDirectory,
  getAdMoneyOverview,
  getTvAdTracker,
  listAds,
} from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Ad Tracker",
  description:
    "Who is paying to reach Wisconsin voters — political ad spend from the Meta Ad Library, Google political ads, and broadcast-TV FCC filings, sponsor by sponsor.",
};

type View = "your-ballot" | "statewide" | "browse";
const TABS: { view: View; label: string; href: string }[] = [
  { view: "your-ballot", label: "Your ballot", href: "/ads?view=your-ballot" },
  { view: "statewide", label: "Statewide", href: "/ads" },
  { view: "browse", label: "Browse", href: "/ads?view=browse" },
];

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: raw } = await searchParams;
  const view: View =
    raw === "your-ballot" || raw === "browse" ? raw : "statewide";

  // Fetch only what the active tab needs — data is cached (ISR) and shared.
  const needOverview = view !== "browse";
  const needAds = view === "statewide" || view === "browse";
  const needTv = view === "statewide";

  const [overview, ads, tvSponsors, candidates] = await Promise.all([
    needOverview ? getAdMoneyOverview() : Promise.resolve(null),
    needAds ? listAds() : Promise.resolve([]),
    needTv ? getTvAdTracker() : Promise.resolve([]),
    needAds ? candidateDirectory() : Promise.resolve([]),
  ]);
  const candidateNames = Object.fromEntries(
    candidates.map((c) => [c.slug, c.name]),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Wisconsin 2026
      </p>
      <h1 className="font-display mt-2 text-4xl leading-none sm:text-5xl">
        Who&apos;s paying to reach you?
      </h1>
      <p className="mt-4 max-w-2xl text-lg">
        Every political ad we&apos;ve tracked running to Wisconsin voters — the
        sponsor, who paid for it, and how much they spent. From the Meta Ad
        Library, Google&apos;s political ads, and broadcast-TV filings in the FCC
        public files.
      </p>

      <section className="mt-8 border-2 border-border bg-warning p-4 text-sm text-foreground shadow-[var(--shadow-brutal)]">
        <p>
          <strong>How to read this.</strong> Sponsor names come straight from the
          Meta and Google ad libraries and FCC orders — a name is <em>not</em> an
          endorsement, and attribution to a specific candidate only happens after
          a human verifies the source. Treat the sponsor as reported by the
          platform, not as our claim about who it really backs.
        </p>
      </section>

      {/* Tab bar — URL-addressable (?view=), shareable, back-button native. */}
      <nav
        aria-label="Ad tracker views"
        className="sticky top-0 z-20 -mx-4 mt-8 flex flex-wrap gap-2 border-b-2 border-border bg-background px-4 py-3"
      >
        {TABS.map((t) => {
          const active = view === t.view;
          return (
            <Link
              key={t.view}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`press border-2 border-border px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)] ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {view === "your-ballot" && overview && (
        <div className="mt-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Ad money in the races on your ballot
          </p>
          <YourRaces races={overview.races} />
        </div>
      )}

      {view === "statewide" && overview && (
        <div className="mt-6 space-y-10">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Every tracked ad reaching Wisconsin, race by race
            </p>
            <div className="mt-2">
              <AdsOverview overview={overview} />
            </div>
          </div>

          {tvSponsors.length > 0 && <TvAdTracker sponsors={tvSponsors} />}

          {ads.length > 0 && (
            <div>
              <h2 className="font-display text-2xl">The numbers behind it</h2>
              <div className="mt-4">
                <AdsAnalytics ads={ads} candidateNames={candidateNames} />
              </div>
            </div>
          )}
        </div>
      )}

      {view === "browse" && (
        <div className="mt-6">
          <h2 className="font-display text-2xl">Browse every ad</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The full record — search, filter, and sort every tracked ad by
            spend, sponsor, or platform.
          </p>
          <div className="mt-4">
            {ads.length > 0 ? (
              <AdsBrowser ads={ads} />
            ) : (
              <p className="border-2 border-dashed border-border p-6 text-center text-muted-foreground">
                No ads tracked yet. Check back soon.
              </p>
            )}
          </div>
        </div>
      )}

      <p className="mt-10 border-t-2 border-dashed border-border pt-4 font-mono text-xs text-muted-foreground">
        Sources: Meta Ad Library + Google political ads (BigQuery) + FCC
        broadcast political files, Wisconsin, political &amp; issue ads. Updated
        daily.
      </p>
    </main>
  );
}
