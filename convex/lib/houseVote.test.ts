import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseClerkPositions,
  parseHouseVote,
  parseMemberVotes,
  parseVotedOn,
  sumPartyTotals,
  verifyAgainstClerk,
  type FederalRollCall,
} from "./houseVote";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");
const json = (name: string) => JSON.parse(fixture(name));

/** roll 100 — "Yea-and-Nay" vocabulary, a concurrent resolution. */
const d100 = () => json("congress-119-1-100-detail.json");
const m100 = () => json("congress-119-1-100-members.json");
/** roll 122 — "Recorded Vote" vocabulary (Aye/No), a bill on passage. */
const d122 = () => json("congress-119-1-122-detail.json");
const m122 = () => json("congress-119-1-122-members.json");
/** roll 259 — an amendment vote (HAMDT over an underlying HR). */
const d259 = () => json("congress-119-1-259-detail.json");
const m259 = () => json("congress-119-1-259-members.json");

const ref = (rollCallNumber: number) => ({
  congress: 119,
  session: 1,
  rollCallNumber,
});

const ok = (rc: FederalRollCall | { error: string }): FederalRollCall => {
  if ("error" in rc) throw new Error(`expected a parse, got: ${rc.error}`);
  return rc;
};

describe("tally summing", () => {
  test("sums per-party totals into one tally", () => {
    expect(sumPartyTotals(d100().houseRollCallVote.votePartyTotal)).toEqual({
      aye: 216,
      nay: 214,
      present: 0,
      notVoting: 3,
    });
  });

  test("rejects a missing votePartyTotal block", () => {
    expect(sumPartyTotals(undefined)).toEqual({ error: "no votePartyTotal block" });
    expect(sumPartyTotals([])).toEqual({ error: "no votePartyTotal block" });
  });

  test("rejects a party row with a missing total rather than reading it as zero", () => {
    // A missing field summed as 0 lowers the expected tally, which would let a
    // parse that dropped members reconcile against a wrong, smaller number.
    const totals = d100().houseRollCallVote.votePartyTotal;
    delete totals[0].nayTotal;
    expect(sumPartyTotals(totals)).toEqual({
      error: "party row missing integer nayTotal",
    });
  });
});

describe("member rows", () => {
  test("reads the Yea/Nay vocabulary", () => {
    const votes = parseMemberVotes(m100().houseRollCallVoteMemberVotes.results);
    if ("error" in votes) throw new Error(votes.error);
    expect(votes).toHaveLength(433);
    expect(votes.filter((v) => v.position === "aye")).toHaveLength(216);
    expect(votes.filter((v) => v.position === "nay")).toHaveLength(214);
  });

  test("reads the Aye/No vocabulary of a Recorded Vote", () => {
    // The official docs list "Aye" and "Nay" together — a pairing that occurs in
    // NEITHER real vote type. Recorded Votes say "No", not "Nay". Reading only
    // the documented set leaves every No unmapped.
    const votes = parseMemberVotes(m259().houseRollCallVoteMemberVotes.results);
    if ("error" in votes) throw new Error(votes.error);
    expect(votes.filter((v) => v.position === "nay")).toHaveLength(228);
  });

  test("REJECTS an unrecognized voteCast instead of defaulting it", () => {
    // The whole misattribution class in one assertion: a new or misspelled cast
    // string must kill the document, never quietly become a position.
    const results = m100().houseRollCallVoteMemberVotes.results;
    results[5].voteCast = "Abstain";
    expect(parseMemberVotes(results)).toEqual({
      error: 'unrecognized voteCast: "Abstain"',
    });
  });

  test("REJECTS the documented-but-wrong bioguideId spelling", () => {
    // Congress.gov sends `bioguideID`; its own docs say `bioguideId`. Matching
    // the documented spelling finds nobody and shows an empty record with no
    // error, so the parser must treat the lowercase-d shape as malformed.
    const results = m100().houseRollCallVoteMemberVotes.results.map(
      ({ bioguideID, ...rest }: Record<string, unknown>) => ({
        ...rest,
        bioguideId: bioguideID,
      }),
    );
    expect(parseMemberVotes(results)).toEqual({
      error: "bad bioguideID: undefined",
    });
  });

  test("rejects an empty result set", () => {
    expect(parseMemberVotes([])).toEqual({ error: "no member results" });
  });
});

