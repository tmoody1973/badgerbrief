export type Locale = "en" | "es";

export const TRANSLATED_PATHS = new Set<string>(["/", "/vote", "/about", "/methodology"]);

export function esTwin(enPath: string): string {
  return enPath === "/" ? "/es" : `/es${enPath}`;
}

export function enTwin(esPath: string): string {
  if (esPath === "/es") return "/";
  return esPath.replace(/^\/es/, "") || "/";
}

export function hreflangFor(enPath: string) {
  return { en: enPath, es: esTwin(enPath), "x-default": enPath } as const;
}

/**
 * Locale-persistent link target. On a Spanish page, an internal link to an
 * English path routes to its Spanish twin IF that twin exists (TRANSLATED_PATHS)
 * — so navigating stays in Spanish. Paths with no Spanish version yet fall back
 * to English (unavoidable until they're translated). English pages are untouched.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (locale !== "es") return href;
  return TRANSLATED_PATHS.has(href) ? esTwin(href) : href;
}
