# BadgerBrief — Milestone 1 Design Spec

**Date:** 2026-07-17
**Status:** Approved design, pending spec review
**Target:** Live before the Wisconsin partisan primary, August 11, 2026 (aim: ~Aug 4)

## What this is

BadgerBrief is a Wisconsin-first, non-partisan, source-linked voter guide and election
intelligence platform (full vision: `docs/wisconsin-voter-guide-prd-proposal (1).md`).
This spec covers **Milestone 1**: the entire PRD spine, thin but end-to-end — public
guide, accounts, AI-generated personal voter briefs, voter help chat, background
research/monitoring agents, and an editorial review workflow — seeded from the
2026 primary dataset and shipped before the August 11 primary.

This is a side/education project. Scope decisions favor learning value and shipping
against the real election calendar over polish. Later milestones (§12) fatten every
layer for the November 3 general.

## Decisions made during brainstorming

| Decision | Choice | Why |
|---|---|---|
| M1 target | Full platform spine, live before Aug 11 primary | Real deadline forces a shakedown of the data model; agents included from day one |
| Agent runtime | **Convex-native** (`@convex-dev/agent` + `@convex-dev/workflow`), not Vercel Eve | Agents live beside the data; tools are typed calls to our own Convex functions; one backend, one deploy; best learning-to-plumbing ratio |
| Monitor "agent" | Plain Convex cron jobs, no LLM loop | It's scheduled fetching + diffing; an agent adds nothing |
| State campaign finance | Manual Sunshine CSV download → import script | No public API; scraping their internal backend is fragile and legally gray. Non-commercial use only per Wis. Stat. § 11.1304(12) — visible footer disclosure required |
| Ad tracker | **Meta in M1** (launch differentiator); Google in M2 | Meta Ad Library has a real API with political-ad archive; **blocker: Meta developer app + political-ad identity confirmation takes 1–3 business days** (applied 2026-07-17). Google has no Transparency Center API, but publishes political ads as the free public BigQuery dataset `google_political_ads` — no application or verification needed, so it can safely wait for M2 |
| Brief rendering | **Generative UI via OpenUI** (`@openuidev/react-lang`), composition-only | Agent composes approved components by entity ID; facts come from published data at render time (§7) |
| SEO/AEO | First-class requirement | Public pages SSR/ISR with JSON-LD; being cited by AI answer engines is the growth strategy (§8) |
| Agent observability & evals | **Arize** (OTel/OpenInference tracing + LLM-as-judge evaluators) | Every agent run traced; trust-critical behaviors (citation faithfulness, neutrality, official-source-first) evaluated continuously and pre-deploy (§10a) |
| Auth | Clerk, personal accounts only; roles via metadata | Clerk Organizations deferred to M3 (solo editorial team) |

## 1. Architecture

