# MOO-311 — Brief Agent + preferences: design spec

Date: 2026-07-18. Contract: Linear MOO-311 (Intent/Acceptance/Verification),
M1 spec §3 "Brief Agent" + §7 (OpenUI), composing over the MOO-305 registry
(`docs/superpowers/specs/2026-07-18-moo-305-openui-brief-renderer-design.md`).

## Decisions (resolved with Tarik 2026-07-18)

- **(a) Streaming transport: DB-chunk streaming.** The workflow's generate step
  streams LLM deltas and flushes them to the `voter_briefs` row (~250ms
  throttle). The client's `useQuery` reactivity delivers progressive render;
  refresh/tab-close resumes for free. No HTTP action streaming.
- **(b) Data access: prefetch, not tools.** A deterministic workflow step
  assembles the full context block (races, positions, quotes, finance,
  voting info for the user's districts). The compose step is a single
  `generateText`/`streamText` call with **no tools** — the LLM arranges entity
  IDs it was handed and cannot fetch anything else. Spec §3's "via tools"
  wording is satisfied in intent (published-data-only, structurally enforced).
- **(c) Retry policy: 3 attempts with parser-error feedback.** On end-of-stream
  parse failure, retry with the serialized `meta.errors`/`meta.unresolved` as a
  corrective message; streamed text resets each attempt. After 3 failed
  attempts → `status: "failed"` + user-facing retry CTA. Never a broken save.
  Transient LLM/network failures are handled separately by workflow step
  retries.
- **(d) Preferences UI: on `/brief`.** One page owns the loop: prefs panel +
  Generate CTA + brief display. No separate route.
- **(e) detailLevel: composition-level only** (locked in MOO-305 spec; the
  prompt carries the rule and a test guards it). No per-component density.
- **Briefs are history rows.** Every generation is a new `voter_briefs` row.
  Newest ready row = current brief; the saved-briefs list shows prior
  generations. No in-place mutation of a single row per user (beyond streaming
  updates to the row being generated).

## Workflow (Convex, `@convex-dev/workflow`)

Kickoff: `briefs.generate` mutation (authed) validates prefs exist
(districts required), inserts a `voter_briefs` row with
`status: "generating"`, empty `openuiSource`, and starts the workflow with
`{userId, briefId, electionSlug}`.

1. **Resolve context (deterministic, no LLM).** Load `user_preferences` →
   `relevantRaces(districts)` (senate odd/up-in-2026 filter from
   `src/lib/districts.ts`) → fetch published positions/quotes, finance
   snapshots, `voting_info` checklist + deadlines through the same read
   surface the public site uses. Assemble one context block. Sparse data stays
   in with explicit "no published data" markers so the LLM composes around
   gaps instead of inventing.
2. **Compose (LLM).** `claude-opus-4-8` via AI SDK. System prompt =
   `briefPrompt` from `src/lib/brief/prompt.ts` (NOT raw `library.prompt()` —
   the fabrication rule is stripped there). User message = context block +
   preference directives (starred races first, issue filter, detailLevel
   composition rule). Stream deltas; flush to the row's `openuiSource` on a
   ~250ms throttle.
3. **Validate.** `createParser(briefLibrary.toJSONSchema()).parse(source)`.
   End-state `meta.errors` or `meta.unresolved` ⇒ failed attempt → retry per
   (c). Success ⇒ `status: "ready"`, stamp `generatedAt` + Arize `traceId`.
4. **Telemetry.** Manual AGENT/LLM spans per the `convex/helloAgent.ts`
   pattern (@convex-dev/agent v0.6 does not forward
   `experimental_telemetry`). Arize project `badgerbrief`. The workflow's
   traceId is written to the brief row for provenance.

Governance is structural: the workflow holds no publish mutations, prefetch
reads only published/official tables, free text renders only through
`AssistantNote` (registry-enforced), no endorsement language (prompt-enforced,
existing test).

## Schema changes (additive)

`voter_briefs` gains:

- `status: v.optional(v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")))`
  — optional so pre-existing rows stay schema-valid; readers treat missing as
  `"ready"`. New rows always set it.
- `attempt: v.optional(v.number())` — current attempt (1–3), for UI copy
  ("refining…") and debugging
- `error: v.optional(v.string())` — terminal failure reason (user-safe)

Existing fields unchanged. No migration needed.

## Convex functions

- `convex/briefs.ts` — `getMine` becomes "latest + history": `getLatest`
  (newest row for user, any status) and `listMine` (ready rows, newest first).
  New `generate` mutation (kickoff above). Internal mutations for the workflow:
  `appendChunk` (throttled source writes + attempt), `finalize`
  (ready/failed transitions). Queries/mutations stay out of any `"use node"`
  module (gotcha 3) — the workflow/LLM step lives in a node action file,
  siblings hold queries/mutations.
- `convex/preferences.ts` — new `savePrefs` mutation for
  `savedRaceIds`/`savedIssues`/`detailLevel` (schema fields already exist);
  `saveDistricts` unchanged.

## `/brief` surface

Signed-in:

- **Preferences panel**: `BallotFinder` (address→districts, existing), star
  races (checkbox list from `relevantRaces`), issue picker, detail level
  (short/standard/deep). Saves via `savePrefs`/`saveDistricts`.
- **Generate CTA**: disabled until districts exist; fires `briefs.generate`.
- **Brief display**: `BriefLoader` subscribes to `getLatest`.
  `"generating"` → partial `openuiSource` through `BriefRenderer`
  (`isStreaming` skeletons; attempt > 1 shows "refining…").
  `"ready"` → rendered brief + `generatedAt` stamp. `"failed"` → error state +
  retry button. Regeneration keeps the previous ready brief visible until the
  new row starts streaming.
- **Saved briefs list**: `listMine`, selecting an old row re-renders its
  stored Lang against current published data (live re-render is the point).
- Print CSS + beforeprint `<details>` expansion already done (MOO-305).

Signed-out: fixture demo unchanged.

## Error handling

- No districts → generate blocked in UI and validated in the mutation.
- Transient LLM/tool failure → workflow step retry (component defaults).
- Parse failure → per (c); terminal failure sets `status: "failed"` +
  user-safe `error`, detailed context to server logs/Arize.
- Sparse published data → brief still generates; components render their
  null/fallback states (MOO-305 behavior); AssistantNote may say coverage is
  limited — never invented facts.

## Testing & verification

Unit/integration (vitest, node env where needed):

- Context assembly: district fixtures → exact expected race set (reuse MOO-307
  verification data).
- Retry loop: parser-failure fake → corrective message contains serialized
  errors; 3rd failure → failed status; success path stamps traceId.
- `savePrefs` validation; history-row semantics (`getLatest` vs `listMine`).
- Existing guard tests stay green (briefPrompt fabrication-rule strip, 47 ✓).

Against reality (Linear verification checklist):

- Real Milwaukee address → district-correct races only (vs MOO-307 data).
- 5 rendered claims traced to published source rows.
- Edit `voting_info` deadline → saved brief re-renders updated value.
- Print preview screenshot (take-to-the-polls doc).
- Stored OpenUI Lang attached to MOO-311 as evidence.
- Headless Clerk sign-in per handoff gotcha 5 for browser verification.

## Out of scope

SMS/audio formats; brief invalidation triggers (M2); anonymous briefs; chat
surface (MOO-310); per-component density knobs; HTTP streaming transport.
