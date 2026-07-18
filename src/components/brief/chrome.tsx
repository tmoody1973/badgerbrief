"use client";

/** Shared chrome for brief components: loading skeleton + safe fallback. */

export function BriefSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="animate-pulse border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
      aria-busy="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="mt-2 h-4 w-full bg-muted first:mt-0" />
      ))}
    </div>
  );
}

/** Rendered when an entity ID resolves to nothing — never crash, never invent. */
export function NotFoundCard({ entity }: { entity: string }) {
  return (
    <div className="border-2 border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest">
        Not available
      </p>
      <p className="mt-1">
        We couldn&apos;t find published data for {entity}. It may have been
        removed or renamed.
      </p>
    </div>
  );
}
