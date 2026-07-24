/**
 * Pure extraction of the first sentence of a bill's Legislative Reference
 * Bureau analysis from its docs.legis.wisconsin.gov proposal page. No network —
 * the fetching lives in the "use node" action; this is the tested core.
 *
 * The analysis body is a div whose class is `qs_anal_text_` on 2023-and-older
 * pages (one div holding the whole analysis, <br/> line-wraps) or `qsanal_text`
 * on 2025+ pages (one div per paragraph, <span>-wrapped — the first div is the
 * first sentence). Either way the first such div carries the opening sentence.
 * LRB double-spaces after a sentence-ending period, while statutory cites
 * ("s. 20.005") use a single space and decimals ("20.005", "$1.5") have none —
 * so a period followed by 2+ whitespace is the only reliable sentence boundary.
 */
export function parseLrbFirstSentence(html: string): string | null {
  const m = html.match(/<div class="(?:qs_anal_text_|qsanal_text)"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  // Strip tags to nothing (not to a space) so the source spacing — including the
  // double-space after a sentence — survives; a <br/> mid-sentence just rejoins
  // the two halves with the single space that already sat before it.
  const text = m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&sect;/g, "§")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
  const boundary = text.search(/\.\s{2,}/);
  const sentence = boundary === -1 ? text : text.slice(0, boundary + 1);
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return null;
  // Guard against a run-on block with no double-space boundary.
  if (clean.length > 305) return clean.slice(0, 300).replace(/\s+\S*$/, "") + "…";
  return clean;
}
