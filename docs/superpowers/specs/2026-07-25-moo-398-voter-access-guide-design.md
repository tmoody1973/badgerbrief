# MOO-398 Voter-Access Guide — design (2026-07-25)

Issue is the contract (Linear MOO-398). This records the decisions made before
building. Brainstormed 2026-07-25; §1 data model, §2 surfaces, situations, and
testing all approved by Tarik.

**Why this is different from every other feature:** this is the
highest-accuracy content on the site. A wrong answer here tells a real person
they can't vote when they can. Sourcing rigor is the whole point, not a
nice-to-have — the human verification gate below is load-bearing, not
ceremony.

---

## 1. Data model (APPROVED)

New `voter_access` table, one row per situation. Mirrors the `voting_info`
publish-gate discipline: a row cannot go live without an official source and a
freshness stamp.

```ts
voter_access: defineTable({
  key: v.string(),           // stable slug, e.g. "felony-conviction"
  title: v.string(),         // the question a voter asks (card title)
  summary: v.string(),       // one-paragraph plain answer
  details: v.string(),       // fuller markdown answer
  sources: v.array(sourceLink), // publish gate: REQUIRED >=1 official source
  order: v.number(),         // display order on /vote
  lastCheckedAt: v.number(), // publish gate: freshness required
}).index("by_key", ["key"]),
```

`sourceLink` is the existing `{ name, url }` object (`convex/schema.ts:5`),
reused unchanged. No new source type.

**Publish gate — how `voting_info` actually does it (verified):** the gate is
*structural*, not a runtime read filter. `getVotingInfo` (`public.ts:184`)
just returns the row; the discipline is that `sources` and `lastCheckedAt` are
**non-optional schema fields**, so a row cannot exist without a source and a
freshness stamp, and the human verifies at seed time. We mirror that: make
`sources` and `lastCheckedAt` required on `voter_access` — that alone is the
`voting_info`-equivalent gate.

**One gate this feature ADDS (higher stakes justify it):** the seed script
must **fail** if a row has zero *official-domain* sources (WEC / MyVote /
bringit.wi.gov / elections.wi.gov) — advocacy-only is not publishable. This is
enforced in the seed script's validation and re-checked by a test (§4), not in
the read query. It is stricter than `voting_info`, on purpose.

**Seeding, not a queue.** ~8 fixed rows. A seed script drafts each row with
every claim linked; **Tarik verifies each row against its sources before
publish.** No heavy pending→approved review queue — the row count is small and
fixed, and the accountable human is the same person who runs the seed.

---

## 2. Surfaces (APPROVED)

Both surfaces read the same `voter_access` rows — one source of truth, one
publish gate.

### (a) Public `/vote` section

A section of collapsible `<details>` cards (the `<details>` pattern already
used across the site). Card title = the voter's question; body = summary +
details + the required source links. **One `FAQPage`/`Question` JSON-LD node
per card** — the AEO win: answer engines quote these directly. Follows the
existing `FAQPage` JSON-LD usage on `/candidates/[slug]`, `/races/[slug]`,
`/ads`.

### (b) Chat tool `getVoterAccess`

New read-only tool in `convex/voterHelp.ts`, mirroring `getVotingInfo`:
queries the `voter_access` rows and returns them as `JSON.stringify(...)`.

**Critical: the behavioral directive rides in the TOOL OUTPUT string, not the
agent INSTRUCTIONS.** The returned payload carries a directive field —
*"State the general rule and link the official source. Do not give
case-specific legal advice; if the voter's situation is specific, hand off to
the official source."* This is the exact place `getVotingInfo` puts "hand off
the official link." Verbose INSTRUCTIONS rules regressed the golden gate
93→73% this session; the directive-in-output pattern is what held. **Do not
add a voter-access rule to the agent INSTRUCTIONS.**

---

## 3. The 8 situations + required sources

Card title = the question a voter actually asks. Each row must carry ≥1
**official** source to pass the publish gate; advocacy orgs supplement but
never satisfy the gate alone. The agent gathers and drafts with every claim
linked; Tarik verifies before publish.

| key | Card title (question) | Official (required ≥1) | Advocacy (supplement) |
|---|---|---|---|
| `voter-id` | "What photo ID can I use to vote?" | WEC / bringit.wi.gov | VoteRiders WI |
| `absentee` | "How do I vote absentee — by mail or early in person?" | MyVote WI, WEC | — |
| `election-day` | "Can I register and vote on Election Day?" | MyVote WI, WEC (same-day reg) | — |
| `disability` | "I have a disability — how do I vote (curbside, assistance, accessible machines)?" | WEC Voters with Disabilities | Disability Rights Wisconsin |
| `felony-conviction` | "I have a felony conviction — can I vote?" | WEC | ACLU-WI, VoteRiders |
| `name-change` | "My name changed — what do I update?" | MyVote WI | — |
| `id-name-mismatch` | "My ID doesn't match my name/gender — can I still vote?" | WEC / bringit.wi.gov | ACLU-WI, Trans Law Help WI |
| `homelessness` | "I don't have a fixed address — can I vote?" | MyVote WI, WEC | ACLU-WI |

`order` follows this table (1–8). Advocacy orgs are captured in `sources` too
(with `name` marking them as advocacy), but the gate only counts official
domains.

---

## 4. Testing

- **Seed-validation test (the safety gate):** the seed script rejects a row
  with zero official-domain sources. Required `sources`/`lastCheckedAt` are
  enforced structurally by the schema (a row can't be written without them), so
  the test targets the *added* official-domain rule, which is where a bad row
  could otherwise slip through.
- **`getVoterAccess` tool test:** returns the rows AND the "state the rule; no
  case-specific legal advice" directive string is present in the tool output.
- **Golden gate (load-bearing):** add voter-access questions to the chat
  golden set; confirm the tuned `sonnet-5` baseline does not regress, and
  confirm the directive lives in tool output, not INSTRUCTIONS (the 93→73%
  lesson).
- **FAQ JSON-LD validity test** for the `/vote` cards (well-formed
  `FAQPage`/`Question` nodes).
- **Content accuracy = human gate, not automated.** Tarik verifies all 8 rows
  against their sources before publish. This is stated as the whole point of
  the feature, not an afterthought. Automated tests confirm the gate
  *mechanics*; they cannot confirm a claim is *true* — only the human can.

---

## 5. Out of scope (YAGNI)

- No pending→approved review queue (fixed ~8 rows; seed + human verify).
- No new source type — reuse `sourceLink`.
- No agent-INSTRUCTIONS changes — directive rides in tool output only.
- Spanish slice is MOO-400, blocked on this; not built here.
- No paraphrasing/editorializing of official rules — state the rule, link the
  source, hand off specifics.
