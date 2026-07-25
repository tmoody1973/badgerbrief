# MOO-399 Mobile App-Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BadgerBrief feel like an app on a phone — installable, thumb-navigable, smooth, de-scrolled — without a native rebuild and without touching SSR/ISR/SEO or the neo-brutalist design.

**Architecture:** Next 16 App Router native metadata (`manifest.ts`, `apple-icon.tsx`, viewport), a hand-rolled offline service worker, a mobile-only bottom tab bar derived from the existing `NAV_LINKS`, CSS-native View Transitions, and mobile-only IA re-arrangement of the homepage and candidate pages. Every change is mobile-gated; desktop and cache headers are untouched.

**Tech Stack:** Next 16.2.10 (App Router, Turbopack), React, Tailwind v4, `next/og` `ImageResponse`, vitest + convex-test.

## Global Constraints

- **No cache-header regression:** pages stay `Cache-Control: public` / `x-vercel-cache: HIT`. The SW MUST use **network-first for HTML navigations**.
- **Desktop unchanged:** every mobile change is `sm:hidden` / `hidden sm:block` / a mobile-only reorder. `sm` is the existing mobile/desktop line.
- **`NAV_LINKS` (`src/components/guide/nav-links.tsx`) is the single nav source of truth** — bottom tabs and the "More" sheet derive from it; no second list.
- **No content summarization** (trust rule): de-scroll re-arranges/surfaces existing sourced content, never paraphrases.
- **Tokens only:** `--border`, `--shadow-brutal`, `--primary` (`#c5050c`), `--background` (`#fff7ed`), `--card`. No new colors.
- **No Serwist, no React experimental `viewTransition` flag, no push/VAPID.**
- **Test command:** `npx vitest run <file>`.

---

### Task 1: PWA manifest, icons, and meta

**Files:**
- Create: `src/app/manifest.ts`
- Create: `public/icon.svg` (hand-written neo-brutalist mark)
- Create: `src/app/apple-icon.tsx` (`ImageResponse`, iOS PNG)
- Modify: `src/app/layout.tsx` (add `appleWebApp` to metadata; add `viewport` export)
- Test: `src/app/manifest.test.ts`

**Interfaces:**
- Consumes: `SITE_NAME`, `SITE_DESCRIPTION` from `src/lib/site`.
- Produces: `manifest()` default export returning `MetadataRoute.Manifest`; `/manifest.webmanifest` served by Next; `/icon.svg`; apple touch icon auto-wired by Next.

- [ ] **Step 1: Write the failing test** — `src/app/manifest.test.ts`

```ts
import { describe, expect, test } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  test("declares an installable standalone app with icons", () => {
    const m = manifest();
    expect(m.name).toMatch(/BadgerBrief/);
    expect(m.short_name).toBe("BadgerBrief");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#fff7ed");
    expect(m.theme_color).toBe("#c5050c");
    // at least one icon, and a maskable one
    expect(m.icons?.length).toBeGreaterThanOrEqual(1);
    expect(m.icons?.some((i) => i.purpose?.includes("maskable"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/manifest.test.ts`
Expected: FAIL — `./manifest` not found.

- [ ] **Step 3: Create `src/app/manifest.ts`**

```ts
import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Wisconsin Voter Guide 2026`,
    short_name: "BadgerBrief",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fff7ed",
    theme_color: "#c5050c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `public/icon.svg`** — a neo-brutalist BB mark (cardinal field, cream letters, thick charcoal border). Maskable-safe: keep the glyph within the central 80% safe zone.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="BadgerBrief">
  <rect width="512" height="512" fill="#c5050c"/>
  <rect x="24" y="24" width="464" height="464" fill="none" stroke="#1c1b1a" stroke-width="24"/>
  <text x="256" y="256" fill="#fff7ed" font-family="Arial Black, Arial, sans-serif" font-weight="900"
        font-size="240" text-anchor="middle" dominant-baseline="central" letter-spacing="-8">BB</text>
