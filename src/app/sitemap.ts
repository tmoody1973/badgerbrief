import type { MetadataRoute } from "next";
import { listCandidateSlugs, listRaces } from "@/lib/data";
import { SITE_URL, raceIdToSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [allRaces, candidateSlugs] = await Promise.all([
    listRaces(),
    listCandidateSlugs(),
  ]);

  // The chamber-wide legislative races were superseded by one race per
  // district and now 301 to the homepage (see next.config.ts). A sitemap must
  // list canonical, indexable URLs only — advertising a redirect wastes crawl
  // budget and re-asserts a page we deliberately retired.
  const SUPERSEDED = new Set(["WI-STATE-SENATE-2026", "WI-STATE-ASSEMBLY-2026"]);
  const races = allRaces.filter((r) => !SUPERSEDED.has(r.raceId));
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/es`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/vote`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/es/vote`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/news/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/es/methodology`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/es/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/start`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/feedback`, changeFrequency: "yearly", priority: 0.3 },
    ...races.map((r) => ({
      url: `${SITE_URL}/races/${raceIdToSlug(r.raceId)}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...races.map((r) => ({
      url: `${SITE_URL}/compare/${raceIdToSlug(r.raceId)}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...candidateSlugs.map((slug) => ({
      url: `${SITE_URL}/candidates/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
