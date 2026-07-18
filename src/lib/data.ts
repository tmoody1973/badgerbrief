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
