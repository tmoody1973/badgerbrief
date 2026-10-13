/**
 * Daily watch on the pages published positions cite (decision 017).
 *
 * Every morning: list each on-ballot candidate's published position with the
 * page it cites and the sentence it rests on, read each page once, and file a
 * warning when a page has moved, no longer carries the sentence, or cannot be
 * read. New warnings go to the editor in one email. A warning is filed once;
 * it closes itself the day the page reads clean again.
 *
 * Pages are read through context.dev. Of the readers tested it and Firecrawl
 * get past the bot check on every campaign site in the set; context.dev was
 * the editor's choice
 * (docs/evidence/2026-10-13-position-source-audit/reader-comparison.md).
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isOnGeneralBallot } from "./lib/ballot";
import { checkCitation, describeProblem, isWatched, problemSubject, type PageRead } from "./lib/citedPage";
import { emailEditor } from "./lib/notify";

const SCRAPE_URL = "https://api.context.dev/v1/web/scrape";
const READ_TIMEOUT_MS = 20_000;
// Convex stops an action at ten minutes, and a job stopped mid-run tells
// nobody. Stop reading well before that and report what was left unchecked.
const READ_BUDGET_MS = 6 * 60_000;
const GIVE_UP_AFTER = 3; // reads in a row with no answer from the reader
const CLEAN_NOTE = " (read clean again ";
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
 * about, and closes earlier warnings about anything that checked clean today.
 * Returns the messages it filed, for the email.
 *
 * About a position, the editor has been told when a warning on the same
 * subject was filed since the position was last published, whether it is
 * still open or was resolved. So resolving a warning keeps it quiet until the
 * problem becomes a different one or the position is published again;
 * publishing stamps lastReviewedAt (convex/publish.ts), and a problem that
 * survives a fresh review is worth a fresh warning.
 *
 * A clean read ends that. The earlier warning is resolved and marked, and no
 * longer counts as having told anyone: if the page breaks again next week,
 * that is news.
 *
 * A notice about the watch itself (no key, reader down) is filed whenever
 * none is open.
 */
