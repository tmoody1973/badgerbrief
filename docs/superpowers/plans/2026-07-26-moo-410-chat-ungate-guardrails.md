# MOO-410 — Un-gate chat + budget guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-out guests use Voter Help chat, protected by a kill switch + global/per-guest daily caps + per-message bounds, with no golden-gate regression.

**Architecture:** All abuse/cost backstops live in `sendMessage` (`convex/voterHelpQueries.ts`) — the transactional Convex mutation every message passes through — using a hand-rolled `chat_usage` day-counter table (no rate-limiter dep). Guest identity is a client `localStorage` UUID (`bb_guest_id`) passed as `guestId`; the resolved subject is `users._id` when signed in else `guest:<uuid>`. Per-message output bounds + prompt caching go on the agent (`convex/voterHelp.ts`) and are the only golden-gate-sensitive changes. Middleware un-gates `/chat` (keeps `/admin`).

**Tech Stack:** Convex (mutations/queries/actions — read `convex/_generated/ai/guidelines.md` first), `@convex-dev/agent`, `@ai-sdk/anthropic` (AI SDK v6 — verify caching syntax against docs), Next.js App Router (NON-stock), Clerk, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-moo-410-chat-ungate-guardrails-design.md`

## Global Constraints

- **No new dependency** (no `@convex-dev/rate-limiter`).
- **Signed-in users are never counted, never capped** by the daily caps. The **kill switch applies to everyone** (emergency off).
- **Guardrail order in `sendMessage`:** kill switch → resolve subject → (guest only) global cap → (guest only) per-guest cap → save + schedule. Increments occur in the same mutation transaction as the message save.
- **Caps are env-tunable:** `GUEST_DAILY_CAP` default **500**, `GUEST_MSG_CAP` default **30**, `VOTER_HELP_DISABLED` off. Read via `process.env` with numeric-parse + default fallback.
- **Day key** = `new Date(Date.now()).toISOString().slice(0,10)` (UTC). Caps reset at UTC midnight (known simplification).
- **KEEP `stepCountIs(8)`** — do not reduce.
- **Golden gate is the release law:** the agent-side bounds change output → `npm run eval:gate -- --name moo410 --baseline sonnet-5-tuned` must pass on **PROD** (dev lacks prod data → false fails). Deploy-to-prod → eval → **revert on fail**.
- **Deploy needs BOTH** `npx convex deploy --yes` (table + fns + env) and `npx vercel --prod` (middleware). Conventional commits, no attribution.

## File Structure

- `convex/schema.ts` — add `chat_usage` table (subject/day/count + `by_subject_day` index).
- `convex/lib/chatUsage.ts` (new) — pure helpers: `dayKey(nowMs)`, `capFromEnv(name, fallback)`, `isOverCap(count, cap)`. React-free, unit-tested.
- `convex/lib/chatUsage.test.ts` (new) — helper tests.
- `convex/voterHelpQueries.ts` — subject resolver + guardrails in `sendMessage`; `guestId` arg on `getMyThread`/`sendMessage`/`listThreadMessages` + guest ownership checks.
- `convex/voterHelp.ts` — `maxOutputTokens` + Anthropic prompt caching on the agent + `getRaceInfo` output trim.
- `src/middleware.ts` — remove `/chat(.*)` from the protected matcher.
- `src/components/chat/voter-help-chat.tsx` + `src/app/chat/page.tsx` — guest id, pass `guestId`, drop the sign-in wall, render cap/kill notices.

---

### Task 1: `chat_usage` table + pure usage helpers

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/lib/chatUsage.ts`, `convex/lib/chatUsage.test.ts`

