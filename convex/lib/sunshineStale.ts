/**
 * Pure helpers for the Sunshine staleness monitor (convex/sunshineMonitor.ts).
 *
 * "Stale" = the WI CFIS site has a newer PERIODIC report (July Continuing, Fall
 * Pre-Primary, …) for a committee than the coverage we've ingested. Event-
 * triggered reports (72-hour large-contribution reports) are ignored — they
 * carry no period total, so they never change our receipts/cash-on-hand.
 * No network here; the fetch lives in the "use node" action.
 */

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Extract the END date (YYYY-MM-DD) from a stored coverage label such as
 * "filings through Jun 30, 2026" or "Jan 1 – Jun 30, 2026" — the LAST calendar
 * date in the string. Returns null when no date is present (e.g. a placeholder
 * label), which the caller treats as "unknown → flag to be safe".
 */
export function parseCoverageEndDate(label: string | undefined | null): string | null {
  if (!label) return null;
  const re = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})/g;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(label)) !== null) {
    const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (!mm) continue;
    last = `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
  }
  return last;
}

type Report = {
  submitted?: boolean;
  committee?: { assignedCommitteeId?: string };
  reportTemplate?: { name?: string; templateType?: string; transactionsEndDate?: string };
};

/** The most recent submitted PERIODIC report for this registrant, or null. */
export function latestPeriodicReport(
  reports: Report[],
  registrantId: string,
): { name: string; end: string } | null {
  const periodic = reports.filter(
    (r) =>
      r.submitted &&
      r.committee?.assignedCommitteeId === registrantId &&
      r.reportTemplate?.templateType === "PERIODIC" &&
      typeof r.reportTemplate?.transactionsEndDate === "string",
  );
  if (periodic.length === 0) return null;
  periodic.sort((a, b) =>
    a.reportTemplate!.transactionsEndDate! < b.reportTemplate!.transactionsEndDate! ? 1 : -1,
  );
  const top = periodic[0].reportTemplate!;
  return { name: top.name ?? "(unnamed)", end: top.transactionsEndDate!.slice(0, 10) };
}

/**
 * True when a report ending `filedEndISO` is newer than what our coverage label
 * says we hold. ISO date strings (YYYY-MM-DD) compare correctly lexically. An
 * unparseable/absent coverage label is treated as behind (conservative).
 */
export function isBehind(filedEndISO: string, coverageLabel: string | undefined | null): boolean {
  const have = parseCoverageEndDate(coverageLabel);
  if (!have) return true;
  return filedEndISO > have;
}