describe("dates", () => {
  test("takes the date as printed, without timezone conversion", () => {
    // 2025-04-10T11:08:00-04:00 shifted to UTC is still the 10th, but a
    // late-evening vote would roll onto the next day and misdate the record.
    expect(parseVotedOn("2025-04-10T11:08:00-04:00")).toBe("2025-04-10");
    expect(parseVotedOn("2025-09-10T23:40:00-04:00")).toBe("2025-09-10");
    expect(parseVotedOn(undefined)).toBeNull();
  });
});

describe("parseHouseVote", () => {
  test("parses a Yea-and-Nay vote on a concurrent resolution", () => {
    const rc = ok(parseHouseVote(d100(), m100(), ref(100)));
    // "{session}-{chamber}-{voteId}" — summarize() reads chamber from index 1.
    expect(rc.voteKey.split("-")[1]).toBe("us_house");
    expect(rc.voteKey).toBe("119-us_house-1-100");
    expect(rc.measure).toBe("HCONRES 14");
    expect(rc.billNumber).toBe("HCONRES 14");
    expect(rc.voteQuestion).toBe("On Motion to Concur in the Senate Amendment");
    expect(rc.result).toBe("Passed");
    expect(rc.votedOn).toBe("2025-04-10");
    expect([rc.ayes, rc.nays, rc.present, rc.notVoting]).toEqual([216, 214, 0, 3]);
    expect(rc.votes).toHaveLength(433);
  });

  test("parses a Recorded Vote on passage of a bill", () => {
    const rc = ok(parseHouseVote(d122(), m122(), ref(122)));
    expect(rc.measure).toBe("HR 276");
    expect(rc.voteQuestion).toBe("On Passage");
    expect([rc.ayes, rc.nays, rc.notVoting]).toEqual([211, 206, 16]);
  });

  test("an amendment vote records the amendment AND its underlying bill", () => {
    // measure is what was voted on; billNumber is what a reader recognises.
    // Collapsing the two would either lose the amendment or mislabel the vote
    // as being on the bill itself.
    const rc = ok(parseHouseVote(d259(), m259(), ref(259)));
    expect(rc.measure).toBe("HAMDT 97");
    expect(rc.billNumber).toBe("HR 3838");
    expect(rc.voteQuestion).toBe("On Agreeing to the Amendment");
  });

  test("resolves all eight tracked Wisconsin members by Bioguide ID", () => {
    const rc = ok(parseHouseVote(d100(), m100(), ref(100)));
    const at = (id: string) => rc.votes.find((v) => v.bioguideId === id);
    expect(at("S001213")?.position).toBe("aye"); // Steil WI-01
    expect(at("P000607")?.position).toBe("nay"); // Pocan WI-02
    expect(at("V000135")?.position).toBe("aye"); // Van Orden WI-03
    expect(at("M001160")?.position).toBe("nay"); // Moore WI-04
    expect(at("F000471")?.position).toBe("aye"); // Fitzgerald WI-05
    expect(at("G000576")?.position).toBe("aye"); // Grothman WI-06
    expect(at("T000165")?.position).toBe("aye"); // Tiffany WI-07
    expect(at("W000829")?.position).toBe("aye"); // Wied WI-08
  });

  test("REJECTS a members payload for a different roll call", () => {
    // Without the self-identification check one vote's positions get filed
    // under another vote's key, with a source link that points elsewhere.
    const rc = parseHouseVote(d100(), m122(), ref(100));
    expect(rc).toEqual({
      error:
        "members payload identifies as 119/1/122, expected 119/1/100",
    });
  });

  test("REJECTS when a member row is dropped", () => {
    const members = m100();
    // Row 0 is a Yea, so the aye count is the one that drops.
    members.houseRollCallVoteMemberVotes.results.splice(0, 1);
    expect(parseHouseVote(d100(), members, ref(100))).toEqual({
      error: "parsed 215/214/0/3 does not match published 216/214/0/3",
    });
  });

  test("REJECTS a duplicated member that the tally check cannot see", () => {
    // The duplicate must replace a row voting the SAME way, otherwise the counts
    // shift and the tally check fires first — which would leave the duplicate
    // check itself untested and free to be deleted.
    const members = m100();
    const rows = members.houseRollCallVoteMemberVotes.results;
    const twin = rows.findIndex(
      (r: { voteCast: string; bioguideID: string }, i: number) =>
        i > 0 && r.voteCast === rows[0].voteCast,
    );
    rows[twin] = { ...rows[0] };
    expect(parseHouseVote(d100(), members, ref(100))).toEqual({
      error: `duplicate bioguideID: ${rows[0].bioguideID}`,
    });
  });

  test("REJECTS a vote naming neither legislation nor amendment", () => {
    const members = m100();
    delete members.houseRollCallVoteMemberVotes.legislationType;
    delete members.houseRollCallVoteMemberVotes.legislationNumber;
    expect(parseHouseVote(d100(), members, ref(100))).toEqual({
      error: "vote names neither legislation nor amendment",
    });
  });

  test("REJECTS a Speaker election, whose totals count people not positions", () => {
    // Observed live at 119/1/2. votePartyTotal carries {candidate, total} rows
    // instead of party yea/nay rows, because members vote for a PERSON. There is
    // no aye/nay to record, so the document must be refused rather than coerced
    // into a position — the same reason a quorum call ("Call by States", roll 1)
    // is refused for naming no legislation.
    const detail = {
      houseRollCallVote: {
        congress: 119,
        sessionNumber: 1,
        rollCallNumber: 2,
        votePartyTotal: [
          { candidate: "Jeffries", total: 215 },
          { candidate: "Johnson (LA)", total: 218 },
        ],
      },
    };
    const members = {
      houseRollCallVoteMemberVotes: {
        congress: 119,
        sessionNumber: 1,
        rollCallNumber: 2,
        results: [],
      },
    };
    expect(parseHouseVote(detail, members, ref(2))).toEqual({
      error: "party row missing integer yeaTotal",
    });
  });

  test("CORRUPTION SWEEP: flipping any single member's vote is rejected", () => {
    // The federal counterpart of the Wisconsin blank-mark sweep. Every row, one
    // at a time, gets its cast changed to a different real value; the tally must
    // catch all of them. A single survivor is a member published with the
    // opposite of their real vote.
    const base = m100();
    const rows = base.houseRollCallVoteMemberVotes.results;
    const survivors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const members = m100();
      const row = members.houseRollCallVoteMemberVotes.results[i];
      row.voteCast = row.voteCast === "Yea" ? "Nay" : "Yea";
      if (!("error" in parseHouseVote(d100(), members, ref(100)))) {
        survivors.push(row.bioguideID);
      }
    }
    expect(survivors).toEqual([]);
  });
});

