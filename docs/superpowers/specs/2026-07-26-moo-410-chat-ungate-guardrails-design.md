# MOO-410 — Un-gate Voter Help chat + budget guardrails

**Date:** 2026-07-26 · **Issue:** [MOO-410](https://linear.app/moodyco/issue/MOO-410) (epic MOO-409) · **Priority:** Urgent

> Design **locked** in the prior session (handoff §2). This spec writes it up, grounded
> in the real code. No re-brainstorm.

## Problem

The flagship "help me decide" feature — Voter Help chat at `/chat` — is **Clerk-gated**
(`src/middleware.ts` protects `/chat(.*)`; `sendMessage`/`getMyThread`/`listThreadMessages`
all throw "Sign in to use Voter Help"). The lost, undecided voter — the exact person the
tool is for — won't create an account to use it. Un-gating exposes an LLM endpoint to the
open internet, so it can't ship without cost/abuse guardrails.

## Goal

Let a **signed-out guest** use Voter Help, protected by cheap, hand-rolled backstops that
cap total and per-guest spend and can be killed instantly — with **no regression to answer
quality** (the golden gate stays the law).

## Scope (MVP — locked)

**In:** anonymous guest sessions · #1 global daily cap · #2 per-guest daily cap ·
#4 per-message bounds · #6 kill switch.
**Deferred to phase 2:** #3 bot wall (CAPTCHA/Turnstile) · #5 quota-nudge UX. (Reason
below — the transport makes per-IP/bot walls not cheaply doable here.)

## Key architectural constraint (discovered, drives the design)

The chat runs over the **Convex client** — a WebSocket straight to Convex, **bypassing
Vercel's edge/middleware**. So per-IP limiting and a bot wall aren't cheaply doable at the
transport layer → deferred. **`sendMessage` (`convex/voterHelpQueries.ts`) is the single
choke point** every message passes through, and it's a Convex **mutation** (transactional,
serializable) — so a hand-rolled counter row read-modify-written inside it is atomic
without any rate-limiter dependency. **The global daily cap is the true backstop.**

## Identity model

- **Guest id:** the `/chat` client generates a UUID once and stores it in
  `localStorage` as `bb_guest_id`; it passes it as a `guestId` arg on every call.
- **Resolved subject** (server, one helper): signed-in → the Clerk-linked `users._id`;
  else → `guest:<uuid>`. This string is the agent thread's `userId` (the agent component
  only needs a stable string) and the key for per-guest counting.
- **Trust note:** a guest could pass another guest's id and read that thread, but the id
  is an unguessable random UUID (same trust model as an opaque session token) and guest
  threads hold no PII — acceptable for MVP. Signed-in threads stay protected by the
  existing `users._id` ownership check.

## Guardrails — all in `sendMessage`, in this order (fail fast)

