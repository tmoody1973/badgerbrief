import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { StatewideQuestions } from "../../../convex/lib/ballotExtras";
import { BallotQuestions } from "./questions";

const SOURCE = { name: "Wisconsin Elections Commission, Type C Notice of Referendum, November 3, 2026", url: "https://elections.wi.gov/memo/x", documentUrl: "https://elections.wi.gov/doc.pdf", documentDate: "2026-09-01", retrievedAt: "2026-10-13T00:00:00Z" };
const question = (number: number, note?: string) => ({
  number,
  ballotPosition: 910000 + number,
  title: `Title ${number}`,
  resolution: `2025 Joint Resolution ${number}`,
  ballotText: `Shall the constitution be amended, number ${number}?`,
  explanation: [`First paragraph of explanation ${number}.`, `Second paragraph of explanation ${number}.`],
  yesVote: `A "yes" vote on Question ${number} would amend it.`,
  noVote: `A "no" vote on Question ${number} would not.`,
  ...(note ? { note } : {}),
});
const OK: StatewideQuestions = { status: "ok", questions: [question(1), question(2), question(3, "The notice says section 18 where the question says section 27.")], source: SOURCE, certifiedAt: "2026-10-13" };

describe("BallotQuestions", () => {
  test("shows the three questions in order, each with the ballot's own text and the state's yes and no sentences", () => {
    const html = renderToStaticMarkup(<BallotQuestions questions={OK} />);
    expect(html.indexOf("Question 1")).toBeLessThan(html.indexOf("Question 2"));
    expect(html.indexOf("Question 2")).toBeLessThan(html.indexOf("Question 3"));
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`Shall the constitution be amended, number ${n}?`);
      expect(html).toContain(`A &quot;yes&quot; vote on Question ${n} would amend it.`);
      expect(html).toContain(`A &quot;no&quot; vote on Question ${n} would not.`);
      expect(html).toContain(`First paragraph of explanation ${n}.`);
    }
  });

  test("says whose words these are, and links the state's notice", () => {
    const html = renderToStaticMarkup(<BallotQuestions questions={OK} />);
    expect(html).toContain("Wisconsin Elections Commission");
    expect(html).toContain('href="https://elections.wi.gov/doc.pdf"');
    expect(html).toMatch(/state(’|')s (own )?words/i);
  });

  test("the guide's own note appears only where there is one, labelled as the guide's", () => {
    const html = renderToStaticMarkup(<BallotQuestions questions={OK} />);
    expect(html.match(/BadgerBrief(’|')s note/g)).toHaveLength(1);
    expect(html).toContain("The notice says section 18 where the question says section 27.");
    expect(html.indexOf("BadgerBrief")).toBeGreaterThan(html.indexOf("Question 3"));
  });

  test("an uncertified file shows no question text, and says the questions are not loaded", () => {
    const html = renderToStaticMarkup(<BallotQuestions questions={{ status: "not-certified" }} />);
    expect(html).toContain("The statewide questions aren’t loaded yet.");
    expect(html).not.toContain("Shall");
    expect(html).toContain("myvote.wi.gov");
  });
});
