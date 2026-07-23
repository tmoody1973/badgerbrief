# Porting BadgerBrief to your state

BadgerBrief is a Wisconsin voter guide, but roughly 80% of it isn't about Wisconsin. The
schema, the review gates, the ad trackers, the coverage scout, and the transcript pipeline
are all state-agnostic. What's Wisconsin-specific is a fairly short list, and this document
is that list.

This is written to be worked through **with a coding agent** — Claude Code, Cursor, Codex,
whatever you use. Each phase below is scoped to be one agent session with a verifiable
finish line. The prompts are starting points, not incantations; the important part is the
*verification* line under each, because that's what stops an agent from reporting success
on work it didn't do.

> **The single most important thing in this document:** every piece of automation here
> writes a **draft**. A human approves before anything is public. If you port this and
> remove the review gates to move faster, you have built something different from
> BadgerBrief, and you should not put a nonpartisan label on it.

---

## 0. Before you start: is your state's data actually available?

Spend an hour on this before writing any code. It determines whether the project is two
weeks or two months.

| What you need | Wisconsin's answer | How to check yours |
|---|---|---|
| **State campaign finance** | Wisconsin Ethics Commission "CFIS/Sunshine", bulk CSV export | Search "<state> campaign finance database export". Look for **bulk download**, not just a search UI. |
| **Official ballot / candidate list** | WEC publishes an `.xlsx` of certified candidates | Your Secretary of State or state elections board. Ask for the certified candidate list file. |
| **Voter-facing official links** | `myvote.wi.gov` (register, absentee, polling place, sample ballot) | Your state's official voter portal. You will link to it constantly. |
| **Legislative district geography** | US Census geocoder + state FIPS | National — works for every state. Only the FIPS code changes. |
| **State public-affairs video** | WisconsinEye | Many states have a "state C-SPAN". Search "<state> public affairs network". Not all do. |

**Federal and national sources work everywhere with no porting:** OpenFEC (federal
candidates), the Meta Ad Library, Google political ads via BigQuery, and FCC political
files for broadcast TV. If your state's own finance data turns out to be bad, you still get
a real product from the federal and ad data alone.

The hardest variable by far is state campaign finance. Some states publish clean bulk CSVs;
some have a search form and nothing else; a few will sell you a CD. Find out first.

---

## Phase 1 — Fork and get it running unchanged

Do this before changing anything. A working Wisconsin instance is your reference: when
something breaks later you need to know whether you broke it or it was always like that.

```bash
git clone <your-fork> && cd <your-fork>
pnpm install
cp .env.example .env.local
npx convex dev      # creates your own Convex deployment
pnpm dev
```

You'll need, at minimum, a [Convex](https://convex.dev) account, a [Clerk](https://clerk.com)
application, and an `ANTHROPIC_API_KEY`. Everything else degrades gracefully — the agents
log a warning and skip when a key is missing, which is deliberate so a fresh clone runs.

**Verify:** `npx vitest run` is green (300+ tests) and `localhost:3000` renders. Stop here
until both are true.

---

## Phase 2 — Rename the state

This is mostly mechanical and a good first agent task. The state identity lives in a small
number of places:

| File | What's Wisconsin about it |
|---|---|
| `src/lib/districts.ts` | `WISCONSIN_FIPS = "55"` — change to your state's FIPS code |
| `src/lib/official-links.ts` | Every `myvote.wi.gov` / `bringit.wi.gov` URL |
| `convex/schema.ts` + `convex/seed.ts` | `raceId` convention (`WI-GOV-2026`, `WI-US-HOUSE-D6-2026`) |
| `src/app/vote/page.tsx` | Voting deadlines, ID rules, registration rules — **all state law** |
| `DESIGN.md` | Badger cardinal `#c5050c`; the palette is Wisconsin-coded on purpose |
| `convex/voterHelp.ts` | Chat scope rule pinned to Wisconsin 2026 |
| `scripts/golden-questions.json`, `scripts/voter-help-golden.json` | Eval questions about Wisconsin |

