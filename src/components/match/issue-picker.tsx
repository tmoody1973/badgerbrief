"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { labelForSlug } from "@/lib/candidate-order";

export function IssuePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  const slugs = useQuery(api.public.listIssueSlugs, {});
  if (slugs === undefined) {
    return <p className="mt-4 font-mono text-xs text-muted-foreground">Loading issues…</p>;
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Issues you care about">
      {slugs.map((slug) => {
        const on = selected.includes(slug);
        return (
          <button
            key={slug}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(slug)}
            className={`press border-2 border-border px-3 py-1.5 text-sm font-bold shadow-[var(--shadow-brutal)] ${
              on ? "bg-foreground text-background" : "bg-card"
            }`}
          >
            {labelForSlug(slug)}
          </button>
        );
      })}
    </div>
  );
}
