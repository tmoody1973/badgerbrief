"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "./auth-nav";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { IconHome, IconBallot, IconVote, IconChat, IconMore } from "./nav-icons";
import { localeFromPath } from "@/lib/i18n/chrome-dict";
import { chromeEn } from "@/lib/i18n/chrome-en";
import { chromeEs } from "@/lib/i18n/chrome-es";
import { localizeHref } from "@/lib/i18n/locale";

export const TABS = [
  { href: "/", en: "Home", es: "Inicio", Icon: IconHome },
  { href: "/ballot", en: "My Ballot", es: "Mi boleta", Icon: IconBallot },
  { href: "/vote", en: "Vote", es: "Votar", Icon: IconVote },
  { href: "/chat", en: "Chat", es: "Chat", Icon: IconChat },
] as const;

/** Derived from the tabs, so the two cannot drift. Everything else in the navigation goes under More. */
export const PRIMARY_TAB_HREFS: string[] = TABS.map((t) => t.href);

export function moreLinks(links: typeof NAV_LINKS) {
  return links.filter((l) => !PRIMARY_TAB_HREFS.includes(l.href));
}

/** A tab is lit on its own page and on pages beneath it. "/ballot" is not lit on "/ballot-basics". */
export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomTabs() {
  const pathname = usePathname();
  const locale = localeFromPath(pathname);
  const dict = locale === "es" ? chromeEs : chromeEn;
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" onClick={() => setMoreOpen(false)}>
          <nav
            className="absolute inset-x-0 bottom-14 border-t-2 border-border bg-card shadow-[var(--shadow-brutal)]"
            onClick={(e) => e.stopPropagation()}
            aria-label="More navigation"
          >
            {moreLinks(NAV_LINKS).map(({ href, label }) => (
              <Link key={href} href={localizeHref(href, locale)} className="block border-b-2 border-border px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider last:border-b-0 hover:bg-secondary">
                {dict.navLabels[href] ?? label}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-2 border-t-2 border-border px-4 py-3">
              <AuthNav />
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t-2 border-border bg-card sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <Link key={t.href} href={localizeHref(t.href, locale)} aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide ${active ? "text-primary" : "text-foreground"}`}>
              <t.Icon className="h-6 w-6" />
              {t[locale]}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide ${moreOpen ? "text-primary" : "text-foreground"}`}>
          <IconMore className="h-6 w-6" />
          {locale === "es" ? "Más" : "More"}
        </button>
      </nav>
    </>
  );
}
