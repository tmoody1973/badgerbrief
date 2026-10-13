#!/usr/bin/env node
/**
 * County offices and statewide questions for My Ballot.
 *
 *   node scripts/ballot-extras.mjs                      rebuild the county file and both review sheets
 *   node scripts/ballot-extras.mjs --certify "<name>"   sign both files. Only on the certifier's own word.
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
  questionsReviewMarkdown,
  toCountyFile,
} from "./lib/ballot-extras-files.mjs";
import { citesAnotherSection, notVerbatim } from "./lib/ballot-questions.mjs";
import { buildCountyContests } from "./lib/wec-county.mjs";
import { readWecWorkbook } from "./lib/wec-legislative.mjs";

const STATE_XLSX = "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx";
const NOTICE_TXT = "docs/evidence/2026-10-13-wec-referenda/Type-C-Notice-of-Referendum-2026-11-03.txt";
const COUNTY_JSON = "convex/lib/data/county-contests-2026.json";
const QUESTIONS_JSON = "convex/lib/data/ballot-questions-2026.json";
const REVIEW_DIR = "docs/evidence/ballot-extras";
const COUNTY_SOURCE = {
  name: "Wisconsin Elections Commission, All Contests and Candidates, November 3, 2026 General Election",
  url: "https://elections.wi.gov/media/41846/download",
  documentDate: "2026-10-06",
  retrievedAt: "2026-10-12T21:32:56Z",
};

const args = process.argv.slice(2);
const certifyAt = args.indexOf("--certify");
const certifier = certifyAt >= 0 ? args[certifyAt + 1] : undefined;
if (certifyAt >= 0 && !certifier?.trim()) {
  console.error('--certify needs a name, for example: --certify "Tarik Moody"');
  process.exit(2);
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
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const county = certifier ? certify(rebuiltCounty, certifier, today) : rebuiltCounty;
const questions = certifier ? certify(storedQuestions, certifier, today) : dropStaleSignature(storedQuestions);
const flagged = questions.questions.filter(citesAnotherSection).map((q) => q.number);

mkdirSync(REVIEW_DIR, { recursive: true });
writeJson(COUNTY_JSON, county);
writeJson(QUESTIONS_JSON, questions);
writeFileSync(join(REVIEW_DIR, "county-offices-review.md"), countyReviewMarkdown({ file: county, notes: built.notes }));
writeFileSync(join(REVIEW_DIR, "statewide-questions-review.md"), questionsReviewMarkdown({ file: questions, flagged }));

const signedBy = (file) => (isSigned(file) ? `signed by ${file.certifiedBy} on ${file.certifiedAt}` : "NOT SIGNED");
console.log(`county offices: ${county.contests.length} contests, ${county.excluded.length} left out, ${built.notes.length} flagged | ${signedBy(county)}`);
console.log(`statewide questions: ${questions.questions.length}, ${flagged.length} flagged | ${signedBy(questions)}`);
console.log(`review sheets: ${join(REVIEW_DIR, "county-offices-review.md")} and statewide-questions-review.md`);
