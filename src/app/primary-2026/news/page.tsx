import type { Metadata } from "next";
import { ArchiveBanner } from "@/components/guide/archive-banner";
import { NewsFeed } from "@/components/guide/news-feed";
import { getHubArticles, listRaces } from "@/lib/data";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `Election news — ${PRIMARY_ARCHIVE.label} season (archive)`,
  description: `Archived: news coverage tracked before and around Wisconsin's ${PRIMARY_ARCHIVE.label}, linked out to the outlets that reported it.`,
  alternates: { canonical: `${PRIMARY_ARCHIVE.path}/news` },
};

export default async function ArchivedNewsPage() {
  const [all, races] = await Promise.all([getHubArticles(), listRaces()]);
  const items = all.filter((r) => r.article.archive);
  const raceLabels = Object.fromEntries(races.map((r) => [r.raceId, r.office]));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:max-w-5xl">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Primary archive", path: PRIMARY_ARCHIVE.path },
            { name: "News", path: `${PRIMARY_ARCHIVE.path}/news` },
          ]),
        ]}
      />
      <ArchiveBanner currentHref="/news" currentLabel="See general-election news" />
      <h1 className="font-display text-[clamp(1.75rem,7vw,3rem)] leading-none">
        News from the {PRIMARY_ARCHIVE.label} season
      </h1>
      <p className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
        {items.length} {items.length === 1 ? "story" : "stories"}: coverage published before the general-election
        season began, and later coverage of candidates who are not on the November ballot.
      </p>
      <NewsFeed items={items} raceLabels={raceLabels} />
    </main>
  );
}
