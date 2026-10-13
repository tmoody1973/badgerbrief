// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { citesAnotherSection, listingText, normalizeNotice, notVerbatim } from "./ballot-questions.mjs";
import { decode, readWecWorkbook } from "./wec-legislative.mjs";

const EVIDENCE = "docs/evidence/2026-10-13-wec-referenda";
const QUESTIONS_FILE = "convex/lib/data/ballot-questions-2026.json";

const question = (over) => ({
  number: 1,
  ballotPosition: 910001,
  title: "Partial veto",
  resolution: "2025 Senate Joint Resolution 116",
  ballotText: "Shall section 10 of article V be amended?",
  explanation: ["Under current law, the Governor may veto."],
  yesVote: "A “yes” vote on Question 1 would amend art. V, § 10.",
  noVote: "A “no” vote on Question 1 would not amend art. V § 10.",
  ...over,
});

const NOTICE = [
  "2025 Senate Joint Resolution 116",
  "QUESTION 1: “Partial veto. Shall section 10 of article V",
  "be amended?”",
  "Explanatory Statements as to the Questions",
  "Explanatory statement regarding Question 1:",
  "Under current law, the Governor",
  "3",
  "\fNotice of Referendum Election",
  "November 3, 2026",
  "",
  "may veto.",
  "A “yes” vote on Question 1 would amend art. V, § 10.",
  "A “no” vote on Question 1 would not amend art. V § 10.",
  "Explanatory statement regarding Question 2:",
  "Under current law, Article I protects religious rights.",
  "A “yes” vote on Question 2 would amend art. I, § 18.",
  "A “no” vote on Question 2 would not amend art. I, § 18.",
  "Done in the ______ of ______,",
].join("\n");

describe("normalizeNotice", () => {
  test("joins a sentence broken across lines and across a page", () => {
    expect(normalizeNotice(NOTICE)).toContain("Under current law, the Governor may veto.");
  });
});

describe("notVerbatim", () => {
  test("is empty when every field is in the notice word for word", () => {
    expect(notVerbatim(question(), NOTICE)).toEqual([]);
  });

  test("names the field that was reworded, however slightly", () => {
    expect(notVerbatim(question({ yesVote: "A “yes” vote on Question 1 would amend art. V, § 27." }), NOTICE)).toEqual(["yesVote", "statement"]);
    expect(notVerbatim(question({ explanation: ["Under current law, the governor may veto."] }), NOTICE)).toEqual(["explanation[0]", "statement"]);
  });

  // Every case below is made only of sentences that DO appear in the notice.
  // "Appears somewhere" is not the same as "is this question's statement".
  test("catches a dropped paragraph", () => {
    expect(notVerbatim(question({ explanation: [] }), NOTICE)).toEqual(["statement"]);
  });

  test("catches a sentence cut short", () => {
    expect(notVerbatim(question({ explanation: ["Under current law, the Governor"] }), NOTICE)).toEqual(["statement"]);
  });

  test("catches the yes and no sentences swapped", () => {
    const q = question();
    expect(notVerbatim(question({ yesVote: q.noVote, noVote: q.yesVote }), NOTICE)).toEqual(["statement", "yesNo"]);
  });

  test("catches another question's statement filed under this one", () => {
    const fromQuestion2 = question({
      explanation: ["Under current law, Article I protects religious rights."],
      yesVote: "A “yes” vote on Question 2 would amend art. I, § 18.",
      noVote: "A “no” vote on Question 2 would not amend art. I, § 18.",
    });
    expect(notVerbatim(fromQuestion2, NOTICE)).toEqual(["statement", "yesNo"]);
  });

  test("checks the last question up to the signature block", () => {
    const question2 = question({
      number: 2,
      title: "Partial veto",
      explanation: ["Under current law, Article I protects religious rights."],
      yesVote: "A “yes” vote on Question 2 would amend art. I, § 18.",
      noVote: "A “no” vote on Question 2 would not amend art. I, § 18.",
    });
    expect(notVerbatim(question2, NOTICE)).toEqual([]);
  });
});

describe("citesAnotherSection", () => {
  test("is false when the yes and no sentences cite the section the question names", () => {
    expect(citesAnotherSection(question())).toBe(false);
  });

  test("is true when they cite a different section", () => {
    expect(citesAnotherSection(question({ noVote: "A “no” vote on Question 1 would not add art. I § 18." }))).toBe(true);
  });
});

describe("the three statewide questions for November 3, 2026", () => {
  const file = JSON.parse(readFileSync(QUESTIONS_FILE, "utf8"));
  const notice = readFileSync(`${EVIDENCE}/Type-C-Notice-of-Referendum-2026-11-03.txt`, "utf8");

  test("are questions 1, 2 and 3 at the state's ballot positions", () => {
    expect(file.questions.map((q) => [q.number, q.ballotPosition])).toEqual([
      [1, 910001],
      [2, 910002],
      [3, 910003],
    ]);
  });

  test("every quoted field appears word for word in the state's notice", () => {
    expect(file.questions.map((q) => notVerbatim(q, notice))).toEqual([[], [], []]);
  });

  test("the ballot text matches the state's separate referendum listing", () => {
    const listing = readWecWorkbook(`${EVIDENCE}/Referendum-Listing-10.6.26.xlsx`);
    for (const q of file.questions) {
      const rows = listing.filter((r) => r["Ballot Position"] === String(q.ballotPosition));
      expect(rows).toHaveLength(1);
      expect(decode(rows[0].Question).replace(/[“”]/g, '"').replace(/\s+/g, " ").trim()).toBe(listingText(q));
    }
  });

  test("question 3's yes and no sentences cite a different section than the question, and no other question's do", () => {
    expect(file.questions.filter(citesAnotherSection).map((q) => q.number)).toEqual([3]);
  });

  test("a question whose yes and no sentences cite another section carries a decision about a note", () => {
    for (const q of file.questions.filter(citesAnotherSection)) {
      expect(typeof q.note, `Question ${q.number} needs a "note" field ("" means show the state's words with no comment)`).toBe("string");
    }
  });

  test("no other question carries a note", () => {
    expect(file.questions.filter((q) => !citesAnotherSection(q) && "note" in q)).toEqual([]);
  });
});
