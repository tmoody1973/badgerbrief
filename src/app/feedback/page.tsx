import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackForm } from "@/components/guide/feedback-form";

export const metadata: Metadata = {
  title: "Report an error or ask a question",
  description:
    "Found something wrong on BadgerBrief? Every claim links to its source — tell us which one doesn't match and we'll check it against the record.",
  alternates: { canonical: "/feedback" },
};

export default function FeedbackPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Report an error or ask a question</h1>
      <p className="mt-3 max-w-[60ch] text-lg">
        Most of what&rsquo;s on this site is assembled automatically from
        official records — roll calls, ballot filings, campaign finance reports.
        That process is checked against each document&rsquo;s own published
        totals, but no automated check catches everything.
      </p>
      <p className="mt-3 max-w-[60ch]">
        If something here doesn&rsquo;t match the record — a vote attributed to
        the wrong person, a name that isn&rsquo;t what&rsquo;s on the ballot, a
        figure that&rsquo;s off — telling us is the fastest way it gets fixed.{" "}
        <Link href="/methodology" className="underline decoration-2 underline-offset-2">
          How we source and verify
        </Link>
        .
      </p>

      <div className="mt-6">
        <FeedbackForm />
      </div>
    </main>
  );
}
