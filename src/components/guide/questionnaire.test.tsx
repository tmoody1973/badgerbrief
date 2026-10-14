import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CandidateQuestionnaire, RaceQuestionnaire, guideLink, questionnaireRows } from "./questionnaire";

const SOURCE = { url: "https://elections.wi.gov/x", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const candidate = (slug: string, ballotName: string, party: string, ballotOrder: number) => ({
  slug,
  name: ballotName,
  general: { onBallot: true, ballotName, party, ballotOrder, source: SOURCE },
});

// Real entries from the link list: Senate District 13 is a race where one
// candidate answered and one did not.
const SD13 = "WI-STATE-SENATE-D13-2026";
const jagler = candidate("john-jagler", "John Jagler", "Republican", 1);
const ripley = candidate("sasha-ripley", "Sasha Ripley", "Democratic", 2);

describe("guideLink", () => {
  test("tags the visit so Wisconsin Watch can count readers we send", () => {
    expect(guideLink("https://voterguide26.wisconsinwatch.org/candidate/x1/")).toBe(
      "https://voterguide26.wisconsinwatch.org/candidate/x1/?utm_source=badgerbrief&utm_medium=referral",
    );
  });
});

describe("questionnaireRows", () => {
  test("gives every candidate one row, in the order given, with the ballot's name and party", () => {
    const rows = questionnaireRows(SD13, [jagler, ripley]);
    expect(rows.map((r) => [r.slug, r.name, r.party, r.status.status])).toEqual([
      ["john-jagler", "John Jagler", "Republican", "did-not-answer"],
      ["sasha-ripley", "Sasha Ripley", "Democratic", "answered"],
    ]);
  });

  test("names the person, not the whole ticket, for governor", () => {
    // A stored record carries the person's own name; the ballot prints the ticket.
    const ticket = { ...candidate("tom-tiffany", "Tom Tiffany / David Varnam", "Republican", 1), name: "Tom Tiffany" };
    expect(questionnaireRows("WI-GOV-2026", [ticket])[0].name).toBe("Tom Tiffany");
  });

  test("is empty for a race their guide does not cover", () => {
    expect(questionnaireRows("WI-COUNTY-MILWAUKEE-SHERIFF", [jagler])).toEqual([]);
  });
});

describe("RaceQuestionnaire", () => {
  const html = renderToStaticMarkup(<RaceQuestionnaire office="State Senate District 13" raceId={SD13} candidates={[jagler, ripley]} />);

  test("links to the answers of a candidate who answered", () => {
    expect(html).toContain("Sasha Ripley");
    expect(html).toContain("Answered 4 questions.");
    expect(html).toContain('href="https://voterguide26.wisconsinwatch.org/candidate/s-ripley1/?utm_source=badgerbrief&amp;utm_medium=referral"');
  });

  test("says what the guide shows for a candidate with no answers, about the guide and not the person, and links the page", () => {
    expect(html).toContain("John Jagler");
    expect(html).toContain("Wisconsin Watch’s guide shows no response.");
    expect(html).not.toMatch(/did not answer/i);
    expect(html).toContain("See John Jagler’s page on Wisconsin Watch");
    expect(html).toContain('href="https://voterguide26.wisconsinwatch.org/candidate/j-jagler1/?utm_source=badgerbrief&amp;utm_medium=referral"');
    expect(html).not.toMatch(/declin|refus|ignor|fail/i);
  });

  test("gives every row one link of its own, whether or not the candidate answered", () => {
    const rows = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => (m[1].match(/<a /g) ?? []).length);
    expect(rows).toEqual([1, 1]);
  });

  test("does not claim, as its own fact, that every candidate was sent the questions", () => {
    expect(html).not.toMatch(/every candidate/i);
    expect(html).toContain("asked candidates for this office the same questions");
  });

  test("is titled for what it is, since in some races nobody answered", () => {
    expect(html).toContain("Wisconsin Watch’s questionnaire</h2>");
    expect(html).not.toContain("In their own words");
  });

  test("credits Wisconsin Watch and says the words are the candidates' own", () => {
    expect(html).toContain("Wisconsin Watch");
    expect(html).toContain("the candidates’ own words");
    expect(html).toMatch(/through <a [^>]*>Voter Guide Commons<\/a>/);
    expect(html).toContain("last updated August 20, 2026");
    expect(html).toMatch(/BadgerBrief checked it October \d{1,2}, 2026/);
  });

  test("gives both statuses the same text style", () => {
    const statusClasses = [...html.matchAll(/<p class="([^"]*)" data-status/g)].map((m) => m[1]);
    expect(statusClasses).toHaveLength(2);
    expect(new Set(statusClasses).size).toBe(1);
  });

  test("renders nothing for a race their guide does not cover", () => {
    expect(renderToStaticMarkup(<RaceQuestionnaire office="State Senate District 13" raceId="WI-COUNTY-MILWAUKEE-SHERIFF" candidates={[jagler]} />)).toBe("");
  });
});

