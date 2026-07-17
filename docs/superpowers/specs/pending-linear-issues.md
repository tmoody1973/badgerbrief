# Pending Linear issues — blocked by workspace free-plan issue limit

Project: **BadgerBrief M1 — Primary Guide + Agents** (Moodyco)
Created 2026-07-17: MOO-302 … MOO-311 (10 of 13). These three remain — create them
verbatim once Linear space frees up (upgrade, or archive/delete old MOO issues).

---

## Issue 11: Research + Editorial QA agents + admin review dashboard

Blocked by: MOO-303, MOO-304 · Priority: Medium

### Intent
The editorial pipeline: Research Agent extracts quotes/stances from candidate sites
into drafts, Editorial QA Agent scores them, a human approves in the `/admin`
dashboard, and only then does content publish. Spec §3 Research/QA, §6.

### Acceptance criteria
- [ ] Research Agent (cron): Firecrawl-extracts candidate sites from seed JSON URLs → drafts issue positions (support/oppose/mixed/evolving/unclear + confidence) and quote candidates → `review_tasks`; fetches logged with content hash
- [ ] Editorial QA Agent (on-demand): claim-support score against source excerpts, missing-citation detection, neutral-rewrite suggestion, diff vs. prior published version
- [ ] `/admin` review queue: draft + source excerpt + QA scores side-by-side; approve/edit/reject; edits re-run QA; audit log of every decision
- [ ] Publish only via gated mutations (MOO-303); approved content appears on public candidate pages with source links
- [ ] Monitor crons: staleness sweep + source-change detection writing `alerts`

### Verification checklist (prove it against reality)
- [ ] Run Research Agent against one real candidate site — show a draft position with its source excerpt and confidence
- [ ] QA Agent flags a deliberately unsupported claim planted in a draft (show the score)
- [ ] Approve a draft → appears on the public candidate page with source link; reject → never public (show both)
- [ ] Audit log shows the full decision trail for one record
- [ ] Change a candidate site fixture → alert row appears on next monitor run

### Out of scope
News-article aggregation beyond candidate sites; ad-message clustering; multi-editor roles beyond admin.

---

## Issue 12: Arize evaluators + eval gating

Blocked by: MOO-310, MOO-311, Issue 11 · Priority: Medium

### Intent
Continuous quality measurement on the trust-critical agent behaviors, plus a
pre-deploy gate on the golden dataset. Spec §10a.

### Acceptance criteria
- [ ] LLM-as-judge evaluators in Arize: citation faithfulness, neutrality, official-source-first, refusal correctness — running on sampled production traces (Voter Help, Brief, Research/QA)
- [ ] Code evaluators: OpenUI Lang parses against library schema; every entity ID in a brief exists in published tables
- [ ] Golden-dataset experiment runnable on demand; documented as the pre-deploy gate for any agent prompt/instruction change (regression = don't ship)
- [ ] Eval-score drops / elevated failure rates write to `alerts` and surface on `/admin`
- [ ] `voter_briefs` and `review_tasks` store originating trace ids; `/admin` deep-links to Arize traces (arize-link URL format)

### Verification checklist (prove it against reality)
- [ ] Show evaluator scores on real sampled traces in the Arize UI (screenshot)
- [ ] Plant a citation-less answer via a test prompt → citation-faithfulness evaluator flags it (show the score)
- [ ] Run the golden-dataset experiment twice — once with current prompts (passes), once with a deliberately degraded prompt (regression detected)
- [ ] Click an admin deep-link → lands on the correct Arize trace

### Out of scope
Automated rollback; human annotation queues; evaluator fine-tuning.

---

## Issue 13: Launch hardening & go-live

Blocked by: MOO-306, MOO-308, MOO-309, MOO-311, Issues 11–12 · Priority: High

### Intent
Prove the whole system against reality per spec §10 and put it on the production
domain before the Aug 11 primary (target Aug 4).

### Acceptance criteria
- [ ] Spec §10 manual verification checklist executed and documented with evidence: known WI address → correct election info vs. official sources; sampled quotes → accurate excerpts at original sources; absentee instructions match current official guidance; a generated brief contains only reviewed source-linked content; sampled ads match Meta Ad Library; JSON-LD passes Rich Results Test
- [ ] Production domain live with HTTPS; sitemap submitted to Google Search Console
- [ ] Footer disclosures verified: non-partisan mission, methodology page, Sunshine non-commercial notice
- [ ] Error/alert review: no unresolved critical alerts; crons green for 48h pre-launch
- [ ] Rollback plan documented (previous deploy + data snapshot)

### Verification checklist (prove it against reality)
- [ ] Evidence bundle (screenshots + links) for every §10 item attached to this issue
- [ ] Live production URL loads race pages from a phone off-network
- [ ] Search Console shows sitemap accepted
- [ ] 48h cron health screenshot from Convex dashboard

### Out of scope
Marketing/launch announcement; M2 features.
