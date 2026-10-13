import { describe, expect, test } from "vitest";
import { matchRace, parseCandidateList, personOnBallot, raceJobs, surname } from "./wisconsin-watch.mjs";

const page = (id) => `https://voterguide26.wisconsinwatch.org/candidate/${id}/`;
const block = (head, id, answerLine) =>
  [`### ${head}`, `- Source: ${page(id)}?utm_source=voterguidecommons&utm_medium=ai`, `- candidate_id: \`${id}\``, `- ${answerLine}`].join("\n");
const ANSWERED = `answered 4 of Wisconsin Watch's questions — call get_candidate_answers("x") for the full text.`;
const DID_NOT = "Did not answer Wisconsin Watch's questionnaire.";

const LIST = [
  "# Wisconsin State Assembly, District 19 — Wisconsin Watch (Wisconsin)",
  "",
  "## Wisconsin State Assembly, District 19",
  "Wisconsin Watch on this race:",
  "> A newsroom summary that must never be read.",
  "",
  block("Pat Example (Republican, Milwaukee)", "p-example1", DID_NOT),
  "",
  block("Sam Sample (Democrat, Milwaukee) — incumbent", "s-sample1", ANSWERED),
  "",
  block("Lee Loser (Democrat, Milwaukee) — no longer running: lost the primary", "l-loser1", ANSWERED),
  "",
  "## Wisconsin State Assembly, District 19 (Democratic primary)",
  block("Sam Sample (Democrat, Milwaukee) — incumbent", "s-sample1", ANSWERED),
].join("\n");

describe("raceJobs", () => {
  test("covers the 129 races in their guide, by our race ids", () => {
    const jobs = raceJobs();
    expect(jobs).toHaveLength(129);
    expect(jobs[0]).toEqual({ raceId: "WI-GOV-2026", office: "Governor" });
    expect(jobs).toContainEqual({ raceId: "WI-US-HOUSE-D4-2026", office: "U.S. House of Representatives", district: "4" });
    expect(jobs).toContainEqual({ raceId: "WI-STATE-SENATE-D7-2026", office: "Wisconsin State Senate", district: "7" });
    expect(jobs.some((j) => j.raceId === "WI-STATE-SENATE-D8-2026")).toBe(false);
    expect(jobs.filter((j) => j.office === "Wisconsin State Assembly")).toHaveLength(99);
  });
});

describe("parseCandidateList", () => {
  test("keeps the candidates still running, once each, with their page and answer count", () => {
    expect(parseCandidateList(LIST)).toEqual([
      { candidateId: "p-example1", name: "Pat Example", party: "Republican", running: true, url: page("p-example1"), answered: 0 },
      { candidateId: "s-sample1", name: "Sam Sample", party: "Democrat", running: true, url: page("s-sample1"), answered: 4 },
    ]);
  });

  test("stops rather than guess when the guide does not say whether someone answered", () => {
    const silent = [`### Pat Example (Republican, Milwaukee)`, `- Source: ${page("p-example1")}`, "- candidate_id: `p-example1`"].join("\n");
    expect(() => parseCandidateList(`# x\n\n${silent}`)).toThrow(/p-example1: the guide does not say whether they answered/);
  });

  test("reads nothing from text with no candidates", () => {
    expect(parseCandidateList("District 19 exists in more than one guide here. Pass `source`.")).toEqual([]);
  });
});

describe("personOnBallot and surname", () => {
  test("picks the right half of a governor ticket for each race", () => {
    expect(personOnBallot("WI-GOV-2026", "Tom Tiffany / David Varnam")).toBe("Tom Tiffany");
    expect(personOnBallot("WI-LTGOV-2026", "Tom Tiffany / David Varnam")).toBe("David Varnam");
    expect(personOnBallot("WI-AG-2026", "Josh Kaul")).toBe("Josh Kaul");
  });

  test("compares surnames without suffixes, case or punctuation", () => {
    expect(surname("Rachael Ann Cabral-Guevara")).toBe("cabralguevara");
    expect(surname("John Smith Jr.")).toBe("smith");
    expect(surname("Joshua Kaul")).toBe(surname("Josh Kaul"));
  });
});

describe("matchRace", () => {
  const theirs = parseCandidateList(LIST);
  const ours = [
    { slug: "pat-example", ballotName: "Pat Example", party: "Republican" },
    { slug: "sam-sample", ballotName: "Samuel Sample", party: "Democratic" },
  ];

  test("links each certified candidate to the one person with their surname", () => {
    const result = matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours, theirs });
    expect(result.links).toEqual([
      { raceId: "WI-STATE-ASSEMBLY-D19-2026", slug: "pat-example", candidateId: "p-example1", url: page("p-example1"), answered: 0 },
      { raceId: "WI-STATE-ASSEMBLY-D19-2026", slug: "sam-sample", candidateId: "s-sample1", url: page("s-sample1"), answered: 4 },
    ]);
    expect(result.notInGuide).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  test("notes a name their guide spells differently from the ballot, and treats Democrat and Democratic as one", () => {
    const { notes } = matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours, theirs });
    expect(notes).toEqual(['WI-STATE-ASSEMBLY-D19-2026: the ballot prints "Samuel Sample"; their guide prints "Sam Sample".']);
  });

  test("notes a party their guide labels differently from the ballot", () => {
    const { notes, links } = matchRace({
      raceId: "WI-STATE-ASSEMBLY-D19-2026",
      ours: [{ slug: "pat-example", ballotName: "Pat Example", party: "Independent" }],
      theirs: theirs.slice(0, 1),
    });
    expect(links).toHaveLength(1);
    expect(notes).toEqual(['WI-STATE-ASSEMBLY-D19-2026: Pat Example is "Independent" on the ballot and "Republican" in their guide.']);
  });

  test("lists a certified candidate their guide has no page for, and never guesses", () => {
    const result = matchRace({
      raceId: "WI-STATE-ASSEMBLY-D19-2026",
      ours: [...ours, { slug: "new-person", ballotName: "New Person", party: "Democratic" }],
      theirs,
    });
    expect(result.notInGuide).toEqual([{ raceId: "WI-STATE-ASSEMBLY-D19-2026", slug: "new-person", ballotName: "New Person" }]);
    expect(result.links).toHaveLength(2);
  });

  test("reports someone in their guide who is not on our ballot, and does not link them", () => {
    const result = matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours: ours.slice(0, 1), theirs });
    expect(result.links.map((l) => l.slug)).toEqual(["pat-example"]);
    expect(result.extra).toEqual([{ raceId: "WI-STATE-ASSEMBLY-D19-2026", name: "Sam Sample", party: "Democrat", candidateId: "s-sample1" }]);
  });

  test("leaves a candidate unlinked when two people in their guide share the surname", () => {
    const twins = [...theirs, { candidateId: "q-example1", name: "Quinn Example", party: "Independent", running: true, url: page("q-example1"), answered: 4 }];
    const result = matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours: ours.slice(0, 1), theirs: twins });
    expect(result.links).toEqual([]);
    expect(result.notInGuide).toHaveLength(1);
    expect(result.notes[0]).toMatch(/2 people in their guide share the surname of Pat Example; left unlinked/);
  });

  test("matches a lieutenant governor by the second name on the ticket", () => {
    const result = matchRace({
      raceId: "WI-LTGOV-2026",
      ours: [{ slug: "sam-sample", ballotName: "Pat Example / Sam Sample", party: "Democratic" }],
      theirs,
    });
    expect(result.links.map((l) => l.candidateId)).toEqual(["s-sample1"]);
  });
});