describe("cross-source verification against the House Clerk", () => {
  const clerk = () => fixture("clerk-2025-roll100.xml");

  test("reads positions out of the Clerk's own XML", () => {
    const positions = parseClerkPositions(clerk());
    expect(positions.size).toBe(433);
    expect(positions.get("T000165")).toBe("aye"); // Tiffany
    expect(positions.get("M001160")).toBe("nay"); // Moore
  });

  test("every Congress.gov position agrees with the Clerk rendering", () => {
    // This is the check the Wisconsin gate could not have. Arithmetic cannot see
    // two swapped positions; an independent source can.
    const rc = ok(parseHouseVote(d100(), m100(), ref(100)));
    const { compared, disagreements } = verifyAgainstClerk(rc.votes, clerk());
    expect(compared).toBe(433);
    expect(disagreements).toEqual([]);
  });

  test("CATCHES the swap that every arithmetic check passes", () => {
    // Swap two members' positions in the API payload and leave the tallies
    // untouched: counts balance, IDs stay unique, the gate is satisfied — and
    // both members are published with the opposite of their real vote. Only the
    // second source sees it. This is the demonstrated blind spot from
    // parseRollCall's comment, closed.
    const members = m100();
    const rows = members.houseRollCallVoteMemberVotes.results;
    const a = rows.findIndex((r: { bioguideID: string }) => r.bioguideID === "T000165");
    const b = rows.findIndex((r: { bioguideID: string }) => r.bioguideID === "M001160");
    [rows[a].voteCast, rows[b].voteCast] = [rows[b].voteCast, rows[a].voteCast];

    const rc = ok(parseHouseVote(d100(), members, ref(100)));
    const { disagreements } = verifyAgainstClerk(rc.votes, clerk());
    expect(disagreements).toHaveLength(2);
    expect(disagreements.join(" ")).toContain("T000165");
    expect(disagreements.join(" ")).toContain("M001160");
  });
});
