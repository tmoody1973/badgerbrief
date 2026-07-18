export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://badgerbrief.vercel.app";

export const SITE_NAME = "BadgerBrief";
export const SITE_DESCRIPTION =
  "Non-partisan, source-linked Wisconsin voter guide: your ballot, the candidates, the money, and exactly how to vote.";

/** "WI-GOV-2026" ↔ "wi-gov-2026" */
export const raceIdToSlug = (raceId: string) => raceId.toLowerCase();
export const slugToRaceId = (slug: string) => slug.toUpperCase();
