/**
 * Pure normalization of published horse-race polls.
 *
 * No network, no Convex ctx — same split as rollCall.ts / houseVote.ts.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: results are carried VERBATIM and never
 * averaged. BadgerBrief cites what a pollster published; it does not compute a
 * number no pollster published. That is the same posture as the voting record
 * ("we don't rate or score votes"), and here it is not merely editorial — the
 * source data cannot be averaged even if we wanted to:
 *
 *   "26-27%"   a range, not a point estimate
 *   "R +2.2"   a margin, with no candidate shares at all
 *   "Hong trails by 3"                       prose
 *   "Among registered voters, Tiffany led Hong 43-40; tied 44-44 among likely
 *    voters."                                two populations in one cell
 *
 * Averaging any of that requires inventing precision the pollster declined to
 * publish. Aggregators that do this properly (house effects, recency weighting,
 * likely-voter models) are linked instead — see POLL_AGGREGATORS.
 */

export type PollResultRow = {
  /** Candidate or option exactly as the pollster printed it. */
  label: string;
  /** The published figure, verbatim: "26-27%", "R +2.2", or a sentence. */
  value: string;
  /** Our candidate slug, ONLY when unambiguously matched. Null otherwise. */
  candidateSlug: string | null;
};

export type PollResultGroup = {
  /** "Democratic" / "Republican" when one poll covers both; null when flat. */
  label: string | null;
  rows: PollResultRow[];
};

