import { describe, expect, test } from "vitest";
import { computeDonorRosters, donorKeyFor } from "./donors.mjs";

const HEADER =
  "ID,Transaction Date,Amount,Registrant Name,Transaction Type,Contributor Name,Contributor Entity Type,Contributor City,Contributor State,Related Ballot Event Name";
const row = (id, date, amount, committee, type, donor, entityType, city, state, event = "") =>
  [id, date, amount, committee, type, donor, entityType, city, state, event].join(",");

const CSV = [
  HEADER,
  row(1, "2026-01-15", 100, "Test Comm", "Contribution", "Alice A", "Individual", "Madison", "WI"),
  row(2, "2026-07-02", 150, "Test Comm", "Contribution", "alice  a", "Individual", "Madison", "Wisconsin"),
  row(3, "2026-07-10", 50, "Test Comm", "Contribution", "Bob B", "Individual", "Chicago", "IL"),
  row(4, "2026-07-11", 500, "Test Comm", "Contribution", "WEAC PAC", "Registrant", "Madison", "WI"),
  row(5, "2026-03-01", 999, "Test Comm", "Disbursement", "Vendor", "Business", "", ""),
  row(6, "2026-03-02", 777, "Test Comm", "Contribution", "Old Donor", "Individual", "", "", "2020 Fall General"),
].join("\n");

const TAGS = { "WEAC PAC": "union" };

describe("donorKeyFor", () => {
  test("trims, collapses whitespace, lowercases", () => {
    expect(donorKeyFor("  Alice   A ")).toBe("alice a");
  });
});

describe("computeDonorRosters", () => {
  const roster = computeDonorRosters(CSV, TAGS).get("Test Comm");

  test("aggregates case/whitespace variants under one donorKey", () => {
    const alice = roster.find((d) => d.donorKey === "alice a");
    expect(alice).toMatchObject({
      donorName: "Alice A", // first-seen display form
      category: "individuals",
      total: 250,
      giftCount: 2,
      location: "Madison, WI",
      state: "WI",
    });
    expect(alice.gifts).toEqual([
      { date: "2026-01-15", amount: 100 },
      { date: "2026-07-02", amount: 150 },
    ]);
  });

  test("category matches pac-tags path; sorted by total desc", () => {
    expect(roster[0]).toMatchObject({ donorKey: "weac pac", category: "union", total: 500 });
    expect(roster.map((d) => d.total)).toEqual([...roster.map((d) => d.total)].sort((a, b) => b - a));
  });

  test("disbursements and old-cycle rows excluded; state normalizes Wisconsin→WI", () => {
    expect(roster.find((d) => d.donorKey === "vendor")).toBeUndefined();
    expect(roster.find((d) => d.donorKey === "old donor")).toBeUndefined();
    expect(roster.find((d) => d.donorKey === "bob b").state).toBe("IL");
  });

  test("gifts capped at 500 newest with exact totals", () => {
    const many = [HEADER];
    // Phase A: 100 older gifts dated 2026-01-15 with amount 1
    for (let i = 1; i <= 100; i++) {
      many.push(row(i, "2026-01-15", 1, "Big Comm", "Contribution", "Recurring R", "Individual", "", ""));
    }
    // Phase B: 500 newer gifts dated 2026-06-01 with amount 2
    for (let i = 101; i <= 600; i++) {
      many.push(row(i, "2026-06-01", 2, "Big Comm", "Contribution", "Recurring R", "Individual", "", ""));
    }
    const big = computeDonorRosters(many.join("\n"), {}).get("Big Comm")[0];
    expect(big.giftCount).toBe(600);
    expect(big.total).toBe(1100); // 100*1 + 500*2
    expect(big.gifts).toHaveLength(500);
    expect(big.giftsTruncated).toBe(true);
    // after capping, all 500 capped gifts are from Phase B (newest)
    expect(big.gifts.every((g) => g.date === "2026-06-01" && g.amount === 2)).toBe(true);
  });
});
