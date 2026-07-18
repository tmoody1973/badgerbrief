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

// 12:00 UTC = 7:00 AM Central — after finance sync, before editorial review hours.
crons.daily(
  "research agent sweep",
  { hourUTC: 12, minuteUTC: 0 },
  internal.research.run,
  {},
);

export default crons;
