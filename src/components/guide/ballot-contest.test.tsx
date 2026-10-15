import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { Doc } from "../../../convex/_generated/dataModel";
import { BallotContest } from "./ballot-contest";

const SOURCE = { url: "https://elections.wi.gov/x", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const candidate = (slug: string, ballotName: string, party: string, ballotOrder: number) =>
  ({ slug, name: ballotName, general: { onBallot: true, ballotName, party, ballotOrder, source: SOURCE } }) as unknown as Doc<"candidates">;

const tiffany = candidate("tom-tiffany", "Tom Tiffany / David Varnam", "Republican", 1);
const crowley = candidate("david-crowley", "David Crowley / Sarah Godlewski", "Democratic", 2);

describe("BallotContest", () => {
  const html = renderToStaticMarkup(
    <BallotContest
      candidates={[tiffany, crowley]}
      holds={{ "tom-tiffany": { questionnaire: true, money: true, ads: true }, "david-crowley": { questionnaire: true, money: false, ads: false } }}
      compare={{ href: "/compare/wi-gov-2026", label: "Compare these 2 tickets" }}
    />,
  );

  test("lists the names as printed, in the state's ballot order, numbered", () => {
    expect(html).toContain("As printed");
    expect(html.indexOf("Tom Tiffany / David Varnam")).toBeLessThan(html.indexOf("David Crowley / Sarah Godlewski"));
    expect(html).toMatch(/<ol/);
    expect(html).toMatch(/>1</);
  });

  test("says what the guide holds on each candidate, as links to those sections", () => {
    expect(html).toMatch(/href="#questionnaire"/);
    expect(html).toMatch(/href="#money"/);
  });

  test("makes Compare the contest's one red action", () => {
    const compareTag = html.match(/<a[^>]*href="\/compare\/wi-gov-2026"[^>]*>/)?.[0] ?? "";
    expect(compareTag).toContain("bg-primary");
    expect(html).toContain("Compare these 2 tickets");
  });

  test("says so plainly when the guide holds nothing beyond the name", () => {
    const thin = renderToStaticMarkup(
      <BallotContest candidates={[crowley]} holds={{ "david-crowley": { questionnaire: false, money: false, ads: false } }} />,
    );
    expect(thin).toContain("No questionnaire, money or ads on record");
    expect(thin).not.toContain("bg-primary");
  });
});
