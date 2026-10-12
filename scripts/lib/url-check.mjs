/** Paths listed in a sitemap, e.g. "/races/wi-gov-2026". */
export function pathsFromSitemap(xml) {
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1].trim()).pathname);
  if (paths.length === 0) throw new Error("the sitemap lists no addresses");
  return paths;
}

/** A page "still works" only if it answers 200 after any redirects. */
export function failures(results) {
  return results.filter((r) => r.status !== 200);
}
