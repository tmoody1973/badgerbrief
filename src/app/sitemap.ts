import type { MetadataRoute } from "next";
import {
  listCandidateDirectory,
  listRaces,
} from "@/lib/data";
import { SITE_URL, raceIdToSlug } from "@/lib/site";

export const revalidate = 3600;

// dataAsOf is an editorial string like "July 17, 2026". Parse it to a real
// Date for <lastmod>; fall back to `fallback` on anything unparseable so a bad
// value can never emit an invalid lastmod (which Google drops the whole URL's
// date for).
function asDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [allRaces, candidates] = await Promise.all([
    listRaces(),
    listCandidateDirectory(),
  ]);

  // The chamber-wide legislative races were superseded by one race per
  // district and now 301 to /races (see next.config.ts). A sitemap must list
  // canonical, indexable URLs only — advertising a redirect wastes crawl budget
  // and re-asserts a page we deliberately retired.
  const SUPERSEDED = new Set(["WI-STATE-SENATE-2026", "WI-STATE-ASSEMBLY-2026"]);
  const races = allRaces.filter((r) => !SUPERSEDED.has(r.raceId));

  // A single site-content freshness date for the evergreen/static pages: the
  // most recent editorial dataAsOf across all races. Honest (it moves when the
  // data is refreshed) and avoids stamping "now" on every crawl, which would
  // tell Google the whole site changes hourly and erode lastmod's signal.
  const siteUpdated = races.reduce<Date>((max, r) => {
    const d = asDate(r.dataAsOf, max);
    return d > max ? d : max;
  }, new Date(0));
  const fallback = siteUpdated.getTime() > 0 ? siteUpdated : new Date();

  return [
    { url: SITE_URL, lastModified: fallback, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/es`, lastModified: fallback, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/vote`, lastModified: fallback, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/es/vote`, lastModified: fallback, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/races`, lastModified: fallback, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/candidates`, lastModified: fallback, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/news`, lastModified: fallback, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/news/about`, lastModified: fallback, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/methodology`, lastModified: fallback, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/es/methodology`, lastModified: fallback, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/about`, lastModified: fallback, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/es/about`, lastModified: fallback, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/start`, lastModified: fallback, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/ballot-basics`, lastModified: fallback, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/feedback`, lastModified: fallback, changeFrequency: "yearly", priority: 0.3 },
    ...races.map((r) => ({
      url: `${SITE_URL}/races/${raceIdToSlug(r.raceId)}`,
      lastModified: asDate(r.dataAsOf, fallback),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...races.map((r) => ({
      url: `${SITE_URL}/compare/${raceIdToSlug(r.raceId)}`,
      lastModified: asDate(r.dataAsOf, fallback),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...candidates.map((c) => ({
      url: `${SITE_URL}/candidates/${c.slug}`,
      lastModified: asDate(c.dataAsOf, fallback),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
