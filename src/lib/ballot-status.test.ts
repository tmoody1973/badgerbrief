// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isOnBallot, partySectionId } from "./ballot-status";

describe("isOnBallot", () => {
  it("treats undefined and Active as on-ballot", () => {
    expect(isOnBallot(undefined)).toBe(true);
    expect(isOnBallot("Active")).toBe(true);
  });

  it("keeps Withdrawn and Suspended on-ballot (printed ballot per WEC)", () => {
    expect(isOnBallot("Withdrawn")).toBe(true);
    expect(isOnBallot("Suspended campaign")).toBe(true);
  });

  it("folds did-not-file and not-on-ballot statuses", () => {
    expect(
      isOnBallot("Did not file by June 1, 2026 deadline — not on primary ballot"),
    ).toBe(false);
    expect(isOnBallot("Not on ballot")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isOnBallot("NOT ON BALLOT")).toBe(false);
    expect(isOnBallot("DID NOT FILE")).toBe(false);
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
