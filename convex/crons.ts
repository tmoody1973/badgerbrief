import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 11:00 UTC = 6:00 AM Central — fresh numbers before the morning news cycle.
crons.daily(
  "sync OpenFEC totals",
  { hourUTC: 11, minuteUTC: 0 },
  internal.finance.syncOpenFec,
  {},
);

// 11:00 UTC — propose new article sources for human review (MOO-322).
crons.daily(
  "scout article sources",
  { hourUTC: 11, minuteUTC: 0 },
  internal.scout.run,
  {},
);

// 11:30 UTC — between scout and the research sweep, so own-site policy pages
// discovered today are extractable in the same run (MOO-326).
crons.daily(
  "map campaign sites",
  { hourUTC: 11, minuteUTC: 30 },
  internal.siteMap.run,
  {},
);

// 12:00 UTC = 7:00 AM Central — after finance sync, before editorial review hours.
crons.daily(
  "research agent sweep",
  { hourUTC: 12, minuteUTC: 0 },
  internal.research.run,
  {},
);

// 12:15 UTC — after the research sweep, re-fetch campaign sites and alert on
// content-hash drift.
crons.daily(
  "source change sweep",
  { hourUTC: 12, minuteUTC: 15 },
  internal.monitor.sourceChangeSweep,
  {},
);

// 12:30 UTC — flag published positions that haven't been reviewed recently.
// Deviation from plan text: lives at internal.monitorQueries.stalenessSweep,
// not internal.monitor.stalenessSweep — "use node" modules (convex/monitor.ts)
// may only export actions, so the mutation lives in monitorQueries.ts instead.
crons.daily(
  "staleness sweep",
  { hourUTC: 12, minuteUTC: 30 },
  internal.monitorQueries.stalenessSweep,
  {},
);

// 12:45 UTC — after the other syncs. No-arg: reads META_ADS_ACCESS_TOKEN and
// (once curated) tracked pages. With no token it logs an info alert and skips,
// never crashes (MOO-309). Switch to crons.interval hourly for the final
// pre-primary week when spend moves fast.
crons.daily(
  "sync Meta ads",
  { hourUTC: 12, minuteUTC: 45 },
  internal.ads.syncMetaAds,
  {},
);

// 13:00 UTC — Google political ads (BigQuery public dataset). No-arg: reads
// GOOGLE_SERVICE_ACCOUNT_JSON. No creds → info alert and skip, never crashes
// (MOO-315). Google ads are M2; the cron is registered now, dormant until the
// GCP project + service account exist.
crons.daily(
  "sync Google ads",
  { hourUTC: 13, minuteUTC: 0 },
  internal.ads.syncGoogleAds,
  {},
);

// 13:30 UTC — broadcast-TV political-file orders via Browserbase + FCC (MOO-318).
// Drives a hosted browser (Convex can't), unwraps PDF portfolios, Sonnet-extracts,
// lands human-reviewed platform:tv ads. One station's failure alerts + continues.
crons.daily(
  "sync TV ads",
  { hourUTC: 13, minuteUTC: 30 },
  internal.adsTv.syncTvAdsDispatch,
  {},
);

// Monthly, 8:00 UTC on the 1st — batch-enrich the highest-spend outside
// groups that are stale or unenriched (MOO-318 follow-up).
crons.monthly(
  "enrich sponsors",
  { day: 1, hourUTC: 8, minuteUTC: 0 },
  internal.sponsorEnrich.enrichOutsideGroups,
  { limit: 50, staleDays: 30 },
);

// Sundays 12:00 UTC — the Legislature posts roll calls within a day or two of a
// floor session, and already-ingested vote ids are skipped, so a weekly full
// pass costs one index fetch per chamber when nothing is new.
crons.weekly(
  "ingest legislative roll calls",
  { dayOfWeek: "sunday", hourUTC: 12, minuteUTC: 0 },
  internal.votes.ingest,
  {},
);

// Sundays 12:30 UTC — 30 min after the roll-call ingest, so bills from today's
// new roll calls get their LRB analysis in the same weekly pass. Already-enriched
// bills are skipped, so a full pass is cheap once the backfill has run.
crons.weekly(
  "enrich bill analyses",
  { dayOfWeek: "sunday", hourUTC: 12, minuteUTC: 30 },
  internal.bills.enrich,
  {},
);

export default crons;
