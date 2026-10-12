// @vitest-environment node
import { describe, expect, it, test } from "vitest";
import { hadAugustPrimary, partySectionId, primaryField, wasOnPrimaryBallot } from "./ballot-status";

describe("wasOnPrimaryBallot", () => {
  it("treats undefined and Active as on-ballot", () => {
    expect(wasOnPrimaryBallot(undefined)).toBe(true);
    expect(wasOnPrimaryBallot("Active")).toBe(true);
  });

  it("keeps Withdrawn and Suspended on-ballot (printed ballot per WEC)", () => {
    expect(wasOnPrimaryBallot("Withdrawn")).toBe(true);
    expect(wasOnPrimaryBallot("Suspended campaign")).toBe(true);
  });

  it("folds did-not-file and not-on-ballot statuses", () => {
    expect(
      wasOnPrimaryBallot("Did not file by June 1, 2026 deadline — not on primary ballot"),
    ).toBe(false);
    expect(wasOnPrimaryBallot("Not on ballot")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(wasOnPrimaryBallot("NOT ON BALLOT")).toBe(false);
    expect(wasOnPrimaryBallot("DID NOT FILE")).toBe(false);
  });
});

describe("partySectionId", () => {
  it("appends -primary for partisan primaries", () => {
    expect(partySectionId("Democratic")).toBe("democratic-primary");
    expect(partySectionId("Republican")).toBe("republican-primary");
  });

  it("Independent gets no -primary suffix (general election only)", () => {
    expect(partySectionId("Independent")).toBe("independent");
  });
});

describe("primaryField", () => {
  const SOURCE = { url: "u", documentDate: "2026-10-06", retrievedAt: "2026-10-12T00:00:00Z" };
  test("keeps everyone from the primary and drops people added only for November", () => {
    const field = primaryField([
      { slug: "ran-and-advanced", primaryParty: "Democratic", general: { onBallot: true, source: SOURCE } },
      { slug: "ran-and-left", primaryParty: "Republican", general: { onBallot: false, source: SOURCE } },
      // An independent the state lists for November whom we never stored before.
      { slug: "added-for-november", general: { onBallot: true, source: SOURCE } },
      // A nonpartisan race (the spring Supreme Court race) has no primary party.
      { slug: "nonpartisan-race", general: { onBallot: false, source: SOURCE } },
      { slug: "no-block-yet", primaryParty: "Democratic" },
    ]);
    expect(field.map((c) => c.slug)).toEqual(["ran-and-advanced", "ran-and-left", "nonpartisan-race", "no-block-yet"]);
  });
});

describe("hadAugustPrimary", () => {
  test("is true only for a race whose primary was August 11, 2026", () => {
    expect(hadAugustPrimary({ primaryDate: "August 11, 2026" })).toBe(true);
    // Wisconsin Supreme Court, decided in the spring.
    expect(hadAugustPrimary({ primaryDate: "February 17, 2026 (if needed)" })).toBe(false);
    expect(hadAugustPrimary({})).toBe(false);
  });
});
