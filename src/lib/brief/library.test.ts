// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createParser } from "@openuidev/react-lang";
import { briefLibrary } from "./library";
import { fixtureBrief } from "./fixture";
import { briefPrompt } from "./prompt";
import { mkdirSync, writeFileSync } from "node:fs";

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
      "IssueStanceCard",
      "QuoteCard",
      "FinanceSnapshot",
    ]) {
      expect(prompt).toContain(name);
    }
  });
});

describe("fixture brief", () => {
  it("parses against the registry with zero errors and no unresolved refs", () => {
    const result = parse(fixtureBrief);
    expect(result.root).not.toBeNull();
    expect(result.meta.errors).toHaveLength(0);
    expect(result.meta.unresolved).toHaveLength(0);
  });
});

describe("brief agent prompt", () => {
  it("carries the composition rules and full registry", () => {
    expect(briefPrompt).toContain("ballot order");
    expect(briefPrompt).toContain("AssistantNote");
    expect(briefPrompt).toContain("FinanceSnapshot");
  });
});

describe("brief agent prompt artifact", () => {
  it("captures the prompt artifact for MOO-311", () => {
    mkdirSync("docs", { recursive: true });
    writeFileSync("docs/brief-agent-prompt.txt", briefPrompt);
    expect(briefPrompt.length).toBeGreaterThan(500);
  });
});
