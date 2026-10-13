/**
 * Daily watch on the pages published positions cite (decision 017).
 *
 * Every morning: list each on-ballot candidate's published position with the
 * page it cites and the sentence it rests on, read each page once, and file a
 * warning when a page has moved, no longer carries the sentence, or cannot be
 * read. New warnings go to the editor in one email. A warning is filed once
 * and not repeated while it stays open in /admin.
 *
 * Pages are read through context.dev, the one reader tested that gets past
 * the bot check on every campaign site in the set
 * (docs/evidence/2026-10-13-position-source-audit/reader-comparison.md).
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isOnGeneralBallot } from "./lib/ballot";
import { checkCitation, describeProblem, isWatched, type PageRead } from "./lib/citedPage";
import { emailEditor } from "./lib/notify";

const SCRAPE_URL = "https://api.context.dev/v1/web/scrape";
const READ_TIMEOUT_MS = 60_000;
const ALERT_KIND = "cited_page";
const ADMIN_URL = "https://badgerbrief.org/admin";
// ponytail: whole-table reads, as in monitorQueries.stalenessSweep. Fine at
// 125 published positions and about 400 candidates; page through them if
// either table approaches this cap.
const MAX_ROWS = 4000;

type Citation = { positionId: Id<"candidate_positions_published">; who: string; url: string; excerpt: string };

/** Published positions of candidates on the November ballot, each with its cited page and stored sentence. */
export const listCitations = internalQuery({
  args: {},
  handler: async (ctx): Promise<Citation[]> => {
    const candidates = await ctx.db.query("candidates").take(MAX_ROWS);
    const onBallot = new Set(candidates.filter(isOnGeneralBallot).map((c) => c.slug));
    const published = await ctx.db.query("candidate_positions_published").take(MAX_ROWS);
    if (candidates.length === MAX_ROWS || published.length === MAX_ROWS) {
      console.error(`citedPages: a table reached ${MAX_ROWS} rows; some positions are not being watched`);
    }

    const citations: Citation[] = [];
    for (const row of published) {
      // ponytail: first source only. Every published position cites exactly
      // one page today; with several, the sentence could sit on any of them.
      const url = row.sources[0]?.url;
      if (!url || !onBallot.has(row.candidateSlug)) continue;
      const draft = await ctx.db.get(row.draftId);
      citations.push({ positionId: row._id, who: `${row.candidateSlug} / ${row.issueSlug}`, url, excerpt: draft?.evidenceExcerpt ?? "" });
    }
    return citations;
  },
});

/**
 * Files a warning for each problem the editor has not already been told
 * about. Returns the messages it filed, for the email.
 *
 * About a position, the editor has been told when a warning was filed since
 * the position was last published and is either still open, or was resolved
 * and says exactly what this one says. So resolving a warning keeps it quiet
 * until the problem changes or the position is published again; publishing
 * stamps lastReviewedAt (convex/publish.ts), and a problem that survives a
 * fresh review is worth a fresh warning.
 *
 * A notice about the watch itself (no key, reader down) is filed whenever
 * none is open.
 */
export const recordProblems = internalMutation({
  args: {
    problems: v.array(v.object({ refId: v.string(), refTable: v.optional(v.string()), message: v.string() })),
  },
  handler: async (ctx, { problems }): Promise<string[]> => {
    // ponytail: scans the alerts table, which has no index on kind (about 700
    // rows in October 2026). Add one if this read gets slow.
    const past = (await ctx.db.query("alerts").collect())
      .filter((a) => a.kind === ALERT_KIND)
      .map((a) => ({ refId: a.refId, message: a.message, resolved: a.resolved, createdAt: a.createdAt }));

    const filed: string[] = [];
    for (const problem of problems) {
      const positionId = problem.refTable === "candidate_positions_published" ? ctx.db.normalizeId("candidate_positions_published", problem.refId) : null;
      const reviewedAt = positionId ? ((await ctx.db.get(positionId))?.lastReviewedAt ?? 0) : null;
      const told = past.some(
        (a) =>
          a.refId === problem.refId &&
          (reviewedAt === null ? !a.resolved : a.createdAt >= reviewedAt && (!a.resolved || a.message === problem.message)),
      );
      if (told) continue;
      const createdAt = Date.now();
      await ctx.db.insert("alerts", { kind: ALERT_KIND, severity: "warning", ...problem, resolved: false, createdAt });
      past.push({ refId: problem.refId, message: problem.message, resolved: false, createdAt });
      filed.push(problem.message);
    }
    return filed;
  },
});

/** A read that failed because the reading service did, which says nothing about the page. */
type ServiceFailure = { ok: false; service: true; reason: string };

