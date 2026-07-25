import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VoteGuide } from "@/components/guide/vote-guide";
import { voteEn } from "@/lib/i18n/vote-en";
import { hreflangFor } from "@/lib/i18n/locale";
import { getVoterAccess, getVotingInfo } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: voteEn.meta.title,
  description: voteEn.meta.description,
  alternates: {
    canonical: "/vote",
    languages: hreflangFor("/vote"),
  },
};

export default async function VotePage() {
  const info = await getVotingInfo();
  if (!info) notFound();
  const access = (await getVoterAccess()) ?? [];
  return <VoteGuide dict={voteEn} info={info} access={access} />;
}
