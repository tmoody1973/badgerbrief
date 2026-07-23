import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceTransparencyCard } from "./source-transparency-card";
import { ArticleThumb } from "./article-thumb";

type Row = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null };

export function InTheNews({ items, heading }: { items: Row[]; heading: string }) {
  if (items.length === 0) return null;
  return (
    <section id="news" className="mt-8">
      <h2 className="text-xl font-bold">{heading}</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Coverage a BadgerBrief editor reviewed and confirmed belongs here. We link out — we don&rsquo;t summarize.{" "}
        <a href="/news/about" className="underline">
          How we handle coverage&nbsp;↗
        </a>
      </p>
      <ul className="mt-3 space-y-3">
        {items.map(({ article, outlet }) => (
          <li key={article._id} className="flex gap-3 border-2 border-border bg-card p-3">
            <ArticleThumb src={article.imageUrl} />
            <div className="min-w-0 flex-1">
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                {article.headline}&nbsp;↗
              </a>
              {article.publishedAt ? (
                <span className="ml-2 font-mono text-xs text-muted-foreground">{article.publishedAt}</span>
              ) : null}
              <div className="mt-1">
                <SourceTransparencyCard outlet={outlet} outletName={article.outlet} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
