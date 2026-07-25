import Link from "next/link";
import type { Doc } from "../../../convex/_generated/dataModel";
import { raceIdToSlug } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locale";
import {
  candidateCountLabel,
  incumbentPrefix,
  raceLevelLabel,
  raceRatingLabel,
} from "@/lib/i18n/race-card-dict";
import { PartyBadge, StatusBadge } from "./labels";

export function RaceCard({
  race,
  candidateCount,
  locale = "en",
}: {
  race: Doc<"races">;
  candidateCount?: number;
  locale?: Locale;
}) {
  const rating = race.raceRating?.["Cook_Political_Report"];
  return (
    <Link
      href={`/races/${raceIdToSlug(race.raceId)}`}
      className="press block border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {raceLevelLabel(race.level, locale)}
      </p>
      <h3 className="font-display mt-1 text-lg leading-tight">{race.office}</h3>
      {race.incumbent && (
        <p className="mt-1 text-sm text-muted-foreground">
          {incumbentPrefix(locale)}: {race.incumbent}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {rating && (
          <span className="border-2 border-border bg-warning px-2 py-0.5 text-xs font-bold">
            {raceRatingLabel(rating, locale)}
          </span>
        )}
        {candidateCount !== undefined && candidateCount > 0 && (
          <span className="font-mono text-xs">
            {candidateCountLabel(candidateCount, locale)}
          </span>
        )}
      </div>
    </Link>
  );
}

export function CandidateCard({
  candidate,
  variant = "full",
}: {
  candidate: Doc<"candidates">;
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    return (
      <Link
        href={`/candidates/${candidate.slug}`}
        className="press block min-w-0 border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
      >
        <h3 className="font-display text-sm leading-tight">{candidate.name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <PartyBadge party={candidate.party} />
          <StatusBadge status={candidate.status} />
        </div>
        {candidate.currentOccupation &&
          candidate.currentOccupation !== "Unknown" && (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {candidate.currentOccupation}
            </p>
          )}
      </Link>
    );
  }
  return (
    <Link
      href={`/candidates/${candidate.slug}`}
      className="press block border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base leading-tight">
          {candidate.name}
        </h3>
        {candidate.incumbent && (
          <span className="border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
            Incumbent
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <PartyBadge party={candidate.party} />
        <StatusBadge status={candidate.status} />
      </div>
      {candidate.currentOccupation &&
        candidate.currentOccupation !== "Unknown" && (
          <p className="mt-2 text-sm text-muted-foreground">
            {candidate.currentOccupation}
          </p>
        )}
    </Link>
  );
}
