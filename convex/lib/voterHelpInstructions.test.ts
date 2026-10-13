import { describe, expect, test } from "vitest";
import { GENERAL_ELECTION_DATE } from "./ballot";
import { OUT_OF_COVERAGE_NOTE, VOTER_HELP_INSTRUCTIONS } from "./voterHelpInstructions";

describe("the chat's standing instructions", () => {
  test("are about the general election, and say the primary is over", () => {
    expect(VOTER_HELP_INSTRUCTIONS).toContain(`the Tuesday, ${GENERAL_ELECTION_DATE} general election`);
    expect(VOTER_HELP_INSTRUCTIONS).toContain("The August 11 primary is over");
    expect(VOTER_HELP_INSTRUCTIONS).not.toMatch(/ahead of the Tuesday, August 11|partisan primary \(general/);
  });

  test("carry the ballot rule and no debate rule", () => {
    expect(VOTER_HELP_INSTRUCTIONS).toMatch(/10\. THE NOVEMBER BALLOT\./);
    expect(VOTER_HELP_INSTRUCTIONS).toMatch(/never say (a candidate|anyone) lost, won/i);
    expect(VOTER_HELP_INSTRUCTIONS).toMatch(/write-in/i);
    expect(VOTER_HELP_INSTRUCTIONS).not.toMatch(/getDebate|DEBATE\./);
  });

  test("keep the same number of rules: 0 through 12, each once", () => {
    // docs/eval-gate.md: every added rule costs accuracy. The ballot rule replaces the debate rule.
    const numbers = [...VOTER_HELP_INSTRUCTIONS.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test("the out-of-coverage note names the general election", () => {
    expect(OUT_OF_COVERAGE_NOTE).toContain("general election");
    expect(OUT_OF_COVERAGE_NOTE).not.toMatch(/legislative primary/);
  });
});
