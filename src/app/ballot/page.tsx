import type { Metadata } from "next";
import { allCountyContests, statewideQuestions } from "../../../convex/lib/ballotExtras";
import { questionnaireStatus } from "../../../convex/lib/wisconsinWatch";
import { MyBallot } from "@/components/ballot/my-ballot";
import { BallotQuestions } from "@/components/ballot/questions";
import { getBallotIndex } from "@/lib/data";
import { CURRENT_ELECTION } from "@/lib/election";
import { buildBallotData } from "@/lib/my-ballot";

/**
 * My Ballot. This page is the same for every visitor: it reads no query
 * string and no cookie, so it is built ahead of time. Whose ballot is shown is
 * decided in the browser, from districts the server is never told
 * (decision 018). Do not read `searchParams` here.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `My Ballot — Wisconsin, ${CURRENT_ELECTION.longDate}`,
  description:
    "Enter a Wisconsin address to see the contests on your November 3, 2026 ballot in the state's order: who is on it, as printed, and what this guide has on each.",
  alternates: { canonical: "/ballot" },
};

export default async function BallotPage() {
  const index = await getBallotIndex();
  const data = buildBallotData({
    index,
    countyContests: allCountyContests(),
    answered: (raceId) =>
      index.find((race) => race.raceId === raceId)?.candidates.some((candidate) => questionnaireStatus(raceId, candidate.slug)?.status === "answered") ?? false,
  });

  const questions = statewideQuestions();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:pt-10">
      <h1 className="font-display text-4xl leading-none sm:text-5xl">My Ballot</h1>
      <p className="mt-2 max-w-2xl">{CURRENT_ELECTION.longDate}. Names as the state prints them, in the state’s order.</p>
      <MyBallot data={data} questionCount={questions.status === "ok" ? questions.questions.length : undefined}>
        <BallotQuestions questions={questions} />
      </MyBallot>
    </main>
  );
}
