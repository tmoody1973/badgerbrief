#!/usr/bin/env node
/**
 * County offices and statewide questions for My Ballot.
 *
 *   node scripts/ballot-extras.mjs                      rebuild the county file and both review sheets
 *   node scripts/ballot-extras.mjs --certify "<name>"   sign both files. Only on the certifier's own word.
 *
 * Signing is refused unless the review sheets on disk are exactly what the
 * current files produce, so a signature always covers what the certifier read.
 *
 * Reads state documents saved under docs/evidence. Writes four local files.
 * Touches no database.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  certify,
  countyReviewMarkdown,
  dropStaleSignature,
  isSigned,
  parseArgs,
  questionsReviewMarkdown,
  staleSheets,
  toCountyFile,
} from "./lib/ballot-extras-files.mjs";
import { citesAnotherSection, notVerbatim } from "./lib/ballot-questions.mjs";
import {
  REFERENDUM_NOTICE_TXT,
  STATE_CANDIDATES_XLSX,
  alteredEvidence,
  expectedFingerprint,
} from "./lib/evidence.mjs";
import { buildCountyContests } from "./lib/wec-county.mjs";
import { readWecWorkbook } from "./lib/wec-legislative.mjs";

const STATE_XLSX = STATE_CANDIDATES_XLSX;
const NOTICE_TXT = REFERENDUM_NOTICE_TXT;
const COUNTY_JSON = "convex/lib/data/county-contests-2026.json";
const QUESTIONS_JSON = "convex/lib/data/ballot-questions-2026.json";
const REVIEW_DIR = "docs/evidence/ballot-extras";
const COUNTY_SOURCE = {
  name: "Wisconsin Elections Commission, All Contests and Candidates, November 3, 2026 General Election",
  url: "https://elections.wi.gov/media/41846/download",
  documentDate: "2026-10-06",
  retrievedAt: "2026-10-12T21:32:56Z",
  sha256: expectedFingerprint(STATE_CANDIDATES_XLSX),
};

let certifier;
try {
  ({ certifier } = parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const COUNTY_SHEET = join(REVIEW_DIR, "county-offices-review.md");
const QUESTIONS_SHEET = join(REVIEW_DIR, "statewide-questions-review.md");

const altered = alteredEvidence([STATE_XLSX, NOTICE_TXT]);
if (altered.length > 0) {
  console.error(
    `${altered.join(" and ")} changed on disk and ${altered.length === 1 ? "is" : "are"} no longer the bytes the state served (an app may have re-saved it). Restore with: git checkout -- <path>. Nothing was written.`,
  );
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const storedQuestions = readJson(QUESTIONS_JSON);
const notice = readFileSync(NOTICE_TXT, "utf8");
const reworded = storedQuestions.questions.flatMap((q) =>
  notVerbatim(q, notice).map((field) => `Question ${q.number} ${field}`),
);
if (reworded.length > 0) {
  console.error(`NOT WORD FOR WORD in the state's notice: ${reworded.join(", ")}. Nothing was written.`);
  process.exit(1);
}

const built = buildCountyContests(readWecWorkbook(STATE_XLSX));
const rebuiltCounty = toCountyFile({
  built,
  source: COUNTY_SOURCE,
  previous: existsSync(COUNTY_JSON) ? readJson(COUNTY_JSON) : undefined,
});
const currentQuestions = dropStaleSignature(storedQuestions);
const flagged = currentQuestions.questions.filter(citesAnotherSection).map((q) => q.number);
const sheetsFor = (countyFile, questionsFile) => ({
  [COUNTY_SHEET]: countyReviewMarkdown({ file: countyFile, notes: built.notes }),
  [QUESTIONS_SHEET]: questionsReviewMarkdown({ file: questionsFile, flagged }),
});

if (certifier) {
  const onDisk = Object.fromEntries(
    [COUNTY_SHEET, QUESTIONS_SHEET].map((path) => [path, existsSync(path) ? readFileSync(path, "utf8") : undefined]),
  );
  const stale = staleSheets(sheetsFor(rebuiltCounty, currentQuestions), onDisk);
  if (stale.length > 0) {
    console.error(
      `${stale.join(" and ")} ${stale.length === 1 ? "is" : "are"} out of date: the content changed after the sheet was written. Run without --certify, read the new sheet, then certify. Nothing was signed.`,
    );
    process.exit(1);
  }
}

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const county = certifier ? certify(rebuiltCounty, certifier, today) : rebuiltCounty;
const questions = certifier ? certify(currentQuestions, certifier, today) : currentQuestions;
const sheets = sheetsFor(county, questions);

mkdirSync(REVIEW_DIR, { recursive: true });
writeJson(COUNTY_JSON, county);
writeJson(QUESTIONS_JSON, questions);
for (const [path, text] of Object.entries(sheets)) writeFileSync(path, text);

const signedBy = (file) => (isSigned(file) ? `signed by ${file.certifiedBy} on ${file.certifiedAt}` : "NOT SIGNED");
console.log(`county offices: ${county.contests.length} contests, ${county.excluded.length} left out, ${built.notes.length} flagged | ${signedBy(county)}`);
console.log(`statewide questions: ${questions.questions.length}, ${flagged.length} flagged | ${signedBy(questions)}`);
console.log(`review sheets: ${COUNTY_SHEET} and statewide-questions-review.md`);
