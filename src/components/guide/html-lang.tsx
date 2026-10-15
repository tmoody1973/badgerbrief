"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { localeFromPath } from "@/lib/i18n/chrome-dict";

/**
 * Sets <html lang> to Spanish on the /es pages, so screen readers pronounce
 * the Spanish header, footer and page in Spanish. The root layout is shared
 * and static, so the server-rendered tag says "en"; each Spanish page's
 * <main lang="es"> already covers its content before this runs.
 * ponytail: client-side switch; a separate root layout for /es is the
 * upgrade if the server-sent tag must say "es" too.
 */
export function HtmlLang() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = localeFromPath(pathname);
  }, [pathname]);
  return null;
}
