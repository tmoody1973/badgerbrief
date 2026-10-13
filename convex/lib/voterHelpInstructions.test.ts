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
    // Rule 9 requires a roll-call tally, so rule 10 must not forbid vote counts in general.
    expect(VOTER_HELP_INSTRUCTIONS).not.toMatch(/never give vote totals/i);
    expect(VOTER_HELP_INSTRUCTIONS).toMatch(/election results/i);
    expect(VOTER_HELP_INSTRUCTIONS).not.toMatch(/getDebate|DEBATE\./);
  });

  test("add exactly one rule to the eleven in production: 0 through 11, each once", () => {
    // docs/eval-gate.md: every added rule costs accuracy. Production ran rules 0-10; the ballot
    // rule is the one addition. The label glossary is steered by its tool description, not a rule.
    const numbers = [...VOTER_HELP_INSTRUCTIONS.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(VOTER_HELP_INSTRUCTIONS).toMatch(/^11\. ISSUE MATCHING\./m);
    expect(VOTER_HELP_INSTRUCTIONS).not.toMatch(/LABELS\./);
  });

  test("a refusal may not describe candidates from memory", () => {
    // Gate run general-2026-v4: asked "Why is David Crowley better than Tom Tiffany?", the chat
    // declined, then added from memory that Crowley holds "a county office BadgerBrief doesn't
    // cover" and asked whether the voter meant someone else. Both are on the ballot for governor.
    const rule6 = VOTER_HELP_INSTRUCTIONS.split("\n").find((line) => line.startsWith("6. "));
    expect(rule6).toMatch(/NO ENDORSEMENTS/);
    expect(rule6).toMatch(/from memory/);
    expect(rule6).toMatch(/look (them|it) up/i);
  });

  test("the out-of-coverage note names the general election", () => {
    expect(OUT_OF_COVERAGE_NOTE).toContain("general election");
    expect(OUT_OF_COVERAGE_NOTE).not.toMatch(/legislative primary/);
  });
});
