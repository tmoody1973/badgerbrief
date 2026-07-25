import type { Metadata } from "next";
import { HomeGuide } from "@/components/guide/home-guide";
import { homeEs } from "@/lib/i18n/home-es";
import { hreflangFor } from "@/lib/i18n/locale";
import { getElection, listRaces, getVotingInfo } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: homeEs.meta.title,
  description: homeEs.meta.description,
  alternates: {
    canonical: "/es",
    languages: hreflangFor("/"),
  },
};

export default async function HomeEsPage() {
  const [election, races, votingInfo] = await Promise.all([
    getElection(),
    listRaces(),
    getVotingInfo(),
  ]);

  return (
    <HomeGuide
      dict={homeEs}
      lang="es"
      election={election}
      races={races}
      votingInfo={votingInfo}
    />
  );
}
