# Handoff — Meta + Google ad trackers (MOO-309, MOO-315)

**Next session's job:** get ad-tracking credentials in place and build both adapters.
Repo `/Users/tarikmoody/Documents/Projects/badgerbrief`. Live: https://badgerbrief.vercel.app
Primary **Aug 11 2026**; launch gate MOO-314 due **Aug 4**. Today is 2026-07-20.

---

## 🔴 DO THIS FIRST — rotate five leaked API keys

In the previous session I ran `npx convex env list --prod` with a bad `awk` filter and
**printed the real secret values into the transcript**. These are compromised and must be
rotated in the Convex prod deployment (`precious-axolotl-906`):

- `ANTHROPIC_API_KEY` ← highest cost exposure
- `FIRECRAWL_API_KEY` ← second highest
- `ARIZE_API_KEY`
- `OPENFEC_API_KEY`
- `PERPLEXITY_API_KEY`

`CLERK_JWT_ISSUER_DOMAIN` is not a secret — ignore it.

Rotate at each provider, then `npx convex env set <NAME> <VALUE> --prod`. **Never print env
values**: use `npx convex env list --prod --json | jq -r 'keys[]'`, or just `env get` a
single name when you need to confirm existence.

---

## Reality check before you start

Both trackers are **schema-only**. Do not trust "unblocked" to mean "ready":

| | Meta (MOO-309) | Google (MOO-315) |
|---|---|---|
| `ads` + `ad_metrics_daily` tables | ✅ exist (`convex/schema.ts:214-250`) | ✅ same tables |
| Adapter code | ❌ **none** — no `convex/ads*.ts` exists | ❌ none |
| Credentials in Convex | ❌ none | ❌ none |
| External blocker | ✅ cleared 2026-07-20 | never had one |

Meta's blocker clearing means Tarik may now *apply for* API access — not that a token exists.

---

## Credential setup (Tarik must do these; you cannot)

**Meta.** Identity confirmation is **Confirmed / United States** for both "Page publishing
authorization" and "Running ads about social issues, elections or politics" (approved
2026-07-20, applied 07-17 — evidence on MOO-309). Remaining: create a Meta app, add Ad
Library API access, generate a user token with `ads_read`, then exchange it for a
long-lived token. Short-lived tokens expire in ~1h, so the cron needs the long-lived +
refresh path — that refresh handling is explicitly in scope on MOO-309.

**Google.** `google_political_ads` is a public BigQuery dataset, but querying still needs a
GCP project with billing enabled plus a service-account key. Free tier (1 TB/month) covers
this workload; setup is the only gate. Store the service-account JSON as a Convex env var.

**Build against fixtures while waiting** — this is how MOO-309 is already scoped. Swapping
in live credentials should then be config, not a rewrite.

---

## Where the specs live — read these, don't re-derive

- **MOO-309** (Meta) and **MOO-315** (Google) carry full acceptance criteria and
  verification checklists. MOO-309's comment thread has the 2026-07-20 unblock evidence.
- **MOO-316** ad-message clustering depends on real creatives existing — do not start it.
- **MOO-318** FCC broadcast is the third ad channel, Backlog.
- Spec §2 (ads) and §12 (FCC) in the M1 design doc.

**Non-negotiable product rule already in the issue:** ad→candidate matches below the
confidence threshold go to `review_tasks`, never straight to public pages. This project's
whole trust posture is "agents draft, humans publish" — keep it.

---

## Patterns to follow (this codebase has strong precedent)

- **Read `convex/_generated/ai/guidelines.md` first** — it overrides training-data
  assumptions about Convex.
- **Next.js here is not the Next.js you know** — check `node_modules/next/dist/docs/`
  before writing app code (see `AGENTS.md`).
- Adapter shape: follow `convex/finance.ts` (OpenFEC + Sunshine sync) — it is the closest
  analog for "external API → upsert → cron".
- `"use node"` modules may only export **actions**; queries/mutations live in a sibling
  `*Queries.ts`. See `convex/research.ts` ↔ `convex/researchQueries.ts`.
- Cron registration: `convex/crons.ts` (scout 11:00 UTC, site mapper 11:30, research 12:00,
  monitor 12:15, staleness 12:30 — pick a non-colliding slot).
- Idempotent upserts + never overwriting enriched rows: `convex/seed.ts`
  (`addBallotCandidates`, `setPhoto`, `setCampaignWebsite`, `mergeDuplicateCandidate`).
