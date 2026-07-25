"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Site-wide language switch. Only /vote has a Spanish twin (/es/vote) today, so
 * on every English page this points AT the Spanish guide, and on /es/vote it
 * points back. When more pages gain Spanish versions, extend the mapping here.
 */
export function langToggleFor(pathname: string): { label: string; href: string } {
  return pathname === "/es/vote"
    ? { label: "English", href: "/vote" }
    : { label: "Español", href: "/es/vote" };
}

export function LangToggle() {
  const pathname = usePathname();
  const { label, href } = langToggleFor(pathname);
  return (
    <Link
      href={href}
      lang={label === "Español" ? "es" : "en"}
      hrefLang={href === "/es/vote" ? "es" : "en"}
      aria-label={`Cambiar idioma / switch language: ${label}`}
      className="whitespace-nowrap border-2 border-border bg-card px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider shadow-[var(--shadow-brutal)] hover:bg-secondary"
    >
      {label}
    </Link>
  );
}
