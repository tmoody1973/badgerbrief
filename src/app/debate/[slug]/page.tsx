import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebateTopics } from "@/components/guide/debate-topics";
import { DebateTranscript } from "@/components/guide/debate-transcript";
import { DebateVotes } from "@/components/guide/debate-votes";
import { DebateWhoWasThere } from "@/components/guide/debate-who";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { getDebate, getDebateTranscript, listDebateSlugs } from "@/lib/debates";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { raceIdToSlug } from "@/lib/site";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return listDebateSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = getDebate(slug);
  if (!d) return {};
  const names = d.candidates.map((c) => c.short).join(", ");
  return {
    title: `${d.title} — what they said`,
    // What a voter actually searches: the names, and the issues they clashed on.
    description: `${names} on vouchers, AI data centers, property taxes and policing at the ${d.venue} debate. Every position quoted, timestamped and playable, ahead of the August 11 primary.`,
    alternates: { canonical: `/debate/${slug}` },
  };
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Stamp({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </span>
  );
}

export default async function DebatePage({ params }: Props) {
  const { slug } = await params;
  const debate = getDebate(slug);
  if (!debate) notFound();
  const transcript = getDebateTranscript(slug);

  const sections: NavSection[] = [
    { id: "who", label: "Who was there" },
    { id: "votes", label: "Hand votes", count: debate.handVotes.length },
    { id: "issues", label: "Issues", count: debate.topics.length },
    { id: "transcript", label: "Transcript", count: transcript.length },
    { id: "method", label: "Method" },
  ];

  const dateLabel = new Date(`${debate.date}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Debate", path: `/debate/${slug}` },
          ]),
        ]}
      />

      <header className="border-2 border-border bg-card p-5 shadow-[var(--shadow-brutal)] sm:p-8">
        <Stamp>
          {debate.broadcaster} · {debate.venue}
        </Stamp>
        {/* overflow-wrap:anywhere so Archivo Black can't push the card past the
            viewport at 320px — a display face has no soft break opportunities. */}
        <h1
          className="mt-2 font-display text-3xl leading-none sm:text-4xl"
          style={{ overflowWrap: "anywhere" }}
        >
          {debate.title}
        </h1>
        <p className="mt-3 max-w-[65ch] leading-relaxed">
          The first and only televised debate of the Democratic primary, held{" "}
          {dateLabel}, {Math.round(debate.durationSec / 60)} minutes long. Below
          is every position each candidate took, quoted and playable, with the
          full transcript underneath.
        </p>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t-2 border-dashed border-border pt-4">
          <Stamp>Moderators {debate.moderators.join(" · ")}</Stamp>
          <Stamp>Primary August 11, 2026</Stamp>
          <Stamp>Runs {mmss(debate.durationSec)}</Stamp>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {debate.candidates.map((c) => (
            <li
              key={c.slug}
              className="border-2 border-border bg-background px-2 py-1 text-sm font-bold"
            >
              {c.name}
            </li>
          ))}
        </ul>

        {debate.youtubeId && (
          <div className="mt-4 aspect-video w-full border-2 border-border">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${debate.youtubeId}`}
              title={`${debate.title} — full video from ${debate.broadcaster}`}
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}
      </header>

      <SectionNav sections={sections} />

      <section id="who" className="mt-6 scroll-mt-16">
        <DebateWhoWasThere
          raceId={debate.raceId}
          onStage={debate.candidates.map((c) => c.slug)}
        />
      </section>

      <section id="votes" className="mt-6 scroll-mt-16">
        <DebateVotes votes={debate.handVotes} candidates={debate.candidates} />
      </section>

      <section id="issues" className="mt-6 scroll-mt-16">
        <h2 className="sr-only">Where the candidates stood, issue by issue</h2>
        <DebateTopics
          topics={debate.topics}
          candidates={debate.candidates}
          quotes={debate.quotes}
        />
      </section>

      <section id="transcript" className="mt-6 scroll-mt-16">
        <DebateTranscript topics={debate.topics} transcript={transcript} />
      </section>

      <section
        id="method"
        className="mt-6 scroll-mt-16 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
      >
        <h2 className="font-display text-xl">How this page was made</h2>
        {/* The one sentence that matters stays visible; the full disclosure is
            a tap away. Unfolded it ran to nearly two phone screens of prose
            below the content it describes. */}
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed">
          Machine-transcribed and attributed by voice, with every clip checked a
          second time to confirm it holds one speaker saying the words we print.
          BadgerBrief does not endorse candidates and this page does not say who
          won.
        </p>
        <details className="mt-3">
          <summary className="press inline-block cursor-pointer border-2 border-border bg-background px-3 py-2 text-sm font-bold shadow-[var(--shadow-brutal)]">
            Full method and its limits
          </summary>
        <div className="mt-3 max-w-[70ch] space-y-3 text-sm leading-relaxed">
          <p>
            The audio was transcribed by machine and split by voice, then each
            voice was matched to a person using something only that person could
            say about themselves — Kelda Roys calling herself “a mom and stepmom
            of five,” Joel Brennan saying he “put together as a secretary of
            administration two budgets for Governor Evers.” Where no such proof
            existed, the label was not applied.
          </p>
          <p>
            Machine attribution is imperfect, so every clip was checked a second
            time: each excerpt was sent back through transcription on its own to
            confirm it contains exactly one voice and the words we print.{" "}
            {debate.method.clipsVerified
              ? `${debate.method.clipsVerified.passed} of ${debate.method.clipsVerified.checked} clips passed; only those appear above.`
              : null}{" "}
            That is why the audio sits next to the quote — so you can check the
            attribution yourself rather than take ours on trust.
          </p>
          <p>
            Surnames are what speech recognition gets wrong most often, and a
            debate is mostly surnames. Proper nouns were corrected against a
            source outside the tape — the candidate list Wisconsin&apos;s
            Elections Commission publishes, and the broadcaster&apos;s own
            billing for the moderators. Nothing else in the transcript was
            edited.
          </p>
          <p>
            Topics are not machine-generated. Each block begins where a moderator
            said it begins. An automatic topic classifier was run on this audio
            and rejected: it returned labels that were garbled or simply wrong,
            and none of its output appears on this page.
          </p>
          <p>
            <strong>Tone</strong> measures the language of one answer on one
            issue. It is not a score of a candidate, it does not say who was
            right, and it is never added up across the night.
          </p>
          <p>
            Only short excerpts are hosted here. The full programme belongs to{" "}
            {debate.broadcaster}
            {debate.sourceUrl ? (
              <>
                {" "}
                and is available{" "}
                <a
                  className="font-mono underline decoration-2 underline-offset-2"
                  href={debate.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  from them ↗
                </a>
              </>
            ) : null}
            .
          </p>
        </div>

          <div className="mt-4 border-t-2 border-dashed border-border pt-4">
            <Stamp>Voices identified</Stamp>
            <ul className="mt-2 space-y-1 text-sm">
              {debate.method.speakers.map((s) => (
                <li key={s.name} className="max-w-[75ch]">
                  <span className="font-bold">{s.name}</span>{" "}
                  <span className="text-muted-foreground">
                    ({s.role}) — {s.evidence}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>

        <p className="mt-4 text-sm">
          <Link
            className="font-mono underline decoration-2 underline-offset-2"
            href={`/races/${raceIdToSlug(debate.raceId)}`}
          >
            See the full race, including candidates not at this debate →
          </Link>
        </p>
      </section>
    </main>
  );
}
