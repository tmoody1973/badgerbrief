import { describe, expect, test } from "vitest";
import { countyBallotFrom, statewideQuestionsFrom, type CountyFile, type QuestionsFile } from "./ballotExtras";
import { countyKey } from "./countyKey";
import countyData from "./data/county-contests-2026.json";
import questionsData from "./data/ballot-questions-2026.json";

const SOURCE = { name: "State file", url: "https://example.test/file", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const SIGNED = { certifiedBy: "Tarik Moody", certifiedAt: "2026-10-14" };
const UNSIGNED = { certifiedBy: "", certifiedAt: "" };

const sheriff = {
  county: "st-croix",
  countyName: "St. Croix County",
  office: "Sheriff",
  contestAsPrinted: "St. Croix County Sheriff",
  ballotPosition: 25504,
  candidates: [{ ballotName: "A Sheriff", party: "Republican", ballotOrder: 1 }],
};
const clerk = { ...sheriff, office: "Clerk of Circuit Court", contestAsPrinted: "St. Croix County Clerk of Circuit Court", ballotPosition: 25506, candidates: [] };
const other = { ...sheriff, county: "door", countyName: "Door County", contestAsPrinted: "Door County Sheriff", ballotPosition: 21504 };

const countyFile = (signature: { certifiedBy: string; certifiedAt: string }): CountyFile => ({
  ...signature,
  source: SOURCE,
  contests: [other, sheriff, clerk],
});

describe("countyKey", () => {
  test("gives one key for every way a county name is written", () => {
    expect(countyKey("ST. CROIX COUNTY")).toBe("st-croix");
    expect(countyKey("St. Croix County")).toBe("st-croix");
    expect(countyKey("St. Croix")).toBe("st-croix");
    expect(countyKey("Fond du Lac")).toBe("fond-du-lac");
    expect(countyKey("  Milwaukee County ")).toBe("milwaukee");
  });

  test("the script and the app make the same key for every county in the file", () => {
    expect(countyData.contests.filter((c) => countyKey(c.countyName) !== c.county)).toEqual([]);
  });
});

describe("countyBallotFrom", () => {
  test("shows nothing from an unsigned file", () => {
    expect(countyBallotFrom(countyFile(UNSIGNED), "St. Croix")).toEqual({ status: "not-certified" });
  });

  test("treats a blank signature as unsigned", () => {
    expect(countyBallotFrom(countyFile({ certifiedBy: "  ", certifiedAt: "2026-10-14" }), "St. Croix")).toEqual({ status: "not-certified" });
  });

  test("says so when the voter's county is not known", () => {
    expect(countyBallotFrom(countyFile(SIGNED), undefined)).toEqual({ status: "no-county" });
    expect(countyBallotFrom(countyFile(SIGNED), "")).toEqual({ status: "no-county" });
  });

  test("says so when the county is not in the file, rather than returning an empty ballot", () => {
    expect(countyBallotFrom(countyFile(SIGNED), "Cook County")).toEqual({ status: "unknown-county", county: "cook" });
  });

  test("returns a county's contests in the file's order, however the county is written", () => {
    const expected = { status: "ok", countyName: "St. Croix County", contests: [sheriff, clerk], source: SOURCE, certifiedAt: "2026-10-14" };
    expect(countyBallotFrom(countyFile(SIGNED), "St. Croix")).toEqual(expected);
    expect(countyBallotFrom(countyFile(SIGNED), "st-croix")).toEqual(expected);
    expect(countyBallotFrom(countyFile(SIGNED), "ST. CROIX COUNTY")).toEqual(expected);
  });

  test("once signed, every one of the 72 counties in the real file has at least a sheriff and a clerk", () => {
    const signed = { ...countyData, ...SIGNED };
    const counties = [...new Set(countyData.contests.map((c) => c.county))];
    expect(counties).toHaveLength(72);
    for (const county of counties) {
      const ballot = countyBallotFrom(signed, county);
      expect(ballot.status).toBe("ok");
      if (ballot.status === "ok") {
        expect(ballot.contests.map((c) => c.office)).toEqual(expect.arrayContaining(["Sheriff", "Clerk of Circuit Court"]));
      }
    }
  });
});

describe("statewideQuestionsFrom", () => {
  const question = (number: number) => ({
    number,
    ballotPosition: 910000 + number,
    title: `Title ${number}`,
    resolution: "2025 Senate Joint Resolution 116",
    ballotText: "Shall it?",
    explanation: ["Under current law."],
    yesVote: "Yes does this.",
    noVote: "No does that.",
  });
  const questionsFile = (signature: { certifiedBy: string; certifiedAt: string }): QuestionsFile => ({
    ...signature,
    source: SOURCE,
    questions: [question(2), question(1)],
  });

  test("shows nothing from an unsigned file", () => {
    expect(statewideQuestionsFrom(questionsFile(UNSIGNED))).toEqual({ status: "not-certified" });
  });

  test("returns the questions in ballot order once signed", () => {
    const result = statewideQuestionsFrom(questionsFile(SIGNED));
    expect(result).toEqual({ status: "ok", questions: [question(1), question(2)], source: SOURCE, certifiedAt: "2026-10-14" });
  });

  test("reads the real file's three questions once signed", () => {
    const result = statewideQuestionsFrom({ ...questionsData, ...SIGNED });
    expect(result.status === "ok" && result.questions.map((q) => q.number)).toEqual([1, 2, 3]);
  });
});
