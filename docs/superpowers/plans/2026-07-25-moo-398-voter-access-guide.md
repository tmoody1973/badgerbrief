# MOO-398 Voter-Access Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an 8-situation Wisconsin voter-access guide on `/vote` and in the chat agent, where every published claim is backed by an official source and verified by a human before it goes live.

**Architecture:** One `voter_access` Convex table, seeded from a human-verified JSON file through a mutation that hard-fails on advocacy-only rows. Two read surfaces consume the same rows: a public `/vote` section of `<details>` cards with `FAQPage` JSON-LD, and a read-only `getVoterAccess` chat tool whose "state the rule, no case-specific legal advice" directive rides in the tool *output*, never the agent INSTRUCTIONS.

**Tech Stack:** Convex (schema, internalMutation, query), `convex-test` + `vitest`, Next.js App Router server component, `@convex-dev/agent` `createTool`.

## Global Constraints

- **Directive placement:** the legal-advice directive lives in the `getVoterAccess` tool's returned string ONLY. Do NOT add any voter-access rule to the agent INSTRUCTIONS in `convex/voterHelp.ts`. Verbose INSTRUCTIONS regressed the golden gate 93→73%.
- **Publish gate (structural):** `voter_access.sources` and `voter_access.lastCheckedAt` are non-optional — a row cannot be written without a source and a freshness stamp (mirrors `voting_info`).
- **Publish gate (added, stricter):** a row must carry ≥1 source whose URL is on an official domain: `elections.wi.gov`, `myvote.wi.gov`, `bringit.wi.gov`. Advocacy-only rows are rejected at seed time.
- **Human verification is the accuracy control:** the 8 rows' *content* is verified by Tarik against sources before publish. Automated tests confirm gate mechanics only; they cannot confirm a claim is true.
- **Reuse, don't rebuild:** `sourceLink` (`convex/schema.ts:5`), `faqNode` (`src/lib/jsonld.tsx:103`), `upsertByIndex` (`convex/seed.ts:31`), the `cached()` wrapper (`src/lib/data.ts`).
- **Test command:** `npx vitest run <file>`.

---

### Task 1: `voter_access` table + seeding mutation with official-domain gate

**Files:**
- Modify: `convex/schema.ts` (add table after `voting_info`, ~line 178)
- Modify: `convex/seed.ts` (extend `upsertByIndex` union ~line 31; add `upsertVoterAccess` mutation)
- Test: `convex/voterAccess.test.ts` (create)

**Interfaces:**
- Consumes: `sourceLink` from `convex/schema.ts`, `upsertByIndex` from `convex/seed.ts`.
- Produces:
  - Table `voter_access` with fields `key, title, summary, details, sources[], order, lastCheckedAt` and index `by_key` on `["key"]`.
  - `internal.seed.upsertVoterAccess` — args `{ key, title, summary, details, sources: sourceLink[], order }`; upserts by `key`, sets `lastCheckedAt: Date.now()`; **throws** `"voter_access row requires an official-domain source (publish gate)"` when no source URL is on an official domain.
  - Exported const `OFFICIAL_DOMAINS = ["elections.wi.gov", "myvote.wi.gov", "bringit.wi.gov"]` in `convex/seed.ts`.

- [ ] **Step 1: Add the table to `convex/schema.ts`** (immediately after the `voting_info` block)

```ts
  voter_access: defineTable({
    key: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.string(),
    sources: v.array(sourceLink), // publish gate: >=1 required
    order: v.number(),
    lastCheckedAt: v.number(), // publish gate: freshness required
  }).index("by_key", ["key"]),
```

- [ ] **Step 2: Write the failing test** — create `convex/voterAccess.test.ts`

```ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function setup() {
  return convexTest(schema, modules);
}

const officialRow = {
  key: "voter-id",
  title: "What photo ID can I use to vote?",
  summary: "Wisconsin requires an acceptable photo ID to vote.",
  details: "A Wisconsin driver license, state ID, US passport, and several others qualify.",
  order: 1,
  sources: [{ name: "Wisconsin Elections Commission — bringit.wi.gov", url: "https://bringit.wi.gov/" }],
};

describe("upsertVoterAccess publish gate", () => {
  test("accepts a row with an official-domain source", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertVoterAccess, officialRow);
    const rows = await t.run(async (ctx) => ctx.db.query("voter_access").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].lastCheckedAt).toBeGreaterThan(0);
  });

  test("rejects an advocacy-only row (no official-domain source)", async () => {
    const t = setup();
    await expect(
      t.mutation(internal.seed.upsertVoterAccess, {
        ...officialRow,
        sources: [{ name: "VoteRiders", url: "https://www.voteriders.org/wisconsin/" }],
      }),
    ).rejects.toThrow("official-domain source");
  });

  test("upserts by key (second call updates, not duplicates)", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertVoterAccess, officialRow);
    await t.mutation(internal.seed.upsertVoterAccess, { ...officialRow, summary: "Updated." });
    const rows = await t.run(async (ctx) => ctx.db.query("voter_access").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("Updated.");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/voterAccess.test.ts`
