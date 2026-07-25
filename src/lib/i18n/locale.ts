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