**Interfaces:**
- Produces: `dayKey(nowMs: number): string`; `capFromEnv(name: string, fallback: number): number`; `isOverCap(count: number, cap: number): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/chatUsage.test.ts
import { describe, it, expect } from "vitest";
import { dayKey, capFromEnv, isOverCap } from "./chatUsage";

describe("dayKey", () => {
  it("returns the UTC YYYY-MM-DD for a timestamp", () => {
    // 2026-08-11T04:30:00Z
    expect(dayKey(Date.parse("2026-08-11T04:30:00Z"))).toBe("2026-08-11");
  });
});

describe("capFromEnv", () => {
  it("parses a numeric env var", () => {
    process.env.__TEST_CAP = "42";
    expect(capFromEnv("__TEST_CAP", 500)).toBe(42);
    delete process.env.__TEST_CAP;
  });
  it("falls back when unset or non-numeric", () => {
    delete process.env.__TEST_CAP;
    expect(capFromEnv("__TEST_CAP", 500)).toBe(500);
    process.env.__TEST_CAP = "abc";
    expect(capFromEnv("__TEST_CAP", 500)).toBe(500);
    delete process.env.__TEST_CAP;
  });
});

describe("isOverCap", () => {
  it("is true only strictly above the cap", () => {
    expect(isOverCap(30, 30)).toBe(false); // the 30th is allowed
    expect(isOverCap(31, 30)).toBe(true);  // the 31st is not
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/chatUsage.test.ts`
Expected: FAIL — cannot import `./chatUsage`.

- [ ] **Step 3: Write the helpers**

```ts
// convex/lib/chatUsage.ts
/** UTC day key "YYYY-MM-DD" for a millisecond timestamp. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Numeric env var with a safe fallback (unset or non-numeric → fallback). */
export function capFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** True when `count` exceeds `cap` — i.e. this send should be refused. */
export function isOverCap(count: number, cap: number): boolean {
  return count > cap;
}
```

- [ ] **Step 4: Add the table** — in `convex/schema.ts`, add alongside the other tables:

