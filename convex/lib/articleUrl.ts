/**
 * Canonical identity for an article URL.
 *
 * Dedup keyed on the raw URL misses the same story published at two URLs, which
 * is not hypothetical — /news carried these two rows as separate articles:
 *
 *   .../elections/2026/06/16/what-ag-josh-kaul-says-about-the-democrat-field-for-wisconsin-governor/90561349007/
 *   .../elections/2026/06/16/what-ag-josh-kaul-says-about-the-dem-field-for-governor/90561349007/
 *
 * and these:
 *
 *   .../politics/2026/06/14/sara-rodriguez-leads-field.../90529831007/
 *   .../politics/elections/2026/06/14/sara-rodriguez-leads-field.../90529831007/
 *
 * Gannett/USA Today properties (jsonline.com and the rest of the network) end
 * every article path with a stable numeric asset id and freely rewrite the slug
 * and the section path around it. The id is the article's real identity, so it
 * is the key wherever one is present.
 *
 * Deliberately conservative: when there is no publisher id, the key is the
 * normalized host plus path. Two genuinely different stories must never collapse
 * into one — a missed duplicate is a cosmetic bug, a wrong merge silently hides
 * coverage.
 */

/** Trailing numeric asset id used across the USA Today / Gannett network. */
const PUBLISHER_ID = /\/(\d{8,})\/?$/;

/** Host prefixes that serve the same content as the bare domain. */
const HOST_PREFIX = /^(www|eu|amp|m)\./;

export function canonicalArticleKey(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    // Not a URL we can reason about — fall back to the string itself so the
    // caller still gets a stable key rather than an exception.
    return rawUrl.trim().toLowerCase();
  }

  const host = url.hostname.toLowerCase().replace(HOST_PREFIX, "");
  // Query strings on news URLs are tracking (utm_*, ?src=) and never identity.
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();

  const id = PUBLISHER_ID.exec(url.pathname);
  if (id) return `${host}#${id[1]}`;

  return `${host}${path}`;
}

/** True when two URLs point at the same article. */
export const isSameArticle = (a: string, b: string): boolean =>
  canonicalArticleKey(a) === canonicalArticleKey(b);
