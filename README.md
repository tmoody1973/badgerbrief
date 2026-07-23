# BadgerBrief

> A nonpartisan Wisconsin 2026 voter guide — races, candidates, campaign money, and who's paying to reach voters — built on a human-reviewed AI research pipeline.

## Overview

BadgerBrief helps Wisconsin voters make sense of the 2026 election: what's on their ballot, where candidates stand, who's funding the race, and which ads are running to reach them. Editorial content is drafted by AI agents and **published only after a human review gate** — nothing goes live on a claim we haven't sourced.

Key capabilities:

- **Race & candidate guides** — every 2026 Wisconsin race (Governor, statewide, U.S. House, Legislature, Supreme Court) with candidate profiles, positions, and ballot status.
- **Campaign finance** — receipts, disbursements, and donors from the FEC (OpenFEC) and the Wisconsin Ethics Commission ("Sunshine"), including second-hop committee funding.
- **Political ad tracking** — sponsor, spend, and reach from the **Meta Ad Library**, **Google political ads**, and **broadcast TV** (FCC political files), with reviewer-approved **sponsor profiles** ("who is this group?") and outside-spending analysis.
- **Coverage & source transparency** (`/news`) — tracked reporting on the 2026 races from Wisconsin newsrooms, linked out to the outlet that reported it. We don't summarize or rate the journalism; we do show who owns and funds each outlet. Only dates read from an article's own publication metadata are ever displayed.
- **Personalized brief** (`/brief`) — an agent assembles a per-voter summary of their ballot.
- **Voter Help chat** (`/chat`) — a streaming assistant for ballot questions, gated by an evaluation suite.
- **Editorial pipeline** — article discovery, extraction, QA scoring, and a `/admin` review queue; every model call is traced in Arize and gated by a golden-dataset eval before deploy.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Backend / DB | [Convex](https://convex.dev) (reactive database, actions, crons, file storage) |
| Auth | [Clerk](https://clerk.com) |
| Styling | Tailwind CSS v4 (neo-brutalist design system, semantic CSS-variable tokens), `next-themes` |
| AI models | Anthropic Claude (Opus / Sonnet / Haiku) via the Vercel AI SDK |
| AI observability | Arize AX (OpenTelemetry / OpenInference tracing + LLM-as-judge evals) |
| Research / data | OpenFEC, WI Sunshine (CFIS), Firecrawl (scraping), Perplexity (web-grounded lookups) |
| Browser automation | Browserbase + `playwright-core` (FCC political-file access) |
| PDF | `mupdf` (portfolio extraction), `pdfjs-dist`, `fflate` |
| Testing | Vitest + `convex-test` |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- A [Convex](https://convex.dev) account and a [Clerk](https://clerk.com) application

### Installation

```bash
git clone <repo-url>
cd badgerbrief
pnpm install
cp .env.example .env.local
# Fill in .env.local (see Environment Variables)
```

### Development

Run the Convex dev backend and the Next.js dev server in two terminals:

```bash
npx convex dev      # backend: schema, functions, live data
pnpm dev            # frontend: http://localhost:3000
```

## Project Structure

```
badgerbrief/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── page.tsx         # home
│   │   ├── races/[slug]/    # race guide (candidates, finance, ad money, TV ads)
│   │   ├── candidates/[slug]# candidate profile
│   │   ├── compare/[slug]/  # side-by-side candidate compare
│   │   ├── ads/             # ad tracker (Meta/Google/TV spending)
│   │   ├── news/            # coverage hub + /news/about methodology
│   │   ├── brief/           # personalized voter brief
│   │   ├── chat/            # Voter Help chat (gated)
│   │   ├── vote/            # voting info
│   │   ├── methodology/     # how we source & review
│   │   └── admin/           # review queue (auth-gated)
│   ├── components/          # UI (guide/, admin/, retroui/)
│   └── lib/                 # server-side fetchers, site helpers
├── convex/                  # backend: schema, queries, actions, agents, crons
│   ├── schema.ts            # data model
│   ├── lib/                 # pure, unit-tested helpers
│   └── _generated/          # Convex codegen (do not edit)
├── docs/                    # specs, handoffs, runbooks, plans
├── scripts/                 # eval gate/monitor, brief-contract generator
└── convex.json              # Convex config (Node externalPackages)
```

## Environment Variables

**Client / build** — in `.env.local`:

| Variable | Description | Required |
|----------|-------------|----------|
| `CONVEX_DEPLOYMENT` | Convex deployment id (set by `convex dev`) | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Yes |
| `CLERK_SECRET_KEY` | Clerk secret key | Yes |

**Backend** — set in the **Convex dashboard** (`npx convex env set KEY value`), not in `.env.local`:

| Variable | Used for | Required |
|----------|----------|----------|
| `ANTHROPIC_API_KEY` | Claude (editorial agents, chat, extraction) | Yes |
| `ARIZE_SPACE_ID`, `ARIZE_API_KEY`, `ARIZE_PROJECT_NAME` | LLM tracing + evals | Optional (agents degrade gracefully if absent) |
| `OPENFEC_API_KEY` | Federal campaign finance + committee lookups | For finance/sponsors |
| `FIRECRAWL_API_KEY` | Article + campaign-site scraping | For editorial pipeline |
| `PERPLEXITY_API_KEY` | Web-grounded sponsor descriptions | For sponsor profiles |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | Hosted browser for FCC TV political files | For TV ad sync |
| `META_ADS_ACCESS_TOKEN` | Meta Ad Library sync | For Meta ads |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google political ads (BigQuery) | For Google ads |

> **Cost note:** the editorial, chat, extraction, and sync pipelines make paid API calls (Anthropic, Perplexity, Firecrawl, Browserbase). The daily crons are bounded, but a full re-sync or eval run consumes tokens/credits — mind your keys.

## Features & Data Sources

- **Broadcast TV ads (MOO-318):** FCC political files are Akamai-blocked to plain requests, so a Browserbase browser enumerates each station's folders and downloads order PDFs; `mupdf` unwraps PDF-portfolio filings; Claude extracts the order + the NAB disclosure (which candidate/issue the ad is about). TV spend is exact and every order links to its stored source PDF.
- **Coverage discovery:** a daily scout asks Perplexity for reporting on each tracked candidate, bounded by an allowlist of Wisconsin newsrooms in `convex/lib/scoutParse.ts` (`WI_OUTLETS`) — Milwaukee and Madison dailies, public media, the commercial and PBS TV stations, and the statewide nonprofits. That one list is the single source of truth for three things: Perplexity's `search_domain_filter`, the URL gate on everything we store, and the display name shown as credit. **Perplexity silently truncates the domain filter past 20 entries**, so the list is capped and asserted at import — adding a 21st outlet must be a deliberate swap, not a silent no-op. Outlets discovered this way are created as `draft` and render nothing until a human approves them in `/admin → Outlets`.
- **Sponsor profiles:** OpenFEC committee facts + a Perplexity-sourced, cited one-liner, confirmed by a human — so voters see "who is House Majority PAC?" with sources.
- **Trust posture:** ad→candidate attribution and editorial claims are always human-reviewed; low-confidence matches route to `/admin`, never auto-published.

## Testing & Evaluation

> There is **no `pnpm test` script** in this repo — it silently no-ops. Use the commands below; run a single file with `npx vitest run <path>`.

```bash
pnpm exec vitest run        # unit + convex-test suite
pnpm eval:gate              # golden-dataset eval gate (pre-deploy law)
pnpm eval:monitor           # continuous eval monitoring
npx tsc --noEmit            # typecheck
```

## Deploy

```bash
npx convex codegen          # regenerate generated API after backend changes
npx convex deploy -y        # deploy backend to production
npx vercel deploy --prod --yes   # deploy frontend
```

**Deploy both halves.** Shipping the frontend while a newly-added Convex function is missing from production returns a 500 (this has bitten `/news` once).

Public pages use ISR (`revalidate = 300`). Daily Convex crons refresh finance, ads, article sources, and TV filings.

Adding an outlet also means adding its **image** host to `remotePatterns` in `next.config.ts`, or its thumbnails 404. The image host is often not the article host — WPR serves off `npr.brightspotcdn.com`, and the Scripps/Hearst/Gray station groups use Brightspot too, while Lee's papers (madison.com, captimes.com) serve off TownNews. Audit the real `imageUrl` hosts after an ingest rather than assuming.

## Contributing

This is an internal project of Radio Milwaukee. Before committing:

1. Read `AGENTS.md` / `CLAUDE.md` and `convex/_generated/ai/guidelines.md` (Convex rules override training-data assumptions).
2. Keep the Vitest suite green; run `pnpm eval:gate` before deploying agent/chat changes.
3. Use the neo-brutalist semantic tokens (no hex, no `dark:` classes).

## License

Proprietary — © Radio Milwaukee. All rights reserved. _(Add a formal license file if this changes.)_