- Deploy order: `npx convex deploy -y` **before** `npx vercel deploy --prod --yes`.
- 160 tests currently green (`npx vitest run`); `npx tsc --noEmit` and `npx next build` clean.

**Eval gate:** `docs/eval-gate.md` is law — any agent prompt/instruction/model change runs
`pnpm eval:gate` against baseline experiment `sonnet-5-tuned` first. Pure data adapters
don't trigger it; an LLM-based ad classifier would.

---

## Landmines earned the hard way (don't repeat these)

- **`npx convex data <table>` silently defaults to `--limit 100`.** Every count from it is
  truncated. Pass `--limit 5000`. This invalidated a whole before/after analysis.
- **Verify against WEC, not the seed JSON.** `docs/wisconsin_2026_primary_elections.json` is
  incomplete — it was missing 20 congressional candidates and 15 candidate photos. The
  authority is `.playwright-mcp/All-Contests-and-Candidates.xlsx`
  (`elections.wi.gov/media/40146/download`). Parse it via `<x:row>`→`<x:c>`→`<x:v>` — it has
  **no sharedStrings** and uses `x:`-namespaced tags, so naive `<t>` regexes return zero.
  Contest names are UPPERCASE.
- **Never name-match an external record to a candidate without a Wisconsin + office check.**
  Name-only lookups returned an American bobsledder for "Mike Kohn" and a Scottish Labour MP
  for "Douglas Alexander". This applies directly to ad→candidate matching.
- **Resolve near-miss name variants before bulk insert.** An exact-name join treated
  "Don Raihala" vs "Donald Raihala" as different people and duplicated them on a live page.
- **Never poll a deploy with tight curl loops** — it trips Vercel bot mitigation
  (`x-vercel-mitigated: challenge`, HTTP 403) and then you cannot verify your own work.
  Poll via the browser or `npx vercel ls --prod`. Also: grep for markup unique to the *new*
  state; a substring the old state also satisfies gives false positives (bit me twice).
- Vercel deploys sometimes stick in `Initializing` for 10+ min (normal ~36s); redeploy clears it.

---

## Current project state (context, not tasks)

**Shipped 2026-07-19/20** — all deployed, evidence on the issues: MOO-326 (campaign-site
mapping), MOO-329/330/331 (scroll + Workbench desktop UX), MOO-332 (auth UI — the site had
none), MOO-333 (23 candidate photos, 33/48 → 61/66), MOO-334 (**20 missing congressional
candidates** — entire Democratic primaries were invisible in D1/D3/D7/D8).

**Open, needs Tarik:**
1. **Clerk is on `pk_test_…` in production** (dev instance, ~100-user cap). This is a hard
   ceiling on primary-day traffic — bigger than any ad feature. MOO-314.
2. Domain decision + Search Console — MOO-314, due Aug 4.
3. **~113 pending drafts** in the review queue from extraction runs. Nothing publishes until
   a human approves.
4. `/brief` on prod is **unverified in a browser** (my polling tripped bot mitigation).

**Open issues filed this session:** MOO-333 (5 candidates still photoless — do NOT guess),
MOO-335 (Voter Help has no "new conversation"; thread is permanent).

**Videos** (done, don't redo): `docs/video/` has scripts + shot lists; three MP4s on Tarik's
Desktop. Higgsfield MCP is **not** connected — video is local Playwright + ffmpeg + ElevenLabs.

---

## Suggested skills for the next session

- `superpowers:brainstorming` → `superpowers:writing-plans` before implementing (this
  project's established flow; the last three features went spec → plan → ship cleanly).
- `linear-build` — issue is the contract; verify against real data, comment evidence, close.
- `convex` / `convex-quickstart` for adapter patterns.
- `superpowers:systematic-debugging` if an adapter misbehaves.
- **Do not** use `vox-motion-graphics` (Higgsfield MCP unavailable).

## Memory

Durable notes are in `~/.claude/projects/-Users-tarikmoody-Documents-Projects-badgerbrief/memory/`
— `MEMORY.md` indexes them. Most relevant here: `badgerbrief-wec-ballot-truth.md`
(verification discipline), `badgerbrief-moo326-state.md` (registered ≠ fetched),
`badgerbrief-moo313-state.md` (eval gate law).

## Suggested first move

Rotate the five keys. Then ask Tarik whether to build fixture-first or wait for
credentials — do not assume. If fixture-first: brainstorm → plan → implement the Meta
adapter, since its blocker just cleared and the primary is 22 days out.
