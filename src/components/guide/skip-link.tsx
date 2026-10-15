"use client";

import { usePathname } from "next/navigation";
import { localeFromPath } from "@/lib/i18n/chrome-dict";

/**
 * The first thing a keyboard or screen-reader user reaches: a jump past the
 * announcement bar, header and navigation to the page's own content
 * (#main, the site-content wrapper in layout.tsx). Hidden until focused.
 */
export function SkipLink() {
  const es = localeFromPath(usePathname()) === "es";
  return (
    <a
      href="#main"
      className="sr-only z-[100] border-2 border-border bg-card px-4 py-3 font-bold shadow-[var(--shadow-brutal)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      {es ? "Saltar al contenido principal" : "Skip to main content"}
    </a>
  );
}
