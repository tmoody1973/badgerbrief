import type { Metadata } from "next";
import { NewsFeed } from "@/components/guide/news-feed";
import { getHubArticles, listRaces } from "@/lib/data";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Election news — Wisconsin 2026",
  description: "Tracked coverage of Wisconsin's 2026 races, with source transparency on every outlet.",
  alternates: { canonical: "/news" },
};

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
      {/* Masthead + dateline. Counts are real — never a rounded-up claim. */}
      <header className="border-b-2 border-border pb-3">
        <h1 className="font-display text-[clamp(1.75rem,7vw,3rem)] leading-none">Election news</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Wisconsin 2026 · {items.length} {items.length === 1 ? "story" : "stories"} tracked
          {dateline ? ` · updated ${dateline}` : ""}
        </p>
      </header>
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
