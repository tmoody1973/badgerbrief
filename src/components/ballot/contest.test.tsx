import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { BallotContest } from "@/lib/my-ballot";
import { ContestCard, OneNameStrip } from "./contest";

const governor: BallotContest = {
  key: "WI-GOV-2026",
  position: 250,
  office: "Governor",
  href: "/races/wi-gov-2026",
  compareHref: "/compare/wi-gov-2026",
  candidates: [
    { name: "David Crowley / Sarah Godlewski", party: "Democratic", href: "/candidates/david-crowley" },
    { name: "Tom Tiffany / David Varnam", party: "Republican", href: "/candidates/tom-tiffany" },
  ],
  stamps: [
    { label: "positions", href: "/compare/wi-gov-2026" },
    { label: "money", href: "/races/wi-gov-2026#money" },
  ],
};
const sheriff: BallotContest = {
  key: "county:milwaukee:24004",
  position: 24004,
  office: "Milwaukee County Sheriff",
  candidates: [{ name: "Sheriff One", party: "Democratic" }, { name: "Sheriff Two", party: "Independent" }],
  stamps: [],
};
const clerk: BallotContest = { key: "county:milwaukee:24005", position: 24005, office: "Milwaukee County Clerk of Circuit Court", candidates: [{ name: "Clerk Only", party: "Democratic" }], stamps: [] };
const assembly: BallotContest = {
  key: "WI-STATE-ASSEMBLY-D19-2026",
  position: 1419,
  office: "State Assembly District 19",
  href: "/races/wi-state-assembly-d19-2026",
  candidates: [{ name: "Only Assembly", party: "Democratic", href: "/candidates/only-assembly" }],
  stamps: [{ label: "questionnaire", href: "/races/wi-state-assembly-d19-2026#questionnaire" }],
};

describe("ContestCard", () => {
  test("shows its place in the state's order, the office, and each name as printed with the party in full", () => {
    const html = renderToStaticMarkup(<ContestCard contest={governor} number={{ n: 1, of: 9 }} />);
    expect(html).toContain("Governor");
    expect(html).toMatch(/Contest 1 of 9/);
    expect(html).toContain("David Crowley / Sarah Godlewski");
    expect(html).toContain("Tom Tiffany / David Varnam");
    expect(html).toContain("Democratic");
    expect(html).toContain("Republican");
  });

  test("links each name to that candidate, and the contest to its race and compare pages", () => {
    const html = renderToStaticMarkup(<ContestCard contest={governor} number={{ n: 1, of: 9 }} />);
    expect(html).toContain('href="/candidates/david-crowley"');
    expect(html).toContain('href="/candidates/tom-tiffany"');
    expect(html).toContain('href="/races/wi-gov-2026"');
    expect(html).toContain('href="/compare/wi-gov-2026"');
  });

  test("says what the guide holds, each a link to where it is", () => {
    const html = renderToStaticMarkup(<ContestCard contest={governor} number={{ n: 1, of: 9 }} />);
    expect(html).toContain('href="/races/wi-gov-2026#money"');
    expect(html).toMatch(/positions/i);
    expect(html).toMatch(/money/i);
    expect(html).not.toContain("no further information");
  });

  test("a contest the guide knows only by its names says so, and offers no page it does not have", () => {
    const html = renderToStaticMarkup(<ContestCard contest={sheriff} number={{ n: 6, of: 9 }} />);
    expect(html).toContain("BadgerBrief has no further information on this office.");
    expect(html).toContain("Sheriff One");
    expect(html).not.toContain("href=");
  });

  test("states no place on the ballot when the voter's own ballot is not known yet", () => {
    const html = renderToStaticMarkup(<ContestCard contest={governor} />);
    expect(html).toContain("Governor");
    expect(html).not.toMatch(/Contest \d/);
    expect(html).not.toMatch(/>of \d/);
  });

  test("gives every party the same treatment", () => {
    const html = renderToStaticMarkup(<ContestCard contest={governor} number={{ n: 1, of: 9 }} />);
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:red|blue|rose|sky|indigo)-/);
    const badges = [...html.matchAll(/<span class="([^"]*)">(?:Democratic|Republican)<\/span>/g)].map((m) => m[1]);
    expect(badges).toHaveLength(2);
    expect(badges[0]).toBe(badges[1]);
  });

  test("gives every candidate the same markup, in the order given", () => {
    const html = renderToStaticMarkup(<ContestCard contest={governor} number={{ n: 1, of: 9 }} />);
    expect(html.indexOf("David Crowley")).toBeLessThan(html.indexOf("Tom Tiffany"));
    const items = [...html.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(items).size).toBe(1);
  });
});

describe("OneNameStrip", () => {
  const numbers = new Map([
    [assembly.key, { n: 5, of: 9 }],
    [clerk.key, { n: 7, of: 9 }],
  ]);

  test("names every office with one candidate: its number, the office, the name and the party", () => {
    const html = renderToStaticMarkup(<OneNameStrip contests={[assembly, clerk]} numbers={numbers} />);
    expect(html).toContain("State Assembly District 19");
    expect(html).toContain("Only Assembly");
    expect(html).toContain("Milwaukee County Clerk of Circuit Court");
    expect(html).toContain("Clerk Only");
    expect(html).toMatch(/5 of 9/);
    expect(html).toMatch(/7 of 9/);
  });

  test("links an office to its race page when it has one, and not when it has none", () => {
    const html = renderToStaticMarkup(<OneNameStrip contests={[assembly, clerk]} numbers={numbers} />);
    expect(html).toContain('href="/races/wi-state-assembly-d19-2026"');
    expect(html.match(/href=/g)).toHaveLength(1);
  });

  test("renders nothing when every contest has a choice", () => {
    expect(renderToStaticMarkup(<OneNameStrip contests={[]} numbers={numbers} />)).toBe("");
  });
});
