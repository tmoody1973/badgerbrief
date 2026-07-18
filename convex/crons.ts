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

export default crons;
