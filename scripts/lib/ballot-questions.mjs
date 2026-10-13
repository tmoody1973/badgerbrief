/**
 * Checks on the three statewide questions against the state's own documents.
 *
 * The guide shows the state's words and writes none of its own (decision 011),
 * so the test for a question is literal: every string we hold must appear in
 * the state's notice, character for character.
 */

const PAGE_FURNITURE = new Set(["Notice of Referendum Election", "November 3, 2026"]);

const oneLine = (text) => text.replace(/\s+/g, " ").trim();

/** The notice as one line: page headers and page numbers removed, whitespace collapsed. */
export function normalizeNotice(text) {
  return oneLine(
    text
      .replace(/\f/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !/^\d+$/.test(line) && !PAGE_FURNITURE.has(line))
      .join(" "),
  );
}

const quotedFields = (question) => [
  ["title", question.title],
  ["resolution", question.resolution],
  ["ballotText", question.ballotText],
  ...question.explanation.map((paragraph, i) => [`explanation[${i}]`, paragraph]),
  ["yesVote", question.yesVote],
  ["noVote", question.noVote],
];

const STATEMENT_HEADING = "Explanatory statement regarding Question";
const SIGNATURE_BLOCK = "Done in the";

/** The notice's whole explanatory statement for one question, as one line. Null if it has none. */
export function statementFor(number, noticeText) {
  const notice = normalizeNotice(noticeText);
  const heading = `${STATEMENT_HEADING} ${number}:`;
  const start = notice.indexOf(heading);
  if (start < 0) return null;
  const rest = notice.slice(start + heading.length);
  const ends = [rest.indexOf(STATEMENT_HEADING), rest.indexOf(SIGNATURE_BLOCK)].filter((i) => i >= 0);
  return (ends.length > 0 ? rest.slice(0, Math.min(...ends)) : rest).trim();
}

/**
 * What about a question is NOT the state's wording. Empty means all of it is.
 *
 * Three checks, because "this sentence appears somewhere in the notice" is not
 * enough: a dropped paragraph, a sentence cut short, the yes and no sentences
 * swapped, or another question's statement would all pass it.
 *   - a field name: that field is not in the notice word for word
 *   - "statement": the explanation, yes and no sentences, joined in order, are
 *     not the notice's whole statement for THIS question
 *   - "yesNo": the yes or no sentence is not this question's
 */
export function notVerbatim(question, noticeText) {
  const notice = normalizeNotice(noticeText);
  const fields = quotedFields(question)
    .filter(([, text]) => !notice.includes(oneLine(text)))
    .map(([field]) => field);
  const stored = oneLine([...question.explanation, question.yesVote, question.noVote].join(" "));
  const whole = statementFor(question.number, noticeText) === stored;
  const sides =
    question.yesVote.startsWith(`A “yes” vote on Question ${question.number} `) &&
    question.noVote.startsWith(`A “no” vote on Question ${question.number} `);
  return [...fields, ...(whole ? [] : ["statement"]), ...(sides ? [] : ["yesNo"])];
}

const sectionsCited = (text) =>
  new Set([...text.matchAll(/(?:§|section)\s*(\d+)/gi)].map((m) => m[1]));

/** True when a yes or no sentence cites a section number the ballot text does not. */
export function citesAnotherSection(question) {
  const asked = sectionsCited(question.ballotText);
  return [question.yesVote, question.noVote].some((sentence) =>
    [...sectionsCited(sentence)].some((section) => !asked.has(section)),
  );
}

/** A question as the state's referendum listing prints it, with plain quotation marks. */
export const listingText = (question) =>
  `QUESTION ${question.number}: "${question.title}. ${question.ballotText}"`;
