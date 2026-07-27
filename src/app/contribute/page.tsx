import type { Metadata } from "next";
import { Suspense } from "react";
import { ContributeForm } from "@/components/contribute/contribute-form";
import { ShareButton } from "@/components/contribute/share-button";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Help improve the guide",
  description:
    "Suggest a candidate we're missing, point us to a source, flag a gap in the data, or volunteer. Nonpartisan, human-reviewed — nothing is auto-published.",
  alternates: { canonical: "/contribute" },
};

export default function ContributePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Help improve the guide</h1>
      <p className="mt-3 max-w-[60ch] text-lg">
        BadgerBrief is assembled from public records, and it&rsquo;s incomplete
        by nature — new candidates file, sources move, and some races have
        thinner data than others. If you know something we don&rsquo;t, this is
        the way to tell us.
      </p>
      <p className="mt-3 max-w-[60ch]">
        This stays nonpartisan. Every submission is read by a person before
        anything changes on the site — nothing here is auto-published.
      </p>

      <div className="mt-6">
        <Suspense fallback={null}>
          <ContributeForm />
        </Suspense>
      </div>

      <div className="mt-8 border-2 border-border bg-card p-4">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
          Spread the word
        </p>
        <p className="mt-2 max-w-[60ch] text-sm">
          Know someone who&rsquo;s still deciding? Share the guide.
        </p>
        <div className="mt-3">
          <ShareButton
            url={SITE_URL}
            title="BadgerBrief — Wisconsin 2026 voter guide"
          />
        </div>
      </div>

      <div className="mt-8 border-2 border-border bg-secondary p-4 text-sm">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
          Support the project
        </p>
        <p className="mt-2 max-w-[60ch]">
          BadgerBrief is independent and free to use. If it&rsquo;s useful to
          you, you can chip in via{" "}
          <a
            href="https://ko-fi.com/tarikmoody"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2"
          >
            Ko-fi
          </a>{" "}
          or{" "}
          <a
            href="https://github.com/sponsors/tmoody1973"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2"
          >
            GitHub Sponsors
          </a>
          .
        </p>
      </div>
    </main>
  );
}
