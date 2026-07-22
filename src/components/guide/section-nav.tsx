"use client";

import { useEffect, useState } from "react";

export type NavSection = { id: string; label: string; count?: number };

/**
 * Sticky in-page jump nav, shared by the race, candidate, and /ads pages. Plain
 * anchor chips with scroll-spy: whichever target sits in the top band of the
 * viewport is marked `aria-current` and inverted (ink fill) — deliberately NOT
 * cardinal, so it stays distinct from the cardinal "active view" tab on /ads and
 * doesn't blur the two nav levels (or break the One Voice cardinal budget).
 * Target sections must carry `scroll-mt-*` so anchored headings land below this
 * bar. `sticky` overrides the sticky slot (default top-0); /ads passes a lower
 * offset so this stacks beneath the view tab bar.
 */
export function SectionNav({
  sections,
  sticky = "sticky top-0 z-40",
}: {
  sections: NavSection[];
  sticky?: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // The topmost section currently crossing the detection band wins.
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Sections on this page"
      className={`${sticky} -mx-4 mb-2 overflow-x-auto border-b-2 border-border bg-background px-4 py-2`}
    >
      <ul className="flex w-max gap-2">
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`press inline-block whitespace-nowrap border-2 border-border px-3 py-1 text-sm font-bold shadow-[var(--shadow-brutal)] ${
                  isActive ? "bg-foreground text-background" : "bg-card"
                }`}
              >
                {s.label}
                {s.count !== undefined ? ` (${s.count})` : ""}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
