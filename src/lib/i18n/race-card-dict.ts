import type { Locale } from "./locale";

// Race data (office names, candidate names) stays English until the Phase 2
// machine-translation pipeline. These are the small, fixed-set UI LABELS on the
// race card, safe to localize now. EN always renders the source value verbatim.
const LEVEL_ES: Record<string, string> = {
  "State Executive": "Ejecutivo Estatal",
  "State Judicial": "Judicial Estatal",
  Federal: "Federal",
  "State Legislative": "Legislativo Estatal",
};

export function raceLevelLabel(level: string, locale: Locale): string {
  return locale === "es" ? LEVEL_ES[level] ?? level : level;
}

export function incumbentPrefix(locale: Locale): string {
  return locale === "es" ? "Titular" : "Incumbent";
}

export function candidateCountLabel(n: number, locale: Locale): string {
  if (locale === "es") return `${n} ${n === 1 ? "candidato" : "candidatos"}`;
  return `${n} candidate${n === 1 ? "" : "s"}`;
}
