/**
 * The two signed files My Ballot reads: county offices and statewide
 * questions. A signature is a name, a date and a hash of what was signed, so
 * content cannot change after signing without the tests noticing.
 */
import { createHash } from "node:crypto";

export const ELECTION = "2026-11-03";

const UNSIGNED = { certifiedBy: "", certifiedAt: "", certifiedSha256: "" };

/** What a signature covers: the source and the content, never the signature itself. */
const signedContent = (file) =>
  "questions" in file
    ? { source: file.source, questions: file.questions }
    : { source: file.source, contests: file.contests, excluded: file.excluded };

export const contentHash = (file) =>
  createHash("sha256").update(JSON.stringify(signedContent(file))).digest("hex");

export const isSigned = (file) =>
  Boolean(file.certifiedBy?.trim()) && Boolean(file.certifiedAt?.trim());

export const signatureHolds = (file) => isSigned(file) && file.certifiedSha256 === contentHash(file);

/** A file whose content changed after it was signed goes back to unsigned. */
export const dropStaleSignature = (file) =>
  isSigned(file) && !signatureHolds(file) ? { ...file, ...UNSIGNED } : file;

export function certify(file, name, date) {
  if (!name?.trim()) throw new Error("a certifier's name is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a date like 2026-10-14`);
  return { ...file, certifiedBy: name.trim(), certifiedAt: date, certifiedSha256: contentHash(file) };
}

export const USAGE = 'usage: node scripts/ballot-extras.mjs [--certify "<name>"]';

/** The command line: nothing, or --certify "<name>". Anything else is refused, never guessed at. */
export function parseArgs(argv) {
  if (argv.length === 0) return { certifier: undefined };
  const [flag, name, ...rest] = argv;
  if (flag !== "--certify" || rest.length > 0 || !name?.trim() || name.startsWith("-")) {
    throw new Error(USAGE);
  }
  return { certifier: name.trim() };
}

/**
 * Review sheets on disk that differ from the ones the current files produce.
 * A signature covers what the certifier read, so signing stops on any.
 */
export const staleSheets = (fresh, onDisk) =>
  Object.keys(fresh).filter((name) => onDisk[name] !== fresh[name]);

export function toCountyFile({ built, source, previous }) {
  if (built.unrecognized.length > 0) {
    throw new Error(`unrecognized contest(s): ${built.unrecognized.join("; ")}`);
  }
  const fresh = {
    election: ELECTION,
    source,
    ...UNSIGNED,
    contests: built.contests,
    excluded: built.excluded,
  };
  const stillSigned =
    previous !== undefined && isSigned(previous) && previous.certifiedSha256 === contentHash(fresh);
  return stillSigned
    ? {
        ...fresh,
        certifiedBy: previous.certifiedBy,
        certifiedAt: previous.certifiedAt,
        certifiedSha256: previous.certifiedSha256,
      }
    : fresh;
}

const signatureLine = (file) =>
  isSigned(file)
    ? `Signed by ${file.certifiedBy} on ${file.certifiedAt}.`
    : "NOT SIGNED. Nothing in this file is shown to voters until it is signed.";

const sourceLine = (source) =>
  `Source: ${source.name} (${source.documentUrl ?? source.url}), dated ${source.documentDate}, retrieved ${source.retrievedAt}.${
    source.sha256 ? ` File fingerprint (SHA-256): \`${source.sha256}\`.` : ""
  }`;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function countyReviewMarkdown({ file, notes }) {
  const counties = new Set(file.contests.map((c) => c.county));
  const candidates = file.contests.reduce((n, c) => n + c.candidates.length, 0);
  const onBallot = (contest) =>
    contest.candidates.length === 0
      ? "No candidate listed"
      : contest.candidates.map((c) => `${c.ballotName} (${c.party ?? "no party listed"})`).join("; ");
  return [
    "# County offices on the November 3, 2026 ballot: review sheet",
    "",
    signatureLine(file),
    "",
    sourceLine(file.source),
    "",
    `${plural(file.contests.length, "contest")} in ${counties.size} ${counties.size === 1 ? "county" : "counties"}, ${plural(candidates, "candidate")}.`,
    "",
    "## Read before signing",
    "",
    ...(notes.length > 0 ? notes.map((note) => `- ${note}`) : ["- Nothing flagged."]),
    "",
    "## Left out, and why",
    "",
    ...(file.excluded.length > 0
      ? file.excluded.map((e) => `- **${e.contestAsPrinted}** (${e.district}). ${e.reason}`)
      : ["- Nothing left out."]),
    "",
    "## Every contest, as it will be shown",
    "",
    "| County | Contest as the state prints it | On the ballot, in the state's order |",
    "|---|---|---|",
    ...file.contests.map((c) => `| ${c.countyName} | ${c.contestAsPrinted} | ${onBallot(c)} |`),
    "",
  ].join("\n");
}

export function questionsReviewMarkdown({ file, flagged }) {
  const quote = (text) => `> ${text}`;
  return [
    "# Statewide questions on the November 3, 2026 ballot: review sheet",
    "",
    signatureLine(file),
    "",
    sourceLine(file.source),
    "",
    "Everything in a quote block below is the state's wording and has been checked against the notice by a test. Compare it with the PDF once yourself before signing.",
    "",
    "## Read before signing",
    "",
    ...(flagged.length > 0
      ? flagged.map((n) => `- Question ${n}: the yes and no sentences cite a different section than the question itself.`)
      : ["- Nothing flagged."]),
    "",
    ...file.questions.flatMap((q) => [
      `## Question ${q.number}: ${q.title}`,
      "",
      `${q.resolution}.`,
      "",
      "**On the ballot**",
      "",
      quote(q.ballotText),
      "",
      "**The state's explanation**",
      "",
      ...q.explanation.flatMap((paragraph) => [quote(paragraph), ""]),
      "**What a yes vote does, and a no vote**",
      "",
      quote(q.yesVote),
      "",
      quote(q.noVote),
      "",
      ...(q.note ? [`**The guide's own note (not the state's words):** ${q.note}`, ""] : []),
    ]),
  ].join("\n");
}
