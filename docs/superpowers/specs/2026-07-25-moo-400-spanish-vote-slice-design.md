# MOO-400 Spanish Vote Slice — design (2026-07-25)

Issue is the contract (Linear MOO-400). Brainstormed 2026-07-25. Blocked-by MOO-398 (now DONE — the English `/vote` + `voter_access` content exists). Two forks decided by Tarik: **page content + language toggle** (global nav stays English — full nav i18n is November scope); **I draft the Spanish, Tarik verifies before publish** (same human-gate discipline as MOO-398's English rows).

**Goal:** a fully-Spanish `/es/vote` — the how-to-vote logistics + the 8 voter-access situations — with correct reciprocal hreflang, so Wisconsin's Spanish-speaking voters get the actionable civic content in Spanish and Google treats the EN/ES pair correctly.

---

## 0. Constraints

- **Scoped slice only.** `/es/vote` mirrors `/vote` (logistics + FAQ + the 8 situation cards). NOT full-site i18n, NOT the 589 race/candidate pages, NOT a Spanish chat (all → November).
- **Translate ALL page content** (title, description, headings, intro, FAQ, deadline checklist, situation cards) — partial translation reads as thin/duplicate to Google. Global header/footer nav stays English (out of scope); a visible EN⇄ES toggle links the pair.
- **Spanish voter-access content is accuracy-critical** — a mistranslation could tell a real person they can't vote when they can. Tarik verifies every Spanish row before publish. Same gate as MOO-398.
- **hreflang reciprocity is load-bearing.** Each page must self-reference AND point at the other, with `x-default`. Get reciprocity wrong and Google drops the pair. Follow the `seo-aeo-best-practices` skill for the exact shape.
- **Sources stay single-source-of-truth from Convex.** Only prose is translated; the official source URLs on each `voter_access` row come from the live data and never fork.

---

## 1. Architecture — one shared component, two dicts

The current `/vote` page body becomes a shared presentational component driven by a strings dict, so EN and ES render identical layout and can't visually drift.

- **`src/components/guide/vote-guide.tsx`** — `VoteGuide({ dict, info, access, lang })`. Contains all the JSX currently inline in `src/app/vote/page.tsx` (h1, intro, FAQ cards, deadline checklist, sources, "Your situation" cards, the JsonLd graph). Reads every human string from `dict`; reads data from `info` (`votingInfo`) and `access` (`voter_access` rows). Wraps its root in `<main lang={lang}>`.
- **`src/lib/i18n/vote-dict.ts`** — exports the `VoteDict` TYPE (the shape both languages must satisfy) so ES parity is compiler-enforced.
- **`src/lib/i18n/vote-en.ts`** and **`src/lib/i18n/vote-es.ts`** — the two `VoteDict` instances.
- **`src/app/vote/page.tsx`** → `<VoteGuide dict={voteEn} info access lang="en" />` (EN metadata, unchanged content).
- **`src/app/es/vote/page.tsx`** → `<VoteGuide dict={voteEs} info access lang="es" />` (ES metadata).

Both pages keep the existing `getVotingInfo()` / `getVoterAccess()` data fetch and `revalidate = 300`.

## 2. `VoteDict` shape

```ts
export type VoteDict = {
  lang: "en" | "es";
  meta: { title: string; description: string };
  h1: string;
  intro: (info: VotingInfo) => ReactNode;        // interpolates primaryDate, poll hours, MyVote link
  faqs: (info, deadlines) => { q: string; a: string }[];  // parallel EN/ES builders
  deadlineLabel: (key: string) => string;         // translate map keys: "by_mail" → "por correo"
  deadlineChecklistTitle: string;
  sourcesTitle: string;
  lastUpdatedPrefix: string;
  situation: { title: string; blurb: string };    // "Your situation" heading + legal-advice blurb
  accessText: (row: VoterAccessRow) => { title: string; summary: string; details: string };
  toggle: { label: string; href: string };        // EN → { "Español", "/es/vote" }; ES → { "English", "/vote" }
};
```

- **EN dict** `accessText` returns the row's own `title/summary/details`; `deadlineLabel` returns the humanized key as today. Behavior identical to the current page (regression-safe).
- **ES dict** `accessText` looks the row up by `row.key` in a Spanish translation table (`ACCESS_ES: Record<key, {title,summary,details}>`) covering all 8 keys; `faqs`/`intro`/labels are Spanish. Sources are NOT in the dict — `VoteGuide` renders `row.sources` / `info.sources` straight from data for both languages.
- **Date handling:** `primaryDate` and deadline-map values are stored English strings; the ES `intro`/`faqs` localize the primary date in prose ("el 11 de agosto de 2026") but render deadline-map *values* as-is (they're data, not UI copy). Flagged as an acceptable v1 limitation.

## 3. Routing, metadata & hreflang (load-bearing)

- **`src/app/es/vote/page.tsx`** metadata: Spanish `title`/`description`, and:
  ```ts
  alternates: {
    canonical: "/es/vote",
    languages: { en: "/vote", es: "/es/vote", "x-default": "/vote" },
  }
  ```
- **`src/app/vote/page.tsx`** metadata: update its `alternates` to the RECIPROCAL set:
  ```ts
  alternates: {
    canonical: "/vote",
    languages: { en: "/vote", es: "/es/vote", "x-default": "/vote" },
  }
  ```
- Both self-canonical; `x-default` → EN. This reciprocity is the one thing that, if wrong, silently drops the pair — the tests in §6 assert both directions.
- **JsonLd**: `VoteGuide` builds the breadcrumb + FAQ nodes from `dict` strings, so the ES page emits Spanish breadcrumb labels and Spanish FAQ Q&A (`faqNode`), reinforcing the language signal.

## 4. Language toggle

A small inline link at the top of `VoteGuide` (neo-brutalist chip): renders `dict.toggle.label` linking `dict.toggle.href`. EN page shows "Español" → `/es/vote`; ES page shows "English" → `/vote`. Gives users the switch and gives crawlers an in-page reciprocal link.

## 5. Discoverability

- **`src/app/sitemap.ts`**: add `{ url: ${SITE_URL}/es/vote, changeFrequency: "weekly", priority: 0.7 }` next to the existing `/vote` entry.
- The EN⇄ES toggle is the primary in-content link. (Optionally, a future homepage "En Español" link — out of scope here.)

## 6. Testing

- **Dict parity (compiler + runtime):** `voteEs` satisfies `VoteDict` (type). A runtime test asserts `ACCESS_ES` has a translation for all 8 known `voter_access` keys (`voter-id, absentee, election-day, disability, felony-conviction, name-change, id-name-mismatch, homelessness`) — a missing key would silently fall back to English on the ES page.
- **hreflang reciprocity:** import both pages' `metadata` and assert `alternates.languages` contains `en: "/vote"`, `es: "/es/vote"`, `x-default: "/vote"` on BOTH, and each `canonical` is self-referential.
- **VoteGuide render:** renders EN and ES dicts without throwing; ES root carries `lang="es"`.
- **Live verification (Task deploy):** `/vote` and `/es/vote` both 200; `curl` each and confirm reciprocal `<link rel="alternate" hreflang="es" ...>` / `hreflang="en"` / `hreflang="x-default"`; `/sitemap.xml` includes `/es/vote`; the ES page shows Spanish content (not English).

## 7. The Spanish content (Tarik-verified gate)

I draft: the ES dict (all UI prose + FAQ + labels) and `ACCESS_ES` (the 8 situations' `title/summary/details`), leaning on WEC's own Spanish civic wording where it exists (WEC publishes Spanish brochures, e.g. *Constancia de Residencia*). **Nothing publishes until Tarik verifies the Spanish** — same discipline as MOO-398's English rows. The 8 access rows are the accuracy-critical part; a wrong eligibility statement in Spanish is exactly the failure mode MOO-398 guarded against, now in another language.

## Risks / flags

- **Spanish accuracy** = the human gate; civic/eligibility content, verified before publish.
- **hreflang reciprocity** = the SEO footgun; asserted both directions in tests + live curl.
- **Date localization** partial (primary date localized in prose; deadline-map values shown as stored) — acceptable v1.
- **Official Spanish sources**: the source *links* come from the live data (same URLs both languages), so they aren't translated. Where it helps, the ES prose can name the MyVote Spanish entry point in text. Not a blocker.

## Out of scope (YAGNI)

Full-site i18n; translated candidate/race/ads data; Spanish chat/agent; translated global nav; locale-based automatic redirects; a language cookie. All → November or later.
