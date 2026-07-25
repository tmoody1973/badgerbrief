"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AuthNav } from "./auth-nav";
import { LangToggle } from "./lang-toggle";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { chromeEn } from "@/lib/i18n/chrome-en";
import { chromeEs } from "@/lib/i18n/chrome-es";
import { localeFromPath } from "@/lib/i18n/chrome-dict";
import { localizeHref } from "@/lib/i18n/locale";

// About earns a desktop slot: on an election site "who publishes this" is a
// question a reader should never have to hunt for, and burying it reads as
// evasion. Methodology stays in the footer + mobile menu — About links to it,
// so the row keeps one entry rather than two.
const DESKTOP_LINKS = NAV_LINKS.filter((l) => l.href !== "/methodology");

export function SiteHeader() {
  const pathname = usePathname();
  const locale = localeFromPath(pathname);
  const dict = locale === "es" ? chromeEs : chromeEn;

  // SSR always emits lang="en" (see layout.tsx); this corrects it client-side
  // once we know the route. Known Phase-1 limitation for crawlers/no-JS.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <header className="border-b-2 border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href={localizeHref("/", locale)} className="font-display text-2xl tracking-tight">
          Badger<span className="text-primary">Brief</span>
        </Link>
        <div className="flex items-center gap-3">
          <nav className="hidden items-center gap-3 font-mono text-sm font-bold uppercase tracking-wider sm:flex">
            {DESKTOP_LINKS.map(({ href, label }) => (
              <Link key={href} href={localizeHref(href, locale)} className="whitespace-nowrap px-2 py-1 hover:bg-secondary">
                {dict.navLabels[href] ?? label}
              </Link>
            ))}
            <Link
              href={localizeHref("/vote", locale)}
              className="whitespace-nowrap border-2 border-border bg-primary px-2 py-1 text-primary-foreground shadow-[var(--shadow-brutal)]"
            >
              {dict.ctaAug11}
            </Link>
            <AuthNav />
            <ThemeToggle />
          </nav>
          {/* Always visible (mobile + desktop) so the language switch lives in
              the menu bar, not just inside the /vote page content. */}
          <LangToggle />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const locale = localeFromPath(pathname);
  const dict = locale === "es" ? chromeEs : chromeEn;
  const { footer } = dict;

  return (
    <footer className="mt-16 border-t-2 border-border bg-card">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 text-sm">
        <p className="font-display text-lg">
          Badger<span className="text-primary">Brief</span>
        </p>
        <p>
          {footer.mission}{" "}
          <Link href={localizeHref("/methodology", locale)} className="underline decoration-2 underline-offset-2">
            {footer.missionLink}
          </Link>
          .
        </p>
        <p className="text-muted-foreground">
          {footer.myVote}{" "}
          <a
            href="https://myvote.wi.gov"
            className="underline decoration-2 underline-offset-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            {footer.myVoteLink}
          </a>{" "}
          {footer.myVoteSuffix}
        </p>
        {/* Reachable from every page: a correction is only useful if the
            reader can report it at the moment they spot it. */}
        <p className="border-t-2 border-dashed border-border pt-4">
          <Link href={localizeHref("/about", locale)} className="underline decoration-2 underline-offset-2">
            {footer.about}
          </Link>
          {" · "}
          <Link href={localizeHref("/methodology", locale)} className="underline decoration-2 underline-offset-2">
            {footer.methodology}
          </Link>
          {" · "}
          <Link href={localizeHref("/feedback", locale)} className="font-bold underline decoration-2 underline-offset-2">
            {footer.reportError}
          </Link>
        </p>
        <p className="font-mono text-xs text-muted-foreground">{footer.financeDisclaimer}</p>
      </div>
    </footer>
  );
}
