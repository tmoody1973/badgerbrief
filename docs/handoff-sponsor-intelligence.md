# Handoff — Sponsor Intelligence (built, shipped, live) + Perplexity MCP restart

**Written:** 2026-07-22 · **Why now:** the Perplexity MCP key was fixed in `~/.zshrc`/`~/.bashrc` but the *running* MCP still holds the old key — **restart Claude Code from a fresh terminal** so it relaunches with the valid key, then resume from this doc.

---

## 0. FIRST THING after restart — confirm the Perplexity MCP works

The old `PERPLEXITY_API_KEY` in `~/.zshrc:8` (and `~/.bashrc:23`) was a **revoked** `pplx-` key (401). It's been replaced with the **valid** key copied from prod Convex (verified HTTP 200). Backups: `~/.zshrc.presponsor.bak`, `~/.bashrc.presponsor.bak`.

- Restart Claude Code **from a terminal** (`claude`) so `~/.zshrc` is re-sourced (a Dock/Finder launch does *not* source `~/.zshrc`).
- Test: run a `perplexity_ask` (mcp `plugin_perplexity_perplexity`). Expect a real answer, not `401 Invalid API key`.
- **If it still 401s** (e.g. Claude Code was launched without sourcing `~/.zshrc`): add the key to `~/.claude/settings.json` `env.PERPLEXITY_API_KEY` (Claude injects `env` into MCPs regardless of launch method). The valid value is in prod Convex: `npx convex env get PERPLEXITY_API_KEY --prod`. Use the `update-config` skill.

Note: WebSearch was used as the fallback while the MCP was down — it works fine for entity verification if Perplexity is still flaky.

---

## 1. What Sponsor Intelligence is (shipped + deployed)

A tiered sponsor-enrichment pipeline + a public `/sponsors/[slug]` page + admin narrative review, so voters see **who an advertiser/PAC really is and who it backs/attacks**. Three trust tiers:

| Tier | Source | Publishes |
|---|---|---|
| Exact facts | OpenFEC (totals, top donors, kind) | **auto** |
| Support/attack scorecard | own ad data + OpenFEC Schedule E | **auto** |
| Narrative ("who's behind it") | Firecrawl over a source allowlist | **human-gated** (never public until `approveNarrative`) |

