"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { fixtureBrief } from "@/lib/brief/fixture";
import { BriefSkeleton } from "./chrome";
import { BriefRenderer } from "./renderer";

/** Loads the signed-in user's saved brief; falls back to the fixture until MOO-311 generates real ones. */
export function BriefLoader() {
  const saved = useQuery(api.briefs.getLatest, {});

  // Print contract (spec §5): drill-downs print expanded.
  useEffect(() => {
    const openAll = () =>
      document
        .querySelectorAll<HTMLDetailsElement>("details:not([open])")
        .forEach((d) => {
          d.dataset.printOpened = "true";
          d.open = true;
        });
    const closeAgain = () =>
      document
        .querySelectorAll<HTMLDetailsElement>("details[data-print-opened]")
        .forEach((d) => {
          d.open = false;
          delete d.dataset.printOpened;
        });
    window.addEventListener("beforeprint", openAll);
    window.addEventListener("afterprint", closeAgain);
    return () => {
      window.removeEventListener("beforeprint", openAll);
      window.removeEventListener("afterprint", closeAgain);
    };
  }, []);

  if (saved === undefined) return <BriefSkeleton lines={8} />;
  const generatedAt = saved ? new Date(saved.generatedAt) : new Date();
  return (
    <div>
      <BriefRenderer source={saved ? saved.openuiSource : fixtureBrief} />
      <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Generated {generatedAt.toLocaleDateString("en-US", { dateStyle: "long" })}
        {saved ? "" : " · sample brief — personalized briefs are coming soon"}
      </p>
    </div>
  );
}