```ts
  chat_usage: defineTable({
    subject: v.string(), // "GLOBAL" or "guest:<uuid>"
    day: v.string(),     // "YYYY-MM-DD" (UTC)
    count: v.number(),
  }).index("by_subject_day", ["subject", "day"]),
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run convex/lib/chatUsage.test.ts && npx convex codegen`
Expected: 4 assertions PASS; codegen regenerates `convex/_generated` with `chat_usage`.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/lib/chatUsage.ts convex/lib/chatUsage.test.ts convex/_generated
git commit -m "feat(chat): chat_usage day-counter table + pure usage helpers (MOO-410)"
```

---

### Task 2: Guest identity + guardrails in `sendMessage`

**Files:**
- Modify: `convex/voterHelpQueries.ts`
- Test: `convex/voterHelpQueries.test.ts` (create if absent; Convex mutation test via `convex-test`)

**Interfaces:**
- Consumes: `dayKey`, `capFromEnv`, `isOverCap` (Task 1); `chat_usage` table.
- Produces: `resolveSubject(ctx, guestId): Promise<{ subject: string; isGuest: boolean }>`; `guestId?: v.string()` arg added to `getMyThread`, `sendMessage`, `listThreadMessages`.

Design notes for the implementer:
- **`resolveSubject`:** `const user = await currentUser(ctx);` → if `user`, `{ subject: user._id, isGuest: false }`; else if a non-empty `guestId`, `{ subject: \`guest:${guestId}\`, isGuest: true }`; else throw `ConvexError("Reload and try again.")` (can't count a blank guest).
- **Threads now key on `subject`** (not `user._id`). Update `getMyThread` and `threadIdForUser` calls to use `subject`. In `listThreadMessages`, the ownership check becomes `thread.userId !== subject`.
- **Counter increment helper** (private, in this file): given `ctx`, `subject`, `day`, read the `chat_usage` row via `by_subject_day`; `patch` `count+1` if it exists else `insert` `count: 1`; return the new count.
- **Guardrails in `sendMessage`**, in order:
  1. `if (process.env.VOTER_HELP_DISABLED) throw new ConvexError("Voter Help is paused right now — try the guide.");`
  2. prompt trim + `MAX_PROMPT_CHARS` checks (unchanged, keep).
  3. `const { subject, isGuest } = await resolveSubject(ctx, guestId);`
  4. `if (isGuest)`: `const day = dayKey(Date.now());` → increment `GLOBAL` → `if (isOverCap(globalCount, capFromEnv("GUEST_DAILY_CAP", 500))) throw new ConvexError("Voter Help is busy today — signed-in users still have access, and the guide is always open.");` → increment `subject` → `if (isOverCap(guestCount, capFromEnv("GUEST_MSG_CAP", 30))) throw new ConvexError("You've reached today's Voter Help limit — sign in for more, or come back tomorrow.");`
  5. thread + `saveMessage` + `scheduler.runAfter(streamAnswer)` all using `subject` as `userId` (unchanged shape).

- [ ] **Step 1: Write the failing test** (Convex mutation test with `convex-test`)

```ts
// convex/voterHelpQueries.test.ts
import { convexTest } from "convex-test";
import { describe, it, expect, afterEach } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

afterEach(() => {
  delete process.env.VOTER_HELP_DISABLED;
  delete process.env.GUEST_MSG_CAP;
  delete process.env.GUEST_DAILY_CAP;
});

describe("sendMessage guardrails", () => {
  it("kills for everyone when VOTER_HELP_DISABLED is set", async () => {
    process.env.VOTER_HELP_DISABLED = "1";
    const t = convexTest(schema);
    await expect(
      t.mutation(api.voterHelpQueries.sendMessage, { prompt: "hi", guestId: "g1" }),
    ).rejects.toThrow(/paused/i);
  });

  it("caps a guest at GUEST_MSG_CAP sends/day", async () => {
    process.env.GUEST_MSG_CAP = "2";
    process.env.GUEST_DAILY_CAP = "1000";
    const t = convexTest(schema);
    await t.mutation(api.voterHelpQueries.sendMessage, { prompt: "q1", guestId: "g1" });
    await t.mutation(api.voterHelpQueries.sendMessage, { prompt: "q2", guestId: "g1" });
    await expect(
      t.mutation(api.voterHelpQueries.sendMessage, { prompt: "q3", guestId: "g1" }),
    ).rejects.toThrow(/limit/i);
  });

  it("refuses a signed-out send with no guestId", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.voterHelpQueries.sendMessage, { prompt: "hi" }),
    ).rejects.toThrow(/reload/i);
  });
});
```

> If the agent component makes `sendMessage` hard to run under `convex-test` (it schedules
> `streamAnswer` + uses `components.agent`), register the agent component in the test
> harness per `convex/_generated/ai/guidelines.md`, or assert the guardrail throws BEFORE
> the thread/save calls (the kill-switch and no-guestId cases throw before any agent call).
> Keep at minimum the kill-switch and no-guestId cases (pure guard, no agent needed); if
> the cap case can't run under the harness, cover the cap arithmetic via the Task-1
> `isOverCap` unit test and note the integration gap in the report.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/voterHelpQueries.test.ts`
Expected: FAIL (guardrails/args not implemented yet).

- [ ] **Step 3: Implement** the `resolveSubject` helper, the `guestId` args, the counter helper, and the guardrails per the Design notes above. Read the current file first; keep the signed-in path behavior-identical (signed-in never hits the guest branch).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run convex/voterHelpQueries.test.ts && npx convex codegen`
Expected: guard tests PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/voterHelpQueries.ts convex/voterHelpQueries.test.ts
git commit -m "feat(chat): guest sessions + kill switch + daily caps in sendMessage (MOO-410)"
```

---

### Task 3: Agent per-message bounds (GOLDEN-GATE-SENSITIVE)

**Files:**
- Modify: `convex/voterHelp.ts`

**Interfaces:**
- Consumes/produces: no new exports; changes the agent config + `getRaceInfo` output.

Design notes:
- **`maxOutputTokens`:** set on the Agent so BOTH `streamText` (prod) and `generateText`
  (eval) inherit it — keeps the gate representative. In `makeVoterHelpAgent`'s
  `new Agent(components.agent, { ... })`, add the generation setting (`@convex-dev/agent`
  exposes call settings such as `maxOutputTokens` — **confirm the exact field name against
  the installed `@convex-dev/agent` version's types before writing**). Value: **1024**.
- **Anthropic prompt caching:** enable cache control on the static system prompt + tool
  schemas via `providerOptions.anthropic` for `@ai-sdk/anthropic` (AI SDK v6). **Verify the
  exact `providerOptions` shape against the current AI SDK / provider docs (use Context7 or
  read `node_modules/@ai-sdk/anthropic`) — do NOT guess the field names.** Apply it on the
  agent so it's identical every call (that's what makes it cacheable).
- **Trim `getRaceInfo`:** its handler returns ~62KB pretty-printed today (the 30K slice in
  `evalAnswer` is eval-only and does NOT shrink what the model receives). Cap the actual
  returned payload the model sees to a sane bound (e.g. compact JSON, drop pretty-print
  whitespace, and/or cap to ~15–20KB) so one call can't dominate the context. Preserve the
  fields the instructions rely on (summaries + one source per item, per the existing
  comments) — read the handler and trim structurally, don't blind-truncate a JSON string.
- **KEEP `stepCountIs(8)`.**

- [ ] **Step 1: Read** `convex/voterHelp.ts` fully (agent config, `getRaceInfo`, `streamAnswer`, `evalAnswer`) and the installed `@convex-dev/agent` + `@ai-sdk/anthropic` types/docs for the exact `maxOutputTokens` + `providerOptions` syntax.

- [ ] **Step 2: Apply** the three changes (maxOutputTokens=1024 on the agent, prompt caching via verified providerOptions, structural getRaceInfo trim).

- [ ] **Step 3: Typecheck + build + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; existing voterHelp tests still pass (a pre-existing unrelated `convex/lib/houseVote.test.ts` timeout may flake).

- [ ] **Step 4: Commit** (mark it gate-sensitive in the message)

```bash
git add convex/voterHelp.ts
git commit -m "perf(chat): maxOutputTokens 1024 + Anthropic prompt caching + getRaceInfo trim (MOO-410, re-gate)"
```

> **DO NOT treat this task as verified until the golden gate passes on PROD (final task).**
> The unit suite cannot detect an answer-quality regression.

---

### Task 4: Un-gate the chat route

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Edit** — remove `/chat(.*)` from the matcher, keep `/admin(.*)`:

```ts
const isProtectedRoute = createRouteMatcher(["/admin(.*)"]);
```

Update the leading comment if it references `/chat` gating. Nothing else changes.

- [ ] **Step 2: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(chat): un-gate /chat for guests, keep /admin protected (MOO-410)"
```

---

### Task 5: Client — guest id, args, notices, drop the sign-in wall

**Files:**
- Modify: `src/components/chat/voter-help-chat.tsx`, `src/app/chat/page.tsx`
- Update: `src/components/chat/voter-help-chat.test.tsx` (adjust for guest behavior)

Design notes (read the file first — it uses `useConvexAuth`, skips `getMyThread` when unauth, sends `{ prompt }`, and shows a "Sign in to use Voter Help" wall ~line 200):
- **Guest id:** a small client helper `getGuestId()` — in an effect (SSR-safe), read `localStorage.getItem("bb_guest_id")`; if absent, create one with `crypto.randomUUID()` and store it; hold it in state. Never touch `localStorage` during render/SSR.
- **Args:** when `!isAuthenticated`, pass `{ guestId }` to `getMyThread`, `listThreadMessages`, and `sendMessage` (instead of `"skip"` / bare). When authenticated, keep current behavior (no `guestId`). Guard queries with `"skip"` until the guest id exists.
- **Drop the wall:** remove the "Sign in to use Voter Help" gate so signed-out users see the chat input. (Keep a subtle "sign in for more" affordance if trivial — optional, not required.)
- **Notices:** the cap/kill `ConvexError`s surface via the existing send error path — render the thrown message inline as a friendly notice rather than a crash.

- [ ] **Step 1: Update the test** (`voter-help-chat.test.tsx`) to reflect that a signed-out user now sees the input (not a wall) and that a `guestId` is passed. Run it to see it fail against current code.

Run: `npx vitest run src/components/chat/voter-help-chat.test.tsx`
Expected: FAIL (current code still shows the wall).

- [ ] **Step 2: Implement** the guest-id helper, args wiring, wall removal, and inline notice. Read the file first; keep the authenticated path unchanged.

- [ ] **Step 3: Test + build**

Run: `npx vitest run src/components/chat/voter-help-chat.test.tsx && npx tsc --noEmit && npm run build`
Expected: PASS + clean build.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/voter-help-chat.tsx src/components/chat/voter-help-chat.test.tsx src/app/chat/page.tsx
git commit -m "feat(chat): guest-session client (bb_guest_id + args + inline cap notices, drop wall) (MOO-410)"
```

---

### Task 6: Release — env, deploy, GOLDEN GATE, live-verify (Tarik-gated)

**Not a code task — the release procedure. The prod deploy + gate is Tarik-gated; do not deploy without explicit go-ahead.**

- [ ] **Step 1:** Set Convex env (prod + dev): `GUEST_DAILY_CAP=500`, `GUEST_MSG_CAP=30`, and ensure `VOTER_HELP_DISABLED` is unset/false. (`npx convex env set ...`.)
- [ ] **Step 2:** Deploy Convex: `npx convex deploy --yes` (table + fns + env).
- [ ] **Step 3:** **Golden gate on PROD:** `npm run eval:gate -- --name moo410 --baseline sonnet-5-tuned`. Gate = golden-expectations ≥90% floor + ≤5pt drop. **If it fails, revert the Task-3 agent-bounds commit and redeploy Convex** (the guest/kill/cap/un-gate parts are behavior-neutral and can stay); re-tune bounds and re-gate. Do not proceed to the frontend deploy on a failed gate.
- [ ] **Step 4:** Deploy frontend: `npx vercel --prod`.
- [ ] **Step 5:** **Live-verify (prod, signed-out):** a guest sends and gets a streamed, cited answer; the per-guest cap trips at the limit with the friendly notice; toggling `VOTER_HELP_DISABLED=1` pauses everyone within seconds (then unset); a signed-in user is unaffected by caps.

## Self-Review notes

- **Spec coverage:** kill switch → T2 guard #1. Global cap → T2 #4a + T1 table/helpers. Per-guest cap → T2 #4b. Per-message bounds → T1 (`MAX_PROMPT_CHARS` kept) + T3 (maxOutputTokens/caching/trim). Guest identity → T2 (`resolveSubject`) + T5 (`bb_guest_id`). Un-gate → T4. Golden gate + deploy → T6. Deferred (#3 bot wall, #5 quota-nudge) intentionally absent.
- **Signed-in invariance:** T2 keeps the signed-in path on `user._id`, never entering the guest count branch; only the kill switch touches signed-in users.
- **Gate risk isolated:** only T3 changes model output; it's a standalone commit so T6 can revert exactly it on a gate fail without losing the un-gate/guardrail work.
- **Verify-before-writing flags:** T3 explicitly requires confirming `maxOutputTokens` (agent) and `providerOptions` caching (AI SDK v6) syntax against installed types/docs — no guessing.
- **Type consistency:** `resolveSubject`, `dayKey`, `capFromEnv`, `isOverCap`, `chat_usage`/`by_subject_day` used identically across tasks.
