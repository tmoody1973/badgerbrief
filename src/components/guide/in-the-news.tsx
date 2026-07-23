import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceTransparencyCard } from "./source-transparency-card";

type Row = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null };

export function InTheNews({ items, heading }: { items: Row[]; heading: string }) {
  if (items.length === 0) return null;
  return (
    <section id="news" className="mt-8">
      <h2 className="text-xl font-bold">{heading}</h2>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Coverage a BadgerBrief editor confirmed is about this race. We link out — we don&rsquo;t summarize.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map(({ article, outlet }) => (
          <li key={article._id} className="border-2 border-border bg-card p-3">
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              {article.headline}&nbsp;↗
            </a>
            {article.publishedAt ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">{article.publishedAt}</span>
            ) : null}
            <div className="mt-1">
              <SourceTransparencyCard outlet={outlet} outletName={article.outlet} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