One Next.js app (App Router, TypeScript), one Convex backend, Clerk auth.
RetroUI (neobrutalist) components with the Wisconsin palette and CSS tokens defined
in the PRD (`bb-cardinal` #C5050C primary, `bb-cream` #FFF7ED background, etc.).
LLM calls via the Vercel AI SDK (Claude models) inside Convex actions.
Firecrawl for page extraction.

```
Public pages (SSR/ISR + JSON-LD) ──reads──▶ Convex: published tables only
Signed-in app (briefs, chat)     ──Clerk──▶ Convex: user tables + agent threads
Admin/review dashboard  ──Clerk role gate─▶ Convex: draft + review tables
Convex crons: finance sync, source monitoring, freshness checks
Convex agents: VoterHelp, Brief, Research, EditorialQA
```

**Pipeline rule (inviolable):** the public UI reads stored, reviewed data only.
No live LLM output ever renders on a public page. Agents write to draft tables,
review queues, or per-user artifacts — never to published civic data.

**Server rendering rule:** public pages use Convex server-side fetching
(`preloadQuery`/`fetchQuery`) with ISR. Client-side reactivity only where it earns
its keep: chat, brief generation view, admin dashboard.

## 2. Data model (Convex tables)

### Civic core (seeded from `docs/wisconsin_2026_primary_elections.json`)
- `elections` — cycle, primary/general dates, type
- `races` — 16 seeded races: office, level, dates, incumbent, race ratings, source links
- `candidates` — name, party, status, background, occupation, FEC ID / Sunshine refs, campaign site, source links
- `sources` — registry: URL, outlet, type (official / campaign / reported / ad-library), first/last fetched
- `voting_info` — registration, absentee, early voting, ID rules, deadlines, official URLs

A one-time import script maps the JSON into these tables, preserving every source
link and the `data_as_of` stamp. The Research Agent later *enriches* these records;
it never creates public content from scratch.

### Finance
- `finance_totals` — per candidate: receipts, disbursements, cash on hand, coverage date, source (`openfec` | `sunshine`)
- `contributions` — top contributions only in M1: donor name, amount, date, committee

Federal: daily cron against OpenFEC (`/candidates/totals/`; FEC IDs for all 14 WI
House candidates are in `docs/Wisconsin 2026 Campaign Finance Integration Guide.md`).
State: manual CSV download from campaignfinance.wi.gov → `pnpm import:sunshine <file>`,
run after each filing deadline (next: July 29 pre-primary).

### Ads (Meta, M1)
- `ads` — Meta ad archive ID, page/committee, candidate ref (with match confidence), creative text/link, first/last seen, status, spend range, impression range, funding entity, ad snapshot URL
- `ad_metrics_daily` — per-ad daily spend/impression range snapshots for the timeline view

Sync: Meta Ad Library API cron (daily; hourly in the final week before the primary)
querying known candidate pages and committee names. Ad→candidate matches below a
confidence threshold go to `review_tasks` instead of publishing (PRD rule: no
ad-sponsor match published without confidence level + sponsor evidence).
Prerequisite: Meta developer app + political-ads identity confirmation — apply at
project start, before any code depends on it.

### Intelligence (draft/published pairs)
- `candidate_positions_drafts` / `candidate_positions_published` — issue slug, stance label (support/oppose/mixed/evolving/unclear), summary, confidence, source links, review status
- `quote_drafts` / `quote_published` — speaker, text, context, outlet, date, source URL
- `review_tasks` — record ref, type, QA scores, status, reviewer note
- `source_fetch_logs` — URL, timestamp, status, content hash
- `alerts` — staleness flags, source-change notices, sync failures

### Users
- `users` (Clerk-linked), `user_preferences` (address, districts, saved races, issues, detail level), `voter_briefs` (OpenUI Lang source + metadata, §7)
- Agent threads/messages: managed by the agent component's own tables

### Publish gates (enforced as Convex validators on publish mutations)
- Quote: requires speaker, source URL, date, excerpt, context
- Position: requires issue tag, summary, ≥1 source link, review status = approved
- Voting rule/deadline: requires official-source URL + last-checked timestamp
- Finance record: requires source + coverage date

Invalid records physically cannot publish. Every public-facing claim traces to `sources`.

## 3. Agent layer

All agents are `@convex-dev/agent` instances inside Convex. Governance is
structural: each agent is handed only the tools for tables it may touch.
**No agent ever receives a publish mutation.**

### Voter Help Agent (user-facing chat)
- Tools: read-only queries over published tables + `voting_info`; `handoffOfficialLink`
- Instructions: official sources first for procedural guidance; always cite; disclose uncertainty; no legal advice; no endorsements
- One thread per user; history persists via the agent component
- Fallback: when uncertain, answer with the official link rather than guessing
- Responses may include inline OpenUI components (§7) — e.g. a `VotingChecklist` in answer to "how do I vote absentee?"

### Brief Agent (durable workflow)
- Input: user ID, election, preferences (districts, saved races/issues, detail level)
- Steps: resolve ballot-relevant races for user's districts → fetch published summaries, finance snapshots, voting checklist via tools → compose brief as OpenUI Lang → validate/parse → write to `voter_briefs`
- Durable workflow: transient LLM/tool failures retry; parse failures regenerate
- Uses only published/official data; distinguishes facts, candidate claims, editorial summaries; includes update timestamps

### Research Agent (cron-triggered)
- Firecrawl-extracts candidate sites (URLs from seed JSON) and approved article pages
- Drafts issue positions and quote candidates with confidence scores → writes to draft tables + creates `review_tasks`
- Records source URL, fetch time, extraction confidence in `source_fetch_logs`
- Never overwrites reviewed records without versioning

### Editorial QA Agent (on-demand from admin dashboard)
- Per draft: claim-support scoring against sources, missing-citation detection, neutral-rewrite suggestion, diff vs. prior version
- Advisory only; results attach to the `review_tasks` record

### Monitor (plain crons, no LLM)
- Daily OpenFEC totals sync
- Meta Ad Library sync (daily; hourly in the final pre-primary week); new-ad
  detections and low-confidence sponsor matches written to `alerts`/`review_tasks`
- Source-change detection: re-fetch registered sources, hash-compare, write `alerts`
- Staleness sweep: flag published records whose sources exceed freshness windows

## 4. Address relevance

Census Bureau geocoder (free, no key) maps address → congressional + state
legislative districts → filters the seeded races to the user's ballot. Polling-place
lookup and absentee workflows remain link-outs to myvote.wi.gov — MyVote stays the
canonical source for official voting actions, clearly labeled.

## 5. Auth & personalization

Clerk (magic link + Google). Signed-in users save address/districts, star races,
select issues, set detail level, generate briefs, use chat. `admin`/`editor` roles
via Clerk metadata gate `/admin`. Personalization is utility-only: geography,
saved issues, density — never inferred ideology, never candidate suppression.

## 6. Editorial workflow

`/admin` dashboard:
- Review queue: drafts side-by-side with source excerpts and QA scores
- Approve / edit / reject; edits re-run QA scoring
- Diff view when a draft updates an existing published record
- Audit log of every publish decision

Human approval is mandatory for all positions and quotes before publish.
In M1 the editorial team is the project owner.

## 7. Generative UI for briefs (OpenUI)

**Principle: generative composition, not generative content.** The LLM decides
which components, in what order, for which entities. It does not write facts.

- Component library via `defineComponent` + Zod: `RaceCard`, `CandidateCompareCard`,
  `IssueStanceCard`, `QuoteCard`, `VotingChecklist`, `DeadlineBanner`,
  `SourceTrustLabel`, `BriefHeader`, `Stack`/`Grid` layout primitives — the same
  RetroUI components the public site uses
- **Components take entity IDs, not facts** — `RaceCard("WI-GOV-2026")`; the
  renderer fetches the published record from Convex at render time. Hallucinated
  facts are structurally impossible, not just discouraged
- Limited free text (section intros, "why this matters to you") renders in a
  visually distinct "assistant note" style
- `library.prompt()` generates the Brief Agent's UI-composition instructions;
  the parser validates output against the library schema; off-registry output fails
  parsing and the workflow retries
- **Briefs are stored as OpenUI Lang source** in `voter_briefs`, not baked HTML.
  Saved briefs re-render against current published data — a corrected deadline
  propagates to every saved brief automatically
- Streaming: progressive render with skeletons while the workflow streams
- Print/PDF: server-render with data resolved at export time, stamped
  "generated [date]" — snapshot on paper, live in app
- Fallback if OpenUI disappoints: agent outputs sectioned JSON, deterministic
  renderer, same component set (~90% shared code)

Packages: `@openuidev/react-lang` (core); `@openuidev/react-headless` for the chat
surface if useful.

## 8. Public pages + SEO/AEO

Routes: `/` (statewide highlights + address entry), `/races/[slug]`,
`/candidates/[slug]`, `/compare/[race]`, `/vote` (logistics hub + FAQ), and
`/ads` (ad tracker: creative gallery, search by candidate/committee/keyword,
spend timeline). Race and candidate pages embed an ad-activity module
(`AdCreativeCard` + spend timeline). All SSR/ISR.

- JSON-LD via `@graph`: `Person` (candidates), `Event` (elections), `FAQPage`
  (`/vote`), `BreadcrumbList` (all), `Organization` (BadgerBrief)
- Question-form H2s matching real queries ("Who is running for Governor of
  Wisconsin in 2026?"); direct answer in the first paragraph; comparison tables
- Visible "Last updated" + `dateModified` in structured data
- Canonical URLs, `sitemap.xml`, `robots.txt` **allowing** GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended — being cited by answer engines is the growth
  strategy
- Every claim links its primary source; data-type labels (official / campaign /
  reported) double as EEAT signals
- Footer: non-partisan mission statement, methodology link, Sunshine data
  non-commercial disclosure

## 9. Error handling

- Every external fetch logged to `source_fetch_logs`; failures flag staleness,
  never delete data; pages degrade to last-good data with visible timestamps
- Agent workflows retry transient failures; Voter Help falls back to official links
- Import scripts validate against Convex schema before writing; partial imports roll back
- User-facing errors are friendly; server logs carry full context

## 10. Testing & verification

Automated (Convex function tests) on trust-critical logic:
- Publish-gate validators reject incomplete records
- District matching: known addresses → correct race sets
- Brief assembly: only published/official data reaches the composer
- OpenUI output for a fixture brief parses against the library schema

Pre-launch manual verification (from the PRD):
- Known WI address → displayed election info matches official sources
- Sampled quotes link to original sources with accurate excerpts
- Absentee instructions match current official guidance
- A generated brief contains only reviewed, source-linked content
- Sampled ad records match their Meta Ad Library entries (sponsor, spend range, dates)
- JSON-LD passes Google Rich Results Test

## 10a. Agent observability & evals (Arize)

The agents are the trust surface, so they get production-grade observability from
day one — this is also the core learning payoff of the project.

**Tracing.** All LLM calls run through the Vercel AI SDK inside Convex actions;
enable AI SDK telemetry and export via OpenTelemetry (OpenInference conventions)
to Arize. Every agent run — prompts, tool calls, retrievals, outputs, latency,
token cost — becomes an inspectable trace. Conventions:
- One Arize project for the app; spans tagged with `agent.name`
  (voter-help / brief / research / editorial-qa)
- Agent threads map to Arize sessions (session id = thread id); user id tagged
  for signed-in surfaces
- `review_tasks` and `voter_briefs` records store their originating trace id, so
  any published summary or brief links back to the exact run that produced it
  (use the arize-link skill to deep-link traces from the admin dashboard)

**Evaluators (LLM-as-judge + code checks), run continuously on sampled
production traces and as pre-deploy experiments:**
- *Citation faithfulness* — is every factual claim in an answer/draft supported
  by its cited source excerpt?
- *Neutrality* — does output avoid endorsement, persuasion framing, or loaded
  language? (maps to the PRD's non-partisan policy)
- *Official-source-first* — do procedural voting answers cite official sources
  or hand off to MyVote?
- *Refusal correctness* — does Voter Help decline legal advice and disclose
  uncertainty when data is thin?
- Code evaluators: OpenUI Lang output parses against the library schema; every
  entity ID referenced in a brief exists in published tables

**Golden dataset.** A fixture set of voter questions ("how do I vote absentee in
Milwaukee?", "who's running for governor?") and brief-generation inputs with known
correct properties. Every agent prompt/instruction change runs as an Arize
experiment against this dataset before deploy; regressions block the change.

**Alerting.** Eval-score drops or elevated failure rates write to `alerts` and
surface on the admin dashboard alongside editorial flags.

## 11. Out of scope for M1

Google political ads adapter (M2 — see §12; BigQuery public dataset, no
lead-time blocker), ad-message clustering,
polling module, SMS/email reminders, semantic related content, audio/multilingual,
Clerk Organizations / partner workspaces, county/municipal races, Oxylabs,
automated Sunshine scraping, PDF service (browser print covers M1).

## 12. Later milestones

- **M2 (Sept–Oct, for Nov 3 general):** general-election data, Google political
  ads adapter, ad-message clustering, polling module + methodology labels,
  reminders, semantic related content, brief invalidation/refresh triggers

  *Google political ads adapter (specified):* weekly cron queries the public
  BigQuery dataset `google_political_ads` (advertiser spend, weekly spend by
  geography, creative stats for US election ads) filtered to Wisconsin
  advertisers/candidates, normalized into the same `ads` / `ad_metrics_daily`
  tables with `platform: "google"`. Requires only a Google Cloud project +
  BigQuery free tier — no application or identity verification. Known limits,
  labeled in the UI: data is aggregated and updated on a lag (spend ranges and
  trends, not same-day creative monitoring), so Meta remains the real-time
  source and Google the spend-trend source. Ad→candidate matching follows the
  same confidence-threshold + review-queue rule as Meta.
- **M3 (post-election):** Google ads adapter, multilingual/audio briefs, partner
  workspaces (Clerk Orgs), county/municipal expansion, analytics warehouse if needed
