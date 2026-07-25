# Full-site i18n — Phase 2: Data Translation Pipeline — design (2026-07-25)

MOO-406, **Phase 2 of 3**. Builds on the Phase-1 foundation (shipped: locale primitives, locale-aware chrome, `/es` static pages, `localizeHref` nav persistence, RaceCard label localization). This phase makes the ~589 data pages (races, candidates, compare, sponsors) available in Spanish via **machine translation + a visible disclaimer**, with **direct quotes kept in English**.

## Locked decisions (from the MOO-406 brainstorm)

- **Machine-translate** the data prose; **human-verify only eligibility/logistics** (already done — not re-touched here). A visible "traducción automática" banner sets expectations on every machine-translated page.
- **Direct quotes are NEVER translated** — render the English original with a small "(en inglés)" label.
- **English pages untouched**; Spanish under `/es/*` as statically-generated shared-component routes (the Phase-1 pattern), preserving `x-vercel-cache: HIT`.

## Decisions to confirm (recommendations; Tarik's call where noted)

1. **Engine: Claude via `@ai-sdk/anthropic`** (already a dependency; AI SDK v6 present). Rationale: high Spanish quality, handles civic context better than DeepL, consistent with the site's existing Anthropic usage, batchable from a Convex `"use node"` action. (Alternative: DeepL — no new dep either, but weaker on context.) **Recommend Claude.**
2. **Storage: a dedicated `translations` table**, not `*_es` columns on every table. Keyed by `(namespace, sourceId, field, locale)` with a `sourceHash` so re-translation only happens when the English source changes. Cleaner than bloating `candidates`/`races`, and one code path serves every entity.
3. **Office names (`races.office`) — hand-translate the small fixed set, don't machine it.** There are ~10 statewide offices + a couple of templated patterns ("Wisconsin State Assembly — District N"), and they're the most-visible page headings. A hand-translated `office` map (like the Phase-1 `raceLevelLabel`) gives higher quality for the headings at trivial cost; machine translation handles the long-tail prose (bios, positions, descriptions). **Recommend hand-translate office names + machine the prose.**

---

## 1. Field inventory (what gets translated)

**Translate (machine, unless noted):**
- `races.officeDescription`; `races.office` → **hand-translated map** (per decision 3).
- `candidates.background`, `currentOccupation`, `keyPriorities[]`, `notableEndorsements[]`, `notes`.
- `candidate_positions_published` — the position summary/detail prose.
- Any race/coverage description prose surfaced on these pages.

**NEVER translate (render English as-is):**
- `quote_published` — direct quotes. Show original + "(en inglés)".
- Proper nouns: `candidates.name`, `party`, `races.incumbent`/`seatHeldBy`, source/outlet names, URLs.
- Dates, IDs, numbers, finance figures.
- `status` / `party` → small fixed-set **label maps** (like `raceLevelLabel`), not machine (e.g. "Running" → "En campaña", "Democratic" → "Demócrata").

## 2. `translations` table

```ts
translations: defineTable({
  namespace: v.string(),   // "candidate" | "race" | "position"
  sourceId: v.string(),    // e.g. candidate slug, raceId, position _id
  field: v.string(),       // e.g. "background", "officeDescription"
  locale: v.string(),      // "es"
  sourceHash: v.string(),  // hash of the English source when translated
  text: v.string(),        // the translated value
  engine: v.string(),      // "claude-…" — provenance
  translatedAt: v.number(),
}).index("by_key", ["namespace", "sourceId", "field", "locale"]),
```

Read path: `getTranslations(namespace, sourceId, locale)` returns a `{ field → text }` map for a page to overlay. Miss → fall back to English + the page shows the disclaimer.

## 3. Batch translation job

