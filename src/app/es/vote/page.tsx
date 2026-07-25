import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteGuide } from "@/components/guide/vote-guide";
import { voteEs } from "@/lib/i18n/vote-es";
import { VOTE_HREFLANG } from "@/lib/i18n/vote-dict";
import { getVoterAccess, getVotingInfo } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: voteEs.meta.title,
  description: voteEs.meta.description,
  alternates: {
    canonical: "/es/vote",
    languages: VOTE_HREFLANG,
  },
};

export default async function VoteEsPage() {
  const info = await getVotingInfo();
  if (!info) notFound();
  const access = (await getVoterAccess()) ?? [];
  return <VoteGuide dict={voteEs} info={info} access={access} />;
}
