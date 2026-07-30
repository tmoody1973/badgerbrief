"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import {
  parseGuideStep,
  nextHref,
  prevHref,
  GUIDE_STEPS,
  type GuideStep,
} from "@/lib/guide-step";

function stepNumber(step: GuideStep): string {
  return step === "done" ? "Done" : `Step ${step} of 3`;
}

export function GuidedRail() {
  const pathname = usePathname();
  const params = useSearchParams();
  const step = parseGuideStep(params.get("guide"));
  const isEs = pathname === "/es" || pathname.startsWith("/es/");

  // Progression signal: fires each time the voter reaches a guide step, the
  // same way section_jump validated the scroll UX. Before the early returns so
  // the hook runs unconditionally.
  useEffect(() => {
    if (step !== null && !isEs) track("guided_path", { step: String(step) });
  }, [step, isEs]);

  if (step === null) return null;
  if (isEs) return null;

  const label = GUIDE_STEPS.find((s) => s.step === step)?.label ?? "";
  const prev = prevHref(step);
  const next = nextHref(step);

  return (
    <div className="border-b-2 border-border bg-secondary">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <span className="font-mono text-xs font-bold uppercase tracking-widest">
          {stepNumber(step)} · {label}
        </span>
        <div className="flex items-center gap-2">
          {prev && (
            <Link
              href={prev}
              className="border-2 border-border bg-card px-3 py-1 text-xs font-bold shadow-[var(--shadow-brutal)] press"
            >
              ← Back
            </Link>
          )}
          {next && (
            <Link
              href={next}
              className="border-2 border-border bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
            >
              {step === 3 ? "Finish" : "Next →"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
