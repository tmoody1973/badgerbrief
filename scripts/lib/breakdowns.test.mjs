import { describe, expect, test } from "vitest";
import { computeBreakdowns } from "./breakdowns.mjs";

const HEADER =
  "ID,Transaction Date,Amount,Registrant Name,Transaction Type,Contributor Name,Contributor Entity Type,Contributor City,Contributor State,Related Ballot Event Name";

const row = (id, date, amount, committee, type, donor, entityType, city, state, event = "") =>
  [id, date, amount, committee, type, donor, entityType, city, state, event].join(",");

const CSV = [
  HEADER,
  // Alice gives twice (aggregates to 250 → mid bucket), in-state
  row(1, "2026-01-15", 100, "Test Comm", "Contribution", "Alice A", "Individual", "Madison", "WI"),
  row(2, "2026-07-02", 150, "Test Comm", "Contribution", "Alice A", "Individual", "Madison", "Wisconsin"),
  // Bob small donor, out of state
  row(3, "2026-07-10", 50, "Test Comm", "Contribution", "Bob B", "Individual", "Chicago", "IL"),
  // Tagged party committee
  row(4, "2026-07-11", 500, "Test Comm", "Contribution", "Republican Party of Wisconsin", "Registrant", "Madison", "WI"),
  // Untagged PAC falls back to 'pac'
  row(5, "2026-07-12", 200, "Test Comm", "Contribution", "Mystery PAC", "Registrant", "", ""),
  // Business, unknown state
  row(6, "2026-02-01", 300, "Test Comm", "Contribution", "Acme LLC", "Business", "Racine", ""),
  // Disbursement must not count toward any breakdown
  row(7, "2026-03-01", 999, "Test Comm", "Disbursement", "Vendor", "Business", "", ""),
  // Old-cycle-tagged row must be dropped
  row(8, "2026-03-02", 777, "Test Comm", "Contribution", "Old Donor", "Individual", "", "", "2020 Fall General"),
].join("\n");

const TAGS = { "Republican Party of Wisconsin": "party" };

describe("computeBreakdowns", () => {
  const b = computeBreakdowns(CSV, TAGS).get("Test Comm");

  test("category totals, donor counts, and tag fallback", () => {
    const byKey = Object.fromEntries(b.categories.map((c) => [c.key, c]));
    expect(byKey.individuals).toMatchObject({ amount: 300, count: 2 });
    expect(byKey.party).toMatchObject({ amount: 500, count: 1 });
    expect(byKey.pac).toMatchObject({ amount: 200, count: 1 }); // Mystery PAC untagged
    expect(byKey.business).toMatchObject({ amount: 300, count: 1 });
    expect(byKey.other ?? { amount: 0 }).toMatchObject({ amount: 0 });
  });

  test("category amounts sum to total receipts (bar sums to 100%)", () => {
    const total = b.categories.reduce((s, c) => s + c.amount, 0);
    expect(total).toBe(1300); // 300 + 500 + 200 + 300; no disbursement, no 2020 row
  });

  test("topDonors aggregate across gifts with location", () => {
    const ind = b.categories.find((c) => c.key === "individuals");
    expect(ind.topDonors[0]).toEqual({ name: "Alice A", amount: 250, location: "Madison, WI" });
  });

  test("size buckets aggregate per donor, individuals only", () => {
    const byKey = Object.fromEntries(b.sizeBuckets.map((s) => [s.key, s]));
    expect(byKey.small).toMatchObject({ amount: 50, count: 1 }); // Bob
    expect(byKey.mid).toMatchObject({ amount: 250, count: 1 }); // Alice (100+150)
    expect(byKey.large ?? { count: 0 }).toMatchObject({ count: 0 });
  });

  test("geo normalizes WI spellings and buckets unknown", () => {
    expect(b.geo.inState).toMatchObject({ amount: 250, count: 1 }); // Alice
    expect(b.geo.outOfState).toMatchObject({ amount: 50, count: 1 }); // Bob
    expect(b.geo.unknown).toMatchObject({ amount: 300, count: 1 }); // Acme
  });

  test("monthly sums ascending, zero months omitted", () => {
    expect(b.monthly).toEqual([
      { month: "2026-01", receipts: 100 },
      { month: "2026-02", receipts: 300 },
      { month: "2026-07", receipts: 900 },
    ]);
  });

  test("takeaway thresholds: party 500/1300 = 38% does not trip at 40", () => {
    expect(b.takeaways.some((t) => t.includes("party"))).toBe(false);
  });

  test("takeaway fires when party crosses 40%", () => {
    const csv = [
      HEADER,
      row(1, "2026-07-01", 600, "P Comm", "Contribution", "Republican Party of Wisconsin", "Registrant", "", ""),
      row(2, "2026-07-02", 400, "P Comm", "Contribution", "Carol C", "Individual", "", ""),
    ].join("\n");
    const p = computeBreakdowns(csv, TAGS).get("P Comm");
    expect(p.takeaways).toContain("Over 60% of this campaign's money came from party committees.");
  });

  test("missing Transaction Type column treats rows as contributions", () => {
    const headerNoType =
      "ID,Transaction Date,Amount,Registrant Name,Contributor Name,Contributor Entity Type,Contributor City,Contributor State,Related Ballot Event Name";
    const rowNoType = (id, date, amount, committee, donor, entityType, city, state, event = "") =>
      [id, date, amount, committee, donor, entityType, city, state, event].join(",");
    const csv = [
      headerNoType,
      rowNoType(1, "2026-01-15", 100, "No Type Comm", "Dave D", "Individual", "Madison", "WI"),
      rowNoType(2, "2026-01-16", 50, "No Type Comm", "Eve E", "Individual", "Chicago", "IL"),
    ].join("\n");
    const nt = computeBreakdowns(csv, {}).get("No Type Comm");
    expect(nt.categories.find((c) => c.key === "individuals")).toMatchObject({ amount: 150, count: 2 });
  });

  test("size bucket boundaries: $200 lands in mid, not small", () => {
    const csv = [
      HEADER,
      row(1, "2026-01-01", 200, "Boundary Comm", "Contribution", "Exact 200", "Individual", "", ""),
    ].join("\n");
    const b = computeBreakdowns(csv, {}).get("Boundary Comm");
    const byKey = Object.fromEntries(b.sizeBuckets.map((s) => [s.key, s]));
    expect(byKey.mid).toMatchObject({ amount: 200, count: 1 });
    expect(byKey.small ?? { count: 0 }).toMatchObject({ count: 0 });
  });

  test("size bucket boundaries: $1000 lands in large, not mid", () => {
    const csv = [
      HEADER,
      row(1, "2026-01-01", 1000, "Boundary Comm", "Contribution", "Exact 1000", "Individual", "", ""),
    ].join("\n");
    const b = computeBreakdowns(csv, {}).get("Boundary Comm");
    const byKey = Object.fromEntries(b.sizeBuckets.map((s) => [s.key, s]));
    expect(byKey.large).toMatchObject({ amount: 1000, count: 1 });
    expect(byKey.mid ?? { count: 0 }).toMatchObject({ count: 0 });
  });
});
