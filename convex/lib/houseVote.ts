/**
 * Pure parsing of U.S. House roll-call votes from the Congress.gov API.
 *
 * No network, no Convex ctx — same split as rollCall.ts, for the same reason:
 * a plain mutation cannot import from a "use node" module, so everything shared
 * between the fetching action and the storing mutation lives here.
 *
 * Source: api.congress.gov/v3/house-vote/{congress}/{session}/{voteNumber}
 *   - .../{voteNumber}          -> votePartyTotal[]  (the printed tally)
 *   - .../{voteNumber}/members  -> results[]         (bioguideID + voteCast)
 *
 * This is the FEDERAL counterpart to rollCall.ts and inherits its posture: the
 * reconciliation gate replaces human review, and it fails closed. See
 * parseHouseVote below for what this gate can and cannot see.
 */

export type FederalPosition = "aye" | "nay" | "present" | "not_voting";

/**
 * voteCast strings, mapped exhaustively.
 *
 * THE DOCUMENTATION IS WRONG HERE, and getting it wrong is silent. The official
 * LoC docs list exactly "Aye", "Nay", "Present", "Not Voting" — a set that
 * matches NEITHER real vote type. Observed in live payloads:
 *
 *   voteType "Yea-and-Nay" / "2/3 Yea-And-Nay" -> "Yea" / "Nay"
 *   voteType "Recorded Vote" / "2/3 Recorded Vote" -> "Aye" / "No"
 *
 * "Nay" pairs with "Yea"; "No" pairs with "Aye". Building from the docs leaves
 * "No" unmapped, which on roll 259 alone is 228 members whose NAY vote would
 * vanish or, worse, default to something else. Hence the explicit reject in
 * parseMemberVotes rather than any fallback: an unrecognized cast string must
 * kill the document, never quietly become a position.
 */
const POSITION_BY_CAST: Record<string, FederalPosition> = {
  Yea: "aye",
  Aye: "aye",
  Nay: "nay",
  No: "nay",
  Present: "present",
  "Not Voting": "not_voting",
};

/** Congress.gov returns `bioguideID` (capital D) even though its own
 * documentation says `bioguideId`. Matching the documented spelling finds zero
 * members and every candidate silently shows an empty record. */
export type MemberVoteRaw = {
  bioguideID?: string;
  firstName?: string;
  lastName?: string;
  voteCast?: string;
  voteParty?: string;
  voteState?: string;
};

export type FederalMemberVote = {
  bioguideId: string;
  lastName: string;
  party?: string;
  state?: string;
  position: FederalPosition;
};

export type FederalTally = {
  aye: number;
  nay: number;
  present: number;
  notVoting: number;
};

/**
 * Sum the per-party totals into one tally.
 *
 * Unlike the Wisconsin documents there is no printed grand total — only a
 * votePartyTotal[] row per party. Summing is the only way to get the number the
 * gate reconciles against, so a missing or malformed party row must fail rather
 * than contribute a silent zero.
 */
export function sumPartyTotals(
  votePartyTotal: unknown,
): FederalTally | { error: string } {
  if (!Array.isArray(votePartyTotal) || votePartyTotal.length === 0) {
    return { error: "no votePartyTotal block" };
  }
  const tally: FederalTally = { aye: 0, nay: 0, present: 0, notVoting: 0 };
  const fields: [keyof FederalTally, string][] = [
    ["aye", "yeaTotal"],
    ["nay", "nayTotal"],
    ["present", "presentTotal"],
    ["notVoting", "notVotingTotal"],
  ];
  for (const row of votePartyTotal) {
    if (typeof row !== "object" || row === null) {
      return { error: "malformed votePartyTotal row" };
    }
    for (const [key, field] of fields) {
      const raw = (row as Record<string, unknown>)[field];
      // A party row legitimately omits nothing in practice, but a missing field
      // read as 0 would lower the expected tally and let a short parse through.
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
        return { error: `party row missing integer ${field}` };
      }
      tally[key] += raw;
    }
  }
  return tally;
}

/**
 * Member rows -> positions. Rejects rather than skips: a row without a usable
 * bioguideID or with an unrecognized voteCast means the payload is not the shape
 * this parser was verified against, and dropping it would silently shrink the
 * count until it no longer matched the tally (which the gate would then catch as
 * a confusing arithmetic error instead of the real cause).
 */
