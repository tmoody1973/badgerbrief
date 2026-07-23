import Image from "next/image";

/**
 * The publisher's own og:image, shown as a small thumbnail beside the headline.
 *
 * Renders NOTHING when the article has no declared image — roughly a fifth of
 * them don't, and a text-only card reads better than a grey placeholder on
 * every other row.
 *
 * `alt=""` is deliberate: we never receive the publisher's real alt text, and
 * the headline immediately beside it already carries the meaning. Inventing a
 * description would be exactly the kind of guessing this product avoids, so the
 * image is marked decorative and skipped by screen readers.
 */
export function ArticleThumb({ src }: { src?: string }) {
  if (!src) return null;
  return (
    <div className="relative hidden h-20 w-32 shrink-0 overflow-hidden border-2 border-border bg-card sm:block">
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        fill
        sizes="128px"
        className="object-cover"
        // A publisher can move or delete an image at any time; an unoptimized
        // 404 must not take the card down with it.
        unoptimized={false}
      />
    </div>
  );
}
