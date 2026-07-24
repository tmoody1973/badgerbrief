import Image from "next/image";

/**
 * The publisher's own og:image, or a typographic stand-in when there is none.
 *
 * `alt=""` is deliberate: we never receive the publisher's real alt text, and
 * the headline beside it already carries the meaning. Inventing a description
 * would be the same guessing this product removes elsewhere.
 *
 * ON THE PLACEHOLDER. Roughly two in five tracked articles declare no image,
 * and the feed previously rendered nothing for them — deliberately, to avoid a
 * fabricated stand-in. The rule that mattered was never "no placeholder", it
 * was never invent imagery that appears to DEPICT the story: no stock photo, no
 * generated scene, nothing a reader could mistake for reporting. A flat block
 * carrying the outlet's initials cannot be mistaken for a photograph, and it
 * buys back the scanning rhythm a half-empty river loses.
 *
 * The colour is derived from the outlet name, so one outlet always looks the
 * same and the feed gains a real signal instead of decoration. It is drawn in
 * CSS from the existing tokens — no image request, no generated asset, and it
 * follows light/dark automatically.
 *
 * Three sizes for the front-page hierarchy — the lead runs full-width, the
 * river runs a small square. All of them show on mobile: a phone is exactly
 * where a thumbnail earns its keep for scanning.
 */
type Size = "lead" | "secondary" | "river";

const BOX: Record<Size, string> = {
  lead: "relative aspect-[16/9] w-full",
  secondary: "relative aspect-[16/9] w-full",
  river: "relative h-14 w-14 shrink-0 sm:h-16 sm:w-16",
};

const SIZES: Record<Size, string> = {
  lead: "(max-width: 768px) 100vw, 720px",
  secondary: "(max-width: 640px) 100vw, 360px",
  river: "64px",
};

/** Token pairs only — the placeholder must re-theme with everything else. */
const SWATCHES = [
  "bg-secondary text-secondary-foreground",
  "bg-accent text-accent-foreground",
  "bg-primary text-primary-foreground",
  "bg-muted text-muted-foreground",
] as const;

/** Stable small hash, so an outlet keeps its colour across renders and pages. */
function swatchFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SWATCHES[h % SWATCHES.length];
}

/**
 * Up to three initials: "Milwaukee Journal Sentinel" -> MJS, "WPR" -> WPR.
 * Words like "the" and "of" are dropped so the mark reads as the masthead does.
 */
function initialsFor(outlet: string): string {
  const words = outlet
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(the|of|and|for|news|com)$/i.test(w));
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
}

const TEXT: Record<Size, string> = {
  lead: "text-3xl",
  secondary: "text-2xl",
  river: "text-[11px] sm:text-xs",
};

export function ArticleThumb({
  src,
  size = "river",
  outlet,
}: {
  src?: string;
  size?: Size;
  outlet?: string;
}) {
  if (src) {
    return (
      <div className={`${BOX[size]} overflow-hidden border-2 border-border bg-card`}>
        <Image src={src} alt="" aria-hidden="true" fill sizes={SIZES[size]} className="object-cover" />
      </div>
    );
  }
  // Without an outlet there is nothing meaningful to draw, so keep the original
  // behaviour and render nothing rather than an empty coloured square.
  if (!outlet) return null;
  return (
    <div
      aria-hidden="true"
      className={`${BOX[size]} ${swatchFor(outlet)} flex items-center justify-center overflow-hidden border-2 border-border`}
    >
      <span className={`font-mono font-bold uppercase tracking-[0.1em] ${TEXT[size]}`}>
        {initialsFor(outlet)}
      </span>
    </div>
  );
}
