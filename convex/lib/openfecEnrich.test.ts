import { describe, expect, test } from "vitest";
import totals from "./fixtures/openfec-totals.json";
import scheduleA from "./fixtures/openfec-schedule-a.json";
import scheduleE from "./fixtures/openfec-schedule-e.json";
import { parseCommitteeTotals, parseTopDonors, parseIndependentExpenditures, isFecMatchImplausible } from "./openfecEnrich";

describe("openfecEnrich parsers", () => {
  test("totals pull receipts/disbursements + coverage date", () => {
    expect(parseCommitteeTotals(totals)).toEqual({
      totalRaised: 6155000, totalSpent: 5400000, financialsAsOf: "2026-06-30",
      peakReceipts: 6155000,
    });
  });
  test("totals expose peak receipts across cycles, display figures stay current-cycle", () => {
    // A hybrid PAC quiet this cycle but large last cycle (The Justice Project
    // shape): display the current cycle, but let the decoy guard see the peak.
    const multi = { results: [
      { cycle: 2026, receipts: 226731.44, disbursements: 226393.4, coverage_end_date: "2026-06-30" },
      { cycle: 2024, receipts: 4617845.73, disbursements: 4589924.31, coverage_end_date: "2024-12-31" },
    ] };
    expect(parseCommitteeTotals(multi)).toEqual({
      totalRaised: 226731.44, totalSpent: 226393.4,
      financialsAsOf: "2026-06-30", peakReceipts: 4617845.73,
    });
  });
  test("a real committee quiet this cycle is not flagged as a decoy", () => {
    // Regression: the guard is documented as "spend vs what a committee EVER
    // raised" but was fed one cycle, so C00873513 ($4.6M in 2024) tripped it.
    const multi = { results: [
      { cycle: 2026, receipts: 226731.44 },
      { cycle: 2024, receipts: 4617845.73 },
    ] };
    const { totalRaised, peakReceipts } = parseCommitteeTotals(multi);
    expect(isFecMatchImplausible(1_592_500, totalRaised)).toBe(true); // old behaviour
    expect(isFecMatchImplausible(1_592_500, peakReceipts)).toBe(false); // fixed
  });
  test("top donors sorted desc, capped", () => {
    expect(parseTopDonors(scheduleA, 1)).toEqual([{ name: "Jane Q. Donor", amount: 250000 }]);
  });
  test("top donors aggregate multiple itemized gifts from the same contributor", () => {
    const donors = parseTopDonors(scheduleA);
    const acme = donors.filter((d) => d.name === "Acme LLC");
    expect(acme).toEqual([{ name: "Acme LLC", amount: 200000 }]);
  });
  test("top donors merge FEC name variants (punctuation/suffix/case) of one entity", () => {
    const json = { results: [
      { contributor_name: "KOCH INDUSTRIES INC.", contribution_receipt_amount: 32500000 },
      { contributor_name: "KOCH INDUSTRIES INC", contribution_receipt_amount: 15000000 },
      { contributor_name: "STAND TOGETHER CHAMBER OF COMMERCE", contribution_receipt_amount: 25000000 },
      { contributor_name: "Stand Together Chamber of Commerce, Inc.", contribution_receipt_amount: 15000000 },
    ] };
    const donors = parseTopDonors(json);
    // Koch Industries variants (period vs none) collapse, summed, fullest name kept.
    expect(donors).toContainEqual({ name: "KOCH INDUSTRIES INC.", amount: 47500000 });
    // Stand Together variants (case + comma + suffix) collapse to one line too.
    const stand = donors.filter((d) => d.name.toLowerCase().includes("stand together"));
    expect(stand).toHaveLength(1);
    expect(stand[0].amount).toBe(40000000);
  });
  test("isFecMatchImplausible flags decoy committees (spend dwarfs receipts)", () => {
    // Justice Project: $815k tracked ads vs a $26k name-matched committee → decoy.
    expect(isFecMatchImplausible(815000, 26000)).toBe(true);
    // Legit large committee (AFP-style): spend well under receipts → fine.
    expect(isFecMatchImplausible(1_000_000, 87_000_000)).toBe(false);
    // Tiny sponsor under the floor → don't flag even if ratio is high.
    expect(isFecMatchImplausible(500, 100)).toBe(false);
    // Unknown receipts (no totals) → can't judge, don't flag.
    expect(isFecMatchImplausible(1_000_000, undefined)).toBe(false);
    // Just over 2x with meaningful spend → flag.
    expect(isFecMatchImplausible(120000, 50000)).toBe(true);
  });
  test("independent expenditures grouped by candidate + support/oppose, summed", () => {
    const ies = parseIndependentExpenditures(scheduleE);
    expect(ies).toContainEqual({ candidate: "TIFFANY, TOM", office: "H", supportOppose: "oppose", amount: 60000 });
    expect(ies).toContainEqual({ candidate: "COOKE, REBECCA", office: "H", supportOppose: "support", amount: 15000 });
  });
});