1. **Kill switch (everyone).** If `process.env.VOTER_HELP_DISABLED` is an explicit "on"
   value (parsed by `isKillSwitchOn` — unset/`""`/`"0"`/`"false"`/`"off"`/`"no"` are OFF,
   anything else is ON), throw a friendly `ConvexError` ("Voter Help is paused right now —
   try the guide.") before any work. Instant off-switch, no deploy. Raw truthiness on the
   string would leave `VOTER_HELP_DISABLED="false"` stuck paused, so the value is parsed,
   not just checked for presence.
2. **Global daily cap (guests only).** A new `chat_usage` day-counter table. Increment the
   `GLOBAL` row for today; if it exceeds `GUEST_DAILY_CAP` (default **500**, env-tunable),
   throw a friendly "Voter Help is busy today — signed-in users still have access; the
   guide is always open." **Signed-in users bypass** (never counted, never capped).
3. **Per-guest daily cap (guests only).** Increment the `guest:<uuid>` row for today; over
   `GUEST_MSG_CAP` (default **30**, env-tunable) → friendly "You've reached today's Voter
   Help limit — sign in for more, or come back tomorrow." Signed-in bypass.
4. **Per-message bounds** (already partial): `MAX_PROMPT_CHARS = 2000` input bound stays;
   output bound is added agent-side (below).

Counting order: check kill switch → resolve subject → if guest, increment+check global,
then increment+check per-guest → proceed. Increments happen in the same transaction as the
message save, so a thrown cap cleanly aborts with no partial write.

### `chat_usage` table (new, `convex/schema.ts`)

```ts
chat_usage: defineTable({
  subject: v.string(),   // "GLOBAL" or "guest:<uuid>"
  day: v.string(),       // "YYYY-MM-DD" (UTC, from Date.now())
  count: v.number(),
}).index("by_subject_day", ["subject", "day"]),
```

Day string = `new Date(Date.now()).toISOString().slice(0, 10)` (Convex mutations may use
`Date.now()`). No cleanup cron in MVP (rows are tiny; a future prune can sweep old days).

## Per-message bounds — agent side (`convex/voterHelp.ts`)

These change model output, so **they re-run the golden gate** (see Testing):
- **`maxOutputTokens` ≈ 1024** on the agent's generate/stream calls — caps the worst-case
  output per message.
- **Anthropic prompt caching** on the static system prompt + tool schemas (they're
  identical every call) to cut input cost — via the AI SDK's `providerOptions` cache
  control for `@ai-sdk/anthropic`. **Verify exact syntax against current AI SDK v6 / provider
  docs before implementing** (read the docs; don't rely on memory).
- **Trim `getRaceInfo`'s output** (~62KB pretty-printed today; there's already a 30K/tool
  truncation note in `generateAnswer`) so a single tool call can't blow the context/cost.
- **KEEP `stepCountIs(8)`** — reducing it is the most gate-risky lever and the handoff
  recommends against it; leave it unless a gate run proves headroom.

## Un-gate (`src/middleware.ts`)

Remove `/chat(.*)` from `isProtectedRoute`; **keep `/admin(.*)`**. That's the only
middleware change.

## Client (`/chat`)

The `/chat` page + its chat components (`src/components/chat/*`) must:
- On mount, read-or-create `bb_guest_id` in `localStorage` (guard for SSR — only touch
  `localStorage` in an effect/client boundary).
- Pass `guestId` (when signed-out) to `getMyThread`, `sendMessage`, `listThreadMessages`.
- Render the cap/kill `ConvexError` messages inline as friendly notices (not a crash).
- Drop any "sign in to use" wall/redirect for the chat itself.

## Files (indicative — plan will finalize)

- Modify: `convex/schema.ts` (add `chat_usage`), `convex/voterHelpQueries.ts` (subject
  helper + guardrails in `sendMessage`; `guestId` arg on the three public fns + ownership
  checks), `convex/voterHelp.ts` (maxOutputTokens + prompt caching + getRaceInfo trim),
  `src/middleware.ts` (un-gate), `src/components/chat/*` + `src/app/chat/*` (guest id +
  args + notices).
- Env (Convex prod + dev): `VOTER_HELP_DISABLED` (unset — `"0"`/`"false"`/`"off"` also read
  as OFF, only unset while `"1"`/`"true"` etc. turn it ON), `GUEST_DAILY_CAP=500`,
  `GUEST_MSG_CAP=30`.

## Error handling / edge cases

- Signed-in users: never counted, never capped, never killed by caps (kill switch still
  applies to everyone by design — it's the emergency off).
- Guest with no `bb_guest_id` yet (first load): client creates it before the first send;
  a missing/empty `guestId` on a signed-out send → treat as a fresh guest is impossible to
  count safely, so `sendMessage` throws a friendly "reload and try again" rather than
  counting under a blank subject.
- Day rollover: counts key on the UTC day string, so caps reset at UTC midnight (document
  it; WI is UTC-5/6 — acceptable for MVP, note as a known simplification).
- Cap error vs kill error: distinct friendly messages so the client can tell "busy today"
  from "paused".
- Concurrency: two near-simultaneous guest sends both increment; Convex mutation
  serializability makes the counter exact (no rate-limiter needed).

## Non-goals / guardrails

- No new dependency (no `@convex-dev/rate-limiter`).
- No change to answer content/behavior beyond the per-message bounds (and those must pass
  the gate).
- No IP logging, no bot wall, no CAPTCHA (phase 2).
- Guest threads are not linked to any account and store no PII.

## Testing

- **Unit** — the subject resolver + the counter/cap logic factored into a pure helper where
  possible (e.g. `overCap(count, cap)` and day-string), unit-tested; the cap paths tested
  via a Convex mutation test that stubs env caps low and asserts the Nth guest send throws
  while signed-in sends never do, and that the kill switch throws for everyone.
- **GOLDEN GATE (mandatory, the release law)** — the agent-side changes (maxOutputTokens,
  prompt caching, getRaceInfo trim) change output, so run
  `npm run eval:gate -- --name moo410 --baseline sonnet-5-tuned` **against PROD** (dev
  lacks prod data → false failures; only a prod run is valid). Gate = golden-expectations
  only (≥90% floor + ≤5pt drop, `scripts/eval-gate.mjs:351-357`). Because chat is currently
  Clerk-gated, the workable loop is deploy-to-prod → eval → **revert on fail** (used
  successfully for the matchBallotByIssues tool). Un-gating + guardrails ship only after a
  green gate.
- **Manual/live (prod, signed-out)** — a guest can send and get a streamed answer; the
  per-guest cap trips at the configured limit with the friendly notice; `VOTER_HELP_DISABLED=1`
  pauses everyone within seconds; signed-in users are unaffected by caps.

## Open inputs (defaults chosen — override anytime, they're env-tunable)

- **Cap numbers:** `GUEST_DAILY_CAP=500`, `GUEST_MSG_CAP=30` (proposed defaults). Tunable
  in Convex env with no deploy.
- **`stepCountIs`:** keep at 8 (do not reduce — gate risk).

## Dependencies / sequencing

- Independent of Feature A and Feature B. The agent-side bounds are the only gate-sensitive
  part; everything else (guest identity, counters, kill switch, un-gate) is behavior-neutral
  to the model and safe.
- **Deploy needs BOTH** `npx convex deploy --yes` (new table + function changes + env) and
  `npx vercel --prod` (middleware). Set the three Convex env vars before/at deploy.
