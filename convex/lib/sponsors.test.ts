import { describe, expect, test } from "vitest";
import {
  normalizeSponsorKey,
  fecCommitteeKind,
  leanFromParty,
} from "./sponsors";

describe("normalizeSponsorKey", () => {
  test("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeSponsorKey("House Majority PAC")).toBe("house majority pac");
    expect(normalizeSponsorKey("Barnes/D/Governor")).toBe("barnes d governor");
    expect(normalizeSponsorKey("  Opportunity  Wisconsin  ")).toBe(
      "opportunity wisconsin",
    );
  });
  test("same key regardless of trailing punctuation/case", () => {
    expect(normalizeSponsorKey("Restoration of America, Inc.")).toBe(
      normalizeSponsorKey("restoration of america inc"),
    );
  });
});

describe("fecCommitteeKind", () => {
  test("maps FEC committee_type codes to a human kind", () => {
    expect(fecCommitteeKind("O").kind).toBe("Super PAC");
    expect(fecCommitteeKind("W").kind).toBe("Hybrid PAC");
    expect(fecCommitteeKind("V").kind).toBe("Hybrid PAC");
    expect(fecCommitteeKind("Q").kind).toBe("PAC");
    expect(fecCommitteeKind("Y").kind).toBe("Party committee");
    expect(fecCommitteeKind("H").kind).toBe("Candidate committee");
    expect(fecCommitteeKind("?").kind).toBe("Political committee");
  });
  test("any FEC-registered committee discloses donors", () => {
    expect(fecCommitteeKind("O").disclosesDonors).toBe(true);
    expect(fecCommitteeKind("Q").disclosesDonors).toBe(true);
  });
});

describe("leanFromParty", () => {
  test("maps FEC party codes to a lean", () => {
    expect(leanFromParty("DEM")).toBe("supports_d");
    expect(leanFromParty("REP")).toBe("supports_r");
    expect(leanFromParty("IND")).toBeUndefined();
    expect(leanFromParty(undefined)).toBeUndefined();
  });
});
