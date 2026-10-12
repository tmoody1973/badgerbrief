import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteGuide } from "@/components/guide/vote-guide";
import { voteEs } from "@/lib/i18n/vote-es";
import { hreflangFor } from "@/lib/i18n/locale";
import { getElection, getVoterAccess, getVotingInfo } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: voteEs.meta.title,
  description: voteEs.meta.description,
  alternates: {
    canonical: "/es/vote",
    languages: hreflangFor("/vote"),
  },
};

export default async function VoteEsPage() {
  const [info, election] = await Promise.all([getVotingInfo(), getElection()]);
  if (!info || !election) notFound();
  const access = (await getVoterAccess()) ?? [];
  return <VoteGuide dict={voteEs} info={info} electionDate={election.generalDate} access={access} />;
}
