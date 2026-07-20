# Campaign-Site Mapping Implementation Plan (MOO-326)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover each candidate's own-domain policy subpages via Firecrawl `/map` and auto-register them as extraction sources, so the Research Agent reads more than the homepage.

**Architecture:** A new daily cron action maps every candidate's `campaign_website` with Firecrawl `/v2/map`, filters the returned links to same-registrable-domain policy-shaped paths with a pure helper module, and idempotently registers the survivors as `article_sources` rows with `status:"approved"` and a new `sourceKind:"campaign_site"` discriminator. `listResearchTargets` reads that discriminator so registered subpages inherit campaign-site citation labels and the existing own-site extraction prompt. Everything downstream (hash short-circuit, rotation, fetch logs, drafts → human review → publish) is untouched.

**Tech Stack:** Convex (internalAction/internalMutation/internalQuery, crons), plain `fetch` against `api.firecrawl.dev/v2/map` (no SDK — repo constraint), Vitest (convex-test + node-env pure tests).

**Contract:** Linear MOO-326.

## Global Constraints

- **Own-domain only.** Off-domain links are NEVER auto-registered — dropped silently. Same-site = exact host or subdomain of the registered homepage's base domain, with a leading `www.` stripped from the base (verified: `crowleyforwi.com` is registered but `/map` returns `www.crowleyforwi.com`).
- **Cap ≤10 subpages per candidate**, deterministic ordering: shallower paths first, then alphabetical, so `/policy` always beats `/policy/veterans` when the cap bites (verified: francescahong.com has 11 policy-shaped URLs).
- **Policy paths match by exact first path segment**, case-insensitive: `policy`, `issues`, `plan`, `platform`, `priorities`, about`. Children of a matching first segment also match (`/policy/veterans` ✓). Deliberate deviation from a naive prefix match: `store.francescahong.com/about-us` and `/badger-basics` must NOT register. Record this in the plan's test cases.
- **The homepage itself is never registered as a subpage** (it is already a `listResearchTargets` target from `candidates.socialMedia.campaign_website`).
- **Idempotent:** re-running the mapper must not create duplicate rows. Dedup on `article_sources.by_url`.
- **No agent prompt/model change.** `buildExtractionPrompt`'s existing `campaign_site` branch is reused verbatim → **eval gate NOT required** per `docs/eval-gate.md`.
- Existing `article_sources` rows have no `sourceKind`; the new field is `v.optional(...)` and `undefined` must continue to mean `"article"`.
- Convex: read `convex/_generated/ai/guidelines.md` before writing Convex code. Plain `fetch`, no Firecrawl SDK. `FIRECRAWL_API_KEY` read at call time inside the action, never at import time.
- Commits straight to `main`. Deploy `npx convex deploy -y` before `npx vercel deploy --prod --yes`.

**Verified Firecrawl `/v2/map` contract** (probed live 2026-07-19):
Request `POST https://api.firecrawl.dev/v2/map`, headers `Authorization: Bearer <key>`, `Content-Type: application/json`, body `{"url": "<site>", "limit": <n>}`.
Response `{"success": true, "id": "<uuid>", "links": [{"url": "...", "title"?: "...", "description"?: "..."}]}`.

---

### Task 1: Pure filter module `campaignMap.ts`

**Files:**
- Create: `convex/lib/campaignMap.ts`
- Test: `convex/lib/campaignMap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `selectPolicySubpages({ homepageUrl, links, cap }): string[]` and the helpers `baseDomain(url): string | null`, `isSameSite(homepageUrl, url): boolean`, `isPolicyPath(url): boolean`. Task 3 (the action) and Task 4 (registration) import `selectPolicySubpages`.

- [ ] **Step 1: Write the failing test**

Create `convex/lib/campaignMap.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  baseDomain,
  isPolicyPath,
  isSameSite,
  selectPolicySubpages,
} from "./campaignMap";

