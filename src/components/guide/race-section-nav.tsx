export type RaceNavSection = { id: string; label: string; count?: number };

/**
 * Sticky in-page jump nav for the race page. Plain anchor chips, no
 * scroll-spy in v1. Target sections must carry scroll-mt-16 so anchored
 * headings land below this bar (it is ~48px tall; 64px margin is safe).
 */
export function RaceSectionNav({ sections }: { sections: RaceNavSection[] }) {
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Sections on this page"
      className="sticky top-0 z-40 -mx-4 mb-2 overflow-x-auto border-b-2 border-border bg-background px-4 py-2"
    >
      <ul className="flex w-max gap-2">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="press inline-block whitespace-nowrap border-2 border-border bg-card px-3 py-1 text-sm font-bold shadow-[var(--shadow-brutal)]"
            >
              {s.label}
              {s.count !== undefined ? ` (${s.count})` : ""}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
