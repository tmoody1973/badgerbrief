// Pure normalize/validate helpers for broadcast-TV FCC order extraction
// (MOO-318). No Convex imports — unit-tested against the real WISN Barnes order.

/** What Sonnet returns per FCC order PDF (before normalization to an `ads` row). */
export type TvAdExtraction = {
  advertiser: string; // as printed, e.g. "Barnes/D/Governor"
  party?: string; // "D" | "R" | ...
  office?: string; // "Governor", "US Senate", ...
  candidateName?: string; // "Mandela Barnes"
  station: string; // "WISN-TV"
  dma?: string; // "Milwaukee"
  flightStart?: string; // YYYY-MM-DD
  flightEnd?: string; // YYYY-MM-DD
  spotCount?: number;
  grossSpend?: number; // exact, from the order
  netSpend?: number;
  agency?: string;
  orderRef?: string;
  // From the paired NAB/PB disclosure form (what the ad is ABOUT).
  refCandidates?: string[];
  refOffice?: string;
  refElectionDate?: string;
  refNationalIssue?: string;
  sponsorOfficers?: string[];
  sponsorLegalName?: string;
  confidence: Record<string, number>; // per-field 0..1
};

/** "$24,550.00" → 24550. Returns undefined for non-numeric input. */
export function parseMoney(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a flight window out of a doc/folder name like "Barnes Gov 7.21-7.27"
 * (year supplied from the folder). Supports "." or "/" separators and
 * zero-padding; if the end month is earlier than the start month, the end rolls
 * into the next year. Returns {} when no M/D-M/D range is present.
 */
export function parseFlightDates(
  name: string,
  year: number,
): { start?: string; end?: string } {
  const m = name.match(
    /(\d{1,2})[./](\d{1,2})\s*[-–]\s*(\d{1,2})[./](\d{1,2})/,
  );
  if (!m) return {};
  const [, sM, sD, eM, eD] = m.map(Number) as unknown as number[];
  const endYear = eM < sM ? year + 1 : year;
  const iso = (y: number, mo: number, d: number) =>
    `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { start: iso(year, sM, sD), end: iso(endYear, eM, eD) };
}

/** What a TV ad is about, from the paired NAB disclosure form. */
export type TvDisclosure = {
  candidates: string[];
  office?: string;
  electionDate?: string;
  nationalIssue?: string;
  sponsorOfficers?: string[];
  sponsorLegalName?: string;
};

/**
 * Merge the disclosure fields across all pages extracted from one portfolio
 * (the order page has none; the NAB form has them). Returns undefined when no
 * page carried any disclosure (e.g. a plain candidate order).
 */
export function buildDisclosure(
  exs: TvAdExtraction[],
): TvDisclosure | undefined {
  const candidates = [
    ...new Set(
      exs
        .flatMap((e) => e.refCandidates ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const office = exs.map((e) => e.refOffice).find(Boolean);
  const electionDate = exs.map((e) => e.refElectionDate).find(Boolean);
  const nationalIssue = exs.map((e) => e.refNationalIssue).find(Boolean);
  const sponsorOfficers = exs
    .map((e) => e.sponsorOfficers)
    .find((a) => a && a.length);
  const sponsorLegalName = exs.map((e) => e.sponsorLegalName).find(Boolean);
  if (
    !candidates.length &&
    !office &&
    !nationalIssue &&
    !sponsorOfficers &&
    !sponsorLegalName
  )
    return undefined;
  return {
    candidates,
    office,
    electionDate,
    nationalIssue,
    sponsorOfficers,
    sponsorLegalName,
  };
}

/** An `ads` write payload (internal.ads.upsertAd shape) for a TV order. */
export type TvAdWrite = {
  platform: "tv";
  platformAdId: string;
  pageOrCommittee: string;
  spendLower?: number;
  spendUpper?: number;
  station: string;
  dma?: string;
  spotCount?: number;
  flightStart?: string;
  flightEnd?: string;
  fccDocUrl: string;
  orderRef?: string;
};

/**
 * Normalize an extraction into an `ads` write. TV spend is EXACT (stated on the
 * order), so spendLower === spendUpper === grossSpend; both stay unset if gross
 * is unknown. platformAdId is the FCC fileManagerId (idempotency key).
 */
export function toAdWrite(
  x: TvAdExtraction,
  meta: { fileManagerId: string; fccDocUrl: string; year: number },
): TvAdWrite {
  return {
    platform: "tv",
    platformAdId: meta.fileManagerId,
    pageOrCommittee: x.advertiser,
    spendLower: x.grossSpend,
    spendUpper: x.grossSpend,
    station: x.station,
    dma: x.dma,
    spotCount: x.spotCount,
    flightStart: x.flightStart,
    flightEnd: x.flightEnd,
    fccDocUrl: meta.fccDocUrl,
    orderRef: x.orderRef,
  };
}
