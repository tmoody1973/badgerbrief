import { describe, expect, test } from "vitest";
import {
  parseMoney,
  parseFlightDates,
  toAdWrite,
  buildDisclosure,
} from "./tvExtract";
import type { TvAdExtraction } from "./tvExtract";

describe("buildDisclosure", () => {
  const order: TvAdExtraction = {
    advertiser: "Opportunity Wisconsin",
    station: "WISN-TV",
    grossSpend: 27430,
    confidence: {},
  };
  const nab: TvAdExtraction = {
    advertiser: "",
    station: "WISN-TV",
    refCandidates: ["Bryan Steil"],
    refOffice: "Wisconsin's 1st congressional district",
    refNationalIssue: "Tariffs",
    sponsorLegalName: "Opportunity Wisconsin",
    confidence: {},
  };
  test("merges NAB target from the disclosure page onto the buy", () => {
    const d = buildDisclosure([order, nab]);
    expect(d?.candidates).toEqual(["Bryan Steil"]);
    expect(d?.office).toBe("Wisconsin's 1st congressional district");
    expect(d?.nationalIssue).toBe("Tariffs");
  });
  test("returns undefined when no page carries disclosure (plain order)", () => {
    expect(buildDisclosure([order])).toBeUndefined();
  });
});

describe("parseMoney", () => {
  test("parses a formatted dollar amount", () => {
    expect(parseMoney("$24,550.00")).toBe(24550);
  });
  test("parses a bare number", () => {
    expect(parseMoney("20867.5")).toBe(20867.5);
  });
  test("returns undefined for junk", () => {
    expect(parseMoney("n/a")).toBeUndefined();
    expect(parseMoney("")).toBeUndefined();
  });
});

describe("parseFlightDates", () => {
  test("parses M.D-M.D with the folder year", () => {
    expect(parseFlightDates("Barnes Gov 7.21-7.27", 2026)).toEqual({
      start: "2026-07-21",
      end: "2026-07-27",
    });
  });
  test("supports slash separators and zero-padding", () => {
    expect(parseFlightDates("Doe 07/14-07/20", 2026)).toEqual({
      start: "2026-07-14",
      end: "2026-07-20",
    });
  });
  test("rolls the end into the next year when it wraps", () => {
    expect(parseFlightDates("Year-end 12.28-1.3", 2026)).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });
  test("returns empty object when no range is present", () => {
    expect(parseFlightDates("General Order", 2026)).toEqual({});
  });
});

describe("toAdWrite", () => {
  const extraction: TvAdExtraction = {
    advertiser: "Barnes/D/Governor",
    party: "D",
    office: "Governor",
    candidateName: "Mandela Barnes",
    station: "WISN-TV",
    dma: "Milwaukee",
    flightStart: "2026-07-14",
    flightEnd: "2026-07-20",
    spotCount: 18,
    grossSpend: 24550,
    netSpend: 20867.5,
    orderRef: "4443972",
    confidence: { advertiser: 0.98, grossSpend: 0.99 },
  };

  test("maps exact spend to equal lower/upper and fileManagerId to platformAdId", () => {
    const row = toAdWrite(extraction, {
      fileManagerId: "fm-uuid-1",
      fccDocUrl: "https://publicfiles.fcc.gov/x.pdf",
      year: 2026,
    });
    expect(row.platform).toBe("tv");
    expect(row.platformAdId).toBe("fm-uuid-1");
    expect(row.pageOrCommittee).toBe("Barnes/D/Governor");
    expect(row.spendLower).toBe(24550);
    expect(row.spendUpper).toBe(24550);
    expect(row.spendLower).toBe(row.spendUpper);
    expect(row.station).toBe("WISN-TV");
    expect(row.spotCount).toBe(18);
    expect(row.fccDocUrl).toBe("https://publicfiles.fcc.gov/x.pdf");
    expect(row.orderRef).toBe("4443972");
  });

  test("leaves spend unset when gross is unknown", () => {
    const row = toAdWrite(
      { ...extraction, grossSpend: undefined },
      { fileManagerId: "fm-2", fccDocUrl: "https://x", year: 2026 },
    );
    expect(row.spendLower).toBeUndefined();
    expect(row.spendUpper).toBeUndefined();
  });
});
