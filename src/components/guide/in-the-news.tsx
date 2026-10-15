import { SourceTransparencyCard } from "./source-transparency-card";
import { ArticleThumb } from "./article-thumb";

import type { CoverageRow as Row } from "@/lib/coverage-types";

/** Articles shown before the fold. */
const FIRST_ITEMS = 5;

export function InTheNews({ items, heading }: { items: Row[]; heading: string }) {
  if (items.length === 0) return null;
  const item = ({ article, outlet }: Row) => (
          <li key={article._id} className="flex gap-3 border-2 border-border bg-card p-3">
            <ArticleThumb src={article.imageUrl} outlet={article.outlet} />
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
  );
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
        {items.slice(0, FIRST_ITEMS).map(item)}
      </ul>
      {items.length > FIRST_ITEMS && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            All {items.length} articles
          </summary>
          <ul className="mt-3 space-y-3">{items.slice(FIRST_ITEMS).map(item)}</ul>
        </details>
      )}
    </section>
  );
}
