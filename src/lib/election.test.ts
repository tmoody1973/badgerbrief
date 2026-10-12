import { describe, expect, test } from "vitest";
import { CURRENT_ELECTION, PRIMARY_ARCHIVE, formatIsoDate } from "./election";

describe("CURRENT_ELECTION", () => {
  test("its dates agree with each other", () => {
    const day = new Date(`${CURRENT_ELECTION.isoDate}T12:00:00Z`);
    const long = day.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    expect(long).toBe(CURRENT_ELECTION.longDate);
    expect(day.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })).toBe("Tuesday");
    expect(CURRENT_ELECTION.badge).toBe(`GENERAL · ${CURRENT_ELECTION.shortDate.toUpperCase()}`);
  });

  test("the archive points somewhere and names the primary", () => {
    expect(PRIMARY_ARCHIVE.path).toBe("/primary-2026");
    expect(PRIMARY_ARCHIVE.label).toContain(PRIMARY_ARCHIVE.longDate);
  });
});

describe("formatIsoDate", () => {
  test("writes a date the way the guide prints dates", () => {
    expect(formatIsoDate("2026-10-06")).toBe("October 6, 2026");
  });

  test("returns the input unchanged when it is not a date", () => {
    expect(formatIsoDate("filings through Aug 3")).toBe("filings through Aug 3");
  });
});
