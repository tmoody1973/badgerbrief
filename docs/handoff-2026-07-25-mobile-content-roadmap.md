# Handoff — mobile/content roadmap + MOO-401 ready to build (2026-07-25, cont.)

**Continues** `docs/handoff-2026-07-25.md` (all SHIPPED work — federal votes, legislative races, polls, /news
fixes, trust layer, SEO/perf, PWA-less caching, OG card, IndexNow, PostHog). Read that first for anything live.
**Repo:** clean, pushed, synced. No code has changed since that handoff — this session was planning + design.

---

## 0. State in one paragraph

A brainstorm turned "make it app-like" into **seven** workstreams; we triaged and filed six Linear issues
(MOO-398…405) with sequencing baked in. **Nothing is built yet.** The immediate, do-first item is **MOO-401**
(About-page conflict disclosure) — it's fully specced AND the exact copy is approved and ready to paste below.
Then resume the **MOO-398** design (paused mid-brainstorm). Two decisions this session REVERSE or constrain
earlier choices — see §4.

---

## 1. The roadmap (all in Linear, project "BadgerBrief M1")

| Issue | Pri | When | One-liner |
|---|---|---|---|
| **MOO-401** | Urgent | **NOW (do first)** | About-page disclosure — copy ready in §2 below |
| MOO-398 | Urgent | Project 1 | Voter-access guide (6 eligibility cases) — design PAUSED, see §3 |
| MOO-399 | High | Project 2 | Mobile app-feel: PWA + bottom tabs + de-scroll. **No Ionic.** |
| MOO-400 | Med | Project 3 | Spanish slice of /vote + access. Blocked by MOO-398. |
| MOO-403 | High | instrument now | Partnership metrics (needs PostHog key set) |
| MOO-405 | High | parallel, gated on 401 | Distribution: LWV, libraries, MPS, Reddit |
| MOO-402 | High | if 1-2-3 land early | Shareable "My Brief" image/link |
| MOO-404 | Med | **November** | Embeddable ballot widget for partner outlets |

Each issue body carries its own scope + acceptance. Strategic frame (from Tarik): **Aug 11 is the proof run,
Nov 3 is the target; reach is downstream of trust; the 17 days buy evidence + relationships, not traffic.**

---

## 2. MOO-401 — READY TO BUILD (copy approved 2026-07-25)

Edit `src/app/about/page.tsx`. This REVISES the About page built earlier and adds the disclosures. Facts and
wording are confirmed by Tarik — paste as-is. Then deploy (`npx vercel --prod --yes`) and verify `/about`.

**Funding fact tile** (currently "None") → change to:
> **Self-funded** — no advertising, sponsorships, donations, grants, or party/PAC money.

**Replace the "Who makes it" section body with:**
> BadgerBrief is built and maintained by **Tarik Moody** in Milwaukee, independently and in his own time.
> *(photo: add later — ship text-only now)*
>
> **In the interest of full disclosure:** Tarik is Director of Strategy and Innovation at Radio Milwaukee, and
> an appointed commissioner of the Milwaukee City Plan Commission. Both are stated here on purpose. The Plan
> Commission is a city land-use body — it has no role in the state legislative, congressional, or statewide
> races this guide covers — and he has no involvement in any race on BadgerBrief. Every candidate is treated
> identically, by the same sourced method, with no endorsements. Neither role funds or directs this site.
>
> This is not a news organisation and does not claim to be one. It is one person's attempt to make public
> records legible, held to a simple rule: if a claim is on this site, its source is one click away, and if it
> turns out to be wrong, it gets corrected in public.

**Also:**
- Surface a **"Report an error" link above the fold** (currently only lower + footer). Tarik asked for this.
- **Photo + the "20 years on air" link are still MISSING** — Tarik will supply later. Ship without them; leave
  a spot. Do NOT invent a URL.
- **Update `docs/distribution-submissions.md`** — its §0/§5 "do not name an employer" guidance is now WRONG
  and contradicts this. Fix it as part of MOO-401.

Verify after deploy: `curl -s https://badgerbrief.org/about | grep -iE "Plan Commission|Director of Strategy|Self-funded"` returns all three.

---

## 3. MOO-398 design — PAUSED, resume here

Brainstorm (superpowers) in progress. **Approved so far:**
- **§1 Data model (APPROVED):** new `voter_access` table, one row per situation:
  `key, title (the question a voter asks), summary, details, sources[] (REQUIRED ≥1 official), order,
  lastCheckedAt`. Mirrors the `voting_info` publish-gate discipline (source + freshness required to go live).
  Seeded via a script Tarik verifies before publish — NOT a heavy pending→approved queue (~8 fixed rows).
- **§2 Surfaces (PRESENTED, awaiting approval):** (a) `/vote` section of collapsible `<details>` cards, title
  = the question, FAQ schema per card (AEO win); (b) new chat tool `getVoterAccess` returning the same rows;
  the "state the rule, no case-specific legal advice" directive rides in the TOOL OUTPUT, not INSTRUCTIONS
  (the pattern that worked this session; verbose INSTRUCTIONS rules regressed the golden gate 93→73%).

**Still to design:** the 8 situations + their required sources, and testing. **NEXT STEP: get §2 approval, then
present the situations list + testing, write the spec to `docs/superpowers/specs/`, then writing-plans.**

The 8 situations: voter ID · absentee (mail + in-person early) · in-person election day · disability · criminal
conviction · name change · transgender voters · homelessness. Sourcing decided: **official (WEC/MyVote) + WI
advocacy orgs** (Disability Rights Wisconsin, ACLU-WI, VoteRiders), agent gathers & drafts with every claim
linked, Tarik verifies before publish. **This is the highest-accuracy content on the site** — a wrong answer
tells a real person they can't vote when they can. Sourcing rigor is the whole point.

---

## 4. Decisions this session that OVERRIDE earlier ones

- **Employer disclosure REVERSED.** Earlier this session Tarik said "independent, don't mention the employer"
  and the About page + distribution doc were built that way. He has now reversed it (MOO-401): disclose Radio
  Milwaukee AND the Plan Commission seat. Reason: a sitting Plan Commissioner running an election guide has a
  disclosure obligation; disclosed = credential, discovered = unrecoverable. The distribution doc's old
  guidance must be fixed.
- **Ionic REJECTED** for the mobile work (MOO-399). Client-heavy SPA framework, fights the static-render/SEO
  work and the neo-brutalist design. Use PWA + bottom tabs + View Transitions instead.
- **"Summarize coverage" REFUSED.** The "voters can't learn what a candidate would do" gap is a DISCOVERY
  problem, not a content one — 5/7 active Gov Dems already have 6-10 sourced positions (the 2 thin ones
  withdrew). Surface them better on mobile (MOO-399); never paraphrase/editorialize.
- **Spanish = scoped slice**, not full 589-page i18n (MOO-400).

---

## 5. Suggested skills next session

- **superpowers:brainstorming** → **writing-plans** to finish MOO-398 (resume at §2 approval).
- For MOO-401: no skill needed — it's a specced content edit, copy is in §2 above.
- **superpowers:verification-before-completion** — the session's throughline: verify across samples/current
  state before claiming done.
