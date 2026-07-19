# MOO-310 Voter Help Agent — design (2026-07-19)

Issue is the contract (Linear MOO-310); spec §3 Voter Help. This records the
decisions made before building.

## Decisions

1. **Streaming: agent-native** (Tarik picked over MOO-311's DB-chunk pattern).
   `saveMessage` in a mutation → scheduled `"use node"` action calls
   `agent.streamText(..., { saveStreamDeltas: true })` → client merges via
   `useThreadMessages(query, { stream: true })` where the query pairs
   `listMessages` + `syncStreams`. The agent component owns thread/message
   tables; we add none.
2. **One thread per user, lazily created** on first message. Lookup:
   `components.agent.threads.listThreadsByUserId`; no new schema.
3. **Tools (all read-only, spec §3 governance — no publish mutations):**
   - `getVotingInfo` → `api.public.getVotingInfo` (deadlines, official URL)
   - `getMyBallot` → district-filtered races via `relevantRaces` +
     `user_preferences` (internal query; empty answer when no districts saved)
   - `getRaceInfo` → `api.public.getRace` (candidates + published positions + finance)
   - `getCandidateInfo` → `api.public.getCandidateBySlug` (published positions + quotes)
   - `handoffOfficialLink` → static canonical map (myvote.wi.gov flows,
     bringit.wi.gov, elections.wi.gov) so the model never invents URLs
4. **Instructions enforce:** official-source-first, always cite (markdown
   links), disclose uncertainty, no legal advice, no endorsements; uncertain →
   `handoffOfficialLink` fallback instead of guessing.
5. **Telemetry:** new shared `convex/lib/agentTelemetry.ts` (the MOO-325
   target shape — existing 5 copies migrate there under MOO-325, not here).
   AGENT span with `session.id = threadId` (acceptance), manual TOOL + LLM
   spans (v0.6 doesn't forward experimental_telemetry).
6. **UI:** `/chat`, Clerk-gated in middleware like `/brief`. Client renders
   `toUIMessages` + `useSmoothText`; tiny markdown-link renderer (no new dep).
   Failed runs save a visible assistant apology + official link.
7. **Tests** follow the briefs.test.ts convention: cover paths that stop
   before the agent component (auth guards, input validation, ballot query,
   official-link map); thread/stream behavior is live-verified.

## Out of scope (per issue)
Anonymous chat, OpenUI inline components (fast-follow), voice.
