"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { districtsFromHash } from "./ballot-link";
import { storedDistrictsSnapshot, subscribeBallotStorage } from "./ballot-storage";
import type { Districts } from "./districts";

type Prefs = { congressionalDistrict?: string; stateSenateDistrict?: string; stateAssemblyDistrict?: string } | null | undefined;

/**
 * The voter's districts, from the one lookup on the site (My Ballot): the
 * account's saved districts when signed in, otherwise what My Ballot
 * remembered on this device. Null when they have not found their ballot yet.
 */
export function pickDistricts(prefs: Prefs, storedHash: string): Districts | null {
  if (prefs?.congressionalDistrict) {
    return {
      congressional: Number(prefs.congressionalDistrict),
      senate: Number(prefs.stateSenateDistrict),
      assembly: Number(prefs.stateAssemblyDistrict),
    };
  }
  return storedHash ? districtsFromHash(storedHash, null) : null;
}

export function useMyDistricts(): Districts | null {
  const prefs = useQuery(api.preferences.getMine, {});
  const stored = useSyncExternalStore(subscribeBallotStorage, storedDistrictsSnapshot, () => "");
  return pickDistricts(prefs, stored);
}
