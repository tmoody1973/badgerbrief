# Full-site i18n — Phase 1: Foundation & Static Pages — design (2026-07-25)

Pulls the November full-i18n forward (Tarik decision 2026-07-25, reversing the MOO-400 "scoped slice" scope). This is **Phase 1 of 3**; Phases 2–3 get their own specs. A new Linear issue should track this (proposed: "Full-site Spanish i18n").

## Decisions locked in brainstorming (2026-07-25)

1. **Full site in Spanish**, phased.
2. **Translation strategy:** machine-translate the data pages with a visible "machine-translated, original in English" disclaimer; human-verify ONLY the eligibility/logistics content (already done for `/vote`). **Direct quotes are NEVER translated** — the original English stays, optionally with a labeled gloss.
3. **Routing:** English stays exactly where it is (unprefixed, already indexed); Spanish lives under `/es/*`. **No `app/[lang]` restructure.**
4. **Architecture (refinement of #3):** shared page components + thin per-locale route files — the `/es/vote` pattern generalized. NOT a middleware header-rewrite, because reading a locale header in a page forces dynamic rendering and would break the static-render / `x-vercel-cache: HIT` posture protected in MOO-399. Each `/es/*` page is its own statically-generated route rendering a shared component with the ES dict/locale.

## Phase 1 scope (this spec)

The **foundation primitives** + the **static, no-data pages** in Spanish. No candidate/race data (that's Phase 2).

**In scope:**
- i18n primitives: a general `locale` type, a per-page hreflang-pair helper, a `MachineTranslated` disclaimer banner (used in Phase 2, defined here), and the generalized `LangToggle`.
- Spanish versions of the static pages: **home (`/es`), About (`/es/about`), Methodology (`/es/methodology`)**, and the already-shipped `/es/vote`. (News/Ads/Chat/Brief deferred — News/Ads are data-ish, Chat/Brief are app surfaces; revisit in a later phase.)
- Global chrome in Spanish **when on an `/es/*` page**: nav labels, footer, the "Aug 11" chip. This requires making `SiteHeader`/`SiteFooter` locale-aware.
- hreflang on every EN/ES pair shipped in this phase; `/es` entries in the sitemap.

**Out of scope (Phase 2+):** the 4 dynamic data routes (`races/[slug]`, `candidates/[slug]`, `compare/[slug]`, `sponsors/[slug]`), the machine-translation batch pipeline, translated data storage, News/Ads/Chat/Brief.

---

## 1. Locale primitives

- **`src/lib/i18n/locale.ts`** — `export type Locale = "en" | "es";` and helpers:
  - `hreflangFor(enPath: string): { canonical map }` — given an English path, returns the `alternates.languages` object `{ en: enPath, es: esPath, "x-default": enPath }` where `esPath = enPath === "/" ? "/es" : "/es" + enPath`. Replaces the one-off `VOTE_HREFLANG`; `/vote` and `/es/vote` adopt it.
  - `esTwin(enPath)` / `enTwin(esPath)` — path mapping for the toggle.
  - `TRANSLATED_PATHS: Set<string>` — the English paths that currently HAVE a Spanish twin (this phase: `/`, `/vote`, `/about`, `/methodology`). The toggle and hreflang only offer Spanish for paths in this set, so we never link to a not-yet-built `/es/*` (avoids 404s during the phased rollout).

## 2. Generalized `LangToggle` (update the one shipped today)

`langToggleFor(pathname)` becomes twin-aware and rollout-safe:
- On an `/es/*` path → `{ label: "English", href: enTwin(pathname) }`.
- On an English path IN `TRANSLATED_PATHS` → `{ label: "Español", href: esTwin(pathname) }`.
- On an English path with NO twin yet → `{ label: "Español", href: "/es" }` (send them to the Spanish home rather than a 404), OR hide the toggle. Decision: **link to `/es` home** — a dead-end 404 is worse than landing on the Spanish front page. Revisit once coverage is complete.

## 3. Locale-aware chrome

`SiteHeader` / `SiteFooter` (`src/components/guide/chrome.tsx`) take an optional `locale: Locale = "en"` and read labels from a **chrome dictionary** (`src/lib/i18n/chrome-en.ts` / `chrome-es.ts`: nav labels, footer prose, "Aug 11"/"11 ago" chip). The root `layout.tsx` renders EN chrome by default; `/es/*` pages need ES chrome.

**How `/es/*` pages get ES chrome without a `[lang]` layout:** add an `src/app/es/layout.tsx` that re-renders `SiteHeader`/`SiteFooter` with `locale="es"` and sets `<div lang="es">`. Because the root layout already renders EN chrome, the ES segment layout must NOT double-render it — instead the root layout renders `{children}` only, and header/footer move into a shared `<SiteChrome locale>` used by BOTH a root-level `(en)` wrapping and the `es` layout. **Refactor:** introduce a `SiteChrome` that both the default and `/es` layouts render with the right locale. (Detail the exact layout split in the plan; the key constraint: chrome renders once, in the correct language, per subtree.)

## 4. Machine-translated disclaimer banner (define now, use in Phase 2)

- **`src/components/guide/machine-translated.tsx`** — a dismissible-optional neo-brutalist banner: "Traducción automática — el texto original está en inglés." Shown on Spanish pages whose content is machine-translated and NOT human-verified. Phase-1 static pages that are hand-translated (home/about/methodology/vote) do NOT show it; Phase-2 data pages DO. A `verified?: boolean` prop or simply: pages opt in by rendering it.

## 5. Static Spanish pages (this phase)

Each mirrors the `/es/vote` pattern — a shared component + EN/ES dicts, English route at root, ES route under `/es`:
- **`/es`** (home) — hand-translate the homepage hero/prose + the ballot-finder chrome (the finder itself stays functional; its labels translate). Data (race names) stay as-is for now (Phase 2 handles race data).
- **`/es/about`**, **`/es/methodology`** — hand-translate (static prose; the About page's disclosure content is sensitive → hand-translate + Tarik verify).
- **`/es/vote`** — already shipped; re-point its hreflang to the new `hreflangFor` helper.
- Each ES page: `lang="es"`, `alternates` via `hreflangFor`, self-canonical, sitemap entry.

## 6. SEO plumbing

- `hreflangFor` on every EN page that has a twin (add to `/`, `/about`, `/methodology`, `/vote`) AND its ES twin — reciprocal.
- `sitemap.ts`: add `/es`, `/es/about`, `/es/methodology` (`/es/vote` already there).
- The English pages are otherwise **untouched** (URLs, canonicals, output) — verified by diff + the `x-vercel-cache` check.

## 7. Testing

- `hreflangFor("/")`, `("/vote")`, `("/about")` return correct reciprocal `{en, es, x-default}` (unit).
- `langToggleFor` twin-mapping + no-twin fallback to `/es` (unit; extends today's test).
- `TRANSLATED_PATHS` gates the toggle/hreflang (unit).
- Chrome dict parity (ES has every key EN has) — type-enforced + a key-coverage test.
- Live (deploy): `/es`, `/es/about`, `/es/methodology` 200; reciprocal hreflang both directions; chrome renders Spanish on `/es/*` and English elsewhere; English URLs + `x-vercel-cache: HIT` unchanged.

## Risks / flags

- **Chrome layout split is the riskiest structural change** — getting header/footer to render once in the right language per subtree, without double-rendering or breaking the root layout, needs care. It touches the global layout, so a mistake is site-wide. The plan must isolate this and verify EN pages are byte-unchanged.
- **Hand-translation of the About disclosure** (Radio Milwaukee / Plan Commission) is sensitive, accuracy-critical content → Tarik verifies, like MOO-400.
- **Toggle-to-`/es` fallback** for untranslated paths is a stopgap; full coverage (Phase 2/3) removes the dead-ends.
- This phase deliberately ships NO machine-translated content — it's the safe foundation. The trust-bearing disclaimer + the 589 pages come in Phase 2 with their own verification/QA design.

## Out of scope (later phases / YAGNI now)

Phase 2: data translation pipeline + the 4 dynamic routes + disclaimer in anger. Phase 3: full hreflang/sitemap coverage, verified-vs-machine badging, untranslated-fallback UX, News/Ads/Chat/Brief, `Accept-Language` auto-redirect, language cookie.
