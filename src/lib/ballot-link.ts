/**
 * The My Ballot share link: districts and county, never an address.
 *
 * They ride after the "#" (`/ballot#cd=4&sd=7&ad=19&co=milwaukee`). Browsers
 * do not send that part of an address to any server, so it reaches no log and
 * no analytics tool (decision 018). Never put these values after a "?".
 *
 * A link is something a stranger wrote. Everything read from one is checked
 * here, and anything that does not check out is dropped, never shown.
 */
import type { Districts } from "./districts";

const MAX = { cd: 8, sd: 33, ad: 99 } as const;
// A plain county key such as "st-croix" (see convex/lib/countyKey.ts).
const COUNTY_KEY = /^[a-z]+(?:-[a-z]+)*$/;
const COUNTY_KEY_MAX = 40;

/** "cd=4&sd=7&ad=19&co=milwaukee", with no leading "#". The county is left off when it is not known. */
export function districtsToHash(districts: Districts): string {
  const parts = [`cd=${districts.congressional}`, `sd=${districts.senate}`, `ad=${districts.assembly}`];
  if (districts.county) parts.push(`co=${districts.county}`);
  return parts.join("&");
}

function district(value: string | null, max: number): number | null {
  if (value === null || !/^[1-9]\d?$/.test(value)) return null;
  const n = Number(value);
  return n <= max ? n : null;
}

/**
 * Districts from the part of an address after the "#". Null unless all three
 * districts are present and in range. A county is kept only when it is a
 * plain key and, when the list of counties is given, on that list.
 */
export function districtsFromHash(hash: string, knownCounties: ReadonlySet<string> | null): Districts | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const congressional = district(params.get("cd"), MAX.cd);
  const senate = district(params.get("sd"), MAX.sd);
  const assembly = district(params.get("ad"), MAX.ad);
  if (congressional === null || senate === null || assembly === null) return null;

  const county = params.get("co") ?? "";
  const wellFormed = county.length <= COUNTY_KEY_MAX && COUNTY_KEY.test(county);
  const keep = wellFormed && (knownCounties === null || knownCounties.has(county));
  return { congressional, senate, assembly, ...(keep ? { county } : {}) };
}
