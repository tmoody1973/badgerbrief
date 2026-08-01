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

// 11:30 UTC — daily follower snapshot per candidate (SocialFetch). No-op until
// SOCIALFETCH_API_KEY is set. Accumulates one row/candidate/platform/day so we
// can track follower growth through the Aug 11 primary.
crons.daily(
  "snapshot social followers",
  { hourUTC: 11, minuteUTC: 30 },
  internal.social.syncSocial,
  {},
);

// 11:00 UTC — propose new article sources for human review (MOO-322).
crons.daily(
  "scout article sources",
  { hourUTC: 11, minuteUTC: 0 },
  internal.scout.run,
  {},
);

// 11:15 UTC — 15 min after the scout, so the articles it just proposed get
// their publication date read from the article's own metadata the same morning.
//
// THIS IS WHAT KEPT /news LOOKING FROZEN. The hub sorts date-verified articles
// first and only trusts a date it has confirmed against the publisher's own
// page, so an unverified article sorts below every dated one and falls off the
// 60-item feed. Nothing scheduled ever ran the verifier, so brand-new coverage
// was invisible on arrival: nine articles dated the 24th sat in the database
// while the feed's newest story was the 22nd. The verifier is not an
// enrichment nicety — without it, ingestion does not reach the page.
//
// limit 120 comfortably covers a day's scouting (a full-pool run proposes
// ~20-70) with headroom for a backlog.
crons.daily(
  "verify article publication dates",
  { hourUTC: 11, minuteUTC: 15 },
  internal.publishedDateSync.syncPublishedDates,
  { limit: 120 },
);

// 11:20 UTC — right after the scout + date-verify, tell Bing/IndexNow the
// news hub changed so today's coverage is picked up without waiting for a
// crawl. No-op if INDEXNOW_KEY isn't set.
crons.daily(
  "indexnow ping",
  { hourUTC: 11, minuteUTC: 20 },
  internal.indexNow.pingDaily,
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

// Sundays 13:00 UTC — after the state roll-call pass. Already-stored roll calls
// are skipped, so a weekly run costs one list call per session when the House
// hasn't voted. Every stored vote is cross-checked against the House Clerk's XML
// before it lands (MOO-396).
crons.weekly(
  "ingest House roll calls",
  { dayOfWeek: "sunday", hourUTC: 13, minuteUTC: 0 },
  internal.houseVotes.ingest,
  {},
);

// Sundays 13:30 UTC — the vote endpoints carry no bill title at all, so titles
// come from a second pass over the bill endpoint. Cached per bill, so this is
// cheap once the backfill has run.
crons.weekly(
  "enrich House bill titles",
  { dayOfWeek: "sunday", hourUTC: 13, minuteUTC: 30 },
  internal.houseVotes.enrichBillTitles,
  {},
);

export default crons;
