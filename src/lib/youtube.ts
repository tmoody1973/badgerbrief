/**
 * Deep link into a YouTube video at a given second.
 *
 * Lives in its own module rather than beside the component that first needed
 * it: the debate transcript renders on the server while the issue switcher is
 * a client component, and a plain function exported from a `"use client"` file
 * arrives on the server as a client-reference proxy, not something callable —
 * a runtime 500 that typechecks clean. Keeping it here, with no heavy imports,
 * lets both sides use it and keeps the debate JSON out of the client bundle.
 *
 * Only sound when the linked video shares the timeline the timestamps came
 * from; scripts/export-debate-page-data.mjs records how that was verified.
 */
export const youtubeAt = (id: string, sec: number) =>
  `https://www.youtube.com/watch?v=${id}&t=${Math.max(0, Math.floor(sec))}s`;