export type NormalizedPoll = {
  pollKey: string;
  raceId: string;
  pollster: string;
  /** "Democratic primary", "general matchup", … verbatim from the source. */
  pollType: string;
  /** Head-to-head description ("Mandela Barnes vs. Tom Tiffany"), when present. */
  matchup: string | null;
  conductedStart: string;
  conductedEnd: string;
  releasedOn: string | null;
  /** Verbatim, because it is not always a number ("~600 delegates/guests"). */
  sampleSize: string | null;
  sampleType: string | null;
  marginOfError: string | null;
  /**
   * False for straw polls and similar. Surfaced prominently rather than
   * filtered out: a convention straw poll is real news, but presenting it
   * beside a Marquette poll without saying so would mislead.
   */
  scientific: boolean;
  groups: PollResultGroup[];
  notes: string | null;
  sources: { name: string; url: string }[];
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "2026-07-08 to 2026-07-16" or a bare "2026-07-06". */
export function parseConducted(
  raw: unknown,
): { start: string; end: string } | null {
  if (typeof raw !== "string") return null;
  const dates = raw.match(/\d{4}-\d{2}-\d{2}/g);
  if (!dates || dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Sample size verbatim. The source mixes numbers with prose
 * ("~600 delegates/guests") and omits it entirely on some polls, so this is a
 * string or nothing — coercing to a number would silently drop the qualifier
 * that makes a straw poll a straw poll.
 */
export function normalizeSampleSize(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** A poll_type naming a straw poll or otherwise non-scientific sample. */
export function isScientific(pollType: unknown): boolean {
  return !/straw poll|non-?scientific/i.test(String(pollType ?? ""));
}

/**
 * Leading percentage, for ORDERING ROWS WITHIN ONE POLL ONLY.
 *
 * Deliberately not exported as anything that reads like a value. Ordering is
 * not a claim — showing the leader first is how the pollster's own release
 * reads — but this number must never be summed, averaged, or compared across
 * polls, which is exactly what a field called `pct` would invite.
 */
function leadingNumberForOrdering(value: string): number | null {
  const m = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

/**
 * Match a printed name to one of our candidates, or refuse.
 *
 * Same discipline as the roll-call surname mapping: exact full name first, then
 * a UNIQUE surname, and null when ambiguous. Head-to-head polls print bare
 * surnames ("Barnes vs. Tiffany"), so surname matching is required — but two
 * candidates sharing one is a link to the wrong person's page, so ambiguity
 * yields no link rather than a guess. Names carrying a qualifier such as
 * "Josh Kaul (undeclared)" are never matched: they are not on our ballot.
 */
export function matchCandidate(
  printed: string,
  candidates: { name: string; slug: string }[],
): string | null {
  const clean = printed.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (clean !== printed.trim()) return null; // had a qualifier — not our ballot
  if (/^(undecided|other|someone else|none|don'?t know)$/i.test(clean)) return null;

  const exact = candidates.filter(
    (c) => c.name.toLowerCase() === clean.toLowerCase(),
  );
  if (exact.length === 1) return exact[0].slug;

  const surname = clean.split(/\s+/).slice(-1)[0].toLowerCase();
  if (surname.length < 3) return null;
  const bySurname = candidates.filter(
    (c) => c.name.split(/\s+/).slice(-1)[0].toLowerCase() === surname,
  );
  return bySurname.length === 1 ? bySurname[0].slug : null;
}

/**
 * Result groups. A poll is normally flat ({name: value}); a poll covering both
 * primaries nests them ({democratic: {...}, republican: {...}}). Both become
 * groups so the renderer has one shape.
 */
export function normalizeResults(
  raw: unknown,
  candidates: { name: string; slug: string }[],
): PollResultGroup[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = Object.entries(raw as Record<string, unknown>);
  const nested = entries.filter(([, v]) => v && typeof v === "object");

  const toRows = (obj: Record<string, unknown>): PollResultRow[] =>
    Object.entries(obj)
      .map(([label, value]) => ({
        label,
        value: String(value),
        candidateSlug: matchCandidate(label, candidates),
      }))
      .sort((a, b) => {
        const na = leadingNumberForOrdering(a.value);
        const nb = leadingNumberForOrdering(b.value);
        if (na === null && nb === null) return 0;
        if (na === null) return 1; // prose rows sink below numbered ones
        if (nb === null) return -1;
        return nb - na;
      });

  if (nested.length > 0) {
    return nested.map(([label, obj]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      rows: toRows(obj as Record<string, unknown>),
    }));
  }
  return [{ label: null, rows: toRows(raw as Record<string, unknown>) }];
}

type RawPoll = Record<string, unknown>;

/** One published poll -> storable shape, or an error explaining the refusal. */
export function normalizePoll(
  raw: RawPoll,
  ref: { raceId: string; candidates: { name: string; slug: string }[] },
): NormalizedPoll | { error: string } {
  const pollster = typeof raw.pollster === "string" ? raw.pollster.trim() : "";
  if (!pollster) return { error: "poll has no pollster" };

  const conducted = parseConducted(raw.date_conducted);
  if (!conducted) {
    return { error: `${pollster}: unparseable date_conducted ${JSON.stringify(raw.date_conducted)}` };
  }

  const groups = normalizeResults(raw.results, ref.candidates);
  if (groups.length === 0 || groups.every((g) => g.rows.length === 0)) {
    return { error: `${pollster}: no results` };
  }

  const matchup = typeof raw.matchup === "string" ? raw.matchup : null;
  const pollType =
    typeof raw.poll_type === "string" ? raw.poll_type : matchup ? "General election matchup" : "Poll";

  const urls = Array.isArray(raw.urls) ? raw.urls.filter((u) => typeof u === "string") : [];
  if (urls.length === 0) {
    // Every claim on the site links to its source; a poll with no link cannot
    // meet that bar and is refused rather than shown unsourced.
    return { error: `${pollster}: no source urls` };
  }

  return {
    // Natural key: one poll per pollster per field per end-date. Re-importing
    // the same file must not duplicate rows.
    pollKey: slugify(`${ref.raceId}-${pollster}-${matchup ?? pollType}-${conducted.end}`),
    raceId: ref.raceId,
    pollster,
    pollType,
    matchup,
    conductedStart: conducted.start,
    conductedEnd: conducted.end,
    releasedOn: typeof raw.date_released === "string" ? raw.date_released : null,
    sampleSize: normalizeSampleSize(raw.sample_size),
    sampleType: typeof raw.sample_type === "string" ? raw.sample_type : null,
    marginOfError: typeof raw.margin_of_error === "string" ? raw.margin_of_error : null,
    scientific: isScientific(raw.poll_type),
    groups,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    sources: urls.map((url) => ({ name: hostOf(url as string), url: url as string })),
  };
}

/** "https://www.wpr.org/news/…" -> "wpr.org", for a readable source label. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
