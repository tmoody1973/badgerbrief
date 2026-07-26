"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const params = useSearchParams();
  const step = parseGuideStep(params.get("guide"));
  if (step === null) return null;

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