describe("baseDomain", () => {
  it("strips www and lowercases", () => {
    expect(baseDomain("https://www.crowleyforwi.com")).toBe("crowleyforwi.com");
    expect(baseDomain("https://FrancescaHong.com/policy")).toBe("francescahong.com");
  });

  it("returns null for non-http(s) and unparseable input", () => {
    expect(baseDomain("javascript:alert(1)")).toBeNull();
    expect(baseDomain("not a url")).toBeNull();
  });
});

describe("isSameSite", () => {
  const home = "https://crowleyforwi.com";

  it("accepts the bare domain and www (map returns www even when bare is registered)", () => {
    expect(isSameSite(home, "https://crowleyforwi.com/Plan")).toBe(true);
    expect(isSameSite(home, "https://www.crowleyforwi.com/Plan")).toBe(true);
  });

  it("accepts other subdomains of the same registrable domain", () => {
    expect(isSameSite("https://francescahong.com", "https://store.francescahong.com/goods")).toBe(true);
  });

  it("rejects lookalike and suffix-attack domains", () => {
    expect(isSameSite(home, "https://crowleyforwi.com.evil.com/Plan")).toBe(false);
    expect(isSameSite(home, "https://evilcrowleyforwi.com/Plan")).toBe(false);
    expect(isSameSite(home, "https://actblue.com/donate/crowleyforwi.com")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(isSameSite(home, "mailto:info@crowleyforwi.com")).toBe(false);
  });
});

describe("isPolicyPath", () => {
  it("accepts policy-shaped first segments, case-insensitively", () => {
    expect(isPolicyPath("https://x.com/Plan")).toBe(true);
    expect(isPolicyPath("https://x.com/issues")).toBe(true);
    expect(isPolicyPath("https://x.com/POLICY/")).toBe(true);
  });

  it("accepts children of a policy segment", () => {
    expect(isPolicyPath("https://x.com/policy/veterans")).toBe(true);
  });

  it("rejects segments that merely start with a keyword", () => {
    expect(isPolicyPath("https://store.x.com/about-us")).toBe(false);
    expect(isPolicyPath("https://x.com/badger-basics")).toBe(false);
    expect(isPolicyPath("https://x.com/planning-a-visit")).toBe(false);
  });

  it("rejects the homepage, sitemaps, and non-policy pages", () => {
    expect(isPolicyPath("https://x.com")).toBe(false);
    expect(isPolicyPath("https://x.com/")).toBe(false);
    expect(isPolicyPath("https://x.com/sitemap.xml")).toBe(false);
    expect(isPolicyPath("https://x.com/volunteer")).toBe(false);
  });
});

describe("selectPolicySubpages", () => {
  // Real /map output shapes, captured 2026-07-19.
  it("picks Crowley's policy pages and drops the rest", () => {
    const links = [
      "https://www.crowleyforwi.com/Plan",
      "https://www.crowleyforwi.com",
      "https://www.crowleyforwi.com/badger-basics",
      "https://www.crowleyforwi.com/sitemap.xml",
      "https://www.crowleyforwi.com/events",
      "https://www.crowleyforwi.com/issues",
      "https://www.crowleyforwi.com/privacy",
      "https://www.crowleyforwi.com/volunteer",
    ];
    expect(
      selectPolicySubpages({ homepageUrl: "https://crowleyforwi.com", links, cap: 10 }),
    ).toEqual([
      "https://www.crowleyforwi.com/Plan",
      "https://www.crowleyforwi.com/issues",
    ]);
  });

  it("never registers the homepage itself, in any spelling", () => {
    const out = selectPolicySubpages({
      homepageUrl: "https://crowleyforwi.com",
      links: ["https://crowleyforwi.com", "https://www.crowleyforwi.com/", "https://crowleyforwi.com/plan"],
      cap: 10,
    });
    expect(out).toEqual(["https://crowleyforwi.com/plan"]);
  });

  it("drops off-domain links (ActBlue, socials)", () => {
    const out = selectPolicySubpages({
      homepageUrl: "https://crowleyforwi.com",
      links: [
        "https://secure.actblue.com/donate/crowley/issues",
        "https://twitter.com/crowley/plan",
        "https://crowleyforwi.com/issues",
      ],
      cap: 10,
    });
    expect(out).toEqual(["https://crowleyforwi.com/issues"]);
  });

  it("caps at N, preferring shallower paths then alphabetical", () => {
    const links = [
      "https://francescahong.com/policy/veterans",
      "https://francescahong.com/policy/universal-childcare",
      "https://francescahong.com/policy",
      "https://francescahong.com/policy/firewall",
    ];
    expect(
      selectPolicySubpages({ homepageUrl: "https://francescahong.com", links, cap: 2 }),
    ).toEqual([
      "https://francescahong.com/policy",
      "https://francescahong.com/policy/firewall",
    ]);
  });

  it("dedups the same page seen twice (trailing slash, scheme)", () => {
    const out = selectPolicySubpages({
      homepageUrl: "https://francescahong.com",
      links: [
        "https://francescahong.com/policy",
        "https://francescahong.com/policy/",
        "http://francescahong.com/policy",
      ],
      cap: 10,
    });
    expect(out).toHaveLength(1);
  });

  it("returns [] when the homepage is unparseable", () => {
    expect(selectPolicySubpages({ homepageUrl: "nonsense", links: ["https://x.com/policy"], cap: 10 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/campaignMap.test.ts`
Expected: FAIL — cannot resolve `./campaignMap`.

- [ ] **Step 3: Write the implementation**

Create `convex/lib/campaignMap.ts`:

```ts
/**
 * Own-domain policy-subpage selection for the campaign-site mapper (MOO-326).
 *
 * Pure string/URL logic so it unit-tests without Convex or network. The
 * same-site rule mirrors isAllowedUrl's hostname-suffix pattern in
 * scoutParse.ts (no PSL dependency) — a suffix check is safe here because we
 * compare against a domain we already trust, not a user-supplied one.
 */

/** Policy-shaped FIRST path segments. Matched exactly, not as prefixes. */
const POLICY_SEGMENTS = ["policy", "policies", "issues", "plan", "plans", "platform", "priorities", "about"];

/** Registrable-ish domain of a URL: lowercased host with a leading "www." removed. */
export function baseDomain(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

/** True when url is the campaign's own domain or a subdomain of it. */
export function isSameSite(homepageUrl: string, url: string): boolean {
  const home = baseDomain(homepageUrl);
  const host = baseDomain(url);
  if (!home || !host) return false;
  return host === home || host.endsWith(`.${home}`);
}

/** True when the URL's first path segment is policy-shaped (children included). */
export function isPolicyPath(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false; // homepage
  return POLICY_SEGMENTS.includes(segments[0].toLowerCase());
}

/** Identity of a page for dedup: host+path, scheme- and trailing-slash-insensitive. */
function pageKey(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${path.toLowerCase()}`;
}

/**
 * Own-domain, policy-shaped subpages from a /map result, deduped and capped.
 * Order: shallower paths first, then alphabetical — so /policy survives the
 * cap ahead of /policy/veterans.
 */
export function selectPolicySubpages({
  homepageUrl,
  links,
  cap,
}: {
  homepageUrl: string;
  links: string[];
  cap: number;
}): string[] {
  if (!baseDomain(homepageUrl)) return [];
  const homeKey = (() => {
    try {
      return pageKey(homepageUrl);
    } catch {
      return null;
    }
  })();

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const link of links) {
    if (!isSameSite(homepageUrl, link) || !isPolicyPath(link)) continue;
    let key: string;
    try {
      key = pageKey(link);
    } catch {
      continue;
    }
    if (key === homeKey || seen.has(key)) continue;
    seen.add(key);
    kept.push(link);
  }

  return kept
    .sort((a, b) => {
      const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
      return depth(a) - depth(b) || a.localeCompare(b);
    })
    .slice(0, cap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/campaignMap.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/campaignMap.ts convex/lib/campaignMap.test.ts
git commit -m "feat: own-domain policy-subpage selection helper (MOO-326)"
```

---

### Task 2: Schema `sourceKind` + `listResearchTargets` wiring

**Files:**
- Modify: `convex/schema.ts:304-322` (`article_sources` table)
- Modify: `convex/researchQueries.ts:16-55` (`listResearchTargets`)
- Test: `convex/researchQueries.test.ts` (add cases to the existing `listResearchTargets` describe at line 35)

**Interfaces:**
- Consumes: nothing new.
- Produces: `article_sources.sourceKind?: "article" | "campaign_site"` (undefined ⇒ `"article"`). Task 4 writes it; `listResearchTargets` reads it and emits campaign-site semantics (no `outlet`, so `saveExtraction` labels citations with the candidate name).

- [ ] **Step 1: Add the schema field**

In `convex/schema.ts`, inside the `article_sources` table definition, add after the `outlet` line:

```ts
    // MOO-326: own-site policy subpages auto-registered by the campaign-site
    // mapper. Undefined means "article" — every pre-MOO-326 row.
    sourceKind: v.optional(
      v.union(v.literal("article"), v.literal("campaign_site")),
    ),
```

- [ ] **Step 2: Write the failing test**

In `convex/researchQueries.test.ts`, inside the existing `describe("listResearchTargets", ...)` block, add:

```ts
  it("emits campaign_site semantics for auto-registered own-site subpages", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        ...baseCandidate,
        slug: "david-crowley",
        name: "David Crowley",
        raceId: "wi-gov-2026",
        socialMedia: { campaign_website: "https://crowleyforwi.com" },
      });
      await ctx.db.insert("article_sources", {
        ...baseSource,
        candidateSlug: "david-crowley",
        raceId: "wi-gov-2026",
        url: "https://www.crowleyforwi.com/Plan",
        outlet: "David Crowley",
        sourceKind: "campaign_site",
        status: "approved",
      });
    });

    const targets = await t.query(internal.researchQueries.listResearchTargets, {});
    const plan = targets.find((x) => x.url === "https://www.crowleyforwi.com/Plan");
    expect(plan).toBeDefined();
    expect(plan!.sourceKind).toBe("campaign_site");
    expect(plan!.outlet).toBeUndefined();
  });

  it("treats a sourceKind-less row as an article (back-compat)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        ...baseCandidate,
        slug: "david-crowley",
        name: "David Crowley",
        raceId: "wi-gov-2026",
      });
      await ctx.db.insert("article_sources", {
        ...baseSource,
        candidateSlug: "david-crowley",
        raceId: "wi-gov-2026",
        url: "https://urbanmilwaukee.com/story",
        outlet: "Urban Milwaukee",
        status: "approved",
      });
    });

    const targets = await t.query(internal.researchQueries.listResearchTargets, {});
    const story = targets.find((x) => x.url === "https://urbanmilwaukee.com/story");
    expect(story!.sourceKind).toBe("article");
    expect(story!.outlet).toBe("Urban Milwaukee");
  });
```

Note: match the existing file's `setup()`, `baseCandidate`, and `baseSource` fixture names and the `internal` import already present at the top of that test file. If `baseCandidate` lacks `socialMedia`, spreading it with an explicit `socialMedia` (as above) is correct.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/researchQueries.test.ts`
Expected: FAIL — the campaign_site case reports `sourceKind: "article"` and `outlet: "David Crowley"`.

- [ ] **Step 4: Wire `listResearchTargets`**

In `convex/researchQueries.ts`, replace the approved-articles loop with:

```ts
    for (const a of approvedArticles) {
      const name = nameBySlug.get(a.candidateSlug);
      if (!name) continue; // orphaned row (candidate removed) — skip rather than emit a bad target
      // MOO-326: own-site subpages carry the campaign-site prompt + citation
      // label (the candidate, not an outlet). Legacy rows have no sourceKind.
      const kind = a.sourceKind ?? "article";
      targets.push({
        slug: a.candidateSlug,
        name,
        raceId: a.raceId,
        url: a.url,
        sourceKind: kind,
        outlet: kind === "article" ? a.outlet : undefined,
      });
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex/researchQueries.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/researchQueries.ts convex/researchQueries.test.ts
git commit -m "feat: article_sources.sourceKind discriminator, campaign_site targets (MOO-326)"
```

---

### Task 3: `fetchFirecrawlMap` + idempotent registration mutation

**Files:**
- Modify: `convex/research.ts` (add `fetchFirecrawlMap` beside `fetchFirecrawlMarkdown` at ~line 74-102)
- Modify: `convex/researchQueries.ts` (add `listMapTargets` internalQuery + `registerCampaignSubpages` internalMutation)
- Test: `convex/researchQueries.test.ts` (new describe for registration)

**Interfaces:**
- Consumes: `selectPolicySubpages` (Task 1), `sourceKind` (Task 2).
- Produces: `fetchFirecrawlMap(url, limit): Promise<MapResult>` where `MapResult = { ok: true; links: string[] } | { ok: false; error: string }`; `internal.researchQueries.listMapTargets` → `{ slug, name, raceId, homepageUrl }[]`; `internal.researchQueries.registerCampaignSubpages({ candidateSlug, raceId, candidateName, urls })` → `{ registered: number; skipped: number }`. Task 4's action calls all three.

- [ ] **Step 1: Add the Firecrawl map wrapper**

In `convex/research.ts`, directly after `fetchFirecrawlMarkdown`, add:

```ts
export type MapResult =
  | { ok: true; links: string[] }
  | { ok: false; error: string };

/**
 * Firecrawl /v2/map — URL discovery only, no LLM, no markdown. Sibling of
 * fetchFirecrawlMarkdown because the response shape differs entirely
 * ({links:[{url,title?,description?}]} vs markdown).
 */
export async function fetchFirecrawlMap(
  url: string,
  limit: number,
): Promise<MapResult> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, limit }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return { ok: false, error: `map http ${res.status}` };
    }
    const body = (await res.json()) as {
      success?: boolean;
      links?: { url?: string }[];
    };
    if (!body.success || !Array.isArray(body.links)) {
      return { ok: false, error: "map returned no links" };
    }
    const links = body.links
      .map((l) => l.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    return { ok: true, links };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 2: Write the failing registration test**

In `convex/researchQueries.test.ts`, add a new top-level describe:

```ts
describe("registerCampaignSubpages", () => {
  it("registers own-site subpages as approved campaign_site rows", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        ...baseCandidate,
        slug: "david-crowley",
        name: "David Crowley",
        raceId: "wi-gov-2026",
        socialMedia: { campaign_website: "https://crowleyforwi.com" },
      });
    });

    const result = await t.mutation(internal.researchQueries.registerCampaignSubpages, {
      candidateSlug: "david-crowley",
      raceId: "wi-gov-2026",
      candidateName: "David Crowley",
      urls: ["https://www.crowleyforwi.com/Plan", "https://www.crowleyforwi.com/issues"],
    });
    expect(result).toEqual({ registered: 2, skipped: 0 });

    const rows = await t.run(async (ctx) => ctx.db.query("article_sources").collect());
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].sourceKind).toBe("campaign_site");
    expect(rows[0].outlet).toBe("David Crowley");
  });

  it("is idempotent — re-registering the same URLs adds nothing", async () => {
    const t = setup();
    const args = {
      candidateSlug: "david-crowley",
      raceId: "wi-gov-2026",
      candidateName: "David Crowley",
      urls: ["https://www.crowleyforwi.com/Plan"],
    };
    await t.mutation(internal.researchQueries.registerCampaignSubpages, args);
    const second = await t.mutation(internal.researchQueries.registerCampaignSubpages, args);

    expect(second).toEqual({ registered: 0, skipped: 1 });
    const rows = await t.run(async (ctx) => ctx.db.query("article_sources").collect());
    expect(rows).toHaveLength(1);
  });

  it("never resurrects a URL an editor rejected", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("article_sources", {
        ...baseSource,
        candidateSlug: "david-crowley",
        raceId: "wi-gov-2026",
        url: "https://www.crowleyforwi.com/Plan",
        status: "rejected",
      });
    });

    const result = await t.mutation(internal.researchQueries.registerCampaignSubpages, {
      candidateSlug: "david-crowley",
      raceId: "wi-gov-2026",
      candidateName: "David Crowley",
      urls: ["https://www.crowleyforwi.com/Plan"],
    });

    expect(result).toEqual({ registered: 0, skipped: 1 });
    const rows = await t.run(async (ctx) => ctx.db.query("article_sources").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("rejected");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/researchQueries.test.ts`
Expected: FAIL — `registerCampaignSubpages` is not a function on `internal.researchQueries`.

- [ ] **Step 4: Implement the query + mutation**

In `convex/researchQueries.ts`, add:

```ts
/** Candidates with a registered campaign website — the mapper's work list. */
export const listMapTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db.query("candidates").collect();
    const targets: {
      slug: string;
      name: string;
      raceId: string;
      homepageUrl: string;
    }[] = [];
    for (const c of candidates) {
      const homepageUrl = c.socialMedia?.campaign_website;
      if (homepageUrl) {
        targets.push({ slug: c.slug, name: c.name, raceId: c.raceId, homepageUrl });
      }
    }
    return targets;
  },
});

/**
 * Idempotently register own-site policy subpages as approved extraction
 * sources (MOO-326). Own-domain subpages inherit the homepage's trust class,
 * so they skip per-URL human approval — the human gate on CONTENT (drafts →
 * review → publish) is untouched. A URL an editor already rejected is never
 * resurrected.
 */
export const registerCampaignSubpages = internalMutation({
  args: {
    candidateSlug: v.string(),
    raceId: v.string(),
    candidateName: v.string(),
    urls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    let registered = 0;
    let skipped = 0;
    for (const url of args.urls) {
      const existing = await ctx.db
        .query("article_sources")
        .withIndex("by_url", (q) => q.eq("url", url))
        .first();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("article_sources", {
        candidateSlug: args.candidateSlug,
        raceId: args.raceId,
        url,
        outlet: args.candidateName,
        headline: `${args.candidateName} — campaign site page`,
        whyRelevant: "Own-domain policy page discovered by the campaign-site mapper.",
        status: "approved",
        sourceKind: "campaign_site",
        proposedAt: Date.now(),
        decidedAt: Date.now(),
      });
      registered++;
    }
    return { registered, skipped };
  },
});
```

Ensure `internalMutation` and `v` are imported at the top of the file (the file already imports `internalQuery`; extend the existing import rather than adding a second one).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex/researchQueries.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/research.ts convex/researchQueries.ts convex/researchQueries.test.ts
git commit -m "feat: Firecrawl /map wrapper + idempotent subpage registration (MOO-326)"
```

---

### Task 4: Mapper action + cron

**Files:**
- Create: `convex/siteMap.ts`
- Modify: `convex/crons.ts`

**Interfaces:**
- Consumes: `fetchFirecrawlMap` (Task 3), `selectPolicySubpages` (Task 1), `internal.researchQueries.listMapTargets` and `internal.researchQueries.registerCampaignSubpages` (Task 3).
- Produces: `internal.siteMap.run({ candidateSlugs?, limit? })` → `{ mapped, registered, skipped, errors }`.

- [ ] **Step 1: Create the action**

Create `convex/siteMap.ts`:

```ts
"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { selectPolicySubpages } from "./lib/campaignMap";
import { fetchFirecrawlMap } from "./research";

/** Max own-site subpages registered per candidate (MOO-326 contract). */
const SUBPAGE_CAP = 10;
/** URLs requested from /map per site — enough to see a full campaign site. */
const MAP_LIMIT = 100;
/** Candidates mapped per run when no explicit slugs are given. */
const DEFAULT_LIMIT = 10;

export const run = internalAction({
  args: {
    candidateSlugs: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const all = await ctx.runQuery(internal.researchQueries.listMapTargets, {});
    const selected = args.candidateSlugs
      ? all.filter((t) => args.candidateSlugs!.includes(t.slug))
      : all.slice(0, args.limit ?? DEFAULT_LIMIT);

    let mapped = 0;
    let registered = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const target of selected) {
      const result = await fetchFirecrawlMap(target.homepageUrl, MAP_LIMIT);
      if (!result.ok) {
        errors.push(`${target.slug}: ${result.error}`);
        continue;
      }
      mapped++;
      const urls = selectPolicySubpages({
        homepageUrl: target.homepageUrl,
        links: result.links,
        cap: SUBPAGE_CAP,
      });
      if (urls.length === 0) continue;

      const outcome = await ctx.runMutation(
        internal.researchQueries.registerCampaignSubpages,
        {
          candidateSlug: target.slug,
          raceId: target.raceId,
          candidateName: target.name,
          urls,
        },
      );
      registered += outcome.registered;
      skipped += outcome.skipped;
    }

    return { mapped, registered, skipped, errors };
  },
});
```

- [ ] **Step 2: Register the cron**

In `convex/crons.ts`, add alongside the existing entries (scout runs 11:00 UTC, research 12:00 UTC — the mapper goes between so newly registered pages are extractable the same day):

```ts
crons.daily(
  "map campaign sites",
  { hourUTC: 11, minuteUTC: 30 },
  internal.siteMap.run,
  {},
);
```

Match the surrounding call style in that file exactly (it may use `crons.daily(name, schedule, fn, args)` with a different formatting).

- [ ] **Step 3: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean; test count = previous total + the new cases.

- [ ] **Step 4: Commit**

```bash
git add convex/siteMap.ts convex/crons.ts
git commit -m "feat: campaign-site mapper action + daily cron (MOO-326)"
```

---

### Task 5: /admin visibility for auto-registered own-site sources

**Files:**
- Modify: `convex/adminQueue.ts:162-183` (`listArticleSources`)
- Modify: `src/components/admin/article-sources.tsx`
- Test: `convex/articleSources.test.ts` or `convex/adminQueue.test.ts` (whichever already covers `listArticleSources`)

**Interfaces:**
- Consumes: `sourceKind` (Task 2), rows written by Task 3.
- Produces: `listArticleSources` returns proposed rows **plus** approved `campaign_site` rows, each carrying `sourceKind`, so the editor can see and reject what the mapper registered.

- [ ] **Step 1: Write the failing test**

Add to the existing `listArticleSources` describe (mirror that file's admin-identity setup — `const ADMIN = { subject: "user_admin", metadata: { role: "admin" } }` and `t.withIdentity(ADMIN)`):

```ts
  it("shows auto-registered own-site sources alongside proposed articles", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("candidates", { ...baseCandidate, slug: "david-crowley", name: "David Crowley" });
      await ctx.db.insert("article_sources", {
        ...baseSource,
        candidateSlug: "david-crowley",
        url: "https://www.crowleyforwi.com/Plan",
        outlet: "David Crowley",
        status: "approved",
        sourceKind: "campaign_site",
      });
      await ctx.db.insert("article_sources", {
        ...baseSource,
        candidateSlug: "david-crowley",
        url: "https://urbanmilwaukee.com/other-story",
        outlet: "Urban Milwaukee",
        status: "approved",
      });
    });

    const rows = await t.withIdentity(ADMIN).query(api.adminQueue.listArticleSources, {});
    const urls = rows.map((r) => r.url);
    expect(urls).toContain("https://www.crowleyforwi.com/Plan");
    // An approved ARTICLE stays hidden — only own-site rows join the list.
    expect(urls).not.toContain("https://urbanmilwaukee.com/other-story");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/articleSources.test.ts convex/adminQueue.test.ts`
Expected: FAIL — the campaign_site URL is absent (the query returns proposed only).

- [ ] **Step 3: Widen the query**

In `convex/adminQueue.ts`, in `listArticleSources`, fetch approved own-site rows in addition to proposed ones and merge before the existing candidate-name join:

```ts
    const proposed = await ctx.db
      .query("article_sources")
      .withIndex("by_status", (q) => q.eq("status", "proposed"))
      .collect();
    // MOO-326: own-site subpages register as approved without human review, so
    // surface them here — otherwise the editor cannot see what is being read.
    const ownSite = (
      await ctx.db
        .query("article_sources")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .collect()
    ).filter((r) => r.sourceKind === "campaign_site");
    const rows = [...proposed, ...ownSite].sort((a, b) => b.proposedAt - a.proposedAt);
```

Then keep the existing candidate-name join and return shape, adding `sourceKind: r.sourceKind ?? "article"` to each returned object.

- [ ] **Step 4: Surface it in the UI**

In `src/components/admin/article-sources.tsx`, badge own-site rows so the editor can tell them apart from sources awaiting approval. Inside the row rendering, next to the outlet, add:

```tsx
{source.sourceKind === "campaign_site" && (
  <span className="border-2 border-border bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
    Own site · auto
  </span>
)}
```

Match the surrounding className conventions in that file; if approve/reject buttons render unconditionally, keep them for own-site rows (reject = the editor's dismissal path, and Task 3 guarantees a rejected URL is never re-registered).

- [ ] **Step 5: Run tests, typecheck, build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add convex/adminQueue.ts src/components/admin/article-sources.tsx convex/articleSources.test.ts convex/adminQueue.test.ts
git commit -m "feat: surface auto-registered own-site sources in /admin (MOO-326)"
```

---

### Task 6: Deploy and prove it against reality

**Files:** none (verification only; note findings for the Linear evidence comment).

- [ ] **Step 1: Capture before-counts**

Record current issue-position coverage for the three verification candidates so the before/after is honest:

```bash
npx convex data candidate_positions_published --prod --format json > /tmp/positions-before.json
npx convex data candidate_positions_drafts --prod --format json > /tmp/drafts-before.json
```

Count rows per `candidateSlug` for `david-crowley`, `francesca-hong`, and one more with a campaign site.

- [ ] **Step 2: Deploy**

```bash
npx convex deploy -y
npx vercel deploy --prod --yes
```

- [ ] **Step 3: Run the mapper against the verification candidates**

```bash
npx convex run siteMap:run '{"candidateSlugs":["david-crowley","francesca-hong"]}' --prod
```

Expected: `mapped: 2`, `registered` > 0. Then confirm what landed:

```bash
npx convex data article_sources --prod --format json | python3 -c "import sys,json;[print(r['url'],r.get('sourceKind'),r['status']) for r in json.load(sys.stdin) if r.get('sourceKind')=='campaign_site']"
```

Verify: `crowleyforwi.com/Plan` and `/issues` present; `francescahong.com/policy` + children present, capped at 10; **no `store.francescahong.com/*`, no `act.francescahong.com/*`, no ActBlue/social URLs**.

- [ ] **Step 4: Prove idempotency against prod**

Re-run the exact same command. Expected: `registered: 0`, `skipped` equal to the prior `registered`, and no new rows.

- [ ] **Step 5: Run extraction on the new sources**

```bash
npx convex run research:run '{"candidateSlugs":["david-crowley","francesca-hong"],"limit":12}' --prod
```

Then confirm new position drafts exist whose `sources[].url` is a registered subpage, with verbatim excerpts from that page — and that their citation label is the candidate name, not an outlet.

- [ ] **Step 6: Check /admin**

Load `/admin` on prod, signed in as admin: own-site rows appear with the "Own site · auto" badge.

- [ ] **Step 7: Record evidence and close**

Post to MOO-326: registered URLs per candidate, off-domain exclusions proven, idempotency numbers, before/after coverage counts for 3 candidates, test count, and the note that the eval gate was not required (no agent prompt/model change). Set the issue Done.