describe("CandidateQuestionnaire", () => {
  test("says a certified candidate with no page is not in the guide", () => {
    const goodwin = candidate("michael-j-goodwin", "Michael J. Goodwin", "Democratic", 2);
    const html = renderToStaticMarkup(<CandidateQuestionnaire raceId="WI-STATE-ASSEMBLY-D3-2026" candidate={goodwin} />);
    expect(html).toContain("Not in Wisconsin Watch’s guide.");
  });

  test("renders nothing for someone who is not on the certified ballot", () => {
    const off = { slug: "someone-else", name: "Someone Else" };
    expect(renderToStaticMarkup(<CandidateQuestionnaire raceId={SD13} candidate={off} />)).toBe("");
  });
});

/** The question a "Ask Voter Help" link would type into the chat, or null when there is no link. */
function askedQuestion(html: string): string | null {
  const href = html.match(/href="(\/chat\?[^"]+)"/)?.[1];
  return href ? new URLSearchParams(href.split("?")[1].replace(/&amp;/g, "&")).get("q") : null;
}

describe("asking Voter Help about the answers", () => {
  test("a race page offers to ask Voter Help what this office's candidates told Wisconsin Watch", () => {
    const html = renderToStaticMarkup(
      <RaceQuestionnaire raceId={SD13} office="State Senate District 13" candidates={[jagler, ripley]} />,
    );
    expect(askedQuestion(html)).toBe("What did the candidates for State Senate District 13 tell Wisconsin Watch?");
  });

  test("no Voter Help link when nobody in the race answered: there is nothing to ask about", () => {
    const kitchens = candidate("joel-kitchens", "Joel Kitchens", "Republican", 1);
    const paplham = candidate("renee-a-paplham", "Renee A. Paplham", "Democratic", 2);
    const html = renderToStaticMarkup(
      <RaceQuestionnaire raceId="WI-STATE-ASSEMBLY-D1-2026" office="Assembly District 1" candidates={[kitchens, paplham]} />,
    );
    expect(askedQuestion(html)).toBeNull();
  });

  test("a candidate page offers it only for a candidate who answered", () => {
    const answered = renderToStaticMarkup(<CandidateQuestionnaire raceId={SD13} candidate={ripley} />);
    expect(askedQuestion(answered)).toBe("What did Sasha Ripley tell Wisconsin Watch?");
    const didNot = renderToStaticMarkup(<CandidateQuestionnaire raceId={SD13} candidate={jagler} />);
    expect(askedQuestion(didNot)).toBeNull();
  });
});

describe("credit to Voter Guide Commons", () => {
  test("the source line links back to Voter Guide Commons, which supplies the answers", () => {
    const html = renderToStaticMarkup(
      <RaceQuestionnaire raceId={SD13} office="State Senate District 13" candidates={[jagler, ripley]} />,
    );
    expect(html).toMatch(/href="https:\/\/voterguidecommons\.org\/[^"]*"[^>]*>Voter Guide Commons</);
  });
});