</svg>
```

- [ ] **Step 6: Create `src/app/apple-icon.tsx`** — iOS home-screen PNG via `ImageResponse` (iOS ignores SVG + the web manifest). Mirror the font-free pattern in `src/app/opengraph-image.tsx`.

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c5050c",
          border: "10px solid #1c1b1a",
          color: "#fff7ed",
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: -4,
        }}
      >
        BB
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 7: Add `appleWebApp` metadata + `viewport` export to `src/app/layout.tsx`**

In the existing `metadata` object, add:

```ts
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BadgerBrief" },
  icons: { icon: "/icon.svg" },
```

Add a new `viewport` export (Next 16 splits viewport/themeColor out of `metadata`):

```ts
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff7ed" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1b1a" },
  ],
  viewportFit: "cover",
};
```

- [ ] **Step 8: Typecheck + build check**

Run: `npx tsc --noEmit`
Expected: no errors. (Icon/apple-icon are compiled by Next; tsc validates the TSX.)

- [ ] **Step 9: Commit**

```bash
git add src/app/manifest.ts src/app/manifest.test.ts public/icon.svg src/app/apple-icon.tsx src/app/layout.tsx
git commit -m "feat(pwa): installable manifest + icons + apple-web-app meta (MOO-399)"
```

---

### Task 2: Offline service worker

**Files:**
- Create: `public/sw.js`
- Create: `src/components/guide/sw-register.tsx`
- Modify: `src/app/layout.tsx` (mount `<SwRegister />`)
- Modify: `next.config.ts` (add `async headers()` for `/sw.js`)
- Test: `src/components/guide/sw-register.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SwRegister` (client component, no props, renders null); `/sw.js` served with `no-cache`.

- [ ] **Step 1: Create `public/sw.js`** — network-first HTML, cache-first static, precache `/vote`.

```js
// BadgerBrief service worker — app shell + offline /vote. Network-first for
// HTML so users never see stale pages (and SSR/crawler headers are untouched);
// cache-first for same-origin static. Bump CACHE_VERSION on every change.
const CACHE_VERSION = "bb-v1";
const APP_SHELL = ["/vote", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network-first: fresh page when online, cached/offline fallback when not.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/vote").then((v) => v || caches.match("/offline")))),
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        if (res.ok && request.url.includes("/_next/static")) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return res;
      }),
    ),
  );
});
```

- [ ] **Step 2: Create `src/app/offline/page.tsx`** — the offline fallback page (plain, no data fetch).

```tsx
export const metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl">You&rsquo;re offline</h1>
      <p className="mt-4 text-lg">
        BadgerBrief can&rsquo;t reach the network right now. The{" "}
        <a href="/vote" className="underline decoration-2">how-to-vote page</a>{" "}
        is saved for offline use.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Write the failing test** — `src/components/guide/sw-register.test.ts`

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

