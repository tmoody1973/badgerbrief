# MOO-305 — OpenUI component library + brief renderer (design)

Approved 2026-07-18. Parent spec: `2026-07-17-badgerbrief-m1-design.md` §7.
Linear contract: MOO-305 (Intent/Acceptance/Verification live there).

## Decisions made during brainstorming

- **Compare card:** matrix capped at 4 candidates + "see full race" link; agent
  picks which 4 for larger fields (gov Dem primary has ~6 actives).
- **Brief shape:** single scroll in ballot order; contested races float first
  within each group (statewide, congressional, legislative). No tabs.
- **FinanceSnapshot:** added to the registry as a deliberate contract addition
  (not in the original MOO-305 list) — wraps the existing panels in
  `src/components/guide/finance.tsx`. Noted on the Linear issue.
- **Route:** `/brief`, Clerk-gated. `/vote` stays the public how-to-vote page.
- **detailLevel:** composition-level only for M1 (agent emits fewer/more
  components; no per-component density modes).
- **Print:** `<details>` drill-downs print expanded.

## 1. Rendering architecture

OpenUI's `<Renderer />` is a client component (progressive re-render as the
parser consumes a stream), so the handoff's "server components per component"
idea is replaced by:

- `/brief` page shell = **server component**: Clerk gate, loads saved OpenUI
  Lang source from `voter_briefs`, passes it to a client `<BriefRenderer />`.
- `<BriefRenderer />` = client: OpenUI parser + `<Renderer />` over the
  registry.
- Each data component = client component calling `useQuery(api.public.*)` with
  its entity ID. One mechanism serves three acceptance criteria:
  - `useQuery` returning `undefined` = the loading skeleton (streaming +
    initial load look identical);
  - entity-ID resolution happens at render time — the LLM never writes facts;
  - Convex reactivity re-renders saved briefs against current published data
    (a corrected deadline propagates live).

Fallback if client rendering disappoints (bundle size, print quality):
server-side parse + async RSCs with `fetchQuery` — loses streaming and
reactivity, so only as a last resort.

Packages: `@openuidev/react-lang@^0.2.8` (peer deps verified compatible:
react 19, zod 4; no `ai` coupling).

## 2. Component registry

`src/lib/brief/library.ts` (defineComponent + createLibrary) with renderers in
`src/components/brief/`. RetroUI-styled, reusing existing `guide/` components
where they fit.

| Component | Props (IDs/enums only) | Data source |
|---|---|---|
| `Stack`, `Grid` | children | — (layout) |
| `BriefHeader` | — | election date constant; days-to-election countdown |
| `DeadlineBanner` | deadline key | `getVotingInfo` |
| `VotingChecklist` | — | `getVotingInfo` |
| `RaceCard` | raceId | `api.public.getRace` |
| `CandidateCompareCard` | raceId, candidateIds (max 4) | published candidates |
| `IssueStanceCard` | candidateId, issue | published positions |
| `QuoteCard` | candidateSlug | published quotes w/ sources (no quote-ID natural key exists; renders up to 2 for the candidate) |
| `FinanceSnapshot` | candidateId | existing finance panels |
| `AssistantNote` | text (free text) | — |

- `AssistantNote` is the **only** component accepting free text; visually
  distinct "assistant note" style.
- `SourceTrustLabel` is baked into every data component's footer, not emitted
  standalone by the agent.

## 3. Safety contract

- Zod schemas accept IDs/enums only — no fact-shaped props outside
  `AssistantNote`.
- Off-registry component → parser rejection (vitest proves it).
- Unknown entity ID → `api.public.*` returns null → safe "not found" fallback
  card, never a crash.
- All reads via `api.public.*` (published tables only — structural publish
  gate, per parent spec §2).

## 4. Composition guidance

Brief shape rules (ballot order, contested-first, checklist near top) live in
`library.prompt()` composition guidance + a hand-written fixture brief in
OpenUI Lang. Enforcing them agent-side is MOO-311, out of scope here.

## 5. Print

`@media print` stylesheet on `/brief`: force `details[open]`, drop nav/chrome,
stamp "generated [date]". Verified by print-preview screenshot.

## 6. Verification (mirrors Linear checklist)

1. Fixture brief (hand-written OpenUI Lang) rendered against seeded data —
   screenshot with real race/candidate content.
2. Parser fed invented component → rejection; invented entity ID → fallback
   card.
3. `library.prompt()` output captured to a file for MOO-311.
4. Print preview screenshot.
5. Vitest: parser rejection test + prompt-capture test (`npx vitest run`).

## Out of scope

Brief Agent (MOO-311), chat surface integration, AdActivityCard (MOO-315/318),
PollSnapshot (MOO-317).