export function parseMemberVotes(
  results: unknown,
): FederalMemberVote[] | { error: string } {
  if (!Array.isArray(results) || results.length === 0) {
    return { error: "no member results" };
  }
  const out: FederalMemberVote[] = [];
  for (const raw of results as MemberVoteRaw[]) {
    const bioguideId = raw?.bioguideID;
    if (typeof bioguideId !== "string" || !/^[A-Z]\d{6}$/.test(bioguideId)) {
      return { error: `bad bioguideID: ${JSON.stringify(raw?.bioguideID)}` };
    }
    const cast = raw?.voteCast;
    if (typeof cast !== "string" || !(cast in POSITION_BY_CAST)) {
      return { error: `unrecognized voteCast: ${JSON.stringify(cast)}` };
    }
    out.push({
      bioguideId,
      lastName: typeof raw.lastName === "string" ? raw.lastName : "",
      party: raw.voteParty,
      state: raw.voteState,
      position: POSITION_BY_CAST[cast],
    });
  }
  return out;
}

export type FederalRollCall = {
  voteKey: string;
  congress: number;
  session: number;
  rollCallNumber: number;
  /** "HR 276", "HCONRES 14" — or "HAMDT 97" when the vote is on an amendment. */
  measure: string;
  /** The bill the vote ultimately concerns. For an amendment vote this is the
   * underlying bill (HR 3838), which is what a reader actually recognises. */
  billNumber: string | null;
  voteQuestion: string;
  voteType: string;
  result: string;
  votedOn: string;
  legislationUrl: string | null;
  /** Clerk XML for the same vote — an INDEPENDENT rendering, see verifier. */
  sourceDataUrl: string | null;
  sourceUrl: string;
  ayes: number;
  nays: number;
  present: number;
  notVoting: number;
  votes: FederalMemberVote[];
};

/** Human-readable Congress.gov page for a House roll call. */
export const houseVoteUrl = (congress: number, session: number, roll: number) =>
  `https://www.congress.gov/roll-call-vote/${congress}/${session}/${roll}`;

/** "2025-04-10T11:08:00-04:00" -> "2025-04-10". Takes the date as printed,
 * without timezone conversion: shifting to UTC moves a late-evening vote onto
 * the following day, which misdates the record against every other source. */
