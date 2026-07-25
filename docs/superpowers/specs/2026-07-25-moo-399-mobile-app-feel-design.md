# MOO-399 Mobile App-Feel — design (2026-07-25)

Issue is the contract (Linear MOO-399). Brainstormed 2026-07-25; approach grounded in the Next 16 PWA / manifest / View Transitions guides (`node_modules/next/dist/docs/01-app/02-guides/`). Two user-facing forks decided by Tarik: bottom-tab set = **Home · Races · Vote · Chat · More**; homepage = **ballot-finder-first, districts collapsed**.

**Goal:** make the site feel like an app on a phone — installable, thumb-navigable, smooth, and de-scrolled — without a native rebuild and without touching SSR/ISR/SEO or the neo-brutalist design system.

**Five workstreams, one spec, each independently shippable.** Ordered by isolation: 1→2 are PWA infra, 3→4 are chrome/motion, 5 is IA.

---

## 0. Constraints that bind every workstream

- **No cache-header regression.** Pages must stay `Cache-Control: public` with `x-vercel-cache: HIT`. A client-side service worker does not change what Vercel serves crawlers or the response headers, so SSR/ISR is untouched — the only rule is the SW must use **network-first for HTML navigations** so users never see stale pages.
- **Desktop unchanged.** Every mobile change is gated `sm:hidden` / `max-sm` or a mobile-only reorder. The `sm` breakpoint is the existing mobile/desktop line (`MobileNav` is `sm:hidden`).
- **`NAV_LINKS` stays the single source of truth** (`src/components/guide/nav-links.tsx`) — bottom tabs and the "More" sheet both derive from it. No second nav list.
- **No coverage/position summarization** (site trust rule). De-scroll only re-arranges and surfaces existing sourced content; it never paraphrases it.
- **Neo-brutalist tokens only** (`--border`, `--shadow-brutal`, `--primary` cardinal `#c5050c`, `--background` cream `#fff7ed`). No new colors.
- **No Serwist, no React experimental `viewTransition` flag** — see §2, §4 for why.

---

## 1. PWA install (manifest + meta + icons)

- **`src/app/manifest.ts`** → `MetadataRoute.Manifest` (Next 16 native file convention). Fields: `name: "BadgerBrief — Wisconsin Voter Guide 2026"`, `short_name: "BadgerBrief"`, `description` from `SITE_DESCRIPTION`, `start_url: "/"`, `display: "standalone"`, `background_color: "#fff7ed"` (cream), `theme_color: "#c5050c"` (cardinal), `icons` = 192, 512, and a 512 `purpose: "maskable"`.
- **Icons** in `public/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. **Flag:** no brand app-icon exists yet. Generate a bold neo-brutalist placeholder mark (cardinal field, cream "BB" in the display font, thick charcoal border) so install works now; Tarik can swap real art later (same "ship-without, leave-a-spot" pattern as the About photo). Do NOT block on final art.
- **Meta**: add `appleWebApp: { capable: true, statusBarStyle: "default", title: "BadgerBrief" }` to the root `metadata` in `layout.tsx`, and a `viewport` export with `themeColor` (light `#fff7ed` / dark to match the dark token) and `viewportFit: "cover"` (so the tab bar can use `safe-area-inset`).

## 2. Offline service worker

- **`public/sw.js`** (hand-rolled, not Serwist — the Next guide notes Serwist "requires webpack configuration" and this project runs **Turbopack**, so Serwist fights the build):
  - `install`: precache an app shell — `/vote` (highest-value offline page: the rules a voter needs at the polls), an offline fallback, and the site's static shell. `skipWaiting()`.
  - `activate`: delete old caches by version prefix; `clients.claim()`.
  - `fetch`: **network-first for navigations** (`request.mode === "navigate"`) → fall back to cache, then to the cached `/vote`/offline page; **cache-first** for same-origin static assets (`_next/static`, icons, fonts). Never intercept cross-origin or non-GET.
  - A `CACHE_VERSION` constant bumped on every SW change (the cache-busting lever).
- **`src/components/guide/sw-register.tsx`** (`"use client"`): registers `/sw.js` in a `useEffect`, guarded by `"serviceWorker" in navigator` and `process.env.NODE_ENV === "production"`. Mounted once in `layout.tsx`. No UI.
- **`next.config.ts`**: add an `async headers()` returning the `/sw.js` `no-cache` header from the Next guide (`Cache-Control: no-cache, no-store, must-revalidate`). This is a NEW function — the config currently has none — so nothing is clobbered; it composes with `images`/`redirects`/`experimental`.
- **No push notifications** — the Next PWA guide centers on push, but the issue scopes only app-shell + offline. Skip VAPID/web-push entirely (YAGNI).

## 3. Bottom tab bar

