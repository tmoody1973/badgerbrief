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

/** The fields of a question that are NOT word for word in the notice. Empty means all are. */
export function notVerbatim(question, noticeText) {
  const notice = normalizeNotice(noticeText);
  return quotedFields(question)
    .filter(([, text]) => !notice.includes(oneLine(text)))
    .map(([field]) => field);
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
