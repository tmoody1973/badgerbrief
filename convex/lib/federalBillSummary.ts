/**
 * Pure helpers for the federal (U.S. House) branch of the bills cache.
 *
 * The Wisconsin path scrapes an LRB analysis sentence (see billAnalysis.ts);
 * the federal path instead reads the nonpartisan CRS (Congressional Research
 * Service) summary that congress.gov publishes per bill. No network here — the
 * fetching lives in the "use node" action (billsFederal.ts); this is the tested
 * core: parse the API payload, and build the public bill URL / API path parts.
 */

/** "HR 3838" -> { type: "hr", number: "3838" } for the congress.gov bill/summaries
 * endpoints. Amendment-only measures ("HAMDT 5") still match on shape but have no
 * bill endpoint; the caller treats an unresolved fetch as "no summary". Returns
 * null only when the string is not "<letters> <digits>". */
export function federalBillParts(
  billNumber: string,
): { type: string; number: string } | null {
  const m = billNumber.trim().match(/^([A-Za-z]+)\s*(\d+)$/);
  if (!m) return null;
  return { type: m[1].toLowerCase(), number: m[2] };
}

// Bill-type code -> congress.gov URL slug. Public bill pages use the long form.
const TYPE_SLUG: Record<string, string> = {
  hr: "house-bill",
  s: "senate-bill",
  hjres: "house-joint-resolution",
  sjres: "senate-joint-resolution",
  hconres: "house-concurrent-resolution",
  sconres: "senate-concurrent-resolution",
  hres: "house-resolution",
  sres: "senate-resolution",
};

/** Public congress.gov page for a bill. Used only for the review UI/Artifact —
 * the voter-facing vote link comes from the vote row's sourceUrl, not this. Falls
 * back to a congress.gov search when the type code is unrecognized. */
export function federalBillUrl(congress: string, billNumber: string): string {
  const parts = federalBillParts(billNumber);
  const slug = parts && TYPE_SLUG[parts.type];
  if (parts && slug) {
    return `https://www.congress.gov/bill/${congress}th-congress/${slug}/${parts.number}`;
  }
  return `https://www.congress.gov/search?q=${encodeURIComponent(billNumber)}`;
}

// A CRS summary long enough to classify without shipping an entire multi-page
// summary to the LLM. Classification needs the issue areas and enough of the
// substance to phrase a ≤12-word outcome; the opening of a CRS summary always
// leads with what the bill does. ponytail: fixed cap, raise if outcomes read thin.
const MAX_SUMMARY_CHARS = 1500;

type SummaryItem = { text?: unknown; updateDate?: unknown };

/**
 * Extract the cleanest, most-current CRS summary from a congress.gov
 * `/bill/{c}/{type}/{n}/summaries` payload, as plain text.
 *
 * Picks the latest by updateDate (ISO strings sort correctly), strips HTML and
 * decodes the handful of entities CRS uses, collapses whitespace, and caps
 * length at a sentence boundary. Returns null when there is no usable summary —
 * the same signal the WI parser uses for "no analysis", so an enriched-but-empty
 * bill is stored with summary=null and never retried or classified.
 */
export function parseCrsSummary(payload: unknown): string | null {
  const summaries = (payload as { summaries?: unknown })?.summaries;
  if (!Array.isArray(summaries) || summaries.length === 0) return null;

  const items = summaries as SummaryItem[];
  const latest = items.reduce((best, cur) => {
    const b = typeof best.updateDate === "string" ? best.updateDate : "";
    const c = typeof cur.updateDate === "string" ? cur.updateDate : "";
    return c >= b ? cur : best;
  });

  if (typeof latest.text !== "string") return null;
  const clean = stripHtml(latest.text);
  if (clean.length === 0) return null;
  return capAtSentence(clean, MAX_SUMMARY_CHARS);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8216;|&lsquo;/gi, "‘")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate to <= max chars, preferring to end at the last sentence break within
 * range so the classifier never sees a mid-word fragment. */
function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const lastStop = window.lastIndexOf(". ");
  if (lastStop >= max * 0.5) return window.slice(0, lastStop + 1);
  return window.trimEnd() + "…";
}
