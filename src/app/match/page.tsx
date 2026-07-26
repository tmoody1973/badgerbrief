import type { Metadata } from "next";
import { Suspense } from "react";
import { listRaces } from "@/lib/data";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { MatchExperience } from "@/components/match/match-experience";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "What matters to you? — Wisconsin 2026 candidates by issue",
  description:
    "Pick the issues you care about and see where the candidates on your Wisconsin ballot stand — every position linked to its source. No rankings, no endorsements.",
  alternates: { canonical: "/match" },
};

export default async function MatchPage() {
  const races = await listRaces();
  // Pass only what the client needs (raceId, office, level) — keep the payload small.
  const raceMeta = races.map((r) => ({ raceId: r.raceId, office: r.office, level: r.level }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "What matters to you", path: "/match" },
          ]),
        ]}
      />
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">
        What matters to you?
      </h1>
      <p className="mt-2 max-w-2xl">
        Pick the issues you care about. We&apos;ll show where the candidates on your
        ballot stand — every position linked to its source. This is not a ranking or
        an endorsement.
      </p>
      {/* useSearchParams() in MatchExperience needs a Suspense boundary to
          statically prerender under revalidate; ponytail: smallest fix, no
          UI change, no loading fallback needed since the shell above renders
          the header immediately and the client component's own "Loading
          issues…"/"Finding positions…" states cover the rest. */}
      <Suspense>
        <MatchExperience raceMeta={raceMeta} />
      </Suspense>
    </main>
  );
}
