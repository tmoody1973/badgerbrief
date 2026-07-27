import Link from "next/link";
import { LastUpdated } from "@/components/guide/labels";
import { SourceList } from "@/components/guide/sources";
import type { VoteDict, VotingInfo, VoterAccessRow } from "@/lib/i18n/vote-dict";
import {
  JsonLd,
  breadcrumbNode,
  faqNode,
  organizationNode,
} from "@/lib/jsonld";
import { voterAccessToFaqs } from "@/lib/voter-access-faqs";

type DeadlineMap = Record<string, string> | undefined;

function deadlineRows(map: DeadlineMap): [string, string][] {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map).map(([k, v]) => [k, String(v)]);
}

export function VoteGuide({
  dict,
  info,
  access,
}: {
  dict: VoteDict;
  info: VotingInfo;
  access: VoterAccessRow[];
}) {
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

  const faqs = dict.faqs(info, {
    registration,
    absenteeRequest,
    absenteeReturn,
    early,
  });

  return (
    <main lang={dict.lang} className="mx-auto w-full max-w-3xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: dict.crumbs.home, path: "/" },
            {
              name: dict.crumbs.vote,
              path: dict.lang === "es" ? "/es/vote" : "/vote",
            },
          ]),
          faqNode([
            ...faqs,
            ...voterAccessToFaqs(
              access.map((r) => {
                const t = dict.accessText(r);
                return { title: t.title, summary: t.summary };
              }),
            ),
          ]),
        ]}
      />

      <Link
        href={dict.toggle.href}
        className="inline-block border-2 border-border bg-card px-2 py-1 font-mono text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)]"
      >
        {dict.toggle.label}
      </Link>

      <h1 className="mt-4 font-display text-3xl leading-tight sm:text-4xl">
        {dict.h1}
      </h1>
      <p className="mt-3 text-lg">{dict.intro(info, dict.myVoteLabel)}</p>

      {dict.ballotBasics && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          <Link
            href={dict.ballotBasics.href}
            className="underline-offset-2 hover:underline"
          >
            {dict.ballotBasics.text} → Ballot basics
          </Link>
        </p>
      )}

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
        <h2 className="font-display text-lg">{dict.checklist.title}</h2>
        <ul className="mt-2 space-y-1 font-mono text-sm">
          {registration.map(([key, d]) => (
            <li key={`r-${key}`}>
              ☐ {dict.checklist.register} ({dict.deadlineLabel(key)}): {d}
            </li>
          ))}
          {absenteeRequest.map(([key, d]) => (
            <li key={`a-${key}`}>
              ☐ {dict.checklist.requestAbsentee} ({dict.deadlineLabel(key)}):{" "}
              {d}
            </li>
          ))}
          {absenteeReturn.map(([key, d]) => (
            <li key={`b-${key}`}>
              ☐ {dict.checklist.returnAbsentee} ({dict.deadlineLabel(key)}):{" "}
              {d}
            </li>
          ))}
          <li>
            ☐ {dict.checklist.vote}: {info.primaryDate}, {info.pollsOpen}–
            {info.pollsClose}
          </li>
        </ul>
      </section>

      <div className="mt-10 space-y-3">
        <SourceList sources={info.sources} title={dict.sourcesTitle} />
        <LastUpdated
          date={new Date(info.lastCheckedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          prefix={dict.lastUpdatedPrefix}
        />
      </div>

      {access.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl">{dict.situation.title}</h2>
          <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
            {dict.situation.blurb}
          </p>
          <div className="mt-4 space-y-2">
            {access.map((row) => {
              const t = dict.accessText(row);
              return (
                <details
                  key={row.key}
                  className="border-2 border-border bg-card p-3"
                >
                  <summary className="cursor-pointer font-bold">
                    {t.title}
                  </summary>
                  <p className="mt-2 max-w-[60ch] text-sm">{t.summary}</p>
                  <p className="mt-2 max-w-[60ch] text-sm whitespace-pre-line">
                    {t.details}
                  </p>
                  <div className="mt-3">
                    <SourceList sources={row.sources} />
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