const isServiceFailure = (read: PageRead | ServiceFailure): read is ServiceFailure => "service" in read;

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

async function readOnce(url: string, apiKey: string): Promise<PageRead | ServiceFailure> {
  try {
    const res = await fetch(SCRAPE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // maxAgeMs 0: a fresh read. Left out, context.dev may hand back a copy
      // up to three days old, and a watcher reading old copies sees nothing.
      body: JSON.stringify({ url, formats: { markdown: true }, maxAgeMs: 0 }),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    const code = field(body, "error_code");
    const blocked = code === "WEBSITE_ACCESS_ERROR" || code === "WEBSITE_BLOCKED";
    if (res.status === 404 || (res.status === 400 && blocked)) return { ok: false, reason: "the reader could not open it" };
    if (!res.ok) return { ok: false, service: true, reason: `context.dev answered ${res.status}${typeof code === "string" ? ` ${code}` : ""}` };

    const text = field(field(body, "markdown"), "data");
    if (typeof text !== "string" || text.trim() === "") return { ok: false, reason: "the page returned nothing" };
    const landed = field(body, "url");
    return { ok: true, text, landedUrl: typeof landed === "string" ? landed : url };
  } catch (error) {
    return { ok: false, service: true, reason: `context.dev did not answer (${error instanceof Error ? error.message : String(error)})` };
  }
}

/** One retry: a single bad read should not become a warning in the editor's inbox. */
async function readPage(url: string, apiKey: string): Promise<PageRead | ServiceFailure> {
  const first = await readOnce(url, apiKey);
  return first.ok ? first : readOnce(url, apiKey);
}

type SweepResult =
  | { status: "no-key" }
  | { status: "ok"; pages: number; positions: number; unchecked: number; problems: number; fresh: number; emailed: boolean };

export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<SweepResult> => {
    const apiKey = process.env.CONTEXT_DEV_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.citedPages.recordProblems, {
        problems: [{ refId: "config", message: "Cited-page watch did not run: CONTEXT_DEV_API_KEY is not set." }],
      });
      return { status: "no-key" };
    }

    const all: Citation[] = await ctx.runQuery(internal.citedPages.listCitations, {});
    const citations = all.filter((c) => isWatched(c.url));
    const urls = [...new Set(citations.map((c) => c.url))];

    // One at a time: context.dev's free plan allows a single request at once.
    const reads = new Map<string, PageRead | ServiceFailure>();
    for (const url of urls) reads.set(url, await readPage(url, apiKey));

    const results = [...reads.values()];
    const failures = results.filter(isServiceFailure);
    const unreadable = results.filter((r): r is Extract<PageRead, { ok: false }> => !r.ok && !isServiceFailure(r));
    // Most pages unreadable in one morning is the reader failing, not the web.
    const readerDown = unreadable.length >= 2 && unreadable.length * 2 > urls.length;
    const unchecked = failures.length + (readerDown ? unreadable.length : 0);

    const problems: { refId: string; refTable?: string; message: string }[] = [];
    if (unchecked > 0) {
      const why = failures[0]?.reason ?? `most came back unreadable at once (${unreadable[0].reason})`;
      problems.push({ refId: "service", message: `Cited-page watch could not check ${unchecked} of ${urls.length} cited pages: ${why}.` });
    }
    for (const citation of citations) {
      const read = reads.get(citation.url);
      if (!read || isServiceFailure(read) || (readerDown && !read.ok)) continue;
      const problem = checkCitation(citation, read);
      if (problem) {
        problems.push({ refId: citation.positionId, refTable: "candidate_positions_published", message: describeProblem(citation.who, citation.url, problem) });
      }
    }

    const fresh: string[] = problems.length > 0 ? await ctx.runMutation(internal.citedPages.recordProblems, { problems }) : [];
    const found = problems.length - (unchecked > 0 ? 1 : 0);
    let emailed = false;
    if (fresh.length > 0) {
      const subject = `[badgerbrief] ${fresh.length} cited ${fresh.length === 1 ? "page needs" : "pages need"} a look`;
      const text = [
        "The daily check of the pages BadgerBrief's published positions cite found something new:",
        "",
        ...fresh.map((message) => `- ${message}`),
        "",
        `Review and resolve them at ${ADMIN_URL}`,
        "Each is filed once as a warning and is not sent again while it stays open.",
      ].join("\n");
      emailed = await emailEditor(subject, text);
    }
    return { status: "ok", pages: urls.length, positions: citations.length, unchecked, problems: found, fresh: fresh.length, emailed };
  },
});
