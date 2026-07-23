"use client";

import { useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceTransparencyCard } from "./source-transparency-card";

type Row = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null };

const TYPE_LABEL: Record<string, string> = {
  nonprofit: "Nonprofit", public_media: "Public media",
  corporate_daily: "Daily paper", wire: "Wire service", trade: "Trade press",
  tv: "Broadcast TV", national: "National", other: "Other",
  // Not a taxonomy type: the bucket for articles whose outlet has no
  // approved profile yet. Never collapse these into "Other" — unrated is
  // not a rating.
  pending: "Profile pending",
};

export function NewsFeed({ items }: { items: Row[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const types = Array.from(new Set(items.map((r) => r.outlet?.type ?? "pending")));
  const visible = filter ? items.filter((r) => (r.outlet?.type ?? "pending") === filter) : items;

  return (
    <section className="mt-8">
      {types.length > 1 ? (
        <div role="group" aria-label="Filter by outlet type" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filter === null}
            onClick={() => setFilter(null)}
            className={`border-2 border-border px-2 py-1 font-mono text-xs ${filter === null ? "bg-foreground text-background" : "bg-card"}`}
          >
            All
          </button>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={filter === type}
              onClick={() => setFilter(type)}
              className={`border-2 border-border px-2 py-1 font-mono text-xs ${filter === type ? "bg-foreground text-background" : "bg-card"}`}
            >
              {TYPE_LABEL[type] ?? type}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          We haven&rsquo;t found tracked coverage yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map(({ article, outlet }) => (
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
      )}
    </section>
  );
}
