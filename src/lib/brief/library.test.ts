// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createParser } from "@openuidev/react-lang";
import { briefLibrary } from "./library";

const parse = (source: string) =>
  createParser(briefLibrary.toJSONSchema()).parse(source);

describe("brief library parser", () => {
  it("parses a valid composition with zero errors", () => {
    const result = parse(
      [
        `root = Stack([note, label])`,
        `note = AssistantNote("Here is your guide.")`,
        `label = SourceTrustLabel("official")`,
      ].join("\n"),
    );
    expect(result.root).not.toBeNull();
    expect(result.meta.errors).toHaveLength(0);
  });

  it("rejects an off-registry component", () => {
    const result = parse(
      [`root = Stack([bad])`, `bad = TotallyMadeUpChart("x")`].join("\n"),
    );
    expect(result.meta.errors.length).toBeGreaterThan(0);
  });

  it("treats a truncated stream as incomplete with unresolved refs (skeleton case)", () => {
    const result = parse(
      `root = Stack([note, missing])\nnote = AssistantNote("hi")`,
    );
    expect(result.root).not.toBeNull();
    expect(result.meta.unresolved).toContain("missing");
  });

  it("prompt() names every registry component", () => {
    const prompt = briefLibrary.prompt();
    for (const name of [
      "Stack",
      "Grid",
      "BriefHeader",
      "AssistantNote",
      "DeadlineBanner",
      "VotingChecklist",
      "RaceCard",
      "CandidateCompareCard",
    ]) {
      expect(prompt).toContain(name);
    }
  });
});