- **`convex/i18nTranslate.ts`** (`"use node"` action): iterate translatable entities/fields, skip any whose `sourceHash` matches the stored translation (idempotent — re-run cheaply after content changes), translate the rest via Claude with a system prompt tuned for **Wisconsin civic content, formal "usted", preserve names/URLs/numbers verbatim, do not translate quoted text**. Write to `translations`. Batched + rate-limited; **quotes table is never read by this job**.
- Run manually first (like the seed scripts): `npx convex run i18nTranslate:runAll`. Later, a cron re-translates changed rows (Phase 3).
- **Spot-verification, not full review:** machine output ships with the disclaimer, but a quick human skim of a sample (esp. office descriptions + a few bios) before first publish is cheap insurance.

## 4. Rendering — the 4 dynamic `/es` routes

Extract each dynamic page body into a shared component (the Phase-1 pattern), then add the `/es` twin:
- `src/app/es/races/[slug]/page.tsx`, `es/candidates/[slug]/page.tsx`, `es/compare/[slug]/page.tsx`, `es/sponsors/[slug]/page.tsx` — each renders the shared component with `lang="es"` + a translations overlay fetched by `getTranslations`.
- **Field resolution helper** `t(field, english)` = translation if present, else English. Every translatable field routes through it.
- **Disclaimer**: render `<MachineTranslated />` (built in Phase 1) at the top of every machine-translated `/es` data page.
- **Quotes**: render the English `quote_published` text unchanged, with a `(en inglés)` tag.
- `generateStaticParams` mirrors the English routes (same slugs) so `/es/*` data pages are statically generated too — preserves the cache posture.

## 5. Nav / toggle / hreflang for dynamic paths

Phase 1's `TRANSLATED_PATHS` is a static Set. Phase 2 generalizes twin-detection to dynamic prefixes:
- Add `hasSpanishTwin(path): boolean` — true for the Phase-1 static set OR paths under `/races/`, `/candidates/`, `/compare/`, `/sponsors/` (once this phase ships). `localizeHref` and `langToggleFor` use it, so the toggle offers the direct `/es/<same-slug>` twin instead of falling back to `/es` home.
- `hreflangFor` already works for any path; add the dynamic `/es` routes' `alternates` + extend `sitemap.ts` to emit `/es/<slug>` for every race/candidate/compare/sponsor.

## 6. Sub-task decomposition (for the Phase 2 plan)

1. `translations` schema + `getTranslations` query + `upsertTranslation` mutation + hand-translated `office`/`status`/`party` label maps.
2. Batch translation action (Claude, hash-gated, quotes excluded) + a small self-check on a fixture.
3. Extract the 4 dynamic pages into shared components (EN unchanged) + the `t()` resolver + disclaimer + quotes-in-English.
4. The 4 `/es` dynamic routes + `generateStaticParams` + hreflang.
5. `hasSpanishTwin` generalization → `localizeHref`/`langToggleFor`/sitemap for dynamic paths.
6. Run the batch job, spot-verify, deploy, verify (EN unchanged; `/es/*` data pages 200, Spanish + disclaimer, quotes English, reciprocal hreflang).

## Risks / flags

- **Volume/cost/time:** ~589 pages × several fields is a real batch (LLM calls). Hash-gating + skip-if-unchanged keeps re-runs cheap; the first run is the cost. Rate-limit to avoid throttling.
- **Machine-translation accuracy** is disclaimed, not verified — acceptable per the locked strategy, BUT office descriptions and bios are worth a human skim (cheap) before first publish.
- **Static generation at scale:** 589 more `/es` static pages roughly doubles build output — confirm build time/size stay acceptable (ISR `revalidate` already in use).
- **Quotes discipline** is load-bearing for trust — the batch job must provably never translate `quote_published`, and the render must show the English original. Test both.
- **`<html lang>`** still `en` at SSR (Phase-1 limitation) — Phase 3.

## Out of scope (Phase 3)

Full hreflang/sitemap QA sweep, verified-vs-machine badging refinement, News/Ads/Chat/Brief, `Accept-Language` auto-redirect + language cookie, cron re-translation of changed content, per-route `<html lang>`.
