/**
 * The election this guide is currently about. One place, so no page, share
 * image or search tag carries its own copy of a date.
 */
export const CURRENT_ELECTION = {
  kind: "general",
  name: "general election",
  isoDate: "2026-11-03",
  longDate: "November 3, 2026",
  shortDate: "Nov 3, 2026",
  badge: "GENERAL · NOV 3, 2026",
  eventName: "Wisconsin General Election 2026",
} as const;

/** The finished primary, kept as a labeled archive. */
export const PRIMARY_ARCHIVE = {
  longDate: "August 11, 2026",
  shortDate: "Aug 11, 2026",
  label: "August 11, 2026 primary",
  path: "/primary-2026",
} as const;

/** "2026-10-06" -> "October 6, 2026". Anything else is returned as given. */
export function formatIsoDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
