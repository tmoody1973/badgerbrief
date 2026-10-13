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

type Page =
  | { text: string; landsOn?: string; partial?: true; failed?: true }
  | { status: number; body?: unknown }
  | "nothing"
  | "hang";

/**
 * Stands in for context.dev and Resend. Records every request so tests can see
 * what was asked. A list of pages is served one per read, the last one repeating.
 * `mail` gives Resend's status for each send in turn (200 once the list runs out).
 */
function stubNetwork(pages: Record<string, Page | Page[]>, mail: number[] = []) {
  const reads: { url: string; maxAgeMs: unknown }[] = [];
  const emails: { subject: string; text: string; to: string }[] = [];
  const served = new Map<string, number>();
  let sends = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (input.startsWith("https://api.resend.com/")) {
        const status = mail[sends++] ?? 200;
        if (status !== 200) return Response.json({ message: "try later" }, { status });
        emails.push(body);
        return Response.json({ id: "email-1" });
      }
      if (!input.startsWith("https://api.context.dev/")) throw new Error(`unexpected request to ${input}`);
      reads.push({ url: body.url, maxAgeMs: body.maxAgeMs });
      const entry = pages[body.url] ?? "nothing";
      const n = served.get(body.url) ?? 0;
      served.set(body.url, n + 1);
      const page = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
      if (page === "hang") throw new Error("The operation was aborted due to timeout");
      if (page === "nothing") return Response.json({ url: body.url, markdown: { requested: true, success: false, data: null } });
      if ("status" in page) return Response.json(page.body ?? { error_code: "USAGE_EXCEEDED" }, { status: page.status });
      return Response.json({
        url: page.landsOn ?? body.url,
        markdown: { requested: true, success: !page.failed, data: page.text },
        ...(page.partial ? { isPartial: true } : {}),
      });
    }),
  );
  return { reads, emails, sends: () => sends };
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
    expect(net.emails[0].subject).toBe("[badgerbrief] cited-page watch: 1 new warning");
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

    // Once to look, once more to be sure before saying a sentence is missing.
    expect(net.reads).toHaveLength(2);
    const filed = await alerts(t);
    expect(filed.map((a) => a.refId)).toEqual([gone]);
    expect(filed[0].message).toContain("a / roads: the sentence this summary rests on was not found in today's reading of the cited page");
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
    expect(net.reads).toHaveLength(2); // a refused key is not tried again
    expect(net.emails[0].subject).toBe("[badgerbrief] cited-page watch: 1 new warning");
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
    expect(net.emails).toHaveLength(0); // no mail key in this test either
    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0].message).toContain("CONTEXT_DEV_API_KEY is not set");
  });

  test("without a key, the editor is emailed once, not left to find a row in /admin", async () => {
    const t = setup();
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "test-resend");
    const net = stubNetwork({});

    await t.action(internal.citedPages.sweep, {});
    await t.action(internal.citedPages.sweep, {});

    expect(net.emails).toHaveLength(1);
    expect(net.emails[0].text).toContain("CONTEXT_DEV_API_KEY is not set");
  });

  test("a bot-check screen on the first read is not reported when the second read shows the real page", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "tom-tiffany", ON);
    await publish(t, "tom-tiffany", "education", "https://tomtiffany.com/", "Prepare Kids For Success");
    const net = stubNetwork({ "https://tomtiffany.com/": [{ text: "# Just a moment...\n\nVerifying you are human." }, { text: "#### Prepare Kids For Success" }] });

    const result = await t.action(internal.citedPages.sweep, {});

    expect(net.reads).toHaveLength(2);
    expect(result).toMatchObject({ problems: 0, fresh: 0 });
    expect(await alerts(t)).toHaveLength(0);
  });

  test("a page the reader marks as partial or failed is unreadable, never 'sentence not found'", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c", "d", "e"]) await addCandidate(t, slug, ON);
    await publish(t, "a", "housing", "https://a.example.com/", "We will build homes.");
    await publish(t, "b", "housing", "https://b.example.com/", "We will build homes.");
    for (const slug of ["c", "d", "e"]) await publish(t, slug, "housing", `https://${slug}.example.com/`, "Homes.");
    stubNetwork({
      "https://a.example.com/": { text: "Half a page", partial: true },
      "https://b.example.com/": { text: "An error page", failed: true },
      "https://c.example.com/": { text: "Homes." },
      "https://d.example.com/": { text: "Homes." },
      "https://e.example.com/": { text: "Homes." },
    });

    await t.action(internal.citedPages.sweep, {});

    const messages = (await alerts(t)).map((a) => a.message);
    expect(messages).toHaveLength(2);
    for (const message of messages) expect(message).toContain("the cited page could not be read");
  });

  test("a page that reads clean again closes its warning, so a later real change is reported", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    stubNetwork({ "https://example.com/plan": { text: "Verifying you are human." } });
    await t.action(internal.citedPages.sweep, {});
    await resolveAll(t);

    stubNetwork({ "https://example.com/plan": { text: "We will build homes." } });
    await t.action(internal.citedPages.sweep, {});
    const net = stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });
    const later = await t.action(internal.citedPages.sweep, {});

    expect(later).toMatchObject({ fresh: 1 });
    expect(net.emails).toHaveLength(1);
    const filed = await alerts(t);
    expect(filed).toHaveLength(2);
    expect(filed[0].message).toContain("(read clean again ");
  });

  test("a clean read resolves a warning the editor left open", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } });
    await t.action(internal.citedPages.sweep, {});

    stubNetwork({ "https://example.com/plan": { text: "We will build homes." } });
    await t.action(internal.citedPages.sweep, {});

    expect(await alerts(t)).toMatchObject([{ resolved: true }]);
  });

  test("an open 'could not be read' warning does not hide the sentence going missing", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c"]) await addCandidate(t, slug, ON);
    await publish(t, "a", "housing", "https://a.example.com/", "We will build homes.");
    await publish(t, "b", "housing", "https://b.example.com/", "Homes.");
    await publish(t, "c", "housing", "https://c.example.com/", "Homes.");
    const others = { "https://b.example.com/": { text: "Homes." }, "https://c.example.com/": { text: "Homes." } };
    stubNetwork({ ...others });
    await t.action(internal.citedPages.sweep, {});

    stubNetwork({ ...others, "https://a.example.com/": { text: "We will fix roads." } });
    const next = await t.action(internal.citedPages.sweep, {});

    expect(next).toMatchObject({ fresh: 1 });
    const messages = (await alerts(t)).map((a) => a.message);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("was not found in today's reading");
  });

  test("a resolved 'moved' warning stays quiet when only the landing address differs", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/issues", "We will build homes.");
    stubNetwork({ "https://example.com/issues": { text: "Plan", landsOn: "https://example.com/guid-1" } });
    await t.action(internal.citedPages.sweep, {});
    await resolveAll(t);

    const net = stubNetwork({ "https://example.com/issues": { text: "Plan", landsOn: "https://example.com/guid-2" } });
    const next = await t.action(internal.citedPages.sweep, {});

    expect(next).toMatchObject({ fresh: 0 });
    expect(net.emails).toHaveLength(0);
  });

  test("a notice about the reading service closes itself on a healthy day, so the next outage is announced", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://a.example.com/", "Homes.");
    stubNetwork({ "https://a.example.com/": { status: 503 } });
    await t.action(internal.citedPages.sweep, {}); // notice filed and left open

    stubNetwork({ "https://a.example.com/": { text: "Homes." } });
    await t.action(internal.citedPages.sweep, {});
    const net = stubNetwork({ "https://a.example.com/": { status: 401 } });
    const outage = await t.action(internal.citedPages.sweep, {});

    expect(outage).toMatchObject({ fresh: 1 });
    expect(net.emails).toHaveLength(1);
  });

  test("gives up after three reads in a row get no answer, and says so once", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c", "d", "e"]) {
      await addCandidate(t, slug, ON);
      await publish(t, slug, "housing", `https://${slug}.example.com/`, "Homes.");
    }
    const net = stubNetwork(Object.fromEntries(["a", "b", "c", "d", "e"].map((slug) => [`https://${slug}.example.com/`, "hang" as const])));

    const result = await t.action(internal.citedPages.sweep, {});

    expect(net.reads).toHaveLength(3);
    expect(result).toMatchObject({ unchecked: 5, problems: 0, fresh: 1 });
    const filed = await alerts(t);
    expect(filed).toHaveLength(1);
    expect(filed[0].message).toContain("could not check 5 of 5 cited pages");
  });

  test("stops reading when the morning's time is used up, and counts the rest as unchecked", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c"]) {
      await addCandidate(t, slug, ON);
      await publish(t, slug, "housing", `https://${slug}.example.com/`, "Homes.");
    }
    const net = stubNetwork({ "https://a.example.com/": { text: "Homes." }, "https://b.example.com/": { text: "Homes." }, "https://c.example.com/": { text: "Homes." } });
    // Every read "takes" four minutes.
    const realNow = Date.now.bind(Date);
    let skew = 0;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
    const fetchStub = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (input.startsWith("https://api.context.dev/")) skew += 4 * 60_000;
      return fetchStub(input, init);
    });

    const result = await t.action(internal.citedPages.sweep, {});
    vi.restoreAllMocks();

    expect(net.reads).toHaveLength(2);
    expect(result).toMatchObject({ unchecked: 1 });
    expect((await alerts(t))[0].message).toContain("ran out of time");
  });

  test("a page that is not there is asked for once: a missing page is the one failed read that costs a credit", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c"]) await addCandidate(t, slug, ON);
    await publish(t, "a", "housing", "https://a.example.com/gone", "Homes.");
    await publish(t, "b", "housing", "https://b.example.com/", "Homes.");
    await publish(t, "c", "housing", "https://c.example.com/", "Homes.");
    const net = stubNetwork({ "https://a.example.com/gone": { status: 404, body: {} }, "https://b.example.com/": { text: "Homes." }, "https://c.example.com/": { text: "Homes." } });

    await t.action(internal.citedPages.sweep, {});

    expect(net.reads.filter((r) => r.url === "https://a.example.com/gone")).toHaveLength(1);
    expect((await alerts(t)).map((a) => a.message)).toEqual([expect.stringContaining("a / housing: the cited page could not be read")]);
  });

  test("with some reads refused, judges 'most pages unreadable' against the pages that answered", async () => {
    const t = setup();
    keysOn();
    for (const slug of ["a", "b", "c", "d", "e"]) {
      await addCandidate(t, slug, ON);
      await publish(t, slug, "housing", `https://${slug}.example.com/`, "Homes.");
    }
    stubNetwork({ "https://a.example.com/": { status: 503 }, "https://b.example.com/": { text: "Homes." }, "https://c.example.com/": { status: 429 } });

    const result = await t.action(internal.citedPages.sweep, {});

    // d and e returned nothing: two of the three pages that answered. No page is blamed.
    expect(result).toMatchObject({ unchecked: 4, problems: 0 });
    expect((await alerts(t)).map((a) => a.refId)).toEqual(["service"]);
  });

  test("an email the mail service refuses once is sent on the second try", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    const net = stubNetwork({ "https://example.com/plan": { text: "We will fix roads." } }, [500]);

    const result = await t.action(internal.citedPages.sweep, {});

    expect(result).toMatchObject({ fresh: 1, emailed: true });
    expect(net.sends()).toBe(2);
    expect(net.emails).toHaveLength(1);
  });

  test("the subject counts warnings, in the plural when there are several", async () => {
    const t = setup();
    keysOn();
    await addCandidate(t, "a", ON);
    await publish(t, "a", "housing", "https://example.com/plan", "We will build homes.");
    await publish(t, "a", "roads", "https://example.com/plan", "We will fix roads.");
    const net = stubNetwork({ "https://example.com/plan": { text: "Nothing of the kind." } });

    await t.action(internal.citedPages.sweep, {});

    expect(net.emails[0].subject).toBe("[badgerbrief] cited-page watch: 2 new warnings");
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
