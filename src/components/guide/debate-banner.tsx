import Link from "next/link";
import { getDebate } from "@/lib/debates";

/**
 * Home-page promotion for the debate page.
 *
 * It is an INVERTED INK SLAB rather than a cardinal one on purpose. The hero
 * below it already spends the cardinal budget on two buttons, and the design
 * system's One Voice rule is that a second red thing cancels the first. Solid
 * charcoal is the loudest move left in the system, and it works here precisely
 * because nothing else on this page is a filled block — the contrast is
 * structural, not chromatic, so it also survives dark mode (where the tokens
 * flip it to a light slab on a dark ground) and prints legibly.
 *
 * Counts come from the payload, never from prose. If a clip is added or cut,
 * the banner cannot end up advertising a number that isn't there.
 */
export function DebateBanner({ slug }: { slug: string }) {
  const debate = getDebate(slug);
  if (!debate) return null;

  const dateLabel = new Date(`${debate.date}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <Link
      href={`/debate/${debate.slug}`}
      className="press mb-6 block border-2 border-border bg-foreground p-5 text-background shadow-[var(--shadow-brutal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:p-6"
    >
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">
        {dateLabel} · {debate.broadcaster} · {debate.venue}
      </p>

      {/* overflow-wrap: Archivo Black offers no soft break points, and this
          headline must not push the card past a 320px viewport. */}
      <h2
        className="font-display mt-2 text-2xl leading-tight sm:text-3xl"
        style={{ overflowWrap: "anywhere" }}
      >
        The governor&apos;s debate, sorted by issue
      </h2>

      <p className="mt-2 max-w-[60ch] text-[0.975rem] leading-relaxed opacity-90">
        All five Democrats on vouchers, AI data centers, property taxes and
        policing — every position quoted, timestamped, and playable in their own
        voice before the August 11 primary.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Butter on charcoal: high contrast, and not the cardinal already in use below. */}
        <span className="border-2 border-border bg-secondary px-4 py-2 font-bold text-secondary-foreground">
          Hear what they said →
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">
          {debate.topics.length} issues · {debate.candidates.length} candidates ·{" "}
          {debate.quotes.length} audio clips
        </span>
      </div>
    </Link>
  );
}
