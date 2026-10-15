/**
 * What the chat's findPollingPlace tool hands the model for an address the
 * voter typed. Pure: the Census lookup and the ward lookup happen in
 * convex/voterHelp.ts. The address's map point is never part of the payload.
 */
import { OFFICIAL_LINKS } from "../../src/lib/official-links";
import type { GeocodeResult, PollingPlace } from "../../src/lib/districts";

const IN_MILWAUKEE =
  "Give the polling place, its address and ward, and its entrance and parking notes. Say it comes from the City of Milwaukee's ward and polling-place data, updated nightly, that it is for Election Day (Nov. 3, 7 a.m. to 8 p.m.) and that early in-person voting is at other sites, and tell the voter to confirm it at MyVote with the official link below.";
const ELSEWHERE =
  "BadgerBrief has polling places only for the City of Milwaukee, so say that plainly and give the official link below for this address. Do not guess a polling place.";

export function pollingPlacePayload(result: GeocodeResult, place: PollingPlace | null) {
  const official = OFFICIAL_LINKS.pollingPlace;
  if (!result.ok) {
    return {
      found: false as const,
      mustTellUser:
        result.error === "not_wisconsin"
          ? "That address is not in Wisconsin; BadgerBrief covers Wisconsin only."
          : "The address could not be matched. Ask the voter to check it, or use the official link below.",
      official,
    };
  }
  const { congressional, senate, assembly, county } = result;
  return {
    found: true as const,
    districts: { congressional, senate, assembly, ...(county ? { county } : {}) },
    // The ballot itself comes from getRaceInfo for these ids, never from memory.
    raceIds: [`WI-US-HOUSE-D${congressional}-2026`, `WI-STATE-SENATE-D${senate}-2026`, `WI-STATE-ASSEMBLY-D${assembly}-2026`],
    pollingPlace: place
      ? {
          ward: place.ward,
          pollingPlace: place.pollingPlace,
          address: `${place.address}, Milwaukee`,
          mainEntrance: place.mainEntrance,
          accessibleEntrance: place.accessibleEntrance,
          mainParking: place.mainParking,
          accessibleParking: place.accessibleParking,
        }
      : null,
    mustTellUser: place ? IN_MILWAUKEE : ELSEWHERE,
    official,
  };
}

/**
 * Extra fields for handoffOfficialLink. A bare "where is my polling place?"
 * must still hand off to MyVote first; this lets the answer then offer the
 * Milwaukee lookup from a tool result rather than from memory, which the
 * gate's citation judge otherwise reads as an unsupported claim.
 */
export function handoffExtras(topic: string): { alsoOffer?: string } {
  return topic === "pollingPlace"
    ? {
        alsoOffer:
          "After giving this link, offer: if the voter types their address, BadgerBrief can look up their districts and, for an address in the City of Milwaukee, their Election Day polling place.",
      }
    : {};
}
