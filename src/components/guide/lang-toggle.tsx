"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TRANSLATED_PATHS, enTwin, esTwin } from "@/lib/i18n/locale";

/**
 * Site-wide language switch. On /es/* pages, offers English at the EN twin.
 * On English pages with a Spanish twin (see TRANSLATED_PATHS), offers Español
 * at that twin; otherwise falls back to the Spanish home so the toggle never
 * links to a dead 404.
 */
export function langToggleFor(pathname: string): { label: string; href: string } {
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    return { label: "English", href: enTwin(pathname) };
  }
  const href = TRANSLATED_PATHS.has(pathname) ? esTwin(pathname) : "/es";
  return { label: "Español", href };
}

export function LangToggle() {
  const pathname = usePathname();
  const { label, href } = langToggleFor(pathname);
  return (
    <Link
      href={href}
      lang={label === "Español" ? "es" : "en"}
      hrefLang={href.startsWith("/es") ? "es" : "en"}
      aria-label={`Cambiar idioma / switch language: ${label}`}
      className="whitespace-nowrap border-2 border-border bg-card px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider shadow-[var(--shadow-brutal)] hover:bg-secondary"
    >
      {label}
    </Link>
  );
}
