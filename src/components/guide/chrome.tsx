import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b-2 border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-display text-2xl tracking-tight">
          Badger<span className="text-primary">Brief</span>
        </Link>
        <nav className="flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider sm:gap-3 sm:text-sm">
          <Link href="/races/wi-gov-2026" className="px-2 py-1 hover:bg-secondary">
            Races
          </Link>
          <Link href="/vote" className="px-2 py-1 hover:bg-secondary">
            How to vote
          </Link>
          <Link
            href="/vote"
            className="border-2 border-border bg-primary px-2 py-1 text-primary-foreground shadow-[var(--shadow-brutal)]"
          >
            Aug 11
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-border bg-card">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 text-sm">
        <p className="font-display text-lg">
          Badger<span className="text-primary">Brief</span>
        </p>
        <p>
          BadgerBrief is a non-partisan, source-linked Wisconsin voter guide.
          We link every claim to its source, label official information apart
          from campaign claims and reporting, and never make endorsements.
        </p>
        <p className="text-muted-foreground">
          Voting logistics are always confirmed against official sources — for
          registration, absentee ballots, and polling places, the Wisconsin
          Elections Commission&apos;s{" "}
          <a
            href="https://myvote.wi.gov"
            className="underline decoration-2 underline-offset-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            MyVote Wisconsin
          </a>{" "}
          is the authoritative system.
        </p>
        <p className="border-t-2 border-dashed border-border pt-4 font-mono text-xs text-muted-foreground">
          Campaign finance data for Wisconsin state offices comes from the
          Wisconsin Ethics Commission&apos;s Sunshine database and is used for
          non-commercial voter education only, per Wis. Stat. § 11.1304(12).
          Federal campaign finance data comes from the FEC.
        </p>
      </div>
    </footer>
  );
}