Expected: FAIL — `internal.seed.upsertVoterAccess` does not exist.

- [ ] **Step 4: Extend the `upsertByIndex` type union in `convex/seed.ts`** (~line 31)

```ts
async function upsertByIndex<T extends "elections" | "races" | "voting_info" | "voter_access">(
```

- [ ] **Step 5: Add the mutation to `convex/seed.ts`** (place near the `upsertVotingInfo` mutation)

```ts
export const OFFICIAL_DOMAINS = ["elections.wi.gov", "myvote.wi.gov", "bringit.wi.gov"];

export const upsertVoterAccess = internalMutation({
  args: {
    key: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.string(),
    order: v.number(),
    sources: v.array(sourceLink),
  },
  handler: async (ctx, args) => {
    const hasOfficial = args.sources.some((s) =>
      OFFICIAL_DOMAINS.some((d) => s.url.includes(d)),
    );
    if (!hasOfficial) {
      throw new Error(
        "voter_access row requires an official-domain source (publish gate)",
      );
    }
    const existing = await ctx.db
      .query("voter_access")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return await upsertByIndex(ctx, "voter_access", existing, {
      ...args,
      lastCheckedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run convex/voterAccess.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/seed.ts convex/voterAccess.test.ts
git commit -m "feat(voter-access): voter_access table + seed gate (MOO-398)"
```

---

### Task 2: Public read query + cached data wrapper

**Files:**
- Modify: `convex/public.ts` (add `getVoterAccess` query near `getVotingInfo`, ~line 184)
- Modify: `src/lib/data.ts` (add cached wrapper near `getVotingInfo`, ~line 54)
- Test: `convex/voterAccess.test.ts` (append)

**Interfaces:**
- Consumes: `voter_access` table (Task 1).
- Produces:
  - `api.public.getVoterAccess` — no args; returns `voter_access` rows sorted ascending by `order`.
  - `getVoterAccess` in `src/lib/data.ts` — `cached("getVoterAccess", () => fetchQuery(api.public.getVoterAccess, {}))`.

- [ ] **Step 1: Write the failing test** — append to `convex/voterAccess.test.ts`

```ts
import { api } from "./_generated/api";

describe("getVoterAccess query", () => {
  test("returns rows sorted by order", async () => {
    const t = setup();
    await t.mutation(internal.seed.upsertVoterAccess, { ...officialRow, key: "b", order: 2 });
    await t.mutation(internal.seed.upsertVoterAccess, { ...officialRow, key: "a", order: 1 });
    const rows = await t.query(api.public.getVoterAccess, {});
    expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/voterAccess.test.ts`
Expected: FAIL — `api.public.getVoterAccess` does not exist.

- [ ] **Step 3: Add the query to `convex/public.ts`**

```ts
export const getVoterAccess = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("voter_access").collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/voterAccess.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the cached wrapper to `src/lib/data.ts`** (after the `getVotingInfo` line ~54)

```ts
export const getVoterAccess = cached("getVoterAccess", () => fetchQuery(api.public.getVoterAccess, {}));
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/public.ts src/lib/data.ts convex/voterAccess.test.ts
git commit -m "feat(voter-access): public getVoterAccess query + cached wrapper (MOO-398)"
```

---

### Task 3: `/vote` cards + FAQ JSON-LD

**Files:**
- Create: `src/lib/voter-access-faqs.ts` (pure mapper, so it is unit-testable)
- Modify: `src/app/vote/page.tsx` (fetch rows, render `<details>` cards, merge into `faqNode`)
- Test: `src/lib/voter-access-faqs.test.ts` (create)

**Interfaces:**
- Consumes: `getVoterAccess` from `src/lib/data.ts` (Task 2), `faqNode` from `src/lib/jsonld.tsx`.
- Produces: `voterAccessToFaqs(rows: { title: string; summary: string }[]): { q: string; a: string }[]` — maps each row to `{ q: title, a: summary }`.

- [ ] **Step 1: Write the failing test** — create `src/lib/voter-access-faqs.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { voterAccessToFaqs } from "./voter-access-faqs";

