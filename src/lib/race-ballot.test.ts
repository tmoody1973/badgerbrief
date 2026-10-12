import { describe, expect, test } from "vitest";
import { ballotLine, buildRaceBallot, countSentence, raceDescription, raceFaq, splitPolls } from "./race-ballot";

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const on = (ballotName: string, party: string | undefined, ballotOrder: number) => ({
  onBallot: true, ballotName, ...(party ? { party } : {}), ballotOrder, source: SOURCE,
});
const off = { onBallot: false, source: SOURCE };

const governor = { office: "Governor of Wisconsin", general: { onBallot: true, source: SOURCE } };
const field = [
  { slug: "francesca-hong", name: "Francesca Hong", party: "Democratic", primaryParty: "Democratic", general: off },
  { slug: "david-crowley", name: "David Crowley", party: "Democratic", primaryParty: "Democratic", general: on("David Crowley / Sarah Godlewski", "Democratic", 2) },
  { slug: "tom-tiffany", name: "Tom Tiffany", party: "Republican", primaryParty: "Republican", general: on("Tom Tiffany / David Varnam", "Republican", 1) },
];

describe("buildRaceBallot", () => {
  test("lists only the people on the November ballot, in the state's order", () => {
    const b = buildRaceBallot(governor, field);
    expect(b.kind).toBe("contest");
    if (b.kind !== "contest") return;
    expect(b.onBallot.map((c) => c.slug)).toEqual(["tom-tiffany", "david-crowley"]);
    expect(b.uncontested).toBe(false);
    expect(b.hadPrimary).toBe(true);
  });

  test("a race with one candidate is uncontested", () => {
    const b = buildRaceBallot(
      { office: "U.S. House — District 2", general: { onBallot: true, source: SOURCE } },
      [{ slug: "mark-pocan", name: "Mark Pocan", party: "Democratic", primaryParty: "Democratic", general: on("Mark Pocan", "Democratic", 1) }],
    );
    expect(b.kind === "contest" && b.uncontested).toBe(true);
  });

  test("a race that is not a separate November contest carries its reason and any running mates", () => {
    const b = buildRaceBallot(
      { office: "Lieutenant Governor of Wisconsin", general: { onBallot: false, note: "Runs on the governor ticket.", source: SOURCE } },
      [
        { slug: "sarah-godlewski", name: "Sarah Godlewski", party: "Democratic", primaryParty: "Democratic", general: on("David Crowley / Sarah Godlewski", "Democratic", 2) },
        { slug: "will-martin", name: "Will Martin", party: "Republican", primaryParty: "Republican", general: off },
      ],
    );
    expect(b).toMatchObject({ kind: "no-contest", note: "Runs on the governor ticket." });
    if (b.kind !== "no-contest") return;
    expect(b.runningMates.map((c) => c.slug)).toEqual(["sarah-godlewski"]);
  });

  test("a race with no general block never shows anyone as on the ballot", () => {
    // The live site showed the primary field as the ballot for two months.
    const b = buildRaceBallot({ office: "Governor of Wisconsin" }, field);
    expect(b).toEqual({ kind: "not-loaded", hadPrimary: true });
  });

  test("does not change the list it was given", () => {
    const before = field.map((c) => c.slug);
    buildRaceBallot(governor, field);
    expect(field.map((c) => c.slug)).toEqual(before);
  });
});

describe("ballotLine", () => {
  test("prints the state's name and the full party, verbatim", () => {
    expect(ballotLine(field[2])).toBe("Tom Tiffany / David Varnam (Republican)");
    expect(ballotLine({ name: "Pete Karas", general: on("Pete Karas", "Wisconsin Green", 3) })).toBe("Pete Karas (Wisconsin Green)");
  });

  test("leaves the party off when there is none, instead of printing a blank", () => {
    expect(ballotLine({ name: "Pat Example", general: on("Pat Example", undefined, 4) })).toBe("Pat Example");
  });
});

describe("countSentence", () => {
  test("agrees in number", () => {
    expect(countSentence(1)).toBe("1 candidate is on the November 3, 2026 ballot.");
    expect(countSentence(2)).toBe("2 candidates are on the November 3, 2026 ballot.");
    expect(countSentence(0)).toBe("No candidate is on the November 3, 2026 ballot.");
  });
});

