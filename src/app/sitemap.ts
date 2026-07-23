import type { MetadataRoute } from "next";
import { listCandidateSlugs, listRaces } from "@/lib/data";
import { SITE_URL, raceIdToSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [races, candidateSlugs] = await Promise.all([
    listRaces(),
    listCandidateSlugs(),
  ]);
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/vote`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/news/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.4 },
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
