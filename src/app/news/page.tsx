import type { Metadata } from "next";
import { NewsFeed } from "@/components/guide/news-feed";
import { getHubArticles, listRaces } from "@/lib/data";
import { JsonLd, newsCollectionNode, organizationNode } from "@/lib/jsonld";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Election news — Wisconsin 2026",
  description: "Tracked coverage of Wisconsin's 2026 races, with source transparency on every outlet.",
  alternates: { canonical: "/news" },
};

/** Mirrors the `limit` getHubArticles asks for. If the corpus ever reaches it
 *  the masthead says "500+ stories" rather than reporting a truncated array
 *  length as the whole tracked record — the count must never claim more
 *  completeness than we actually rendered. */
const HUB_FETCH_LIMIT = 500;

export default async function NewsPage() {
  const [items, races] = await Promise.all([getHubArticles(), listRaces()]);
  // raceId → office, so the race filter chips read "Governor" not "WI-GOV-2026".
  const raceLabels = Object.fromEntries(races.map((r) => [r.raceId, r.office]));
  // Dateline = the newest VERIFIED publication date we hold. Never "today" —
  // that would imply freshness we haven't confirmed.
  const newest = items.map((r) => r.article.publishedAt).filter(Boolean).sort().reverse()[0];
  const MONTH = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const dateline = newest
    ? `${MONTH[Number(newest.slice(5, 7)) - 1]} ${Number(newest.slice(8, 10))}`
    : "";
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:max-w-5xl">
      <JsonLd
        nodes={[
          organizationNode(),
          newsCollectionNode(
            items.map((r) => ({
              headline: r.article.headline,
              url: r.article.url,
              outlet: r.article.outlet,
              // publishedAt is only ever set when the date was verified.
              publishedAt: r.article.publishedAt,
            })),
          ),
        ]}
      />
      {/* Masthead + dateline. Counts are real — never a rounded-up claim. */}
      <header className="border-b-2 border-border pb-3">
        <h1 className="font-display text-[clamp(1.75rem,7vw,3rem)] leading-none">Election news</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Wisconsin 2026 · {items.length}
          {items.length >= HUB_FETCH_LIMIT ? "+" : ""}{" "}
          {items.length === 1 ? "story" : "stories"} tracked
          {dateline ? ` · updated ${dateline}` : ""}
        </p>
      </header>
      {/* Breaking editorial update: a candidate withdrawal is exactly what a
          voter guide must surface immediately. Retire after the campaign moves on. */}
      <div className="mt-4 border-2 border-border bg-warning p-4 shadow-[var(--shadow-brutal)]">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest">
          Update · July 30, 2026
        </span>
        <p className="mt-1 font-bold">
          Mandela Barnes has withdrawn from the Democratic primary for governor.
        </p>
        <p className="mt-2 text-sm">
          <a href="/races/wi-gov-2026" className="font-bold underline decoration-2 underline-offset-2">
            See the current Governor field →
          </a>
          {"  ·  "}
          <a
            href="https://fox11online.com/news/state/mandela-barnes-drops-out-of-the-democratic-primary-for-wisconsin-governor-gubernatorial-hong-crowley-brennan-roys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2"
          >
            Source: FOX 11 ↗
          </a>
        </p>
      </div>
      <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
        Coverage we&rsquo;ve tracked, linked out to the outlet that reported it. We don&rsquo;t summarize
        or rate the reporting.{" "}
        <a href="/news/about" className="underline decoration-2 underline-offset-2">
          How we handle coverage ↗
        </a>
      </p>
      <NewsFeed items={items} raceLabels={raceLabels} />
    </main>
  );
}
