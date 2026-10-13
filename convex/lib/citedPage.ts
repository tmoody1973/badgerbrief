/**
 * Does the page a published position cites still back it up?
 *
 * Two things can go wrong without anyone editing BadgerBrief: the page moves
 * (the address now lands somewhere else), or the campaign rewrites it and the
 * sentence the summary rests on is gone. Both are checked here, with no
 * network: the caller reads the page and passes the text in.
 *
 * A fingerprint of the whole page is deliberately not used. Campaign home
 * pages change every few days (events, donation banners), and 218 such
 * alerts went unread between July and October 2026.
 */

// Newspaper pages behind a paywall. Only the opening lines are readable, so
// the sentence check cannot work, and reading past the wall is not ours to do.
const UNWATCHED_HOSTS = ["jsonline.com"];

const host = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

function parse(address: string): URL | null {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function isWatched(address: string): boolean {
  const url = parse(address);
  if (!url) return false;
  const h = host(url);
  return !UNWATCHED_HOSTS.some((u) => h === u || h.endsWith(`.${u}`));
}

/** True when both addresses name the same page. http/https, www and a trailing slash do not count as a move. */
export function sameAddress(cited: string, landed: string): boolean {
  const a = parse(cited);
  const b = parse(landed);
  if (!a || !b) return false;
  const path = (url: URL) => url.pathname.replace(/\/+$/, "");
  return host(a) === host(b) && path(a) === path(b) && a.search === b.search;
}

/** Text reduced to lowercase words, so markdown, punctuation and curly quotes cannot hide a match. */
function words(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // a link or image: keep its words, drop its address
    .replace(/[*_]/g, "") // emphasis markers
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Is the stored sentence still on the page? An excerpt may join separate
 * passages ("A ... B"), so it is split at ellipses, line breaks and sentence
 * ends, and every part has to be there.
 */
export function sentenceOnPage(excerpt: string, page: string): "present" | "missing" | "untestable" {
  const parts = excerpt
    .split(/\.{3}|…|[.!?]+\s|\n+/)
    .map(words)
    .filter((part) => part !== "");
  if (parts.length === 0) return "untestable";
  const haystack = ` ${words(page)} `;
  return parts.every((part) => haystack.includes(` ${part} `)) ? "present" : "missing";
}

export type PageRead = { ok: true; text: string; landedUrl: string } | { ok: false; reason: string };

export type Problem =
  | { kind: "moved"; landedUrl: string }
  | { kind: "sentence-gone" }
  | { kind: "unreadable"; reason: string };

/** What, if anything, is wrong with one citation. A move is reported even if the new page still carries the sentence: the link we show is the cited one. */
export function checkCitation(citation: { url: string; excerpt: string }, read: PageRead): Problem | null {
  if (!read.ok) return { kind: "unreadable", reason: read.reason };
  if (!sameAddress(citation.url, read.landedUrl)) return { kind: "moved", landedUrl: read.landedUrl };
  return sentenceOnPage(citation.excerpt, read.text) === "missing" ? { kind: "sentence-gone" } : null;
}

export function describeProblem(who: string, url: string, problem: Problem): string {
  switch (problem.kind) {
    case "moved":
      return `${who}: the cited page now lands somewhere else. Cited: ${url} Lands on: ${problem.landedUrl}`;
    case "sentence-gone":
      return `${who}: the sentence this summary rests on is no longer on the cited page. Cited: ${url}`;
    case "unreadable":
      return `${who}: the cited page could not be read (${problem.reason}). Cited: ${url}`;
  }
}
