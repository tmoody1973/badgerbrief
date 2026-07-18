"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { fixtureBrief } from "@/lib/brief/fixture";
import { BriefSkeleton } from "./chrome";
import { BriefRenderer } from "./renderer";

/** Loads the signed-in user's brief, status-aware (generating/ready/failed); fixture demo when signed out or never generated (MOO-311). */
export function BriefLoader() {
  const latest = useQuery(api.briefs.getLatest, {});
  const history = useQuery(api.briefs.listMine, {});
  const generate = useMutation(api.briefs.generate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

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

  if (latest === undefined) return <BriefSkeleton lines={8} />;

  // Signed-out or never generated: fixture demo (existing behavior)
  if (latest === null) {
    return (
      <div>
        <BriefRenderer source={fixtureBrief} />
        <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Sample brief — sign in and set your address to generate yours
        </p>
      </div>
    );
  }

  const selected = selectedId ? history?.find((b) => b._id === selectedId) : undefined;
  const brief = selected ?? latest;

  if (!selected && latest.status === "generating") {
    return (
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest">
          {(latest.attempt ?? 1) > 1 ? "Refining your brief…" : "Composing your brief…"}
        </p>
        <BriefRenderer source={latest.openuiSource || null} isStreaming />
        {!latest.openuiSource && <BriefSkeleton lines={8} />}
      </div>
    );
  }

  if (!selected && latest.status === "failed") {
    return (
      <div className="border-2 border-border bg-warning p-4">
        <p className="font-bold">{latest.error ?? "Brief generation failed."}</p>
        <button
          type="button"
          onClick={() => {
            setGenerateError(null);
            void generate({}).catch(() =>
              setGenerateError("Couldn't start your brief — try again."),
            );
          }}
          className="mt-3 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
        >
          Try again
        </button>
        {generateError && (
          <p role="alert" className="mt-3 border-2 border-border bg-warning p-3 text-sm font-bold">
            {generateError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <BriefRenderer source={brief.openuiSource} />
      <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Generated {new Date(brief.generatedAt).toLocaleDateString("en-US", { dateStyle: "long" })}
      </p>
      {history && history.length > 1 && (
        <nav className="mt-4">
          <h3 className="text-sm font-bold">Saved briefs</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {history.map((b) => (
              <li key={b._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(b._id === latest._id ? null : b._id)}
                  className={b._id === brief._id ? "font-bold underline" : "underline"}
                >
                  {new Date(b.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