describe("registerSw", () => {
  beforeEach(() => vi.resetModules());

  test("no-ops when serviceWorker is unavailable", async () => {
    const { registerSw } = await import("./sw-register");
    // navigator without serviceWorker must not throw
    expect(() => registerSw({} as Navigator, "production")).not.toThrow();
  });

  test("does not register outside production", () => {
    const register = vi.fn();
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    // dynamic import to get the fresh module
    return import("./sw-register").then(({ registerSw }) => {
      registerSw(nav, "development");
      expect(register).not.toHaveBeenCalled();
    });
  });

  test("registers /sw.js in production when supported", () => {
    const register = vi.fn(() => Promise.resolve());
    const nav = { serviceWorker: { register } } as unknown as Navigator;
    return import("./sw-register").then(({ registerSw }) => {
      registerSw(nav, "production");
      expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/components/guide/sw-register.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Create `src/components/guide/sw-register.tsx`** — pure `registerSw` (testable) + the client wrapper.

```tsx
"use client";

import { useEffect } from "react";

/** Pure, testable registration guard. */
export function registerSw(nav: Navigator, env: string) {
  if (env !== "production") return;
  if (!("serviceWorker" in nav)) return;
  nav.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Registration failure must never break the page — offline is an enhancement.
  });
}

export function SwRegister() {
  useEffect(() => {
    registerSw(navigator, process.env.NODE_ENV);
  }, []);
  return null;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/guide/sw-register.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Mount `<SwRegister />` in `src/app/layout.tsx`** — add the import and render it alongside the other client mounts (near `<AnalyticsEvents />`):

```tsx
import { SwRegister } from "@/components/guide/sw-register";
// ...
        <AnalyticsEvents />
        <SwRegister />
```

- [ ] **Step 8: Add `async headers()` to `next.config.ts`** — inside the `nextConfig` object, alongside `redirects`:

```ts
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
```

- [ ] **Step 9: Typecheck + commit**

```bash
npx tsc --noEmit
git add public/sw.js src/app/offline/page.tsx src/components/guide/sw-register.tsx src/components/guide/sw-register.test.ts src/app/layout.tsx next.config.ts
git commit -m "feat(pwa): offline service worker + register + no-cache header (MOO-399)"
```

---

### Task 3: Bottom tab bar + retire mobile hamburger

**Files:**
- Create: `src/components/guide/bottom-tabs.tsx`
- Modify: `src/app/layout.tsx` (mount `<BottomTabs />`; add mobile bottom padding to content wrapper)
- Modify: `src/components/guide/chrome.tsx` (remove `<MobileNav />` from the header)
- Test: `src/components/guide/bottom-tabs.test.ts` (the primary/More split)

**Interfaces:**
- Consumes: `NAV_LINKS` from `./nav-links`, `AuthNav`, `ThemeToggle`, `usePathname`.
- Produces: `BottomTabs` (client component); exported `PRIMARY_TAB_HREFS = ["/", "/races/wi-gov-2026", "/vote", "/chat"]` and `moreLinks(NAV_LINKS)` helper returning the non-primary links.

- [ ] **Step 1: Write the failing test** — `src/components/guide/bottom-tabs.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { NAV_LINKS } from "./nav-links";
import { PRIMARY_TAB_HREFS, moreLinks } from "./bottom-tabs";

describe("bottom tab derivation", () => {
  test("More = NAV_LINKS minus the primary tab hrefs", () => {
    const more = moreLinks(NAV_LINKS);
    expect(more.some((l) => PRIMARY_TAB_HREFS.includes(l.href))).toBe(false);
    // the non-primary NAV_LINKS (Ads, News, Brief, About, Methodology) remain
    expect(more.map((l) => l.href)).toContain("/about");
    expect(more.map((l) => l.href)).toContain("/news");
  });

  test("every NAV_LINK is either a primary tab or in More (no link is lost)", () => {
    const more = new Set(moreLinks(NAV_LINKS).map((l) => l.href));
    for (const l of NAV_LINKS) {
      expect(PRIMARY_TAB_HREFS.includes(l.href) || more.has(l.href)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/guide/bottom-tabs.test.ts`
Expected: FAIL — `./bottom-tabs` not found.

- [ ] **Step 3: Create `src/components/guide/bottom-tabs.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "./auth-nav";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export const PRIMARY_TAB_HREFS = ["/", "/races/wi-gov-2026", "/vote", "/chat"];

export function moreLinks(links: typeof NAV_LINKS) {
  return links.filter((l) => !PRIMARY_TAB_HREFS.includes(l.href));
}

const TABS = [
  { href: "/", label: "Home", glyph: "⌂" },
  { href: "/races/wi-gov-2026", label: "Races", glyph: "🗳" },
  { href: "/vote", label: "Vote", glyph: "✓" },
  { href: "/chat", label: "Chat", glyph: "💬" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/races/wi-gov-2026") return pathname.startsWith("/races");
  return pathname.startsWith(href);
}

export function BottomTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" onClick={() => setMoreOpen(false)}>
          <nav
            className="absolute inset-x-0 bottom-14 border-t-2 border-border bg-card shadow-[var(--shadow-brutal)]"
            onClick={(e) => e.stopPropagation()}
            aria-label="More navigation"
          >
            {moreLinks(NAV_LINKS).map(({ href, label }) => (
              <Link key={href} href={href} className="block border-b-2 border-border px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider last:border-b-0 hover:bg-secondary">
                {label}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-2 border-t-2 border-border px-4 py-3">
              <AuthNav />
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t-2 border-border bg-card sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${active ? "text-primary" : "text-foreground"}`}>
              <span aria-hidden className="text-lg leading-none">{t.glyph}</span>
              {t.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${moreOpen ? "text-primary" : "text-foreground"}`}>
          <span aria-hidden className="text-lg leading-none">···</span>
          More
        </button>
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/guide/bottom-tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount `<BottomTabs />` + add mobile bottom padding in `src/app/layout.tsx`**

Import and render `<BottomTabs />` after `<SiteFooter />`. Change the content wrapper so the fixed bar never covers content/footer on mobile:

```tsx
import { BottomTabs } from "@/components/guide/bottom-tabs";
// ...
          <div className="flex-1 pb-16 sm:pb-0">{children}</div>
          <SiteFooter />
          <BottomTabs />
```

- [ ] **Step 6: Retire the hamburger on mobile** — in `src/components/guide/chrome.tsx`, remove the `<MobileNav />` line and its import. The mobile header now shows only the brand (bottom tabs own mobile nav). Desktop `<nav className="hidden ... sm:flex">` is unchanged.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/guide/bottom-tabs.tsx src/components/guide/bottom-tabs.test.ts src/app/layout.tsx src/components/guide/chrome.tsx
git commit -m "feat(mobile): bottom tab bar, retire hamburger on mobile (MOO-399)"
```

> Leave `src/components/guide/mobile-nav.tsx` in the tree (unimported) — deleting it is a separate cleanup; a dead unimported file is harmless and out of this task's scope.

---

### Task 4: View Transitions (CSS-native)

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:** none (pure CSS progressive enhancement).

- [ ] **Step 1: Add the MPA view-transition rules to `src/app/globals.css`** (append near the top-level rules, after the `@custom-variant` line):

```css
/* Native cross-document view transitions (MOO-399). Progressive: unsupported
   browsers get instant navigation. Off when the user asks for reduced motion. */
@view-transition { navigation: auto; }
@media (prefers-reduced-motion: reduce) {
  @view-transition { navigation: none; }
}
```

- [ ] **Step 2: Verify the build still compiles the CSS**

Run: `npx tsc --noEmit` (no TS impact) and confirm `globals.css` has the two `@view-transition` blocks: `grep -c "@view-transition" src/app/globals.css` → expect `2`.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(mobile): native CSS view transitions on navigation (MOO-399)"
```

---

### Task 5: De-scroll the homepage (ballot-first, districts collapsed on mobile)

**Files:**
- Create: `src/lib/home-races.ts` (pure split helper) + `src/lib/home-races.test.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `Doc<"races">[]`.
- Produces: `splitHomeRaces(races)` → `{ listed, byLevel }` where `listed` drops the superseded chamber-wide legislative rows and `byLevel` is a `Map<level, races[]>` in `LEVEL_ORDER`.

- [ ] **Step 1: Write the failing test** — `src/lib/home-races.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { splitHomeRaces } from "./home-races";

const race = (raceId: string, level: string) => ({ raceId, level }) as any;

describe("splitHomeRaces", () => {
  test("drops chamber-wide legislative rows when per-district races exist", () => {
    const races = [
      race("WI-GOV-2026", "Statewide"),
      race("WI-STATE-SENATE-2026", "State Legislative"),
      race("WI-SD-D1-2026", "State Legislative"),
    ];
    const { listed } = splitHomeRaces(races);
    expect(listed.map((r) => r.raceId)).toContain("WI-SD-D1-2026");
    expect(listed.map((r) => r.raceId)).not.toContain("WI-STATE-SENATE-2026");
  });

  test("keeps all rows when there are no per-district legislative races", () => {
    const races = [race("WI-GOV-2026", "Statewide"), race("WI-STATE-SENATE-2026", "State Legislative")];
    const { listed } = splitHomeRaces(races);
    expect(listed).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/home-races.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/home-races.ts`** — lift the inline logic AND the `LEVEL_ORDER` const out of `page.tsx` (verified: `LEVEL_ORDER` is defined inline at `page.tsx:16`, NOT imported; `Doc` is imported via a relative path, `../../../convex/_generated/dataModel` from a component — from `src/lib` it is `../../convex/_generated/dataModel`).

```ts
import type { Doc } from "../../convex/_generated/dataModel";

export const LEVEL_ORDER = [
  "State Executive",
  "Federal",
  "State Judicial",
  "State Legislative",
];

export function splitHomeRaces(races: Doc<"races">[]) {
  const hasPerDistrict = races.some(
    (r) => /-D\d+-\d{4}$/.test(r.raceId) && r.level === "State Legislative",
  );
  const listed = hasPerDistrict
    ? races.filter((r) => r.level !== "State Legislative" || /-D\d+-\d{4}$/.test(r.raceId))
    : races;

  const byLevel = new Map<string, Doc<"races">[]>();
  for (const level of LEVEL_ORDER) {
    const group = listed.filter((r) => r.level === level);
    if (group.length > 0) byLevel.set(level, group);
  }
  return { listed, byLevel };
}
```

> In `page.tsx` (Step 5) DELETE the inline `const LEVEL_ORDER = [...]` (lines 16–21) and the inline split block; `splitHomeRaces` now owns both. If `page.tsx` references `LEVEL_ORDER` anywhere else, import it from `@/lib/home-races`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/home-races.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `src/app/page.tsx`** — three changes, desktop output unchanged:
  1. Replace the inline `hasPerDistrict`/`listed`/`byLevel` block with `const { listed, byLevel } = splitHomeRaces(races);`.
  2. **Move `<BallotFinder races={races} />` up** to immediately after the hero `<section>` (before the "When are the deadlines" box), so the address→ballot lookup is the primary action.
  3. **Collapse the district list on mobile.** For the `State Legislative` branch inside the `byLevel` map, wrap `<DistrictRaces races={group} />` so it is inside a `<details className="mt-2 sm:hidden">` (with `<summary>` "Find your district races") for mobile AND rendered directly in a `hidden sm:block` wrapper for desktop:

```tsx
{level === "State Legislative" ? (
  <>
    <details className="mt-2 border-2 border-border bg-card p-3 sm:hidden">
      <summary className="cursor-pointer font-bold">Find your district races ({group.length})</summary>
      <div className="mt-3"><DistrictRaces races={group} /></div>
    </details>
    <div className="hidden sm:block"><DistrictRaces races={group} /></div>
  </>
) : (
  /* unchanged statewide card grid */
)}
```

  **SEO guardrail:** the district `<a href>` links live in the DOM in BOTH branches — collapsed (`<details>`) still renders them. Verify no link-count regression in Step 6.

- [ ] **Step 6: Typecheck + verify links preserved**

Run: `npx tsc --noEmit`. Then build-free check with the dev server is optional; the mandatory check is the SEO guardrail — after deploy (Task 7) confirm the homepage still exposes the district links. For now, confirm both `DistrictRaces` render sites exist: `grep -c "DistrictRaces races={group}" src/app/page.tsx` → expect `2`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/home-races.ts src/lib/home-races.test.ts src/app/page.tsx
git commit -m "feat(mobile): ballot-first homepage, collapse district wall on mobile (MOO-399)"
```

---

### Task 6: De-scroll candidate page (positions-first on mobile)

**Files:**
- Modify: `src/app/candidates/[slug]/page.tsx`

**Interfaces:** none new — a mobile-only reorder of existing sections.

- [ ] **Step 1: Reorder for mobile.** Verified: the sections `bio` (`page.tsx:222`), `positions` (236), `quotes` (273), `sources` (307), `priorities` (322) are all direct siblings inside one container, `<div className="min-w-0 lg:col-span-8">` (`page.tsx:60`). So this is a one-parent change:
  - Add `flex flex-col` to that container's className: `min-w-0 lg:col-span-8` → `flex flex-col min-w-0 lg:col-span-8`.
  - Add `order-first sm:order-none` to ONLY the `positions` `<section>` (line 236). Every other section keeps default order (source order). Result: on mobile, positions renders first; at `≥ sm`, `sm:order-none` resets it, restoring the original `bio → positions → ...` order.

> `flex flex-col` on the container stacks its children vertically — visually identical to the current block flow (they're already full-width stacked sections with `mt-*` spacing), so desktop is unaffected apart from the intended `sm:order-none` reset. Do NOT restructure `SectionNav`, the `lg:grid` wrapper, or the data flow.

- [ ] **Step 2: Verify desktop order is unchanged** — the `sm:order-none` (or `sm:order-*` matching source) must restore the original visual order at `≥ sm`. Confirm by reading the diff: every `order-*` utility has an `sm:` counterpart that yields the original sequence.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/candidates/[slug]/page.tsx"
git commit -m "feat(mobile): surface candidate positions first on mobile (MOO-399)"
```

---

### Task 7: Deploy + verify (Tarik-gated)

**Files:** none.

- [ ] **Step 1: Full test + typecheck sweep**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 2: Build locally to catch Turbopack/manifest issues**

Run: `npm run build`
Expected: succeeds; the build output lists `/manifest.webmanifest`, `/apple-icon`, `/icon.svg`, `/offline`.

- [ ] **Step 3: Deploy** (Tarik-gated — confirm before running)

Run: `npx vercel --prod --yes`

- [ ] **Step 4: Verify acceptance on the live site**

```bash
# Cache headers NOT regressed (the hard gate):
curl -sI https://badgerbrief.org/ | grep -iE "cache-control|x-vercel-cache"
curl -sI https://badgerbrief.org/races/wi-gov-2026 | grep -iE "cache-control|x-vercel-cache"
# PWA wiring present:
curl -s https://badgerbrief.org/manifest.webmanifest | grep -iE "standalone|BadgerBrief|icon"
curl -sI https://badgerbrief.org/sw.js | grep -i "cache-control"   # expect no-cache
# SEO guardrail: homepage still exposes district links
curl -s https://badgerbrief.org/ | grep -oE '/races/wi-(sd|ad)-d[0-9]+-2026' | sort -u | wc -l
```
Expected: pages still `public` + `x-vercel-cache: HIT`; manifest served; `/sw.js` `no-cache`; district link count > 0.

- [ ] **Step 5: Manual (Tarik)** — install to home screen on iOS Safari + Android Chrome; confirm standalone launch (no browser chrome); confirm `/vote` loads with network off; confirm the bottom tab bar is the only mobile nav. Lighthouse → PWA "Installable" pass.

- [ ] **Step 6: Update Linear MOO-399** to Done with the acceptance evidence.

---

## Self-Review

**Spec coverage:**
- §1 PWA manifest/meta/icons → Task 1 ✓
- §2 offline SW + register + header → Task 2 (incl. `/offline` fallback) ✓
- §3 bottom tab bar + retire hamburger → Task 3 ✓
- §4 CSS view transitions → Task 4 ✓
- §5 de-scroll homepage → Task 5; de-scroll candidate → Task 6 ✓
- §0 no-cache-regression + desktop-unchanged + NAV_LINKS-source-of-truth + SEO guardrail → Tasks 3/5 code + Task 7 curl verification ✓
- Testing (manifest shape, sw-register guard, nav split, home-races split) → Tasks 1/2/3/5 ✓

**Placeholder scan:** No TBD/TODO; every code step has real code. Three "read the actual file first" notes (Task 5 `LEVEL_ORDER` import path, Task 6 section container, Task 3 keep mobile-nav.tsx) are verification instructions against named files, not placeholders.

**Type consistency:** `splitHomeRaces` returns `{ listed, byLevel }` consumed identically in `page.tsx`; `PRIMARY_TAB_HREFS`/`moreLinks` names match between `bottom-tabs.tsx` and its test; `registerSw(nav, env)` signature matches between component and test; manifest field values (`#fff7ed`, `#c5050c`, `standalone`) match the test assertions and the spec tokens.

**Known cross-task note:** Task 5 assumes `LEVEL_ORDER` and `Doc` import paths — the task explicitly says to copy them from `page.tsx` rather than trust the plan's guessed `@/lib/levels`. Flagged for the implementer.
