import type { MetadataRoute } from "next";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { SITE_URL, raceIdToSlug } from "@/lib/site";

/** The primary archive: finished, so it is advertised as rarely changing. */
export function archiveEntries(raceIds: readonly string[], lastModified: Date): MetadataRoute.Sitemap {
  const entry = (path: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "yearly" as const,
    priority,
  });
  return [
    entry(PRIMARY_ARCHIVE.path, 0.3),
    ...raceIds.map((id) => entry(`${PRIMARY_ARCHIVE.path}/races/${raceIdToSlug(id)}`, 0.2)),
  ];
}
