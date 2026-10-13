// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  certify,
  contentHash,
  countyReviewMarkdown,
  dropStaleSignature,
  isSigned,
  questionsReviewMarkdown,
  signatureHolds,
  toCountyFile,
} from "./ballot-extras-files.mjs";
import { buildCountyContests } from "./wec-county.mjs";
import { readWecWorkbook } from "./wec-legislative.mjs";

const SOURCE = { name: "State file", url: "https://example.test/file", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };

const contest = (over) => ({
  county: "door",
  countyName: "Door County",
  office: "Sheriff",
  contestAsPrinted: "Door County Sheriff",
  ballotPosition: 21504,
  candidates: [{ ballotName: "Curt Vandertie", party: "Republican", ballotOrder: 1 }],
  ...over,
});
const built = (over) => ({ contests: [contest()], excluded: [], unrecognized: [], notes: [], ...over });

describe("toCountyFile", () => {
  test("starts unsigned", () => {
    const file = toCountyFile({ built: built(), source: SOURCE });
    expect(file).toEqual({
      election: "2026-11-03",
      source: SOURCE,
      certifiedBy: "",
      certifiedAt: "",
      certifiedSha256: "",
      contests: [contest()],
      excluded: [],
    });
    expect(isSigned(file)).toBe(false);
  });

  test("refuses to write a file while a contest is unrecognized", () => {
    expect(() => toCountyFile({ built: built({ unrecognized: ["DANE COUNTY: Dane County Register of Deeds"] }), source: SOURCE })).toThrow(
      /unrecognized contest\(s\): DANE COUNTY: Dane County Register of Deeds/,
    );
  });

  test("keeps a signature when the rebuilt content is the same", () => {
    const signed = certify(toCountyFile({ built: built(), source: SOURCE }), "Tarik Moody", "2026-10-14");
    const again = toCountyFile({ built: built(), source: SOURCE, previous: signed });
    expect(again.certifiedBy).toBe("Tarik Moody");
    expect(signatureHolds(again)).toBe(true);
  });

  test("drops a signature when one candidate changes", () => {
    const signed = certify(toCountyFile({ built: built(), source: SOURCE }), "Tarik Moody", "2026-10-14");
    const changed = built({ contests: [contest({ candidates: [{ ballotName: "Someone Else", party: "Republican", ballotOrder: 1 }] })] });
    const again = toCountyFile({ built: changed, source: SOURCE, previous: signed });
    expect([again.certifiedBy, again.certifiedAt, again.certifiedSha256]).toEqual(["", "", ""]);
  });

  test("drops a signature when the source document changes", () => {
    const signed = certify(toCountyFile({ built: built(), source: SOURCE }), "Tarik Moody", "2026-10-14");
    const again = toCountyFile({ built: built(), source: { ...SOURCE, documentDate: "2026-10-20" }, previous: signed });
    expect(isSigned(again)).toBe(false);
  });
});

describe("certify", () => {
  const file = toCountyFile({ built: built(), source: SOURCE });

  test("records who signed, when, and a hash of what they signed", () => {
    const signed = certify(file, " Tarik Moody ", "2026-10-14");
    expect([signed.certifiedBy, signed.certifiedAt, signed.certifiedSha256]).toEqual(["Tarik Moody", "2026-10-14", contentHash(file)]);
    expect(file.certifiedBy).toBe("");
  });

  test("refuses a blank name and a date that is not a date", () => {
    expect(() => certify(file, "  ", "2026-10-14")).toThrow(/name is required/);
    expect(() => certify(file, "Tarik Moody", "Oct 14")).toThrow(/not a date like 2026-10-14/);
  });

  test("a hand edit after signing breaks the signature", () => {
    const signed = certify(file, "Tarik Moody", "2026-10-14");
    const edited = { ...signed, contests: [contest({ contestAsPrinted: "Door Sheriff" })] };
    expect(signatureHolds(signed)).toBe(true);
    expect(signatureHolds(edited)).toBe(false);
    expect(isSigned(dropStaleSignature(edited))).toBe(false);
    expect(dropStaleSignature(signed)).toEqual(signed);
  });

  test("signs a questions file by its questions", () => {
    const questions = { election: "2026-11-03", source: SOURCE, certifiedBy: "", certifiedAt: "", certifiedSha256: "", questions: [{ number: 1, title: "Partial veto" }] };
    const signed = certify(questions, "Tarik Moody", "2026-10-14");
    expect(signatureHolds(signed)).toBe(true);
    expect(signatureHolds({ ...signed, questions: [{ number: 1, title: "Partial veto", note: "added later" }] })).toBe(false);
  });
});