- Spec: `docs/superpowers/specs/2026-07-22-sponsor-intelligence-design.md` · Plan: `docs/superpowers/plans/2026-07-22-sponsor-intelligence.md`
- Built via subagent-driven-development (13 tasks + final review + fix wave). Full audit trail: `.superpowers/sdd/progress.md`.
- **Merged** (PR #1) to `main`, **deployed to prod** (Convex `precious-axolotl-906` + Vercel `badgerbrief.vercel.app`). **236→238 tests green.**
- GitHub repo (this project's first remote): **private** `tmoody1973/badgerbrief`.

## 2. Current live state

- **9 sponsors have approved public narratives** (verified + neutral): Americans for Prosperity, House Majority PAC, America PAC (facts fixed → Musk C00879510), Building America's Future (C90022955), A Better Wisconsin Together (political fund + Inc), Opportunity Wisconsin, Alliance for Economic Freedom (dark-money 501c4, banking-funded), Justice Project (dark-money 527).
- **In review (narrative withheld, facts/scorecard still public where valid):** Tiffany for Wisconsin (a *candidate committee* — should NOT get a "who's behind it"; leave), "Issue/House Majority PAC" (a name artifact).
- **Discoverability is live:** sponsor names link to `/sponsors/[slug]` from the `/ads` Browse table, the Top-spenders/reach analytics, the TV tracker ("Full profile →", gated), and candidate pages — but **only when a profile exists** (`SponsorLink` checks `enrichedSponsorKeys`; ~190 un-profiled sponsors stay plain text, no 404s).
- **Decoy-FEC-match guard is live** (commit `724ef01`): auto enrichment holds a name-matched committee's facts + sets a `factsFlag` reviewer note when tracked ad spend dwarfs its receipts. Verified live on Justice Project.

## 3. The core insight (why this matters)

The **biggest WI ad spenders are dark money (501c4 / 527) that don't file as FEC PACs.** OpenFEC *name search* then matches a small, same-named **decoy** committee and publishes its wrong facts. Confirmed decoys: Justice Project ($1.6M ads vs a $227k committee), America PAC (wrong committee), Building America's Future, Alliance for Economic Freedom. The guard (#2 above) now catches these automatically; web/Perplexity verification finds the real entity. This is the central "follow the money" challenge.

## 4. How to operate it (CLI cheatsheet, prod)

- Test cmd is **`npx vitest run <file>`** (repo has NO `pnpm test` — it no-ops).
- Enrich one (auto): `npx convex run --prod sponsorEnrich:enrichSponsorCore '{"advertiser":"NAME"}'` — key = `normalizeSponsorKey(NAME)` (lowercase, `[^a-z0-9]+`→space; **no "The"** if the ad string has none). Pass `"fecCommitteeId":"Cxxxx"` to force the correct committee (skips the decoy guard).
- Batch: `npx convex run --prod sponsorEnrich:enrichOutsideGroups '{"limit":10,"staleDays":30}'`.
- Read a row (internal query, **no `--identity`**): `npx convex run --prod sponsors:sponsorRowByKey '{"key":"..."}'`.
- Approve/save narrative (**admin-gated — needs `--identity '{"metadata":{"role":"admin"}}'`**): `sponsors:saveNarrativeDraft` `{key,narrative,leadership:[]}` then `sponsors:approveNarrative` `{key}`. Set kind/disclosesDonors/sources via `sponsors:saveSponsor`.
- **Editorial rule:** review every Firecrawl narrative before approving — they're often wrong-entity (verify via WebSearch/Perplexity). Describe partisan lean factually + symmetrically (both sides same treatment). For dark money: `kind:"Dark money (501c4/527)"`, `disclosesDonors:false`.

Key files: `convex/lib/openfecEnrich.ts` (parsers + `isFecMatchImplausible`), `convex/lib/firecrawlSponsor.ts` (narrative + relevance guard), `convex/sponsorEnrich.ts` (orchestration + guard), `convex/sponsors.ts` (queries/mutations, the tiered gate in `sponsorPublicProfile`), `src/app/sponsors/[slug]/page.tsx`, `src/components/guide/sponsor-profile.tsx`, `src/components/guide/sponsor-link.tsx`, `src/components/admin/sponsor-resolver.tsx`.

## 5. Open items (pick up here)

1. **Sponsor-name cleanup** (the biggest one): the `ads` table has messy `pageOrCommittee` strings → duplicate/garbage sponsor keys: "A Better Wisconsin Together" as two entries (…POLITICAL FUND / …INC.), "Issue/House Majority PAC" (attribution artifact), "BUILDING AMERICA'S FUTURE" apostrophe stripped, and an **orphan `the justice project` row** I created via a mis-named test (unlinked, harmless — but there's no sponsor-delete mutation yet). A normalization pass on sponsor names (+ a delete/merge mutation) would consolidate these.
2. **Surface `factsFlag` in `/admin`**: `sponsor-resolver.tsx` should show the decoy-match warning inline so reviewers see it (currently only visible via `sponsorRowByKey`).
3. **Verification in-pipeline**: optionally wire Perplexity (now that the key's fixed) or a reviewer confirmation to lock the correct FEC committee ID for ambiguous names before auto-publishing facts.
4. **Live enrichment posture**: the monthly cron (`enrichOutsideGroups`, day 1, 08:00 UTC) is live and will auto-enrich by spend — content-safe (facts auto, narratives gated), consumes Firecrawl credits if the key's set. Fine to leave; disable in `convex/crons.ts` if you want to hold it.

## 6. State: nothing pending to commit for the feature

All feature work is committed to `main` and deployed. The Perplexity fix touched `~/.zshrc`/`~/.bashrc` only (not the repo). This handoff doc is the only new repo file.