> Suggested prompt:
> "Replace Wisconsin with <STATE> throughout. Start by listing every file containing a
> Wisconsin-specific constant, URL, FIPS code, or raceId prefix, and show me that list
> before editing anything. Do not touch the eval JSON files yet — those need real answers,
> not find-and-replace."

**Verify:** `npx tsc --noEmit` clean, tests green. Then open `/vote` and read it as a
voter in your state. Every deadline and ID rule on that page is state law, and find-and-
replace does not know that. **Check each line against your state election board's own page.**

⚠️ The eval JSON files are the trap here. They're question/answer pairs used as a
pre-deploy gate. A find-and-replace produces questions about your state with *Wisconsin's
answers still attached*, and the gate will then happily certify a chatbot that's wrong. Hand-write these.

---

## Phase 3 — Seed races and candidates

`convex/seed.ts` upserts by natural key (`races.raceId`, `candidates.(raceId, slug)`), so
it's re-runnable and safe to iterate on.

Get your state's certified candidate list, then have an agent transform it into seed calls.
Do **not** have the agent generate the candidate list from memory — model recall of
down-ballot candidates is unreliable and confidently wrong, which is the worst combination.

> Suggested prompt:
> "Here is the certified candidate list at <path>. Parse it and produce seed input matching
> the shape in `convex/seed.ts`. Every candidate must come from that file. If a field is
> missing, leave it empty — do not fill it in from your own knowledge, and list what you
> left blank so I can source it."

**Verify:** candidate counts per race match the official file exactly. Not approximately.

---

## Phase 4 — State campaign finance

The Wisconsin importers are `scripts/import-sunshine.mjs`,
`import-sunshine-balances.mjs`, and `import-committee-funding.mjs`. Read them as a
*shape* to copy, not code to reuse: they parse WI's specific CSV layout.

The generic pattern worth preserving is second-hop funding — who gave to the committee
that gave to the candidate. That's usually where the story is, and most guides stop at the
first hop.

Federal candidates (US House, Senate) need no porting: OpenFEC covers them nationally, and
`convex/finance.ts` already handles it.

**Verify:** pick three candidates and reconcile totals against your state's own public
report. If they don't tie out, the importer is wrong — do not ship a number you can't
reconcile.

---

## Phase 5 — Coverage discovery (the newsroom allowlist)

Edit `WI_OUTLETS` in `convex/lib/scoutParse.ts`. This one map is the single source of truth
for three things: Perplexity's `search_domain_filter`, the URL gate on everything stored,
and the display name credited on the page.

**Hard cap of 20 entries.** Perplexity silently truncates past that, so the file throws at
import if you exceed it. Choose deliberately: your largest metro daily, public radio and
TV, the commercial network affiliates in your top two markets, your statewide nonprofit
newsroom(s), and your political trade outlet.

Two traps, both of which cost real time here:

1. **Use the host articles actually publish on**, not the vanity domain. In Wisconsin,
   `nbc15.com` 301s to `wmtv15news.com`; filtering on the redirect matches nothing.
2. **The image host is almost never the article host.** Public radio serves off
   `npr.brightspotcdn.com`; the Scripps/Hearst/Gray station groups also use Brightspot.
   `next.config.ts` has a hard **50-entry** cap and each outlet costs two slots (apex +
   wildcard) — it's asserted at config load so you fail locally, not in a deploy.

**Verify — this is the one people skip:** run the scout, then look at the actual `outlet`
values and `imageUrl` hosts on the rows it created. If no new outlet names appear,
discovery didn't work no matter what the config says.

```bash
npx convex run scout:run '{"limit":20}'
npx convex run coverage:hubArticles '{"limit":200}'
```

---

## Phase 6 — Candidate interviews (optional, high value)

If your state has a public-affairs network that interviews candidates, this is the highest
signal-per-effort feature in the project: every candidate answering the same interviewer
is directly comparable in a way that scattered article quotes never are.

The pipeline is `scripts/transcribe-deepgram.mjs` → `scripts/extract-wiseye-quotes.mjs` →
`convex/quoteIngest.ts` → human review → published.

