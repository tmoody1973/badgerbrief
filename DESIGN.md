---
name: BadgerBrief
description: A nonpartisan Wisconsin voter guide styled as a legible public record — neo-brutalist, sourced, and neutral.
colors:
  cream-bg: "#fff7ed"
  charcoal-ink: "#1c1b1a"
  paper: "#ffffff"
  cardinal: "#c5050c"
  cardinal-deep: "#8f0b13"
  butter: "#f6e7b2"
  lake: "#1f5d8b"
  stone: "#d8cec1"
  stone-ink: "#4a4742"
  pine: "#2f5d3a"
  alert: "#f4bd15"
typography:
  display:
    fontFamily: "Archivo Black, Impact, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 3rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "normal"
  headline:
    fontFamily: "Archivo Black, Impact, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.33
  body:
    fontFamily: "Public Sans, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.1em"
rounded:
  none: "0px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.cardinal}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.butter}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.none}"
    padding: "16px"
---

# Design System: BadgerBrief

## 1. Overview

**Creative North Star: "The Public Record"**

BadgerBrief looks like a clerk's ledger made legible — the official record of a Wisconsin election, stamped, bordered, and sourced, but readable by a hurried voter on a phone. Every surface is built from the same neo-brutalist vocabulary: sharp 2px charcoal borders, hard offset shadows with no blur, monospace labels that read like index stamps, and a single Wisconsin cardinal red used sparingly for emphasis. Nothing is decorative; the structure *is* the design, and the structure signals "this is on the record."

The system is deliberately bold in form and rigorously neutral in content. Archivo Black gives headlines front-page weight, but the palette never encodes a political side and the copy never editorializes. Depth is physical, not soft: elements sit on the page as pressable paper blocks (hard shadow) that collapse into the surface when you press them — tactile and confident, a little defiant, never glossy. Warmth comes from the cream ground and butter accents, not from rounding or gradients (there are none).

What it explicitly rejects: partisan-media theatrics and red/blue color-coding; cluttered legacy-`.gov` density and officiousness; generic AI-SaaS slop (cream-hero + gradient text + identical card grids + a tracked eyebrow on every section); and slick political-campaign persuasion design. If it looks generated, glossy, or like it's taking a side, it's wrong.

**Key Characteristics:**
- Neo-brutalist: 2px hard borders, `4px 4px 0` offset shadows, zero border-radius.
- One accent (cardinal red) used rarely; neutrality by construction.
- Monospace uppercase labels as "stamps"; every claim links to its source.
- Tactile interaction: hard shadow collapses on press.
- Fully theme-aware (light + warm-dark) via semantic CSS-variable tokens — no hex in components, no `dark:` classes.

## 2. Colors

A Wisconsin civic palette: a warm cream ground, charcoal ink, and Badger cardinal red, with a lake blue as the secondary voice. Neutrals do the heavy lifting; color is rationed.

### Primary
- **Badger Cardinal** (`#c5050c`): the single brand accent — primary buttons, focus ring, key emphasis. Used on ≤10% of any screen; its rarity is the point. Brightens to `#e24a50` in dark mode for legibility.
- **Cardinal Deep** (`#8f0b13`): destructive / high-severity only (delete, critical alert). Never decorative.

### Secondary
- **Wisconsin Lake** (`#1f5d8b`): the calm counter-accent — secondary links, informational highlights, data emphasis where cardinal would be too loud.
- **Butter** (`#f6e7b2`): warm fill for secondary buttons and soft callouts; carries "warmth" so the background doesn't have to shout it.

### Tertiary
- **Pine** (`#2f5d3a`): success / confirmed states. **Alert Yellow** (`#f4bd15`): warnings and "dark money" / caution flags (always with charcoal text on top).

### Neutral
- **Cream** (`#fff7ed`): the body ground — a true warm cream, deliberate, not a tinted near-white default.
- **Charcoal Ink** (`#1c1b1a`): all body text, borders, and shadow color. The workhorse.
- **Paper** (`#ffffff`): card / elevated surfaces, sitting on the cream.
- **Stone** (`#d8cec1`) / **Stone Ink** (`#4a4742`): dividers and muted metadata; muted-foreground is legible, never a washed-out light gray.

### Named Rules
**The Neutrality Rule.** Color never encodes a political party. No default red-for-R / blue-for-D. Cardinal is *brand*, lake is *information* — both are used symmetrically regardless of who's on screen. Where sides must be shown (support vs. attack), pair a semantic token with a text label so meaning never rides on hue alone.

**The One Voice Rule.** Cardinal red appears on ≤10% of any given screen. If two things are red, neither is emphasized.

## 3. Typography

**Display Font:** Archivo Black (with Impact fallback)
**Body Font:** Public Sans (with Arial / system fallback)
**Label / Mono Font:** Geist Mono

**Character:** A hard contrast pairing — Archivo Black is a single-weight, ultra-heavy grotesque that gives headlines masthead authority; Public Sans is a neutral, highly legible civic workhorse (it descends from the USWDS type family); Geist Mono supplies the "index stamp" labels. The three don't compete because they sit on different axes (heavy display / neutral sans / mono).

