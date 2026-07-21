// Pure helpers for sponsor profiles (MOO-318 follow-up). No Convex ctx / network
// so they unit-test without convex-test.

export type SponsorLean = "supports_d" | "supports_r" | "bipartisan" | "issue";

/** Normalized sponsor name — the dedup + join key between ads and sponsors. */
export function normalizeSponsorKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map an FEC `committee_type` code to a human-readable kind. FEC-registered
 * committees all disclose their donors (Schedule A) — the "dark money" case is
 * a group with NO FEC committee match, handled by the reviewer, not here.
 * https://www.fec.gov/campaign-finance-data/committee-type-code-descriptions/
 */
export function fecCommitteeKind(committeeType: string | undefined): {
  kind: string;
  disclosesDonors: boolean;
} {
  const t = (committeeType ?? "").toUpperCase();
  const kind =
    t === "O"
      ? "Super PAC"
      : t === "V" || t === "W"
        ? "Hybrid PAC"
        : t === "N" || t === "Q"
          ? "PAC"
          : t === "X" || t === "Y" || t === "Z"
            ? "Party committee"
            : t === "H" || t === "S" || t === "P"
              ? "Candidate committee"
              : "Political committee";
  return { kind, disclosesDonors: true };
}

/** FEC party code → sponsor lean (only the unambiguous ones). */
export function leanFromParty(party: string | undefined): SponsorLean | undefined {
  const p = (party ?? "").toUpperCase();
  if (p === "DEM" || p === "DFL") return "supports_d";
  if (p === "REP") return "supports_r";
  return undefined;
}
