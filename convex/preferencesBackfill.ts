/**
 * One-off: give voters who saved an address before wards existed their City of
 * Milwaukee ward, so My Brief shows their polling place without re-entering it.
 * Run once: npx convex run --prod preferencesBackfill:backfillWards
 */
import { api, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { parseGeocoderResponse } from "../src/lib/districts";

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export const backfillWards = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; inMilwaukee: number }> => {
    const rows = await ctx.runQuery(internal.preferences.addressesWithoutWard, {});
    let inMilwaukee = 0;
    for (const { id, address } of rows) {
      const url = `${CENSUS_URL}?${new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "all", format: "json" })}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const result = parseGeocoderResponse(await res.json());
      if (!result.ok || !result.point) continue;
      const place = await ctx.runQuery(api.mkeWards.pollingPlaceAt, result.point);
      if (!place) continue;
      await ctx.runMutation(internal.preferences.setWard, { id, ward: place.ward });
      inMilwaukee += 1;
    }
    return { checked: rows.length, inMilwaukee };
  },
});