describe("raceDescription and raceFaq", () => {
  test("describe the November ballot and never mention the primary", () => {
    const b = buildRaceBallot(governor, field);
    const d = raceDescription("Governor of Wisconsin", b);
    expect(d).toBe(
      "Tom Tiffany / David Varnam (Republican) and David Crowley / Sarah Godlewski (Democratic) are on the November 3, 2026 ballot for Governor of Wisconsin.",
    );
    const faq = raceFaq("Governor of Wisconsin", b, "Tony Evers");
    expect(faq[0].q).toBe("Who is on the ballot for Governor of Wisconsin on November 3, 2026?");
    expect(faq[0].a).toContain("Tom Tiffany / David Varnam (Republican)");
    expect(faq.map((f) => f.q + f.a).join(" ")).not.toMatch(/primary|August/i);
    expect(faq.at(-1)).toEqual({ q: "Who currently holds Governor of Wisconsin?", a: "Tony Evers is the incumbent." });
  });

  test("a long field is summarized, with the remainder counted", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ slug: `c${n}`, name: `Candidate ${n}`, general: on(`Candidate ${n}`, "Independent", n) }));
    const d = raceDescription("U.S. House — District 6", buildRaceBallot(governor, five));
    expect(d).toContain("Candidate 1 (Independent), Candidate 2 (Independent), Candidate 3 (Independent) and 2 more are on");
  });

  test("a race with no contest is described by its reason", () => {
    const b = buildRaceBallot({ office: "Wisconsin Supreme Court", general: { onBallot: false, note: "Decided in the April 7, 2026 spring election.", source: SOURCE } }, []);
    expect(raceDescription("Wisconsin Supreme Court", b)).toBe("Wisconsin Supreme Court: Decided in the April 7, 2026 spring election.");
    expect(raceFaq("Wisconsin Supreme Court", b)).toEqual([
      { q: "Is Wisconsin Supreme Court on the November 3, 2026 ballot?", a: "Decided in the April 7, 2026 spring election." },
    ]);
  });
});

describe("splitPolls", () => {
  const row = (label: string, candidateSlug: string | null) => ({ label, value: "45%", candidateSlug });
  const poll = (pollType: string, rows: ReturnType<typeof row>[]) => ({ pollType, groups: [{ label: null, rows }] });
  const onBallot = new Set(["tom-tiffany", "david-crowley"]);

  const real = poll("General election matchup", [row("Crowley", "david-crowley"), row("Tiffany", "tom-tiffany"), row("Other", null)]);
  // Production holds seven of these: a matchup polled in July that never happened.
  const hypothetical = poll("General election matchup", [row("Hong", "francesca-hong"), row("Tiffany", "tom-tiffany"), row("Other", null)]);
  const primary = poll("Democratic primary", [row("Crowley", "david-crowley"), row("Undecided", null)]);
  const generic = poll("General election matchup", [row("Tiffany", "tom-tiffany"), row("note", null)]);
  const unlinkedName = poll("General election matchup", [row("Tiffany", "tom-tiffany"), row("Josh Kaul (undeclared)", null)]);
  const nobodyLinked = poll("General election matchup", [row("Undecided", null)]);

  test("the November page gets only polls whose every named candidate is on the ballot", () => {
    const { november, archive } = splitPolls([real, hypothetical, primary, generic, unlinkedName, nobodyLinked], onBallot);
    expect(november).toEqual([real]);
    expect(archive).toEqual([hypothetical, primary, generic, unlinkedName, nobodyLinked]);
  });

  test("with no ballot loaded, every poll stays in the archive", () => {
    expect(splitPolls([real, primary], new Set()).november).toEqual([]);
  });

  test("undecided and other lines do not disqualify a poll", () => {
    const p = poll("General election matchup", [row("Crowley", "david-crowley"), row("Tiffany", "tom-tiffany"), row("Undecided/Other", null), row("Other candidate", null)]);
    expect(splitPolls([p], onBallot).november).toEqual([p]);
  });
});
