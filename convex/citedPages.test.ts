import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);
type T = ReturnType<typeof setup>;

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const OFF = { onBallot: false, source: SOURCE };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function addCandidate(t: T, slug: string, general: typeof ON | typeof OFF) {
  await t.run((ctx) => ctx.db.insert("candidates", { slug, raceId: "WI-GOV-2026", name: slug, sources: [], dataAsOf: "2026-10-13", general }));
}

async function publish(t: T, candidateSlug: string, issueSlug: string, url: string, evidenceExcerpt?: string) {
  return t.run(async (ctx) => {
    const row = {
      candidateSlug,
      raceId: "WI-GOV-2026",
      issueSlug,
      stance: "support" as const,
      summary: "A summary.",
      confidence: 0.9,
      sources: [{ name: "Campaign site", url }],
    };
    const draftId = await ctx.db.insert("candidate_positions_drafts", { ...row, evidenceExcerpt, reviewStatus: "approved" as const, extractedAt: 1 });
    return ctx.db.insert("candidate_positions_published", { ...row, draftId, publishedAt: 1, lastReviewedAt: 1 });
  });
}

type Page = { text: string; landsOn?: string } | { status: number; body?: unknown } | "nothing";

/** Stands in for context.dev and Resend. Records every request so tests can see what was asked. */
function stubNetwork(pages: Record<string, Page>) {
  const reads: { url: string; maxAgeMs: unknown }[] = [];
  const emails: { subject: string; text: string; to: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (input.startsWith("https://api.resend.com/")) {
        emails.push(body);
        return Response.json({ id: "email-1" });
      }
      if (!input.startsWith("https://api.context.dev/")) throw new Error(`unexpected request to ${input}`);
      reads.push({ url: body.url, maxAgeMs: body.maxAgeMs });
      const page = pages[body.url] ?? "nothing";
      if (page === "nothing") return Response.json({ url: body.url, markdown: { requested: true, success: false, data: null } });
      if ("status" in page) return Response.json(page.body ?? { error_code: "USAGE_EXCEEDED" }, { status: page.status });
      return Response.json({ url: page.landsOn ?? body.url, markdown: { requested: true, success: true, data: page.text } });
    }),
  );
  return { reads, emails };
}

const alerts = (t: T) => t.run((ctx) => ctx.db.query("alerts").collect());

/** What the editor does in /admin: marks every open alert resolved. */
const resolveAll = (t: T) =>
  t.run(async (ctx) => {
    for (const alert of await ctx.db.query("alerts").collect()) await ctx.db.patch(alert._id, { resolved: true });
  });

function keysOn() {
  vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
  vi.stubEnv("RESEND_API_KEY", "test-resend");
}

describe("citedPages.listCitations", () => {
  test("returns each on-ballot candidate's published position with its page and stored sentence", async () => {
    const t = setup();
    await addCandidate(t, "on-ballot", ON);
    await addCandidate(t, "lost-primary", OFF);
    const id = await publish(t, "on-ballot", "housing", "https://example.com/plan", "We will build homes.");
    await publish(t, "lost-primary", "housing", "https://example.org/plan", "We will build homes.");

    const out = await t.query(internal.citedPages.listCitations, {});

    expect(out).toEqual([{ positionId: id, who: "on-ballot / housing", url: "https://example.com/plan", excerpt: "We will build homes." }]);
  });

  test("a position stored without a sentence comes back with an empty one", async () => {
    const t = setup();
    await addCandidate(t, "on-ballot", ON);
    await publish(t, "on-ballot", "housing", "https://example.com/plan");

    const out = await t.query(internal.citedPages.listCitations, {});

    expect(out).toMatchObject([{ excerpt: "" }]);
  });
});

