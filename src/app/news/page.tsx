import type { Metadata } from "next";
import { NewsFeed } from "@/components/guide/news-feed";
import { getHubArticles } from "@/lib/data";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Election news — Wisconsin 2026",
  description: "Tracked coverage of Wisconsin's 2026 races, with source transparency on every outlet.",
  alternates: { canonical: "/news" },
};

export default async function NewsPage() {
  const items = await getHubArticles();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:max-w-5xl">
      <h1 className="text-3xl font-bold">Wisconsin 2026 — election news</h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Coverage we&rsquo;ve tracked, linked out with transparency on who runs each outlet. We don&rsquo;t summarize or rate the reporting.{" "}
        <a href="/news/about" className="underline">How we handle coverage ↗</a>
      </p>
      <NewsFeed items={items} />
    </main>
  );
}
