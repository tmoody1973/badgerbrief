# Distribution & citation submissions

**Written:** 2026-07-24 · **Primary:** August 11, 2026 (18 days) · **Site:** https://badgerbrief.org

Adapted from the `directory-submissions` playbook. That playbook targets SaaS
launches — Product Hunt, G2 review drives, AI-tool directories,
`/alternatives/[competitor]` pages. **None of those apply here**, and two would
actively damage the product:

- **Incentivised reviews** (the playbook suggests $25 gift cards for G2 reviews)
  on a nonpartisan voter guide is an integrity problem, not a growth tactic.
- **`/alternatives/[competitor]` pages** attacking other voter guides —
  Ballotpedia, Vote411, WisPolitics — would undercut the nonpartisan posture and
  pick a fight with the exact organisations most likely to link to us.

What transfers is the *citation* half: be findable, be verifiably who you say
you are, and be present in the corpora that answer engines and civic
institutions actually read.

---

## 0. Facts needed before submitting (Tarik only)

Every item below asks "who publishes this". These are real-world claims about a
real organisation and a real person, so they are **not** inferred or filled in
from context — answer once here and every submission can reuse them.

| Field | Needed for | Value |
|---|---|---|
| Legal/publishing entity name | Wikidata, Google News, LWV | ? |
| Relationship to Radio Milwaukee / 88Nine | Google News, press | ? — affiliated, independent, or personal project? |
| Editorial contact address | all | currently a personal Gmail on /methodology — see §4 |
| Funding source | LWV, library listings, trust | ? |
| Founded date | Wikidata | ? |
| Official social profiles | `sameAs` schema, Wikidata | ? |

Until the affiliation question is answered, submit as an **independent
publication**. Claiming an institutional affiliation that is not formal is worse
than claiming none.

---

## 1. Wikidata — highest value, do first

**Why it leads:** Wikidata feeds AI training corpora directly and is the single
cheapest way to become a resolvable *entity* rather than a URL. It is also the
one item from the SaaS playbook that transfers unchanged.

**Create item:** `BadgerBrief`

| Property | Value |
|---|---|
| `instance of` (P31) | online newspaper (Q1153191) **or** website (Q35127) |
| `country` (P17) | United States (Q30) |
| `official website` (P856) | https://badgerbrief.org |
| `language of work` (P407) | English (Q1860) |
| `inception` (P571) | *(founded date)* |
| `main subject` (P921) | 2026 Wisconsin elections |
| `publisher` (P123) | *(entity — see §0)* |

**Do not** create an item for the founder unless there is independent coverage to
cite; Wikidata notability requires a serious reference, and a self-created item
without one gets deleted and looks like self-promotion.

**After it exists:** add its URL to `organizationNode()` `sameAs` in
`src/lib/jsonld.tsx` — the field is deliberately empty today.

---

## 2. Google News Publisher Center

**Why:** puts the guide in Google News and the News tab, and is a strong
publisher-legitimacy signal. Free.

**Prerequisites — all already true:**
- ✅ Original reporting-adjacent content with clear sourcing
- ✅ Dated articles with named outlets (/news)
- ✅ Transparent methodology page
- ✅ HTTPS, sitemap, clean heading hierarchy
- ⚠️ **Contact information** — needs a real editorial address, not a personal
  Gmail (§4)

**Steps:** publishercenter.google.com → add publication → verify domain in
Search Console → set sections (`/news`, `/races`, `/candidates`) → submit.

**Honest caveat:** BadgerBrief aggregates and indexes other outlets' reporting
rather than producing original news reporting. Present it accurately as a
*voter guide with tracked coverage*. Applying as a news publisher and being
rejected is survivable; describing it as something it is not is not worth it.

---

## 3. Civic and institutional listings

These are the real "directories" for this product — the equivalent of the
playbook's Tier 1/2, with authority that actually matters to a Wisconsin voter.

| Target | Why | How |
|---|---|---|
| **League of Women Voters of Wisconsin** | The reference civic org; links from LWV chapters carry real trust | Contact state office, offer the guide as a free resource |
| **Wisconsin library systems** (Milwaukee Public, Madison Public, county systems) | Librarians maintain election-resource guides and link generously | Email reference desks with a one-paragraph description |
| **UW–Madison / UWM civic engagement offices** | `.edu` links, and students are a target audience | Morgridge Center (UW), Center for Community-Based Learning (UWM) |
| **Wisconsin Elections Commission voter-resource page** | Highest-authority state source | Ask to be listed as a third-party guide |
| **Ballotpedia** | Already a source for us; sourcing is reciprocal | Suggest as external link on WI 2026 pages |
| **r/wisconsin, r/Milwaukee, r/madisonwi** | Where Wisconsin voters actually ask "who's on my ballot" | **Participate first.** Answer questions with the link only where it genuinely answers one |
| **Wisconsin Newspaper Association** | Peer legitimacy | Membership enquiry |

**Timing:** these are the highest-value action in the next 18 days — a link from
a library or LWV page reaches voters directly, not just crawlers.

---

## 4. Editorial contact (blocks §2)

`/methodology` lists a personal Gmail as the corrections contact. For a
publication making factual claims about named candidates, that is a weak trust
signal and Google News will read it the same way.

Set up `editor@badgerbrief.org` (or `corrections@`) and update
`/methodology`. Cheap, and it unblocks the Publisher Center application.

---

## 5. What NOT to do

1. **No AI-tool directories** (TAAFT, Futurepedia, Toolify). BadgerBrief is not
   an AI tool; it uses AI internally. Listing it there is a category error that
   invites "AI-generated election content" scrutiny it does not deserve.
2. **No Product Hunt.** The audience is builders, not Wisconsin voters, and the
   playbook's own 3-week warm-up does not fit an 18-day runway.
3. **No paid submission services.** Everything above is free.
4. **No incentivised reviews anywhere.**
5. **No `/alternatives/` pages against other voter guides.**
6. **Do not claim an institutional affiliation** before §0 is answered.

---

## 6. Measurement

The playbook's DR/signup KPIs do not fit. What matters here:

| Signal | How to check | Cadence |
|---|---|---|
| AI citation | Ask ChatGPT/Claude/Perplexity "who is running for Wisconsin governor in 2026" and "what's on my Wisconsin ballot" — log whether BadgerBrief is cited | Weekly until Aug 11 |
| Indexation | Search Console coverage — 589 sitemap URLs | Weekly |
| Civic referrals | Referrer traffic from `.edu`, `.gov`, library domains | Weekly |
| Search visibility | Impressions for "wisconsin 2026 primary", "who is running for governor wisconsin", "[district] assembly candidates" | Weekly |

The AI-citation check is the one worth doing by hand — it is the query path most
likely to reach an undecided voter in the next 18 days, and `robots.txt` already
admits GPTBot, ClaudeBot, PerplexityBot and Google-Extended.
