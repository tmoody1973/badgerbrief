export type GuideStep = 1 | 2 | 3 | "done";

export const GUIDE_STEPS: { step: GuideStep; label: string; href: string }[] = [
  { step: 1, label: "Pick what matters to you", href: "/match?guide=1" },
  { step: 2, label: "Read a candidate", href: "/match?guide=2" },
  { step: 3, label: "Make your plan to vote", href: "/vote?guide=3" },
  { step: "done", label: "You're set", href: "/start?guide=done" },
];

export function parseGuideStep(raw: string | null): GuideStep | null {
  if (raw === "done") return "done";
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  if (raw === "3") return 3;
  return null;
}

function indexOf(step: GuideStep): number {
  return GUIDE_STEPS.findIndex((s) => s.step === step);
}

export function nextHref(step: GuideStep): string | null {
  const i = indexOf(step);
  return i >= 0 && i < GUIDE_STEPS.length - 1 ? GUIDE_STEPS[i + 1].href : null;
}

export function prevHref(step: GuideStep): string | null {
  const i = indexOf(step);
  return i > 0 ? GUIDE_STEPS[i - 1].href : null;
}
