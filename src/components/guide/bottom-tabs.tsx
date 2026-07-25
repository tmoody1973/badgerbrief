"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "./auth-nav";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export const PRIMARY_TAB_HREFS = ["/", "/races/wi-gov-2026", "/vote", "/chat"];

export function moreLinks(links: typeof NAV_LINKS) {
  return links.filter((l) => !PRIMARY_TAB_HREFS.includes(l.href));
}

const TABS = [
  { href: "/", label: "Home", glyph: "⌂" },
  { href: "/races/wi-gov-2026", label: "Races", glyph: "🗳" },
  { href: "/vote", label: "Vote", glyph: "✓" },
  { href: "/chat", label: "Chat", glyph: "💬" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/races/wi-gov-2026") return pathname.startsWith("/races");
  return pathname.startsWith(href);
}

export function BottomTabs() {
  const pathname = usePathname();
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
              <Link key={href} href={href} className="block border-b-2 border-border px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider last:border-b-0 hover:bg-secondary">
                {label}
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
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${active ? "text-primary" : "text-foreground"}`}>
              <span aria-hidden className="text-lg leading-none">{t.glyph}</span>
              {t.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${moreOpen ? "text-primary" : "text-foreground"}`}>
          <span aria-hidden className="text-lg leading-none">···</span>
          More
        </button>
      </nav>
    </>
  );
}
