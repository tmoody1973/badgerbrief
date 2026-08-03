import { describe, test, expect } from "vitest";
import { parseCoverageEndDate, latestPeriodicReport, isBehind } from "./sunshineStale";

describe("parseCoverageEndDate", () => {
  test("pulls the last date from a 'through' label", () => {
    expect(parseCoverageEndDate("filings through Jun 30, 2026")).toBe("2026-06-30");
  });
  test("pulls the END date from a range label", () => {
    expect(parseCoverageEndDate("Jan 1 – Jul 27, 2026")).toBe("2026-07-27");
  });
  test("returns null when there is no date", () => {
    expect(parseCoverageEndDate("per latest Sunshine export")).toBeNull();
    expect(parseCoverageEndDate(undefined)).toBeNull();
  });
});

describe("latestPeriodicReport", () => {
  const reports = [
    { submitted: true, committee: { assignedCommitteeId: "0104606" },
      reportTemplate: { name: "2026 July Continuing", templateType: "PERIODIC", transactionsEndDate: "2026-06-30T23:59:59Z" } },
    { submitted: true, committee: { assignedCommitteeId: "0104606" },
      reportTemplate: { name: "2026 Fall Pre-Primary", templateType: "PERIODIC", transactionsEndDate: "2026-07-27T23:59:59Z" } },
    // event-triggered 72-hour report → ignored
    { submitted: true, committee: { assignedCommitteeId: "0104606" },
      reportTemplate: { name: "2026 Fall Primary – 72-Hour Contributions", templateType: "EVENT", transactionsEndDate: "2026-08-02T00:00:00Z" } },
    // different committee → ignored
    { submitted: true, committee: { assignedCommitteeId: "9999999" },
      reportTemplate: { name: "x", templateType: "PERIODIC", transactionsEndDate: "2026-12-31T00:00:00Z" } },
  ];
  test("returns the newest PERIODIC report for the registrant, ignoring events + other committees", () => {
    expect(latestPeriodicReport(reports, "0104606")).toEqual({ name: "2026 Fall Pre-Primary", end: "2026-07-27" });
  });
  test("returns null when the registrant has no periodic report", () => {
    expect(latestPeriodicReport(reports, "0000000")).toBeNull();
  });
});

describe("isBehind", () => {
  test("behind when the filed report ends after our coverage", () => {
    expect(isBehind("2026-07-27", "filings through Jun 30, 2026")).toBe(true);
  });
  test("not behind when coverage matches the filed report", () => {
    expect(isBehind("2026-06-30", "filings through Jun 30, 2026")).toBe(false);
  });
  test("behind (conservative) when coverage label has no parseable date", () => {
    expect(isBehind("2026-06-30", "per latest Sunshine export")).toBe(true);
  });
});
