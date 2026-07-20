"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Light/dark toggle for the site chrome. Flips the `.dark` class on <html>
 * via next-themes; every component follows because the palette is CSS
 * variables (see globals.css `.dark`).
 *
 * Guarded with a `mounted` flag: on the server we don't know the resolved
 * theme, so we render a fixed-size placeholder and only show the real icon
 * after hydration. Without this the button would flash the wrong glyph and
 * trip a hydration mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="press border-2 border-border bg-card px-2 py-1 font-mono text-sm font-bold shadow-[var(--shadow-brutal)]"
    >
      {/* Keep the box a stable width pre-hydration so layout doesn't shift. */}
      <span aria-hidden className="inline-block w-[1.25em] text-center">
        {mounted ? (isDark ? "☀" : "☾") : ""}
      </span>
    </button>
  );
}
