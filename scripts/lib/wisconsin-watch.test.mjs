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

  test("stops on an entry it cannot read, rather than skipping a candidate", () => {
    const noParty = ["### Pat Example", `- Source: ${page("p-example1")}`, "- candidate_id: `p-example1`", `- ${DID_NOT}`].join("\n");
    const noId = ["### Pat Example (Republican, Milwaukee)", `- Source: ${page("p-example1")}`, `- ${DID_NOT}`].join("\n");
    expect(() => parseCandidateList(`# x\n\n${noParty}`)).toThrow(/could not read the entry "Pat Example"/);
    expect(() => parseCandidateList(`# x\n\n${noId}`)).toThrow(/could not read the entry "Pat Example \(Republican, Milwaukee\)"/);
  });

  test("reads only an entry's own labelled lines, never the newsroom text that follows it", () => {
    const silent = ["### Pat Example (Republican, Milwaukee)", `- Source: ${page("p-example1")}`, "- candidate_id: `p-example1`"].join("\n");
    const summary = "## Wisconsin State Assembly, District 19 (Republican primary)\nWisconsin Watch on this race:\n> Pat Example answered 3 of our reporter's calls. Did not answer others.";
    expect(() => parseCandidateList(`# x\n\n${silent}\n\n${summary}`)).toThrow(/p-example1: the guide does not say whether they answered/);
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

  const person = (candidateId, name, party = "Independent") => ({ candidateId, name, party, running: true, url: page(candidateId), answered: 4 });

  test("tells two people with one surname apart by first name", () => {
    const result = matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours: ours.slice(0, 1), theirs: [...theirs, person("q-example1", "Quinn Example")] });
    expect(result.links.map((l) => l.candidateId)).toEqual(["p-example1"]);
  });

  test("leaves a candidate unlinked when two people in their guide could both be them", () => {
    const result = matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours: ours.slice(0, 1), theirs: [...theirs, person("p-example2", "Patricia Example")] });
    expect(result.links).toEqual([]);
    expect(result.notInGuide).toHaveLength(1);
    expect(result.notes[0]).toMatch(/2 people in their guide could be Pat Example; left unlinked/);
  });

  // Found by review: a certified candidate with no page, and a different
  // person with the same surname in their list, used to be linked together.
  test("does not link a candidate to a different person who shares their surname", () => {
    const result = matchRace({
      raceId: "WI-STATE-ASSEMBLY-D3-2026",
      ours: [{ slug: "michael-j-goodwin", ballotName: "Michael J. Goodwin", party: "Democratic" }],
      theirs: [person("m-goodwin1", "Mary Goodwin", "Republican")],
    });
    expect(result.links).toEqual([]);
    expect(result.notInGuide).toEqual([{ raceId: "WI-STATE-ASSEMBLY-D3-2026", slug: "michael-j-goodwin", ballotName: "Michael J. Goodwin" }]);
    expect(result.notes).toEqual(['WI-STATE-ASSEMBLY-D3-2026: their guide lists "Mary Goodwin", who shares a surname with Michael J. Goodwin but not a first name; left unlinked. Check by hand.']);
    expect(result.extra.map((e) => e.candidateId)).toEqual(["m-goodwin1"]);
  });

  test("never links two certified candidates to one page", () => {
    const result = matchRace({
      raceId: "WI-STATE-ASSEMBLY-D19-2026",
      ours: [
        { slug: "sam-sample", ballotName: "Sam Sample", party: "Democratic" },
        { slug: "sara-sample", ballotName: "Sara Sample", party: "Republican" },
      ],
      theirs: [person("s-sample1", "Sam Sample", "Democrat")],
    });
    expect(result.links.map((l) => [l.slug, l.candidateId])).toEqual([["sam-sample", "s-sample1"]]);
    expect(result.notInGuide.map((c) => c.slug)).toEqual(["sara-sample"]);
  });

  test("still links a candidate whose first name their guide prints in a longer or shorter form", () => {
    const result = matchRace({
      raceId: "WI-AG-2026",
      ours: [{ slug: "josh-kaul", ballotName: "Josh Kaul", party: "Democratic" }, { slug: "shirley-hinze", ballotName: "Shirley Hinze", party: "Democratic" }],
      theirs: [person("j-kaul1", "Joshua Kaul", "Democrat"), person("s-hinze1", "Shirley M. Hinze", "Democrat")],
    });
    expect(result.links.map((l) => l.candidateId)).toEqual(["j-kaul1", "s-hinze1"]);
  });

  // A rate-limit notice or a "pass source" message is text with no entries.
  // Marking the whole race "not in the guide" from that would be a false statement.
  test("refuses a race their guide returned no candidates for", () => {
    expect(() => matchRace({ raceId: "WI-STATE-ASSEMBLY-D19-2026", ours, theirs: [] })).toThrow(/WI-STATE-ASSEMBLY-D19-2026: their guide returned no candidates/);
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
