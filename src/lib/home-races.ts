import type { Doc } from "../../convex/_generated/dataModel";

export const LEVEL_ORDER = [
  "State Executive",
  "Federal",
  "State Judicial",
  "State Legislative",
];

export function splitHomeRaces(races: Doc<"races">[]) {
  const hasPerDistrict = races.some(
    (r) => /-D\d+-\d{4}$/.test(r.raceId) && r.level === "State Legislative",
  );
  const listed = hasPerDistrict
    ? races.filter((r) => r.level !== "State Legislative" || /-D\d+-\d{4}$/.test(r.raceId))
    : races;

  const byLevel = new Map<string, Doc<"races">[]>();
  for (const level of LEVEL_ORDER) {
    const group = listed.filter((r) => r.level === level);
    if (group.length > 0) byLevel.set(level, group);
  }
  return { listed, byLevel };
}
