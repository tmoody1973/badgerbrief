import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "About BadgerBrief",
  description:
    "BadgerBrief is an independent, non-partisan Wisconsin voter guide. No funding, no ads, no party or campaign affiliation — every claim links to its official source.",
  alternates: { canonical: "/about" },
};

/**
 * Who is behind this, and why it can be trusted.
 *
 * Ordered deliberately: independence and method first, the personal story
 * after. For a voter guide the persuasive claim is not "I care about this" but
 * "here is how each fact is checked, and here is who is accountable when it is
 * wrong" — accountability outranks affection. The human paragraph earns its
 * place by explaining the motive, not by carrying the credibility.
 *
 * The independence lines are the most valuable sentences on the site: no
 * funder, no advertiser and no party is a stronger non-partisan position than
 * most established outlets can state, and it is worth saying plainly.
 */
const meta = "font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-border bg-card p-3">
      <p className={meta}>{label}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
        ]}
      />

      <h1 className="font-display text-3xl">About BadgerBrief</h1>

      <p className="mt-4 max-w-[60ch] text-lg">
        BadgerBrief is an independent, non-partisan guide to Wisconsin&rsquo;s
        2026 elections. It exists to answer one question as plainly as possible:
        who is on your ballot, and what have they actually done?
      </p>

      <p className="mt-4">
        <Link
          href="/feedback"
          className="text-sm underline decoration-2 underline-offset-2"
        >
          See a mistake? Report an error →
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl">Independent, and unfunded</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label="Funding">
            Self-funded &mdash; no advertising, sponsorships, donations, grants,
            or party/PAC money.
          </Fact>
          <Fact label="Affiliation">
            No party, campaign, PAC or advocacy group. Nobody has editorial
            input.
          </Fact>
          <Fact label="Endorsements">
            None, ever. Candidates are never rated, ranked or recommended.
          </Fact>
        </div>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">
          Nothing on this site is paid for, and there is nobody to please. That
          is the whole reason it can be read the way it is written.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">How the facts get here</h2>
        <p className="mt-2 max-w-[60ch]">
          Almost nothing here is typed in by hand. Ballots come from the
          Wisconsin Elections Commission&rsquo;s official candidate list — the
          names are printed exactly as a voter sees them in the booth. Voting
          records are parsed directly from the Legislature&rsquo;s own roll-call
          documents and the U.S. House Clerk&rsquo;s records, and every one is
          reconciled against the totals the document itself publishes before it
          is stored. Campaign finance comes from the Wisconsin Ethics
          Commission and the FEC.
        </p>
        <p className="mt-3 max-w-[60ch]">
          When a document cannot be reconciled, it is discarded rather than
          published — an incomplete record is worse than a missing one.{" "}
          <Link href="/methodology" className="underline decoration-2 underline-offset-2">
            The full methodology
          </Link>{" "}
          explains each source, how positions and quotes are reviewed before
          publication, and what the checks cannot catch.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">Who makes it</h2>
        <p className="mt-2 max-w-[60ch]">
          BadgerBrief is built and maintained by{" "}
          <strong>Tarik Moody</strong> in Milwaukee, independently and in his
          own time.
          {/* photo: add later — shipping text-only now */}
        </p>
        <p className="mt-3 max-w-[60ch]">
          <strong>In the interest of full disclosure:</strong> Tarik is Director
          of Strategy and Innovation at Radio Milwaukee, and an appointed
          commissioner of the Milwaukee City Plan Commission. Both are stated
          here on purpose. The Plan Commission is a city land-use body — it has
          no role in the state legislative, congressional, or statewide races
          this guide covers — and he has no involvement in any race on
          BadgerBrief. Every candidate is treated identically, by the same
          sourced method, with no endorsements. Neither role funds or directs
          this site.
        </p>
        <p className="mt-3 max-w-[60ch]">
          This is not a news organisation and does not claim to be one. It is
          one person&rsquo;s attempt to make public records legible, held to a
          simple rule: if a claim is on this site, its source is one click away,
          and if it turns out to be wrong, it gets corrected in public.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">If something is wrong</h2>
        <p className="mt-2 max-w-[60ch]">
          Assembling records automatically means mistakes are possible, and the
          checks are arithmetic — they can confirm that a roll call adds up, not
          that it says what the Legislature meant. Readers are the last check,
          and reports are read by a person.
        </p>
        <p className="mt-4">
          <Link
            href="/feedback"
            className="press inline-block border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]"
          >
            Report an error →
          </Link>
        </p>
      </section>
    </main>
  );
}
