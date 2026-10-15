import { normalizeText } from "./adsMatch";

/**
 * TV political-file discovery without a browser (2026-10-15).
 *
 * The FCC's folder listings (/api/manager) are Akamai-blocked to anything but a
 * real browser, which is why the sync drove Browserbase. Each station's Atom
 * feed (/tv-profile/{call}/rss) is not blocked, and names every upload's folder
 * path, file name and fileManagerId, which files.fcc.gov/download serves to a
 * plain fetch. Limit: the feed holds only the station's 10 newest uploads, so
 * it has to be polled often and cannot backfill.
 */

// In-scope FCC political-file categories. State/Federal are filtered to tracked
// candidates (by surname in the folder path); issue ads are all included.
export const CANDIDATE_CATEGORIES = ["state", "federal"];
export const ISSUE_CATEGORY_MATCH = /non.?candidate|issue/i;
export const SKIP_CATEGORIES = ["local", "terms"];

export type EnumeratedDoc = {
  name: string;
  fileManagerId: string;
  fccDocUrl: string;
  category: string;
};

/** The category slug the browser path has always stored ("non-candidate-issue-ads"). */
export const categorySlug = (name: string) => normalizeText(name).replace(/\s+/g, "-");

/** True when a category is in scope at all; candidate categories still need a surname match. */
export function categoryScope(name: string): "issue" | "candidate" | null {
  const slug = categorySlug(name);
  if (SKIP_CATEGORIES.some((s) => slug.includes(s))) return null;
  if (ISSUE_CATEGORY_MATCH.test(name)) return "issue";
  if (CANDIDATE_CATEGORIES.some((c) => slug.includes(c))) return "candidate";
  return null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const pick = (block: string, re: RegExp) => decode(block.match(re)?.[1]?.trim() ?? "");

export function parseStationFeed(
  xml: string,
  { year, trackedSurnames }: { year: number; trackedSurnames: string[] },
): EnumeratedDoc[] {
  const out: EnumeratedDoc[] = [];
  // ponytail: regex over a fixed FCC template, not an XML parser; a format change
  // yields zero docs, which the sync logs per station.
  for (const block of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const path = pick(block, /uploaded a file in ([^<]+)<\/title>/);
    const fileManagerId = pick(block, /<id>([0-9a-f-]{36})<\/id>/i);
    const fccDocUrl = pick(block, /<link href="([^"]+\.pdf)"/);
    const name = pick(block, /uploaded <strong>([^<]+)<\/strong>/);
    const [root, y, category, ...rest] = path.split("/");
    if (!fileManagerId || !fccDocUrl || root !== "Political Files" || y !== String(year) || !category) continue;

    const scope = categoryScope(category);
    if (!scope) continue;
    if (scope === "candidate") {
      const folderText = normalizeText(rest.join(" "));
      if (!trackedSurnames.some((s) => folderText.includes(s))) continue;
    }
    out.push({ name, fileManagerId, fccDocUrl, category: categorySlug(category) });
  }
  return out;
}