- **`src/components/guide/bottom-tabs.tsx`** (`"use client"`): `fixed bottom-0 inset-x-0 z-50 sm:hidden`, `border-t-2 border-border bg-card`, `padding-bottom: env(safe-area-inset-bottom)`. Five equal cells: **Home (`/`), Races (`/races/wi-gov-2026`), Vote (`/vote`), Chat (`/chat`), More**. Each cell = icon + short label, `min-height: 3.25rem` (thumb target). Active state: `usePathname()` → the matching tab gets cardinal ink; "Home" active only on exact `/`. Icons are inline SVG (no icon library — YAGNI).
- **The primary-4 hrefs live in one exported constant** (`PRIMARY_TAB_HREFS`) so the "More" sheet is exactly `NAV_LINKS.filter(l => !PRIMARY_TAB_HREFS.includes(l.href))` — no drift, derived from the single source of truth.
- **"More"** opens a bottom sheet (`bottom-tabs` local state, not a route): the remaining `NAV_LINKS` + `AuthNav` + `ThemeToggle` (moving what the hamburger held). Closes on route change (`usePathname` effect, same pattern as `MobileNav`).
- **Retire the hamburger on mobile:** remove `MobileNav` from the mobile header (or hide it) so there is one mobile nav, not two. Desktop header row unchanged.
- **Body clearance:** add `pb-16 sm:pb-0` to the layout content wrapper so the fixed bar never covers the last content or the footer on mobile.

## 4. View Transitions

- **CSS-only, native MPA**: add to `globals.css`:
  ```css
  @view-transition { navigation: auto; }
  @media (prefers-reduced-motion: reduce) {
    @view-transition { navigation: none; }
  }
  ```
  This animates cross-document navigations natively — zero JS, no library, and it avoids React's **experimental** `viewTransition` config flag (the issue says "browser-native, no library"). Progressive enhancement: unsupported browsers (older Safari) simply get instant navigation, no breakage.
- v1 scope is the default cross-fade. Named shared-element transitions (candidate card → candidate page) are a later nicety, explicitly out of scope here.

## 5. De-scroll

### Homepage (`src/app/page.tsx`)
- **`BallotFinder` becomes the hero primary action** — the address→your-ballot lookup is the first interactive thing on the page (it already exists, MOO-307). Statewide/marquee races stay as compact cards below.
- **The 99 district races collapse** on mobile so the phone never renders a 99-row scroll wall. Mechanism: render a `<details class="sm:hidden">` "Find your district races" wrapping `DistrictRaces` for `< sm`, and render `DistrictRaces` directly (`hidden sm:block`) for `≥ sm` — desktop keeps the current browser. **SEO guardrail:** the district links stay in the DOM inside the `<details>` (collapsed ≠ removed), so crawlability of the 116 district pages is unaffected; verify no district `<a href>` count regression in the built homepage HTML.
- Extract the "which races are statewide vs per-district" split into a **pure helper** (`src/lib/home-races.ts`) so it is unit-testable and the page stays thin (the split logic already lives inline in `page.tsx:33-34`).

### Candidate page (`src/app/candidates/[slug]/page.tsx`)
- **Promote the positions ("Issues") section directly under the header on mobile**, ahead of bio/priorities, so a voter sees what differentiates the candidate without a long scroll. The existing sticky `SectionNav` (already on the page) stays as the jump mechanism. This is a **mobile-only reorder** (e.g. `order-*` utilities or a conditional section order), not a rewrite — desktop order unchanged.
- No change to how positions render (still the sourced list); only their position on mobile.

---

## Testing

- **Pure helpers (vitest):** `PRIMARY_TAB_HREFS` → "More" split derivation; `home-races` statewide/district split; candidate mobile section-order helper (if extracted). Each asserts real output.
- **`manifest()` shape test:** returns `name`, `start_url: "/"`, `display: "standalone"`, and ≥ one 192 and one 512 icon incl. a maskable.
- **`sw-register` guard test:** no-ops (does not throw, does not call register) when `navigator.serviceWorker` is absent or `NODE_ENV !== "production"`.
- **Not unit-testable, must be manual/Lighthouse:** the service worker runtime (no SW environment in vitest), home-screen install, standalone launch. Acceptance verification:
  - Lighthouse "Installable" pass on the deployed URL.
  - `curl -sI https://badgerbrief.org/` and `/races/...` → `cache-control: public...` and `x-vercel-cache: HIT` unchanged (the no-regression gate).
  - Manual: install on iOS Safari + Android Chrome, confirm standalone (no browser chrome), confirm `/vote` loads offline.

## Risks / flags

- **App-icon art** is a placeholder until Tarik supplies real art (does not block install).
- **`@view-transition` support** is progressive (Chrome, Safari 18+); graceful no-op elsewhere.
- **SW staleness** is the one real footgun — mitigated by network-first HTML + `CACHE_VERSION` bump discipline. A bad SW can be killed by shipping an empty `sw.js` (the no-cache header guarantees clients pick it up next load).

## Out of scope (YAGNI)

Push notifications / VAPID; Serwist; React experimental view-transition flag; shared-element named transitions; desktop layout changes; any content summarization; Spanish (MOO-400).