export const recordProblems = internalMutation({
  args: {
    problems: v.array(v.object({ refId: v.string(), refTable: v.optional(v.string()), message: v.string() })),
    clean: v.array(v.string()),
  },
  handler: async (ctx, { problems, clean }): Promise<string[]> => {
    const nowClean = new Set(clean);
    const today = new Date().toISOString().slice(0, 10);
    // ponytail: scans the alerts table, which has no index on kind (about 700
    // rows in October 2026). Add one if this read gets slow.
    const standing: { refId?: string; message: string; resolved: boolean; createdAt: number }[] = [];
    for (const alert of await ctx.db.query("alerts").collect()) {
      if (alert.kind !== ALERT_KIND || alert.message.includes(CLEAN_NOTE)) continue;
      if (alert.refId !== undefined && nowClean.has(alert.refId)) {
        await ctx.db.patch(alert._id, { resolved: true, message: `${alert.message}${CLEAN_NOTE}${today})` });
        continue;
      }
      standing.push({ refId: alert.refId, message: alert.message, resolved: alert.resolved, createdAt: alert.createdAt });
    }

    const filed: string[] = [];
    for (const problem of problems) {
      const positionId = problem.refTable === "candidate_positions_published" ? ctx.db.normalizeId("candidate_positions_published", problem.refId) : null;
      const reviewedAt = positionId ? ((await ctx.db.get(positionId))?.lastReviewedAt ?? 0) : null;
      const told = standing.some(
        (a) =>
          a.refId === problem.refId &&
          (reviewedAt === null ? !a.resolved : a.createdAt >= reviewedAt && problemSubject(a.message) === problemSubject(problem.message)),
      );
      if (told) continue;
      const createdAt = Date.now();
      await ctx.db.insert("alerts", { kind: ALERT_KIND, severity: "warning", ...problem, resolved: false, createdAt });
      standing.push({ refId: problem.refId, message: problem.message, resolved: false, createdAt });
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

const NOTHING = "the page returned nothing";
const PARTIAL = "the reader got only part of the page";

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

    // Half a page is not evidence that a sentence is missing.
    if (field(body, "isPartial") === true) return { ok: false, reason: PARTIAL };
    const markdown = field(body, "markdown");
    const text = field(markdown, "data");
    if (field(markdown, "success") !== true || typeof text !== "string" || text.trim() === "") return { ok: false, reason: NOTHING };
    const landed = field(body, "url");
    return { ok: true, text, landedUrl: typeof landed === "string" ? landed : url };
  } catch (error) {
    return { ok: false, service: true, reason: `context.dev did not answer (${error instanceof Error ? error.message : String(error)})` };
  }
}

/**
 * An empty or partial answer is asked for once more. Nothing else is: a
 * refused key or a timeout will not improve in a second, and a missing page
 * is the one failed read context.dev charges for.
 */
async function readPage(url: string, apiKey: string): Promise<PageRead | ServiceFailure> {
  const first = await readOnce(url, apiKey);
  const worthAnother = !first.ok && !isServiceFailure(first) && (first.reason === NOTHING || first.reason === PARTIAL);
  return worthAnother ? readOnce(url, apiKey) : first;
}

type Filing = { refId: string; refTable?: string; message: string };

/** Records what the sweep found and, if anything is new, tells the editor in one email. */
async function tell(ctx: ActionCtx, problems: Filing[], clean: string[]): Promise<{ fresh: number; emailed: boolean }> {
  const fresh: string[] = await ctx.runMutation(internal.citedPages.recordProblems, { problems, clean });
  if (fresh.length === 0) return { fresh: 0, emailed: false };
  const text = [
    "The daily check of the pages BadgerBrief's published positions cite has something new:",
    "",
    ...fresh.map((message) => `- ${message}`),
    "",
    `Review them at ${ADMIN_URL}`,
    "Each is filed once as a warning. It closes itself when the page reads clean again.",
  ].join("\n");
  const emailed = await emailEditor(`[badgerbrief] cited-page watch: ${fresh.length} new ${fresh.length === 1 ? "warning" : "warnings"}`, text);
  return { fresh: fresh.length, emailed };
}

type SweepResult =
  | { status: "no-key" }
  | { status: "ok"; pages: number; positions: number; unchecked: number; problems: number; fresh: number; emailed: boolean };

export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<SweepResult> => {
    const apiKey = process.env.CONTEXT_DEV_API_KEY;
    if (!apiKey) {
      await tell(ctx, [{ refId: "config", message: "Cited-page watch did not run: CONTEXT_DEV_API_KEY is not set." }], []);
      return { status: "no-key" };
    }

    const all: Citation[] = await ctx.runQuery(internal.citedPages.listCitations, {});
    const citations = all.filter((c) => isWatched(c.url));
    const urls = [...new Set(citations.map((c) => c.url))];

    const started = Date.now();
    let unanswered = 0;
    /** One read, unless the reader has stopped answering or the time is used up. */
    const read = async (url: string, how: typeof readOnce): Promise<PageRead | ServiceFailure> => {
      if (unanswered >= GIVE_UP_AFTER) return { ok: false, service: true, reason: "not tried: the reader had stopped answering" };
      if (Date.now() - started > READ_BUDGET_MS) return { ok: false, service: true, reason: "ran out of time" };
      const result = await how(url, apiKey);
      unanswered = isServiceFailure(result) ? unanswered + 1 : 0;
      return result;
    };

    // One at a time: context.dev's free plan allows a single request at once.
    const reads = new Map<string, PageRead | ServiceFailure>();
    for (const url of urls) reads.set(url, await read(url, readPage));
    // A second look before saying anything is wrong. A reader can be shown a
    // bot check in place of the page, and a warning names one candidate.
    for (const url of urls) {
      const first = reads.get(url);
      if (first?.ok && citations.some((c) => c.url === url && checkCitation(c, first) !== null)) reads.set(url, await read(url, readOnce));
    }

    const results = [...reads.values()];
    const failures = results.filter(isServiceFailure);
    const unreadable = results.filter((r): r is Extract<PageRead, { ok: false }> => !r.ok && !isServiceFailure(r));
    // Most of the pages that answered coming back unreadable in one morning is
    // the reader failing, not the web.
    const readerDown = unreadable.length >= 2 && unreadable.length * 2 > urls.length - failures.length;
    const unchecked = failures.length + (readerDown ? unreadable.length : 0);

    const problems: Filing[] = [];
    // The key is here, so a notice about a missing one is out of date.
    const clean: string[] = ["config"];
    if (unchecked > 0) {
      const why = failures[0]?.reason ?? `most came back unreadable at once (${unreadable[0].reason})`;
      problems.push({ refId: "service", message: `Cited-page watch could not check ${unchecked} of ${urls.length} cited pages: ${why}.` });
    } else {
      clean.push("service");
    }
    let found = 0;
    for (const citation of citations) {
      const result = reads.get(citation.url);
      if (!result || isServiceFailure(result) || (readerDown && !result.ok)) continue;
      const problem = checkCitation(citation, result);
      if (problem) {
        found++;
        problems.push({ refId: citation.positionId, refTable: "candidate_positions_published", message: describeProblem(citation.who, citation.url, problem) });
      } else {
        clean.push(citation.positionId);
      }
    }

    const { fresh, emailed } = await tell(ctx, problems, clean);
    return { status: "ok", pages: urls.length, positions: citations.length, unchecked, problems: found, fresh, emailed };
  },
});
