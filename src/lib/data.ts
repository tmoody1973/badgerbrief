import { unstable_cache } from "next/cache";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";

/**
 * Server-side fetchers for public pages.
 *
 * WHY THESE ARE WRAPPED IN unstable_cache. convex/nextjs `fetchQuery` hardcodes
 * `cache: "no-store"` on its underlying request, AND Convex queries are POST —
 * which Next.js never caches through the fetch layer regardless. Between the
 * two, every page that read Convex data rendered fully DYNAMIC: the page-level
 * `export const revalidate = 300` was silently a no-op, so each request (and
 * each Googlebot fetch) triggered a cold server render plus a live Convex round
 * trip. That is slow (0.3–0.6s TTFB, `private, no-store`, never CDN-cached) and,
 * worse, it makes indexing fragile — a cold render whose Convex call hiccups can
 * hand Google a 404 for a page that is otherwise reliably 200.
 *
 * `unstable_cache` caches the RESULT of the query rather than the HTTP fetch, so
 * it works despite the POST + no-store, and lets these pages render statically
 * with ISR (revalidated every 5 min — the interval the pages already declared).
 * Googlebot gets an instant cached 200 with no per-request database dependency.
 *
 * Everything here is PUBLIC, non-personalized data. Nothing reads cookies or an
 * auth token, which is the precondition for caching a route this way. Admin and
 * per-user reads use the client-side Convex hooks, not these fetchers, and stay
 * dynamic.
 */
const REVALIDATE = 300;

/**
 * Wrap a public fetcher so its result is cached and shared across requests.
 * The cache key is the label plus the stringified arguments, so `getRace("a")`
 * and `getRace("b")` are distinct entries and a new arg never returns a stale
 * neighbour's data.
 */
function cached<Args extends (string | undefined)[], T>(
  label: string,
  fn: (...args: Args) => Promise<T>,
) {
  return (...args: Args): Promise<T> =>
    unstable_cache(() => fn(...args), [label, ...args.map((a) => a ?? "∅")], {
      revalidate: REVALIDATE,
    })();
}

export const getElection = cached("getElection", () => fetchQuery(api.public.getElection, {}));
export const listRaces = cached("listRaces", () => fetchQuery(api.public.listRaces, {}));
export const getRace = cached("getRace", (raceId: string) =>
  fetchQuery(api.public.getRace, { raceId }));
export const getCandidateBySlug = cached("getCandidateBySlug", (slug: string) =>
  fetchQuery(api.public.getCandidateBySlug, { slug }));
export const listCandidateSlugs = cached("listCandidateSlugs", () =>
  fetchQuery(api.public.listCandidateSlugs, {}));
export const getVotingInfo = cached("getVotingInfo", () => fetchQuery(api.public.getVotingInfo, {}));
export const getVoterAccess = cached("getVoterAccess", () => fetchQuery(api.public.getVoterAccess, {}));
export const listAds = cached("listAds", () => fetchQuery(api.ads.listAds, {}));
export const getAdMoneyForRace = cached("getAdMoneyForRace", (raceId: string) =>
  fetchQuery(api.adMoney.adMoneyForRace, { raceId }));
export const getAdMoneyOverview = cached("getAdMoneyOverview", () =>
  fetchQuery(api.adMoney.adMoneyOverview, {}));
export const getTvAdsForRace = cached("getTvAdsForRace", (raceId: string) =>
  fetchQuery(api.ads.tvAdsForRace, { raceId }));
export const getPollsForRace = cached("getPollsForRace", (raceId: string) =>
  fetchQuery(api.pollsQueries.forRace, { raceId }));
export const getTvAdTracker = cached("getTvAdTracker", () => fetchQuery(api.ads.tvAdsForTracker, {}));
export const candidateDirectory = cached("candidateDirectory", () =>
  fetchQuery(api.public.candidateDirectory, {}));
export const getSponsorProfile = cached("getSponsorProfile", (key: string) =>
  fetchQuery(api.sponsors.sponsorPublicProfile, { key }));
export const getSponsorScorecard = cached("getSponsorScorecard", (key: string) =>
  fetchQuery(api.sponsors.sponsorScorecard, { key }));
export const getSponsorAds = cached("getSponsorAds", (key: string) =>
  fetchQuery(api.sponsors.sponsorAds, { key }));
export const getEnrichedSponsorKeys = cached("getEnrichedSponsorKeys", () =>
  fetchQuery(api.sponsors.enrichedSponsorKeys, {}));
export const getInTheNewsForCandidate = cached("getInTheNewsForCandidate", (candidateSlug: string) =>
  fetchQuery(api.coverage.inTheNewsForCandidate, { candidateSlug }));
export const getInTheNewsForRace = cached("getInTheNewsForRace", (raceId: string) =>
  fetchQuery(api.coverage.inTheNewsForRace, { raceId }));
/** `hubArticles` defaults to 60; /news is the complete tracked record, so it
 *  asks for everything. The cap stays as a runaway guard, just far above the
 *  real corpus rather than quietly trimming the tail off the page. */
export const getHubArticles = cached("getHubArticles", (raceId?: string) =>
  fetchQuery(api.coverage.hubArticles, { limit: 500, ...(raceId ? { raceId } : {}) }));
