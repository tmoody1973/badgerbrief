import Image from "next/image";

/**
 * The publisher's own og:image.
 *
 * Renders NOTHING when the article has no declared image — roughly two in five
 * don't, and a text-only row reads better than a grey placeholder block. Never
 * a fabricated stand-in.
 *
 * `alt=""` is deliberate: we never receive the publisher's real alt text, and
 * the headline beside it already carries the meaning. Inventing a description
 * would be the same guessing this product removes elsewhere.
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

export function ArticleThumb({ src, size = "river" }: { src?: string; size?: Size }) {
  if (!src) return null;
  return (
    <div className={`${BOX[size]} overflow-hidden border-2 border-border bg-card`}>
      <Image src={src} alt="" aria-hidden="true" fill sizes={SIZES[size]} className="object-cover" />
    </div>
  );
}