Four things we learned the hard way, all of which will apply to you:

1. **Read the source's terms before touching the media.** WisconsinEye permits 2–5 minute
   clips, requires their watermark be retained, and *prohibits sharing the generated media
   link*. That last clause is why no media URL is ever stored — text plus the public
   program permalink only, enforced by a gate in `quoteIngest.ts`. Your source's terms will
   differ; read them and let them shape the architecture, not just the policy doc.
2. **Diarization is worth it.** Plain ASR gives no speaker separation, and a single segment
   runs straight from the interviewer's question into the answer. Deepgram `nova-3` with
   `diarize=true` makes attribution acoustic rather than inferred. ~$0.80 for three hours.
3. **Gate on verbatim, deterministically.** Every extracted quote must appear word-for-word
   in the turn it claims. It's a string comparison, not a judgement, so the model can't
   argue past it. It catches real paraphrases.
4. **Do not pair quotes with the interviewer's question.** We tried twice. Diarization is
   reliable for *who* is speaking but not for *where an exchange ends* — short questions get
   absorbed into the tail of the previous turn, so "the preceding question" can be a minute
   and several exchanges away. Both attempts produced confident, plausible, wrong pairings.
   A question above a quote asserts what the candidate was responding to; a wrong one is
   fabricated context.

**Verify:** cut the source audio at a stored timestamp and re-transcribe that slice
independently. If the quoted words aren't spoken there, the timestamps are wrong.

---

## Phase 7 — Ads, TV, and the review queue

Meta, Google, and FCC ad tracking are national and mostly work as-is. What's state-specific:

- **TV stations.** `docs/superpowers/specs/fixtures/wi-tv-stations.csv` maps call sign →
  market → FCC public-file URL. Rebuild for your state's DMAs.
- **FCC political files are Akamai-blocked** to plain HTTP. The project drives a
  Browserbase browser instead. Budget time for this; it is not a `fetch`.
- **Sponsor profiles** (OpenFEC facts + a cited description, human-confirmed) work
  unchanged — PACs are federal.

---

## Phase 8 — Evals, then launch

`scripts/eval-gate.mjs` runs a golden dataset against the Voter Help chat and blocks deploy
on regression. **Rewrite the golden questions for your state by hand** (see the Phase 2
warning). A gate with wrong answers in it is worse than no gate: it converts "untested"
into "certified correct."

```bash
node scripts/eval-gate.mjs --name <your-state>-baseline
```

Then work `docs/launch-runbook.md`, which is mostly state-agnostic: domain, Search Console,
a production auth instance, and a phone test on real hardware.

---

## What actually transfers

The reusable idea here isn't the Wisconsin data — it's the shape:

- **Draft → human review → publish**, with the publish gate enforced in code
  (`convex/publish.ts`), not in a policy document.
- **Sourced or absent.** Every claim carries a link. Dates are displayed only when read
  from the publisher's own metadata, never from a model's guess.
- **Deterministic gates around probabilistic components.** Verbatim substring checks, URL
  allowlists, strict date parsing. Let the model choose *what* is interesting; never let it
  be the thing that decides what's *true*.
- **Verify at the data layer, not the config layer.** "I added the outlet" and "articles
  from that outlet exist" are different claims, and only the second one matters.

---

## Working with a coding agent on this

Some things that made a measurable difference building it:

- **Ask for the file list before the edits.** Most porting bugs are missed files, not wrong
  code.
- **Make the agent verify at the data layer.** "Show me the rows it created", not "confirm
  the config is correct." A config change that produced zero rows is a failed change.
- **Screenshot the UI.** Two separate quote-attribution bugs in this project were invisible
  in passing tests and obvious in a screenshot.
- **Be explicit that election data must come from files, never from recall.** Models are
  fluent and wrong about down-ballot candidates.
- **Keep `AGENTS.md` / `CLAUDE.md` current.** They're loaded every session; a stale
  landmine list costs more than it saves.

Election information is high-stakes. Ship slower than the agent can build.
