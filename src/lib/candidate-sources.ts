import { formatIsoDate } from "./election";

type Source = { name: string; url: string };
type General = { source: { url: string; documentDate: string } } | undefined;

/**
 * The candidate's sources, led by the state's certified November list when
 * they have a November record. Otherwise an Assembly candidate's only source
 * is the July primary filing list, which reads as stale in October.
 */
export function candidateSources(sources: readonly Source[], general: General): Source[] {
  if (!general) return [...sources];
  const certified = {
    name: `Wisconsin Elections Commission — certified Nov. 3 candidate list, dated ${formatIsoDate(general.source.documentDate)}`,
    url: general.source.url,
  };
  return [certified, ...sources.filter((s) => s.url !== certified.url)];
}

/** The page's "last updated" date: the certified list's own date when the
 * page carries the November ballot, else the page's hand-set date (which was
 * last touched for the primary and reads as stale in October). */
export function pageUpdated(general: General, dataAsOf: string): string {
  return general ? formatIsoDate(general.source.documentDate) : dataAsOf;
}
