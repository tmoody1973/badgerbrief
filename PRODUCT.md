# Product

## Register

product

## Users

**Primary — Wisconsin voters.** People preparing for the 2026 Wisconsin election who are short on time and long on questions: What's on my ballot? Where do these candidates actually stand? Who's funding this race, and who's paying to reach me? They arrive overwhelmed, often mid-decision, frequently on a phone, and they need a trustworthy answer fast without wading through spin or bureaucracy.

**Secondary — Radio Milwaukee editors.** Staff working the `/admin` review queue who approve AI-drafted content, attribute political ads to races/candidates, and resolve sponsor identities before anything reaches the public. Their context is a triage workflow: high volume, needs to be scannable, every action must be reversible and sourced.

## Product Purpose

BadgerBrief is a nonpartisan Wisconsin 2026 voter guide. It turns a confusing ballot into clear, sourced answers — races and candidates, campaign finance (FEC + WI Ethics), and political ad spending across Meta, Google, and broadcast TV — including *who is really paying* through outside groups and dark money.

Content is drafted by AI research agents and **published only after a human review gate**; nothing goes live on a claim that isn't traced to a source. Success is a voter leaving with a confident, well-founded understanding of their ballot, and trusting that BadgerBrief has no thumb on the scale.

## Brand Personality

**Trustworthy · clear · neutral.** The voice is authoritative but plain — an informed local guide, not a pundit. Calm, exact, and never breathless: it states what the record shows and cites where it comes from. It carries the confidence of good civic journalism (front-page structure, strong hierarchy) without ever taking a side. When the facts are uncertain, it says so plainly rather than smoothing it over.

## Anti-references

- **Partisan media / cable-news.** No red-vs-blue theatrics, chyron energy, outrage framing, or color-coding that signals a side. Neutrality is the product, not a disclaimer.
- **Cluttered .gov / legacy civic sites.** No dense bureaucratic tables, microscopic type, or 2005 government-portal officiousness. Clarity over the appearance of authority.
- **Generic AI-SaaS template.** No cream-background hero, gradient text, identical-card grids, or a tracked-uppercase eyebrow on every section. It must read as *made*, not generated.
- **Slick political-campaign site.** No candidate-website persuasion design — glossy hero portraits, donate CTAs, momentum language. We inform; we do not campaign.

## Design Principles

1. **Sourced or it doesn't ship.** Every claim traces to its source and every attribution passes a human review gate; the interface should always make the provenance reachable (a link to the FCC order, the FEC record, the article). Trust is earned by showing your work, not asserting it.
2. **Neutral by construction.** Structure, color, and language stay above the partisan fray by design. Never encode a side into the UI (no default partisan color-coding, no loaded framing). Where sides exist, present them symmetrically.
3. **Clarity for the overwhelmed voter.** Reduce a complex ballot to plain, scannable answers a hurried person can absorb on a phone. Progressive disclosure over walls of text; the one thing they need first, first.
4. **Make hidden influence legible.** Follow and surface the money — who's paying, how much, and who's really behind the opaque committee names. Turning dark money into a plain sentence is core value, not a feature.
5. **Made, not generated.** Craft that reads as editorial with a spine — deliberate typography, real structure, honest components — never the templated slop the anti-references warn against.

## Accessibility & Inclusion

Target **WCAG 2.2 AA** as the floor for every public surface: body text ≥ 4.5:1 contrast (large text ≥ 3:1), full keyboard operability, visible focus, and semantic markup / correct landmarks for screen readers. Honor `prefers-reduced-motion` on every animation (crossfade or instant fallback). Because the audience is the whole voting public — including low-literacy, low-bandwidth, and mobile-first users — favor plain language, generous tap targets, and fast first paint. Never rely on color alone to carry meaning (especially anything party-adjacent).
