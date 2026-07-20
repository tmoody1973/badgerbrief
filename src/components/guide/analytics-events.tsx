"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Delegated event tracking (MOO-336).
 *
 * The guide's interactive bits — source folds, jump-nav chips, source links —
 * live in SERVER components (`sources.tsx`, `section-nav.tsx`, `finance.tsx`).
 * Converting them to client components to add onClick handlers would ship those
 * trees to the browser for no user benefit. Instead this single client
 * component listens at the document level and infers the event from the DOM.
 *
 * One file, no prop drilling, no RSC → client conversions.
 */

const OFFICIAL_TOPIC: Array<[RegExp, "register" | "absentee" | "polling" | "myvote"]> = [
  [/register/i, "register"],
  [/absentee/i, "absentee"],
  [/polling|where.*vote/i, "polling"],
];

function foldKind(summary: string): "not_on_ballot" | "finance_rows" | "quotes" | "funding_trace" | null {
  const s = summary.toLowerCase();
  if (s.includes("not on the aug")) return "not_on_ballot";
  if (s.includes("show all") && s.includes("quote")) return "quotes";
  if (s.includes("show all") || s.includes("show ") ) return "finance_rows";
  if (s.includes("where this money comes from")) return "funding_trace";
  return null;
}

export function AnalyticsEvents() {
  useEffect(() => {
    // <details> open — source folds and the various "show all" folds.
    const onToggle = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!(el instanceof HTMLDetailsElement) || !el.open) return;
      const summary = el.querySelector("summary")?.textContent?.trim() ?? "";

      if (/sources?\s*\(/i.test(summary)) {
        const inPositions = !!el.closest("#positions");
        track("source_expand", { context: inPositions ? "position" : "candidate" });
        return;
      }
      const kind = foldKind(summary);
      if (kind) track("fold_expand", { kind });
    };

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute("href") ?? "";

      // Jump-nav chip — validates the MOO-329/330 scroll work.
      if (href.startsWith("#") && a.closest("nav[aria-label='Sections on this page']")) {
        track("section_jump", { section: href.slice(1) });
        return;
      }
      if (!/^https?:/i.test(href)) return;

      let host = "";
      try {
        host = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        return;
      }

      // Official handoff — the real civic outcome (registering, absentee, polling).
      if (/myvote\.wi\.gov|elections\.wi\.gov/.test(host)) {
        const label = `${a.textContent ?? ""} ${a.getAttribute("title") ?? ""}`;
        const hit = OFFICIAL_TOPIC.find(([re]) => re.test(label));
        track("official_link_click", { topic: hit ? hit[1] : "myvote" });
        return;
      }

      // Source link — classify by the trust label already rendered beside it.
      const badge = a.parentElement?.querySelector("span")?.textContent?.trim().toLowerCase();
      const kinds = ["official", "reported", "campaign", "reference", "ad-library"] as const;
      const kind = kinds.find((k) => badge === k);
      if (kind) track("source_click", { kind });
    };

    document.addEventListener("toggle", onToggle, true); // capture: toggle doesn't bubble
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
