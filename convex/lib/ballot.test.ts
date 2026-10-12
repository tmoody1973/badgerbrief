import { describe, expect, test } from "vitest";
import { generalBallotName, generalField, generalParty, generalPersonName, isOnGeneralBallot } from "./ballot";

describe("isOnGeneralBallot", () => {
  test("true only when the state's list says so", () => {
    expect(isOnGeneralBallot({ general: { onBallot: true } })).toBe(true);
    expect(isOnGeneralBallot({ general: { onBallot: false } })).toBe(false);
  });

  test("a candidate with no general block is not on the ballot", () => {
    // Before the certified list is applied nobody has the block. Showing
    // everyone would put primary losers back on the page.
    expect(isOnGeneralBallot({})).toBe(false);
  });
});

describe("generalBallotName and generalParty", () => {
  test("prefer the state's wording, fall back to the stored value", () => {
    const c = {
      name: "Bradley Smith",
      party: "Democratic",
      general: { onBallot: true, ballotName: "Brad Smith", party: "Democratic" },
    };
    expect(generalBallotName(c)).toBe("Brad Smith");
    expect(generalBallotName({ name: "Bradley Smith" })).toBe("Bradley Smith");
    expect(generalParty({ party: "Green", general: { party: "Wisconsin Green" } })).toBe(
      "Wisconsin Green",
    );
    expect(generalParty({ party: "Green" })).toBe("Green");
    expect(generalParty({})).toBeUndefined();
  });
});

describe("generalField", () => {
  const field = [
    { name: "C", general: { onBallot: true, ballotOrder: 3 } },
    { name: "Gone", general: { onBallot: false } },
    { name: "A", general: { onBallot: true, ballotOrder: 1 } },
    { name: "NoBlock" },
    { name: "Zed", general: { onBallot: true } },
    { name: "Amy", general: { onBallot: true } },
  ];

  test("keeps only on-ballot candidates, in the state's ballot order", () => {
    expect(generalField(field).map((c) => c.name)).toEqual(["A", "C", "Amy", "Zed"]);
  });

  test("does not change the list it was given", () => {
    const before = field.map((c) => c.name);
    generalField(field);
    expect(field.map((c) => c.name)).toEqual(before);
  });
});

describe("generalPersonName", () => {
  test("uses the state's printing of the person's own name", () => {
    expect(generalPersonName({ name: "John Leiber", general: { ballotName: "John S. Leiber" } })).toBe("John S. Leiber");
  });

  test("picks the person's half of a governor ticket", () => {
    const ticket = { ballotName: "David Crowley / Sarah Godlewski" };
    expect(generalPersonName({ name: "David Crowley", general: ticket })).toBe("David Crowley");
    expect(generalPersonName({ name: "Sarah Godlewski", general: ticket })).toBe("Sarah Godlewski");
  });

  test("falls back to the stored name when there is no ballot name, or no half matches", () => {
    expect(generalPersonName({ name: "Francesca Hong" })).toBe("Francesca Hong");
    expect(generalPersonName({ name: "Someone Else", general: { ballotName: "A Person / B Person" } })).toBe("Someone Else");
  });
});
