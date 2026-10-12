import Link from "next/link";
import { CURRENT_ELECTION, PRIMARY_ARCHIVE } from "@/lib/election";

/**
 * Says plainly that a page covers the finished primary. Text, a border and a
 * heading-weight label carry the meaning; the background is not the signal.
 */
export function ArchiveBanner({
  currentHref = "/",
  currentLabel = `See the ${CURRENT_ELECTION.longDate} general election guide`,
}: {
  currentHref?: string;
  currentLabel?: string;
}) {
  return (
    <aside role="note" className="mb-6 border-2 border-border bg-warning p-3 text-sm">
      <p>
        <strong>Archived.</strong> This page covers the {PRIMARY_ARCHIVE.label}, which is over. It is kept as a
        record and is no longer updated.{" "}
        <Link href={currentHref} className="font-bold underline decoration-2 underline-offset-2">
          {currentLabel} →
        </Link>
      </p>
    </aside>
  );
}
