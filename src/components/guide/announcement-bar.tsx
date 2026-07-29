"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Site-wide announcement strip, above the masthead on every page.
 *
 * Butter rather than cardinal on purpose. The nav directly beneath carries a
 * cardinal "AUG 11" chip and the home hero spends the rest of the One Voice
 * budget on two red buttons; a third red band stacked on those would make all
 * three read as background. Butter is the system's designated warm callout
 * fill, it is the only large warm surface above the fold, and it sits against
 * cream with enough contrast to be the first thing the eye lands on.
 *
 * Dismissible, and it stays dismissed. A bar that cannot be closed is an
 * advert; one that returns on every navigation is worse. The choice is stored
 * per announcement id, so the next announcement still gets its shot.
 *
 * localStorage is read through useSyncExternalStore rather than an effect:
 * it is an external store, the server has no snapshot of it, and setting state
 * from inside an effect to mirror it causes the cascading re-render React now
 * warns about.
 */
const STORAGE_KEY = "bb-announcement-dismissed";

/** localStorage fires no event in the tab that wrote it, so dismissal notifies. */
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled — treat as never dismissed rather than
    // silently suppressing the announcement.
    return null;
  }
}
/** The server cannot know; render the bar so it is in the HTML for everyone. */
const readServer = () => null;

export function AnnouncementBar({
  id,
  href,
  children,
}: {
  /** Bump this when the message changes so a past dismissal doesn't hide it. */
  id: string;
  href: string;
  children: React.ReactNode;
}) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, readServer);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Nothing to persist to; the emit below still hides it for this session.
    }
    emit();
  }, [id]);

  if (dismissed === id) return null;

  return (
    <div className="border-b-2 border-border bg-secondary text-secondary-foreground">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2">
        <Link
          href={href}
          className="min-w-0 flex-1 text-sm font-bold underline decoration-2 underline-offset-2"
        >
          {children}
        </Link>
        <button
          type="button"
          aria-label="Dismiss this announcement"
          onClick={dismiss}
          className="shrink-0 border-2 border-border px-2 py-0.5 font-mono text-[11px] font-bold leading-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