describe("review sheets", () => {
  test("the county sheet says it is unsigned and lists every contest, flag and exclusion", () => {
    const file = toCountyFile({
      built: built({
        contests: [contest(), contest({ county: "iron", countyName: "Iron County", office: "Coroner", contestAsPrinted: "Iron County Coroner", ballotPosition: 22605, candidates: [] })],
        excluded: [{ contestAsPrinted: "Verona Municipal Judge", jurisdiction: "CITY OF VERONA - DANE COUNTY", district: "City of Verona", reason: "Covers part of a county." }],
      }),
      source: SOURCE,
    });
    const sheet = countyReviewMarkdown({ file, notes: ["Iron County Coroner: the state lists no candidate."] });
    expect(sheet).toContain("NOT SIGNED");
    expect(sheet).toContain("2 contests in 2 counties, 1 candidate");
    expect(sheet).toContain("| Door County | Door County Sheriff | Curt Vandertie (Republican) |");
    expect(sheet).toContain("| Iron County | Iron County Coroner | No candidate listed |");
    expect(sheet).toContain("- Iron County Coroner: the state lists no candidate.");
    expect(sheet).toContain("- **Verona Municipal Judge** (City of Verona). Covers part of a county.");
  });

  test("the questions sheet shows the state's words, the guide's note, and what was flagged", () => {
    const file = {
      source: { ...SOURCE, documentUrl: "https://example.test/notice.pdf" },
      certifiedBy: "Tarik Moody",
      certifiedAt: "2026-10-14",
      questions: [
        { number: 3, title: "Governmental entity discrimination prohibited", resolution: "2025 Assembly Joint Resolution 102", ballotText: "Shall section 27 be created?", explanation: ["Under current law."], yesVote: "A yes vote adds § 18.", noVote: "A no vote does not add § 18.", note: "The notice says § 18 here." },
      ],
    };
    const sheet = questionsReviewMarkdown({ file, flagged: [3] });
    expect(sheet).toContain("Signed by Tarik Moody on 2026-10-14.");
    expect(sheet).toContain("## Question 3: Governmental entity discrimination prohibited");
    expect(sheet).toContain("> Shall section 27 be created?");
    expect(sheet).toContain("> A yes vote adds § 18.");
    expect(sheet).toContain("**The guide's own note (not the state's words):** The notice says § 18 here.");
    expect(sheet).toContain("- Question 3: the yes and no sentences cite a different section than the question itself.");
  });
});

describe("the files in the repository", () => {
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  const county = read("convex/lib/data/county-contests-2026.json");
  const questions = read("convex/lib/data/ballot-questions-2026.json");

  test("the county file is exactly what the state's spreadsheet produces", () => {
    const rebuilt = buildCountyContests(
      readWecWorkbook("docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx"),
    );
    expect(county.contests).toEqual(rebuilt.contests);
    expect(county.excluded).toEqual(rebuilt.excluded);
  });

  test("a signed file's signature still covers its content", () => {
    for (const file of [county, questions]) {
      if (isSigned(file)) expect(signatureHolds(file)).toBe(true);
    }
  });

  test("a file is never half signed", () => {
    for (const file of [county, questions]) {
      const parts = [file.certifiedBy, file.certifiedAt, file.certifiedSha256].map((v) => v.trim() !== "");
      expect(new Set(parts).size).toBe(1);
    }
  });
});
