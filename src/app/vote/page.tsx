import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LastUpdated } from "@/components/guide/labels";
import { SourceList } from "@/components/guide/sources";
import { getVotingInfo } from "@/lib/data";
import {
  JsonLd,
  breadcrumbNode,
  faqNode,
  organizationNode,
} from "@/lib/jsonld";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "How to vote in the Wisconsin 2026 primary",
  description:
    "Registration deadlines, absentee ballot rules, early voting dates, photo ID requirements, and polling hours for the August 11, 2026 Wisconsin primary — every rule linked to its official source.",
  alternates: { canonical: "/vote" },
};

type DeadlineMap = Record<string, string> | undefined;

function deadlineRows(map: DeadlineMap): [string, string][] {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map).map(([k, v]) => [
    k.replaceAll("_", " "),
    String(v),
  ]);
}

export default async function VotePage() {
  const info = await getVotingInfo();
  if (!info) notFound();

  const registration = deadlineRows(info.voterRegistration as DeadlineMap);
  const absenteeRequest = deadlineRows(
    info.absenteeRequestDeadline as DeadlineMap,
  );
  const absenteeReturn = deadlineRows(
    info.absenteeReturnDeadline as DeadlineMap,
  );
  const early = info.earlyVoting as
    | { available?: boolean; start_date?: string; end_date?: string }
    | undefined;

  const faqs = [
    {
      q: "When is the 2026 Wisconsin primary election?",
      a: `The Wisconsin partisan primary is ${info.primaryDate}. Polls are open ${info.pollsOpen} to ${info.pollsClose} ${info.timezone ?? ""}.`.trim(),
    },
    {
      q: "How do I register to vote in Wisconsin?",
      a: registration
        .map(([mode, deadline]) => `${mode}: ${deadline}`)
        .join("; ") +
        ". Wisconsin allows same-day registration at the polls with proof of residence. Register at myvote.wi.gov.",
    },
    {
      q: "How do I request an absentee ballot in Wisconsin?",
      a:
        absenteeRequest
          .map(([mode, deadline]) => `${mode}: ${deadline}`)
          .join("; ") + ". Request through myvote.wi.gov.",
    },
    {
      q: "When must my Wisconsin absentee ballot be returned?",
      a: absenteeReturn
        .map(([mode, deadline]) => `${mode}: ${deadline}`)
        .join("; "),
    },
    ...(early?.available
      ? [
          {
            q: "Does Wisconsin have early voting in 2026?",
            a: `Yes. In-person absentee (early) voting runs ${early.start_date} through ${early.end_date}. Locations and hours vary by municipality — check myvote.wi.gov.`,
          },
        ]
      : []),
    {
      q: "Do I need a photo ID to vote in Wisconsin?",
      a: info.photoIdRequired
        ? "Yes. Wisconsin requires an acceptable photo ID to vote (driver's license, state ID, passport, military ID, and certain student IDs)."
        : "Check current requirements at myvote.wi.gov.",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "How to vote", path: "/vote" },
          ]),
          faqNode(faqs),
        ]}
      />

      <h1 className="font-display text-3xl leading-tight sm:text-4xl">
        How do I vote in the Wisconsin 2026 primary?
      </h1>
      <p className="mt-3 text-lg">
        The primary is <strong>{info.primaryDate}</strong>, polls open{" "}
        {info.pollsOpen}–{info.pollsClose}. Everything below links to official
        sources; for your polling place and personal registration status, use{" "}
        <a
          href={info.officialVoterInfoUrl}
          className="font-bold underline decoration-2 underline-offset-2"
          rel="noopener noreferrer"
          target="_blank"
        >
          MyVote Wisconsin
        </a>{" "}
        — the state&apos;s official system.
      </p>

      <div className="mt-8 space-y-6">
        {faqs.map((f) => (
          <section
            key={f.q}
            className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
          >
            <h2 className="font-display text-xl">{f.q}</h2>
            <p className="mt-2">{f.a}</p>
          </section>
        ))}
      </div>

      <section className="mt-8 border-2 border-border bg-warning p-4 shadow-[var(--shadow-brutal)]">
        <h2 className="font-display text-lg">Deadline checklist</h2>
        <ul className="mt-2 space-y-1 font-mono text-sm">
          {registration.map(([mode, d]) => (
            <li key={`r-${mode}`}>☐ Register ({mode}): {d}</li>
          ))}
          {absenteeRequest.map(([mode, d]) => (
            <li key={`a-${mode}`}>☐ Request absentee ({mode}): {d}</li>
          ))}
          {absenteeReturn.map(([mode, d]) => (
            <li key={`b-${mode}`}>☐ Return absentee ({mode}): {d}</li>
          ))}
          <li>☐ Vote: {info.primaryDate}, {info.pollsOpen}–{info.pollsClose}</li>
        </ul>
      </section>

      <div className="mt-10 space-y-3">
        <SourceList sources={info.sources} title="Official sources" />
        <LastUpdated
          date={new Date(info.lastCheckedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        />
      </div>
    </main>
  );
}