describe("citedPages.sweep", () => {
  test("files one warning and sends one email when a cited page lands somewhere else", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "david-crowley", ON);
    const id = await publish(t, "david-crowley", "abortion", "https://www.crowleyforwi.com/issues", "He will protect access.");
    const net = stubNetwork({ "https://www.crowleyforwi.com/issues": { text: "David's Plan", landsOn: "https://www.crowleyforwi.com/9d027b3e" } });

    const result = await t.action(internal.citedPages.sweep, {});

    expect(result).toMatchObject({ status: "ok", pages: 1, problems: 1, fresh: 1 });
    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0]).toMatchObject({ kind: "cited_page", severity: "warning", refTable: "candidate_positions_published", refId: id, resolved: false });
    expect(filed[0].message).toContain("david-crowley / abortion: the cited page now lands somewhere else");
    expect(net.emails).toHaveLength(1);
    expect(net.emails[0].subject).toBe("[badgerbrief] 1 cited page needs a look");
    expect(net.emails[0].text).toContain("david-crowley / abortion");
    expect(net.emails[0].text).toContain("https://badgerbrief.org/admin");
  });

  test("always asks for a fresh copy of the page, never a saved one", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will build homes." } });

    await t.action(internal.citedPages.sweep, {});

    expect(net.reads).toEqual([{ url: "https://example.com/plan", maxAgeMs: 0 }]);
  });

  test("a page that still says it raises nothing and sends nothing", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "## Housing\n\nWe will **build homes**." } });

    const result = await t.action(internal.citedPages.sweep, {});

    expect(result).toMatchObject({ status: "ok", problems: 0, fresh: 0 });
    expect(await alerts(t)).toHaveLength(0);
    expect(net.emails).toHaveLength(0);
  });

  test("the same problem on the next day is not filed or emailed again", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });

    await t.action(internal.citedPages.sweep, {});
    const second = await t.action(internal.citedPages.sweep, {});

    expect(second).toMatchObject({ problems: 1, fresh: 0 });
    expect(await alerts(t)).toHaveLength(1);
    expect(net.emails).toHaveLength(1);
  });

  test("a warning the editor resolved stays quiet while nothing has changed", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });

    await t.action(internal.citedPages.sweep, {});
    await resolveAll(t);
    const next = await t.action(internal.citedPages.sweep, {});

    expect(next).toMatchObject({ problems: 1, fresh: 0 });
    expect(await alerts(t)).toHaveLength(1);
    expect(net.emails).toHaveLength(1);
  });

  test("a resolved warning is filed again when the problem itself changes", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });
    await t.action(internal.citedPages.sweep, {});
    await resolveAll(t);

    const net = stubNetwork({ "https://example.com/plan": { text: "Moved.", landsOn: "https://example.com/new-plan" } });
    const next = await t.action(internal.citedPages.sweep, {});

    expect(next).toMatchObject({ fresh: 1 });
    expect(await alerts(t)).toHaveLength(2);
    expect(net.emails).toHaveLength(1);
  });

  test("after the position is published again, a problem that remains is filed afresh", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    const id = await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });
    await t.action(internal.citedPages.sweep, {});

    // Publishing a replacement keeps the row and stamps it as reviewed now (convex/publish.ts).
    await t.run(async (ctx) => {
      const [first] = await ctx.db.query("alerts").collect();
      await ctx.db.patch(id, { lastReviewedAt: first.createdAt + 1 });
    });
    const next = await t.action(internal.citedPages.sweep, {});

    expect(next).toMatchObject({ fresh: 1 });
    expect(await alerts(t)).toHaveLength(2);
    expect(net.emails).toHaveLength(2);
  });

  test("a resolved notice about the reading service is filed again at the next outage", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://a.example.com/", "Homes.");
    stubNetwork({ "https://a.example.com/": { status: 503 } });
    await t.action(internal.citedPages.sweep, {});
    await resolveAll(t);

    await t.action(internal.citedPages.sweep, {});

    expect(await alerts(t)).toHaveLength(2);
  });

  test("reads a page shared by two positions once, and judges each position on its own sentence", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const gone = await publish(t, "a", "roads", "https://example.com/plan", "We will fix roads.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will build homes." } });

    await t.action(internal.citedPages.sweep, {});

    expect(net.reads).toHaveLength(1);
    const filed = await alerts(t);
    expect(filed.map((a) => a.refId)).toEqual([gone]);
    expect(filed[0].message).toContain("a / roads: the sentence this summary rests on is no longer on the cited page");
  });

  test("never reads a newspaper page behind a paywall", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "immigration", "https://www.jsonline.com/story/x", "A reported sentence.");
    const net = stubNetwork({});

    const result = await t.action(internal.citedPages.sweep, {});

    expect(net.reads).toHaveLength(0);
    expect(result).toMatchObject({ status: "ok", pages: 0, problems: 0 });
    expect(await alerts(t)).toHaveLength(0);
  });

  test("a page that keeps returning nothing is tried twice, then filed as unreadable", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await addCandidate(t, "b", ON);
    await addCandidate(t, "c", ON);
    await publish(t, "a", "housing", "https://gone.example.com/plan", "We will build homes.");
    await publish(t, "b", "housing", "https://b.example.com/", "Homes for all.");
    await publish(t, "c", "housing", "https://c.example.com/", "Homes for some.");
    const net = stubNetwork({ "https://b.example.com/": { text: "Homes for all." }, "https://c.example.com/": { text: "Homes for some." } });

    await t.action(internal.citedPages.sweep, {});

    expect(net.reads.filter((r) => r.url === "https://gone.example.com/plan")).toHaveLength(2);
    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0].message).toContain("a / housing: the cited page could not be read");
  });

  test("when the reading service itself refuses, files one notice about the service and blames no page", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await addCandidate(t, "b", ON);
    await publish(t, "a", "housing", "https://a.example.com/", "Homes.");
    await publish(t, "b", "housing", "https://b.example.com/", "Homes.");
    const net = stubNetwork({ "https://a.example.com/": { status: 401 }, "https://b.example.com/": { status: 401 } });

    const result = await t.action(internal.citedPages.sweep, {});

    expect(result).toMatchObject({ status: "ok", unchecked: 2, problems: 0 });
    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0]).toMatchObject({ kind: "cited_page", refId: "service" });
    expect(filed[0].message).toContain("could not check 2 of 2 cited pages");
    expect(filed[0].message).toContain("USAGE_EXCEEDED");
    expect(net.emails).toHaveLength(1);
  });

  test("when most pages come back unreadable at once, treats it as the service failing, not the pages", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c"]) {
      await addCandidate(t, slug, ON);
      await publish(t, slug, "housing", `https://${slug}.example.com/`, "Homes.");
    }
    stubNetwork({ "https://c.example.com/": { text: "Homes." } });

    await t.action(internal.citedPages.sweep, {});

    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0].refId).toBe("service");
  });

  test("without a key, files one notice and reads nothing", async () => {
    const t = setup();
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({});

    const first = await t.action(internal.citedPages.sweep, {});
    await t.action(internal.citedPages.sweep, {});

    expect(first).toEqual({ status: "no-key" });
    expect(net.reads).toHaveLength(0);
    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0].message).toContain("CONTEXT_DEV_API_KEY is not set");
  });

  test("still files the warning when the email cannot be sent", async () => {
    const t = setup();
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    vi.stubEnv("RESEND_API_KEY", "");
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });

    const result = await t.action(internal.citedPages.sweep, {});

    expect(result).toMatchObject({ fresh: 1, emailed: false });
    expect(await alerts(t)).toHaveLength(1);
    expect(net.emails).toHaveLength(0);
  });
});
