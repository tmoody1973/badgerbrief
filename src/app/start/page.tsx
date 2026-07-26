import type { Metadata } from "next";
import Link from "next/link";
import { GUIDE_STEPS } from "@/lib/guide-step";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Start here — new to the guide",
  description:
    "New to voting or to BadgerBrief? A simple 3-step path: pick what matters to you, read the candidates on your ballot, and make your plan to vote.",
  alternates: { canonical: "/start" },
};

export default function StartPage() {
  const steps = GUIDE_STEPS.filter((s) => s.step !== "done");
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)] sm:p-10">
        <h1 className="font-display text-4xl leading-none sm:text-5xl">New here? Start here.</h1>
        <p className="mt-4 max-w-2xl text-lg">
          BadgerBrief is a nonpartisan guide to the 2026 Wisconsin elections. We don&apos;t
          tell you who to vote for — we show you where the candidates on your ballot stand,
          from sourced statements. Here&apos;s a simple path.
        </p>
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li
              key={String(s.step)}
              className="border-2 border-border bg-secondary p-3 text-sm font-medium"
            >
              <span className="font-mono text-xs font-bold uppercase tracking-widest">
                Step {i + 1}
              </span>
              <span className="ml-2">{s.label}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/match?guide=1"
          className="mt-6 inline-block border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
        >
          Start step 1 →
        </Link>
      </section>
    </main>
  );
}
