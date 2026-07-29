import raw from "@/data/debates/wi-gov-dem-primary-debate.json";
import rawTranscript from "@/data/debates/wi-gov-dem-primary-debate.transcript.json";
import type {
  DebateCandidate,
  DebateQuote,
  DebateTopic,
} from "@/components/guide/debate-topics";
import type { DebateHandVote } from "@/components/guide/debate-votes";
import type { TranscriptTurn } from "@/components/guide/debate-transcript";

/**
 * Debate pages read from committed JSON rather than Convex.
 *
 * A debate is finished the moment it ends — the transcript, the clips and the
 * hand votes never change again. Putting immutable, already-reviewed text
 * behind a database read would buy nothing and cost the page its static
 * render, which is the whole SEO case for a page like this. The pipeline in
 * scripts/ regenerates the file; git reviews it; the page imports it.
 */

export type Debate = {
  slug: string;
  title: string;
  date: string;
  venue: string;
  broadcaster: string;
  moderators: string[];
  raceId: string;
  primaryDate: string;
  generalDate: string;
  durationSec: number;
  youtubeId: string | null;
  sourceUrl: string | null;
  candidates: DebateCandidate[];
  topics: DebateTopic[];
  handVotes: DebateHandVote[];
  quotes: DebateQuote[];
  participation: Record<string, { notAsked: string[]; namedButSilent: string[] }>;
  tone: Record<string, Record<string, { score: number; words: number; turns: number }>>;
  method: {
    engine: string;
    segmentation: string;
    identification: string;
    speakers: { name: string; role: string; evidence: string }[];
    clipsVerified: { checked: number; passed: number; how: string } | null;
  };
};

const DEBATES: Record<string, Debate> = {
  [raw.slug]: raw as unknown as Debate,
};

const TRANSCRIPTS: Record<string, TranscriptTurn[]> = {
  [rawTranscript.slug]: rawTranscript.transcript as TranscriptTurn[],
};

export function listDebateSlugs(): string[] {
  return Object.keys(DEBATES);
}

export function getDebate(slug: string): Debate | null {
  return DEBATES[slug] ?? null;
}

/**
 * The debate held in a given race, if there is one. Returns null for every race
 * without one — which is most of them — so callers can render nothing rather
 * than an empty shell.
 */
export function getDebateForRace(raceId: string): Debate | null {
  return Object.values(DEBATES).find((d) => d.raceId === raceId) ?? null;
}

export function getDebateTranscript(slug: string): TranscriptTurn[] {
  return TRANSCRIPTS[slug] ?? [];
}
