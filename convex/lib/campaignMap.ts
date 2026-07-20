/**
 * Own-domain policy-subpage selection for the campaign-site mapper (MOO-326).
 *
 * Pure string/URL logic so it unit-tests without Convex or network. The
 * same-site rule mirrors isAllowedUrl's hostname-suffix pattern in
 * scoutParse.ts (no PSL dependency) — a suffix check is safe here because we
 * compare against a domain we already trust, not a user-supplied one.
 */

/**
 * Policy-shaped FIRST path segments, matched exactly rather than as prefixes:
 * a prefix match would register store.<candidate>.com/about-us and
 * /badger-basics as policy pages.
 */
const POLICY_SEGMENTS = [
  "policy",
  "policies",
  "issues",
  "plan",
  "plans",
  "platform",
  "priorities",
  "about",
];

/** One entry from a Firecrawl /map response. */
export type MapLink = { url: string; title?: string };

/** Registrable-ish domain of a URL: lowercased host with a leading "www." removed. */
export function baseDomain(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

/** True when url is the campaign's own domain or a subdomain of it. */
export function isSameSite(homepageUrl: string, url: string): boolean {
  const home = baseDomain(homepageUrl);
  const host = baseDomain(url);
  if (!home || !host) return false;
  return host === home || host.endsWith(`.${home}`);
}

/** True when the URL's first path segment is policy-shaped (children included). */
export function isPolicyPath(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false; // homepage
  return POLICY_SEGMENTS.includes(segments[0].toLowerCase());
}

/**
 * Titles from unedited site templates. Campaign sites ship on Squarespace/Wix
 * themes and leave stub pages behind — mandelabarnes.com/issues/issue-2 is
 * literally titled "Your issue title here" — so registering them as sources
 * would feed empty pages to the extractor and clutter the editor's queue.
 */
const PLACEHOLDER_TITLE = /(your .{0,24}(title|text|heading) here|untitled|lorem ipsum|page title)/i;

export function isPlaceholderTitle(title?: string): boolean {
  if (!title) return false;
  return PLACEHOLDER_TITLE.test(title);
}

/** Identity of a page for dedup: host+path, scheme- and trailing-slash-insensitive. */
function pageKey(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${path.toLowerCase()}`;
}

/**
 * Own-domain, policy-shaped subpages from a /map result, deduped and capped.
 * Order: shallower paths first, then alphabetical — so /policy survives the
 * cap ahead of /policy/veterans.
 */
export function selectPolicySubpages({
  homepageUrl,
  links,
  cap,
}: {
  homepageUrl: string;
  links: MapLink[];
  cap: number;
}): string[] {
  if (!baseDomain(homepageUrl)) return [];
  const homeKey = (() => {
    try {
      return pageKey(homepageUrl);
    } catch {
      return null;
    }
  })();

  // A campaign site's unused routes often serve the homepage (Barnes's /issues
  // is the homepage verbatim). Same title as the homepage ⇒ same page ⇒ a
  // duplicate extraction of content the homepage target already covers.
  const homeTitle = links
    .find((l) => {
      try {
        return pageKey(l.url) === homeKey;
      } catch {
        return false;
      }
    })
    ?.title?.trim();

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const { url: link, title } of links) {
    if (!isSameSite(homepageUrl, link) || !isPolicyPath(link)) continue;
    if (isPlaceholderTitle(title)) continue;
    if (homeTitle && title?.trim() === homeTitle) continue;
    let key: string;
    try {
      key = pageKey(link);
    } catch {
      continue;
    }
    if (key === homeKey || seen.has(key)) continue;
    seen.add(key);
    kept.push(link);
  }

  const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
  return kept
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .slice(0, cap);
}
