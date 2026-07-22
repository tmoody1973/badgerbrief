import { describe, expect, test } from "vitest";
import totals from "./fixtures/openfec-totals.json";
import scheduleA from "./fixtures/openfec-schedule-a.json";
import scheduleE from "./fixtures/openfec-schedule-e.json";
import { parseCommitteeTotals, parseTopDonors, parseIndependentExpenditures } from "./openfecEnrich";

describe("openfecEnrich parsers", () => {
  test("totals pull receipts/disbursements + coverage date", () => {
    expect(parseCommitteeTotals(totals)).toEqual({
      totalRaised: 6155000, totalSpent: 5400000, financialsAsOf: "2026-06-30",
    });
  });
  test("top donors sorted desc, capped", () => {
    expect(parseTopDonors(scheduleA, 1)).toEqual([{ name: "Jane Q. Donor", amount: 250000 }]);
  });
  test("top donors aggregate multiple itemized gifts from the same contributor", () => {
    const donors = parseTopDonors(scheduleA);
    const acme = donors.filter((d) => d.name === "Acme LLC");
    expect(acme).toEqual([{ name: "Acme LLC", amount: 200000 }]);
  });
  test("independent expenditures grouped by candidate + support/oppose, summed", () => {
    const ies = parseIndependentExpenditures(scheduleE);
    expect(ies).toContainEqual({ candidate: "TIFFANY, TOM", office: "H", supportOppose: "oppose", amount: 60000 });
    expect(ies).toContainEqual({ candidate: "COOKE, REBECCA", office: "H", supportOppose: "support", amount: 15000 });
  });
});