describe("voterAccessToFaqs", () => {
  test("maps title→q and summary→a", () => {
    const out = voterAccessToFaqs([
      { title: "Can I vote with a felony conviction?", summary: "Yes, once off paper." },
    ]);
    expect(out).toEqual([{ q: "Can I vote with a felony conviction?", a: "Yes, once off paper." }]);
  });

  test("empty input → empty array", () => {
    expect(voterAccessToFaqs([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/voter-access-faqs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/voter-access-faqs.ts`**

```ts
export function voterAccessToFaqs(
  rows: { title: string; summary: string }[],
): { q: string; a: string }[] {
  return rows.map((r) => ({ q: r.title, a: r.summary }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/voter-access-faqs.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the cards into `src/app/vote/page.tsx`**

Add imports:

```ts
import { getVoterAccess, getVotingInfo } from "@/lib/data";
import { voterAccessToFaqs } from "@/lib/voter-access-faqs";
import { SourceList } from "@/components/guide/sources";
```

In `VotePage()`, after `const info = await getVotingInfo();`:

```ts
  const access = (await getVoterAccess()) ?? [];
```

Merge the access rows into the existing `faqNode` call — change `faqNode(faqs)` to:

```ts
  faqNode([...faqs, ...voterAccessToFaqs(access)])
```

Render a section (place after the existing voting-logistics content, before the closing tag):

```tsx
      {access.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl">Your situation</h2>
          <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
            Answers to common eligibility questions. Every rule links to its
            official source. These are general rules, not legal advice — for a
            specific situation, use the official link.
          </p>
          <div className="mt-4 space-y-2">
            {access.map((row) => (
              <details key={row.key} className="border-2 border-border bg-card p-3">
                <summary className="cursor-pointer font-bold">{row.title}</summary>
                <p className="mt-2 max-w-[60ch] text-sm">{row.summary}</p>
                <p className="mt-2 max-w-[60ch] text-sm whitespace-pre-line">{row.details}</p>
                <div className="mt-3">
                  <SourceList sources={row.sources} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 6: Verify `SourceList` accepts `{ name, url }[]`**

Run: `grep -n "sources" src/components/guide/sources.tsx | head`
Expected: prop typed as an array of `{ name; url }`. If the prop name differs, match it. If it does not exist, render links inline instead:
`{row.sources.map((s) => (<a key={s.url} href={s.url} className="mr-3 underline">{s.name}</a>))}`

- [ ] **Step 7: Typecheck + build the page**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/voter-access-faqs.ts src/lib/voter-access-faqs.test.ts src/app/vote/page.tsx
git commit -m "feat(voter-access): /vote situation cards + FAQ schema (MOO-398)"
```

---

### Task 4: `getVoterAccess` chat tool (directive in output)

**Files:**
- Modify: `convex/voterHelp.ts` (add tool near `getVotingInfo` ~line 51; register in the `tools:` map ~line 256)
- Test: `convex/voterAccess.test.ts` (append)

**Interfaces:**
- Consumes: `api.public.getVoterAccess` (Task 2), `createTool`/`withToolSpan` already imported in `voterHelp.ts`.
- Produces: `getVoterAccess` tool returning `JSON.stringify({ directive, rows })` where `directive` is the fixed legal-advice string.

- [ ] **Step 1: Write the failing test** — append to `convex/voterAccess.test.ts`

Because the tool wraps a query, test the payload shape via a small exported helper. Add to `convex/voterHelp.ts` an exported pure function and test it:

```ts
// in convex/voterAccess.test.ts
import { voterAccessPayload } from "./voterHelp";

describe("voterAccessPayload", () => {
  test("includes the no-legal-advice directive and the rows", () => {
    const payload = JSON.parse(
      voterAccessPayload([{ key: "voter-id", title: "ID?", summary: "s", details: "d", sources: [], order: 1, lastCheckedAt: 1 }]),
    );
    expect(payload.directive).toMatch(/legal advice/i);
    expect(payload.rows).toHaveLength(1);
  });

  test("empty rows still carries the directive", () => {
    const payload = JSON.parse(voterAccessPayload([]));
    expect(payload.directive).toMatch(/official source/i);
    expect(payload.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/voterAccess.test.ts`
Expected: FAIL — `voterAccessPayload` not exported.

- [ ] **Step 3: Add the helper + tool to `convex/voterHelp.ts`**

Add the exported helper (top level, near the other tool definitions):

```ts
export function voterAccessPayload(rows: unknown[]): string {
  return JSON.stringify({
    directive:
      "State the general rule and link the official source. Do NOT give case-specific legal advice; if the voter's situation is specific, hand off to the official source.",
    rows,
  });
}

const getVoterAccess = createTool({
  description:
    "Wisconsin voter eligibility & access situations (voter ID, absentee, election-day registration, disability, felony conviction, name change, ID/name mismatch, homelessness). Returns general rules with official sources. Read-only.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<string> =>
    withToolSpan("getVoterAccess", ctx.threadId, {}, async () => {
      const rows = await ctx.runQuery(api.public.getVoterAccess, {});
      return voterAccessPayload(rows);
    }),
});
```

> Verified against `getVotingInfo` (`convex/voterHelp.ts:51`): these tools use
> `inputSchema: z.object({})` and `execute: async (ctx): Promise<string> => ...`
> — NOT `args`/`handler`. `z` is already imported (line 10).

- [ ] **Step 4: Register the tool** in the `tools:` map (~line 256)

```ts
    tools: { getVotingInfo, getVoterAccess, getMyBallot, getRaceInfo, getCandidateInfo, getCoverage, getVotingRecord, handoffOfficialLink },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/voterAccess.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirm NO INSTRUCTIONS change**

Run: `git diff convex/voterHelp.ts | grep -A2 -B2 "INSTRUCTIONS\|const AGENT\|legal advice"`
Expected: the only "legal advice" string is inside `voterAccessPayload`. The agent instructions block is unchanged. (Global Constraint.)

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add convex/voterHelp.ts convex/voterAccess.test.ts
git commit -m "feat(voter-access): getVoterAccess chat tool, directive in output (MOO-398)"
```

---

### Task 5: Golden-gate questions (no regression)

**Files:**
- Modify: `scripts/golden-questions.json` (add 2 voter-access questions)

**Interfaces:**
- Consumes: the `eval:gate` pipeline (`scripts/eval-gate.mjs`, floor `MIN_GOLDEN_RATE = 0.9`).
- Produces: two new golden questions exercising `getVoterAccess`.

- [ ] **Step 1: Add two questions to `scripts/golden-questions.json`** (match the existing object shape exactly)

```json
{
  "question": "I have a felony conviction in Wisconsin. Can I vote?",
  "race_id": null,
  "expected_topic": "voter-access",
  "must_mention": "official",
  "must_use_tool": true,
  "must_not": "give case-specific legal advice or invent the rule",
  "difficulty": "medium"
},
{
  "question": "My photo ID doesn't match my current name. Can I still vote?",
  "race_id": null,
  "expected_topic": "voter-access",
  "must_mention": "bringit.wi.gov",
  "must_use_tool": true,
  "must_not": "give case-specific legal advice",
  "difficulty": "medium"
}
```

- [ ] **Step 2: Validate the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('scripts/golden-questions.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/golden-questions.json
git commit -m "test(voter-access): add golden questions for getVoterAccess (MOO-398)"
```

> **Gate note (not a vitest):** the live golden gate runs against the Arize `voter-help-golden` dataset via `npm run eval:gate` and must stay ≥ 0.9. The Arize dataset must be updated with these two examples before the gate reflects them (ax CLI — see `docs` handoff for landmines). Run `npm run eval:gate` before the production deploy in Task 7 and confirm no regression.

---

### Task 6: Draft + human-verify the 8 rows, then seed dev

**Files:**
- Create: `scripts/voter-access-seed.json` (8 rows)
- Create: `scripts/seed-voter-access.mjs` (iterates rows → `internal.seed.upsertVoterAccess`)

**Interfaces:**
- Consumes: `internal.seed.upsertVoterAccess` (Task 1).
- Produces: 8 verified rows in the dev deployment.

- [ ] **Step 1: Draft `scripts/voter-access-seed.json`** — one object per situation, shape `{ key, title, summary, details, order, sources: [{name,url}] }`. Keys and titles are fixed by the spec §3 table; each row MUST include ≥1 official-domain source. Draft `summary`/`details` from the official source, every factual claim traceable to a linked source. Example row:

```json
{
  "key": "felony-conviction",
  "title": "I have a felony conviction — can I vote?",
  "summary": "In Wisconsin you cannot vote while serving a felony sentence, including probation, parole, or extended supervision. Once you have completed the full sentence ('off paper'), your right to vote is restored and you must re-register.",
  "details": "You do not need a document proving restoration; once you are off paper you may register and vote. Register at myvote.wi.gov.",
  "order": 5,
  "sources": [
    { "name": "Wisconsin Elections Commission — MyVote", "url": "https://myvote.wi.gov/" },
    { "name": "ACLU of Wisconsin — voting rights", "url": "https://www.aclu-wi.org/en/know-your-rights/voting-rights" }
  ]
}
```

- [ ] **Step 2: Create `scripts/seed-voter-access.mjs`**

```js
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { internal } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const rows = JSON.parse(readFileSync("scripts/voter-access-seed.json", "utf8"));

for (const row of rows) {
  await client.mutation(internal.seed.upsertVoterAccess, row);
  console.log(`seeded: ${row.key}`);
}
console.log(`done: ${rows.length} rows`);
```

> If other seed scripts in `scripts/` invoke mutations differently (e.g. via `npx convex run`), match that convention instead. Check `scripts/import-polls.mjs` for the house pattern before writing this.

- [ ] **Step 3: STOP — human verification gate (Tarik)**

Do NOT proceed until Tarik has verified every row in `scripts/voter-access-seed.json` against its sources. This is the load-bearing accuracy control. Present the drafted file for review.

- [ ] **Step 4: Seed the dev deployment**

Run: `node scripts/seed-voter-access.mjs` (against dev)
Expected: `done: 8 rows`. A row missing an official-domain source will throw — fix the row, do not weaken the gate.

- [ ] **Step 5: Verify locally**

Run `npm run dev`, open `/vote`, confirm all 8 cards render with sources and the FAQ JSON-LD includes them (view source → `FAQPage`).

- [ ] **Step 6: Commit**

```bash
git add scripts/voter-access-seed.json scripts/seed-voter-access.mjs
git commit -m "feat(voter-access): 8 verified situation rows + seed script (MOO-398)"
```

---

### Task 7: Deploy + verify live (Tarik-gated)

**Files:** none (deploy + seed prod).

- [ ] **Step 1: Full test sweep**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 2: Golden gate**

Run: `npm run eval:gate`
Expected: golden-expectations ≥ 0.9 (no regression from the two new questions). If it regresses, the directive likely leaked into INSTRUCTIONS or the tool is not being called — fix before deploy.

- [ ] **Step 3: Deploy** (Tarik-gated — confirm before running)

Run: `npx vercel --prod --yes`, then seed prod: `node scripts/seed-voter-access.mjs` with prod `NEXT_PUBLIC_CONVEX_URL`.

- [ ] **Step 4: Verify live**

Run: `curl -s https://badgerbrief.org/vote | grep -iE "Your situation|felony|FAQPage"`
Expected: all three present.

- [ ] **Step 5: Update Linear MOO-398** to Done with a note linking the spec and this plan.

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 1 (table + structural gate) ✓
- §1 added official-domain gate → Task 1 mutation throw + tests ✓
- §2(a) /vote cards + FAQ schema → Task 3 ✓
- §2(b) getVoterAccess tool, directive-in-output → Task 4 (+ Constraint check Step 6) ✓
- §3 the 8 situations + sources → Task 6 seed data ✓
- §4 seed-validation test → Task 1; tool-output directive test → Task 4; golden gate → Tasks 5 & 7; FAQ validity → Task 3 (view-source check) + Task 7 curl; human accuracy gate → Task 6 Step 3 ✓
- §5 out-of-scope (no queue, no new source type, no INSTRUCTIONS change, no Spanish) → honored; no tasks add them ✓

**Placeholder scan:** No TBD/TODO; every code step has real code. Two "match the house pattern" notes (Task 4 `args` style, Task 6 seed invocation) point at named existing files to copy — they are verification instructions, not placeholders.

**Type consistency:** `upsertVoterAccess` args match the table fields (minus `lastCheckedAt`, set server-side); `getVoterAccess` query name is identical across `public.ts`, `data.ts`, and the tool; `voterAccessToFaqs` and `voterAccessPayload` names are consistent between their definition and test tasks; `OFFICIAL_DOMAINS` defined once in `seed.ts`.
