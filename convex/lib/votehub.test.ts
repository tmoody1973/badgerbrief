import { describe, expect, test } from "vitest";
import fixture from "./fixtures/votehub-wi-2026-10-14.json";
import { raceIdFor, selectPolls, type VoteHubPoll } from "./votehub";

// Every Wisconsin poll VoteHub's API returned on 2026-10-14: 28 for governor,
// 2 each for U.S. House districts 1 and 3.
const all = fixture as VoteHubPoll[];

const candidates = {
  "WI-GOV-2026": [
    { name: "David Crowley", slug: "david-crowley" },
    { name: "Tom Tiffany", slug: "tom-tiffany" },
  ],
  "WI-US-HOUSE-D1-2026": [
    { name: "Bryan Steil", slug: "bryan-steil" },
    { name: "Mitchell Berman", slug: "mitchell-berman" },
  ],
};

const byKey = (polls: ReturnType<typeof selectPolls>, pollster: string, end: string) =>
  polls.find((p) => p.pollster === pollster && p.conductedEnd === end);

describe("raceIdFor", () => {
  test("maps VoteHub's Wisconsin subjects to our race ids, and nothing else", () => {
    expect(raceIdFor({ subject: "2026 Wisconsin", poll_type: "governor" })).toBe("WI-GOV-2026");
    expect(raceIdFor({ subject: "2026 Wisconsin", poll_type: "attorney-general" })).toBe("WI-AG-2026");
    expect(raceIdFor({ subject: "2026 WI-03", poll_type: "us-representative" })).toBe("WI-US-HOUSE-D3-2026");
    expect(raceIdFor({ subject: "2026 Arizona", poll_type: "governor" })).toBeNull();
    expect(raceIdFor({ subject: "2026 Wisconsin", poll_type: "favorability" })).toBeNull();
  });
});

describe("selectPolls", () => {
  const polls = selectPolls(all, candidates);

  test("keeps only polls taken after the August 11 primary", () => {
    expect(polls.every((p) => p.conductedEnd >= "2026-08-12")).toBe(true);
    expect(byKey(polls, "GBAO Strategies", "2026-08-03")).toBeUndefined();
  });

  test("carries each published figure as printed, linked to the candidate it names", () => {
    const marquette = byKey(polls, "Marquette University Law School", "2026-09-23");
    expect(marquette?.groups).toEqual([
      {
        label: null,
        rows: [
          { label: "David Crowley", value: "49%", candidateSlug: "david-crowley" },
          { label: "Tom Tiffany", value: "46%", candidateSlug: "tom-tiffany" },
        ],
      },
    ]);
    expect(marquette?.sampleSize).toBe("692");
    expect(marquette?.sampleType).toBe("Likely voters");
    expect(marquette?.scientific).toBe(true);
  });

  test("shows one poll's likely-voter and registered-voter results as one poll, not two that agree", () => {
    const august = polls.filter((p) => p.pollster === "Marquette University Law School" && p.conductedEnd === "2026-08-20");
    expect(august).toHaveLength(1);
    expect(august[0].groups.map((g) => g.label)).toEqual(["738 likely voters", "891 registered voters"]);
    expect(august[0].sampleType).toBeUndefined();
  });

  test("names a party-aligned sponsor, as VoteHub lists it", () => {
    expect(byKey(polls, "Z to A Research", "2026-10-01")?.notes).toBe(
      "Sponsored by Rust Belt Rising, which VoteHub lists as Democratic-aligned.",
    );
    expect(byKey(polls, "TIPP Insights", "2026-08-18")?.notes).toBe(
      "Sponsored by League of American Workers, which VoteHub lists as Republican-aligned.",
    );
  });

  test("links the pollster's own release and credits VoteHub under its license", () => {
    const z = byKey(polls, "Z to A Research", "2026-10-01");
    const raw = all.find((p) => p.pollster === "Z to A Research" && p.end_date === "2026-10-01");
    expect(z?.sources[0].url).toBe(raw?.url);
    expect(z?.sources.at(-1)).toEqual({ name: "VoteHub (CC BY 4.0)", url: "https://votehub.com/polls/" });
  });

  test("keys each poll so a daily re-run updates it rather than adding a copy", () => {
    const again = selectPolls(all, candidates);
    expect(again.map((p) => p.pollKey)).toEqual(polls.map((p) => p.pollKey));
    expect(new Set(polls.map((p) => p.pollKey)).size).toBe(polls.length);
  });

  test("leaves out a race's party-sponsored polls while it has no independent poll", () => {
    // Both District 1 polls are Democratic-sponsored (DCCC, Impact Research).
    expect(polls.filter((p) => p.raceId === "WI-US-HOUSE-D1-2026")).toEqual([]);
  });

  test("includes them once an independent poll of the race exists, matching names by surname", () => {
    const independent: VoteHubPoll = {
      ...all.find((p) => p.subject === "2026 WI-01")!,
      id: "test-independent",
      pollster: "Independent Pollster",
      partisan: null,
      internal: false,
      sponsors: [],
      end_date: "2026-10-05",
    };
    const withIndependent = selectPolls([...all, independent], candidates).filter((p) => p.raceId === "WI-US-HOUSE-D1-2026");
    expect(withIndependent.length).toBe(3);
    // One release prints "Brian Steil"; the unique surname still finds Bryan Steil.
    const dccc = withIndependent.find((p) => p.pollster.startsWith("DCCC"));
    expect(dccc?.groups[0].rows.find((r) => r.label === "Brian Steil")?.candidateSlug).toBe("bryan-steil");
  });
});

describe("the archived primary forecast", () => {
  test("never averages these November polls into odds (decisions 003 and 006)", async () => {
    const { parsePrimaryPolls } = await import("../../src/lib/forecast");
    expect(parsePrimaryPolls(selectPolls(all, candidates))).toEqual([]);
  });
});
