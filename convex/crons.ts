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

export default crons;