### Hierarchy
_(Values verified against the rendered site.)_
- **Display** (Archivo Black, renders ~36px / `clamp(2.25rem, 6vw, 3rem)`, line-height ~1.05, tracking **normal**): page titles and race/section mastheads. The black weight carries the emphasis — do **not** apply negative tracking to this face; the letters would touch. Kept under a ~3rem ceiling — bold, not shouting.
- **Headline** (Archivo Black, ~24px / 1.5rem): section headers within a page.
- **Title** (Public Sans bold, ~1.125rem): card and candidate names.
- **Body** (Public Sans, 16px, line-height 1.5): all prose; cap measure at 65–75ch.
- **Label** (Geist Mono, 12px, weight 700, tracking 0.1em ≈ 1.2px, UPPERCASE): metadata stamps — station · market · flight, source lines, counts, filter pills.

### Named Rules
**The Stamp Rule.** Structured metadata (dates, amounts, stations, statuses, source attributions) is set in uppercase Geist Mono at small size — it reads as a record stamp, distinct from prose, and signals "this is data, transcribed." Prose is always Public Sans; the two never blur.

## 4. Elevation

The system is flat-with-a-block: surfaces have no soft ambient shadow, only a single hard, un-blurred offset — `4px 4px 0` in charcoal — that reads as a physical paper block on the page. There is no blur, no layered elevation scale, and no glassmorphism. Depth is a *material* fact (the block casts a hard edge), not an atmospheric one.

### Shadow Vocabulary
- **Brutal block** (`box-shadow: var(--shadow-brutal)` = `4px 4px 0px #1c1b1a`): the only shadow. Cards, buttons, and key panels sit on it. In dark mode the offset flips to a *light* block (`4px 4px 0 #e7dfce`) because a black shadow vanishes on a dark ground — the brutalist edge is preserved by inverting border + shadow, not by removing them.

### Named Rules
**The Press Rule.** Interactive blocks are tactile: on hover/press (`.press`, and buttons' `active:`) the element translates `+2px, +2px` and its shadow collapses to none — it visibly *presses into* the page. This 120ms transform is the system's signature interaction and its primary motion. Honor `prefers-reduced-motion` (the transform is small and non-essential; drop it to instant).

## 5. Components

### Buttons
- **Shape:** rectangular, zero radius, `2px solid` charcoal border, `shadow-brutal`.
- **Primary:** cardinal fill, white text (`bg-primary text-primary-foreground`), `px-4 py-2`, `font-bold`. **Secondary:** butter fill. **Outline:** paper fill.
- **States:** `active:` presses in (`translate 2px,2px`, shadow none); `disabled:` `opacity-50`. Focus uses the cardinal ring.

### Cards / Panels
- Paper background, `2px` charcoal border, `shadow-brutal`, zero radius, `p-4`. **Never nest a card in a card** — use a dashed `border-t-2 border-dashed border-border` divider to sub-section instead. Expandable detail uses native `<details>`/`<summary>` (works without JS, prints correctly).

### Labels / Pills / Filters
- Uppercase Geist Mono, small, `text-muted-foreground`. Filter pills are bordered mini-blocks that fill `bg-primary text-primary-foreground` when active (a `-ml-0.5` overlap makes them read as one segmented control). Count/stamp chips are `border-2` with a `bg-background` fill.

### Inputs / Forms
- Text, search, and `<select>` inputs are flat blocks: `2px` charcoal border, zero radius, `bg-card`, `px-2 py-1.5`, mono or sans depending on content (mono for IDs/search, sans for prose). No inner shadow, no rounding. Placeholder text must clear 4.5:1 — never the default light gray. Focus shows the cardinal ring instantly (never animate the ring).

### Section navigation
- Long pages (race, brief) use a **sticky `SectionNav`**: a horizontal row of bordered mono chips that jump to page sections, pinned via `sticky top-0 z-10` with an opaque `bg-card` so content scrolls under it cleanly. Active/available sections only; chips read as the same segmented-control language as filters. Anchor targets set `scroll-mt-16` so the sticky bar never covers the heading.

### Links to source
- Every record links out to its source (FCC order, FEC record, article) as a small bordered mono "↗" chip (`FCC order ↗`) or an underlined mono link (`decoration-2 underline-offset-2`). Provenance is always one click away.

### Named Rules
**The Sidecar Note.** Component color/typography/radius live in the frontmatter above; the *shadow* (`shadow-brutal`), the `2px` border, the `.press` interaction, and the cardinal focus ring are the neo-brutalist signature and are applied via the semantic tokens in `globals.css` — components reference tokens (`bg-card`, `border-border`, `shadow-[var(--shadow-brutal)]`), never raw hex.

## 6. Do's and Don'ts

**Do**
- Use the semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`, `shadow-[var(--shadow-brutal)]`) so light/dark both work automatically.
- Ration cardinal red; let charcoal + cream carry the page.
- Stamp metadata in uppercase Geist Mono; keep prose in Public Sans.
- Link every claim to its source; make provenance reachable.
- Present opposing sides symmetrically; pair any stance color with a text label.

**Don't**
- Don't add `border-radius` to cards/panels/buttons (sharp corners are the identity).
- Don't use `dark:` utility classes or hardcode hex in components — override happens in `globals.css` only.
- Don't pair a `1px border` with a soft blurred drop shadow (the ghost-card tell) — the only shadow is the hard `4px 4px 0` block.
- Don't encode party into color, add gradients/gradient-text, glassmorphism, or a tracked-uppercase eyebrow on every section.
- Don't nest cards, and don't let a bold headline overflow its grid on mobile — test the copy at every breakpoint.
