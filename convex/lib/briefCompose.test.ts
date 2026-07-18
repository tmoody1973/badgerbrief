import { describe, expect, test } from "vitest";
import { buildBriefUserMessage, buildCorrectiveMessage, type BriefContext } from "./briefContext";
import { validateBriefSource } from "./briefValidate";
import contract from "./briefContract.json";

const context: BriefContext = {
  electionSlug: "wi-2026",
  districts: { congressional: 4, senate: 3, assembly: 8 },
  votingInfo: { primaryDate: "2026-08-11", available: true },
  races: [
    {
      raceId: "WI-GOV-2026",
      office: "Governor",
      level: "State Executive",
      candidates: [
        { slug: "kelda-roys", name: "Kelda Roys", party: "Democratic", publishedIssueSlugs: ["immigration"], quoteCount: 1, hasFinance: true },
        { slug: "joel-brennan", name: "Joel Brennan", party: "Democratic", publishedIssueSlugs: [], quoteCount: 0, hasFinance: false },
      ],
    },
  ],
  preferences: { savedRaceIds: ["WI-GOV-2026"], savedIssues: ["immigration"], detailLevel: "deep" },
};

describe("buildBriefUserMessage", () => {
  test("carries entity IDs, preferences, and data-availability guardrails", () => {
    const msg = buildBriefUserMessage(context);
    expect(msg).toContain("WI-GOV-2026");
    expect(msg).toContain("kelda-roys");
    expect(msg).toContain("deep");
    // sparse-data guardrail: components only for candidates that list the data
    // ponytail: no `s` flag — root tsconfig targets ES2017 (no dotAll support); the
    // matched phrase never spans a newline in the actual message, so `i` alone suffices.
    expect(msg).toMatch(/only.*IssueStanceCard.*publishedIssueSlugs/i);
    expect(msg).toMatch(/never invent/i);
  });
  test("detailLevel maps to composition-only directives", () => {
    const short = buildBriefUserMessage({ ...context, preferences: { ...context.preferences, detailLevel: "short" } });
    expect(short).toMatch(/skip QuoteCard/i);
    expect(short).not.toMatch(/density/i);
  });
});

describe("validateBriefSource", () => {
  test("valid source over the real schema passes", () => {
    const src = ['root = Stack([h, c])', 'h = BriefHeader()', 'c = VotingChecklist()'].join("\n");
    expect(validateBriefSource(src, contract.schema)).toEqual({ ok: true });
  });
  test("off-registry component fails with a summary naming it", () => {
    const res = validateBriefSource('root = Stack([x])\nx = MadeUpWidget()', contract.schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.summary).toMatch(/MadeUpWidget/);
  });
  test("unresolved reference fails", () => {
    const res = validateBriefSource("root = Stack([missing])", contract.schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.summary).toMatch(/missing/);
  });
});

describe("buildCorrectiveMessage", () => {
  test("embeds the failure summary and re-states the contract", () => {
    const msg = buildCorrectiveMessage('component "MadeUpWidget" not in registry');
    expect(msg).toContain("MadeUpWidget");
    expect(msg).toMatch(/only.*registry/i);
  });
});
