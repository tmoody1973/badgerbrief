import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";

/** Server-side fetchers for public pages. Pages set `export const revalidate` for ISR. */

export const getElection = () => fetchQuery(api.public.getElection, {});
export const listRaces = () => fetchQuery(api.public.listRaces, {});
export const getRace = (raceId: string) =>
  fetchQuery(api.public.getRace, { raceId });
export const getCandidateBySlug = (slug: string) =>
  fetchQuery(api.public.getCandidateBySlug, { slug });
export const listCandidateSlugs = () =>
  fetchQuery(api.public.listCandidateSlugs, {});
export const getVotingInfo = () => fetchQuery(api.public.getVotingInfo, {});
export const listAds = () => fetchQuery(api.ads.listAds, {});
export const getAdMoneyForRace = (raceId: string) =>
  fetchQuery(api.adMoney.adMoneyForRace, { raceId });
export const getAdMoneyOverview = () => fetchQuery(api.adMoney.adMoneyOverview, {});
export const getTvAdsForRace = (raceId: string) =>
  fetchQuery(api.ads.tvAdsForRace, { raceId });
export const getTvAdTracker = () => fetchQuery(api.ads.tvAdsForTracker, {});
export const candidateDirectory = () =>
  fetchQuery(api.public.candidateDirectory, {});
export const getSponsorProfile = (key: string) =>
  fetchQuery(api.sponsors.sponsorPublicProfile, { key });
export const getSponsorScorecard = (key: string) =>
  fetchQuery(api.sponsors.sponsorScorecard, { key });
export const getSponsorAds = (key: string) =>
  fetchQuery(api.sponsors.sponsorAds, { key });
export const getEnrichedSponsorKeys = () =>
  fetchQuery(api.sponsors.enrichedSponsorKeys, {});
export const getInTheNewsForCandidate = (candidateSlug: string) =>
  fetchQuery(api.coverage.inTheNewsForCandidate, { candidateSlug });
export const getInTheNewsForRace = (raceId: string) =>
  fetchQuery(api.coverage.inTheNewsForRace, { raceId });