export function parseVotedOn(startDate: unknown): string | null {
  if (typeof startDate !== "string") return null;
  const m = startDate.match(/^(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : null;
}

const joinMeasure = (type?: unknown, num?: unknown): string | null =>
  typeof type === "string" && type && (typeof num === "string" || typeof num === "number")
    ? `${type} ${num}`
    : null;

/**
 * Parse and RECONCILE a House roll call from its two payloads.
 *
 * Same law as parseRollCall: nothing here is stored unless the parsed rows agree
 * with the numbers the source itself published. A failure returns { error } and
 * the caller MUST skip the document.
 *
 * HOW THIS GATE DIFFERS FROM THE WISCONSIN ONE.
 *
 *  - WEAKER in one place: there is no seat-count check. Wisconsin documents
 *    declare their vacancies, so `rows + vacant == seats` is checkable. The
 *    House has 435 seats but the API declares no vacancies and mid-term
 *    vacancies are routine, so the equivalent check is not merely unbuilt, it is
 *    uncomputable from this source. Hardcoding 435 would reject every roll call
 *    taken during a vacancy — do not add it.
 *
 *  - STRONGER in two. Duplicate detection keys on Bioguide ID, which is unique
 *    by construction, where Wisconsin can only compare printed surnames and
 *    genuinely cannot distinguish two members sharing one. And an unrecognized
 *    voteCast is fatal here, closing the "new value appears and silently maps to
 *    a default" hole.
 *
 *  - The blind spot Wisconsin could not close IS closeable here. parseRollCall's
 *    own comment notes that an internally-consistent document with two positions
 *    swapped passes every arithmetic check, and that catching it "needs a second,
 *    independent source for the same vote". Every response carries
 *    `sourceDataURL` pointing at the House Clerk's own XML — a genuinely separate
 *    rendering. verifyAgainstClerk below spends it.
 */
export function parseHouseVote(
  detail: unknown,
  members: unknown,
  ref: { congress: number; session: number; rollCallNumber: number },
): FederalRollCall | { error: string } {
  const det = (detail as Record<string, unknown>)?.houseRollCallVote as
    | Record<string, unknown>
    | undefined;
  if (!det) return { error: "detail payload has no houseRollCallVote" };
  const mem = (members as Record<string, unknown>)?.houseRollCallVoteMemberVotes as
    | Record<string, unknown>
    | undefined;
  if (!mem) return { error: "members payload has no houseRollCallVoteMemberVotes" };

  // Both payloads must identify themselves as the vote we asked for. Without
  // this the ref is taken on faith and one vote's positions can be filed under
  // another's key — the federal analogue of the canonical-path check.
  for (const [label, src] of [["detail", det], ["members", mem]] as const) {
    if (
      Number(src.congress) !== ref.congress ||
      Number(src.sessionNumber) !== ref.session ||
      Number(src.rollCallNumber) !== ref.rollCallNumber
    ) {
      return {
        error:
          `${label} payload identifies as ` +
          `${src.congress}/${src.sessionNumber}/${src.rollCallNumber}, expected ` +
          `${ref.congress}/${ref.session}/${ref.rollCallNumber}`,
      };
    }
  }

  const tally = sumPartyTotals(det.votePartyTotal);
  if ("error" in tally) return tally;

  const votes = parseMemberVotes(mem.results);
  if ("error" in votes) return votes;

  const votedOn = parseVotedOn(mem.startDate ?? det.startDate);
  if (!votedOn) return { error: "no usable startDate" };

  const voteQuestion = typeof mem.voteQuestion === "string" ? mem.voteQuestion : null;
  if (!voteQuestion) return { error: "no voteQuestion" };

  // A vote is on a bill or on an amendment to one. The amendment case still
  // names its underlying bill at this level, so both are recorded: `measure` is
  // what was actually voted on, `billNumber` is what a reader recognises.
  const bill = joinMeasure(mem.legislationType, mem.legislationNumber);
  const amendment = joinMeasure(mem.amendmentType, mem.amendmentNumber);
  const measure = amendment ?? bill;
  if (!measure) return { error: "vote names neither legislation nor amendment" };

  const count = (p: FederalPosition) => votes.filter((v) => v.position === p).length;
  if (
    count("aye") !== tally.aye ||
    count("nay") !== tally.nay ||
    count("present") !== tally.present ||
    count("not_voting") !== tally.notVoting
  ) {
    return {
      error:
        `parsed ${count("aye")}/${count("nay")}/${count("present")}/${count("not_voting")} ` +
        `does not match published ${tally.aye}/${tally.nay}/${tally.present}/${tally.notVoting}`,
    };
  }

  const ids = votes.map((v) => v.bioguideId);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) return { error: `duplicate bioguideID: ${duplicate}` };

  return {
    // MUST stay "{session}-{chamber}-{voteId}": summarize() in lib/votingRecord
    // reads the chamber out of split("-")[1] with no join, so putting the
    // session number second would make every federal row read as chamber "1".
    voteKey: `${ref.congress}-us_house-${ref.session}-${ref.rollCallNumber}`,
    congress: ref.congress,
    session: ref.session,
    rollCallNumber: ref.rollCallNumber,
    measure,
    billNumber: bill,
    voteQuestion,
    voteType: typeof mem.voteType === "string" ? mem.voteType : "",
    result: typeof mem.result === "string" ? mem.result : "",
    votedOn,
    legislationUrl:
      typeof mem.legislationUrl === "string" ? mem.legislationUrl : null,
    sourceDataUrl: typeof det.sourceDataURL === "string" ? det.sourceDataURL : null,
    sourceUrl: houseVoteUrl(ref.congress, ref.session, ref.rollCallNumber),
    ayes: tally.aye,
    nays: tally.nay,
    present: tally.present,
    notVoting: tally.notVoting,
    votes,
  };
}

/**
 * Positions as rendered by the House Clerk's XML — the independent second source.
 *
 * Deliberately a separate, dumber reader over a different format: if it shared
 * code with the Congress.gov path it would share bugs, and agreement between two
 * copies of the same mistake proves nothing.
 */
export function parseClerkPositions(xml: string): Map<string, FederalPosition> {
  const out = new Map<string, FederalPosition>();
  const re =
    /<legislator\s+name-id="([A-Z]\d{6})"[^>]*>[\s\S]*?<\/legislator>\s*<vote>([^<]+)<\/vote>/g;
  for (const m of xml.matchAll(re)) {
    const position = POSITION_BY_CAST[m[2].trim()];
    if (position) out.set(m[1], position);
  }
  return out;
}

/**
 * Cross-source check: every member's position per Congress.gov must equal the
 * House Clerk's own rendering of the same roll call.
 *
 * This is the check the Wisconsin gate could not have. Arithmetic cannot detect
 * two swapped positions; a second source can. Returns the disagreements — any
 * non-empty result must reject the document, because one of two official
 * sources is wrong about how a sitting member of Congress voted and there is no
 * safe way to guess which.
 *
 * Only members present in BOTH renderings are compared. The Clerk XML uses
 * `role="legislator"` rows plus occasional non-member rows, and a member absent
 * from one side is a coverage difference, not a contradiction.
 */
export function verifyAgainstClerk(
  votes: FederalMemberVote[],
  clerkXml: string,
): { compared: number; disagreements: string[] } {
  const clerk = parseClerkPositions(clerkXml);
  const disagreements: string[] = [];
  let compared = 0;
  for (const v of votes) {
    const theirs = clerk.get(v.bioguideId);
    if (!theirs) continue;
    compared++;
    if (theirs !== v.position) {
      disagreements.push(`${v.bioguideId} (${v.lastName}): api=${v.position} clerk=${theirs}`);
    }
  }
  return { compared, disagreements };
}
