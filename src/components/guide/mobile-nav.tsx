"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_LINKS } from "./nav-links";

/** MOO-314: hamburger menu for narrow screens — the desktop nav row gets
 * cramped below `sm`. Closes on route change so it never sticks open. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="border-2 border-border bg-card px-3 py-1.5 font-mono text-sm font-bold shadow-[var(--shadow-brutal)]"
      >
        {open ? "✕" : "☰"} Menu
      </button>
      {open && (
        <nav className="absolute right-0 top-full z-50 mt-2 w-56 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block border-b-2 border-border px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider last:border-b-0 hover:bg-secondary"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/vote"
            className="block bg-primary px-4 py-3 font-mono text-sm font-bold uppercase tracking-wider text-primary-foreground"
          >
            Primary: Aug 11
          </Link>
        </nav>
      )}
    </div>
  );
}
