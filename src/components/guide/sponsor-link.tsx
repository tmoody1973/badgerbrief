import Link from "next/link";
import { normalizeSponsorKey } from "../../../convex/lib/sponsors";
import { sponsorKeyToSlug } from "@/lib/site";

/**
 * A sponsor name that links to its /sponsors/[slug] profile ONLY when that
 * profile exists (its key is in `enrichedKeys`); otherwise it renders as plain
 * text. This keeps us from linking the ~190 un-profiled sponsors to 404s.
 */
export function SponsorLink({
  name,
  enrichedKeys,
  className = "",
}: {
  name: string;
  enrichedKeys: string[];
  className?: string;
}) {
  const key = normalizeSponsorKey(name);
  if (!enrichedKeys.includes(key)) {
    return <span className={className}>{name}</span>;
  }
  return (
    <Link
      href={`/sponsors/${sponsorKeyToSlug(key)}`}
      className={`${className} underline decoration-2 underline-offset-2 hover:text-accent`.trim()}
    >
      {name}
    </Link>
  );
}
