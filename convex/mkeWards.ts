/**
 * Nightly copy of the City of Milwaukee's voting wards and Election Day
 * polling places, and the lookup "which polling place serves this map point".
 * Parsing and the point-in-ward test are in lib/wards.ts.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { parseWards, wardAt } from "./lib/wards";

const SERVICE =
  "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/election/election_wards/MapServer/1/query";
// 356 wards on 2026-10-14. Far fewer means a broken download, not a redistricting.
const MINIMUM_WARDS = 300;

const wardRow = v.object({
  ward: v.string(),
  pollingPlaceId: v.number(),
  pollingPlace: v.string(),
  address: v.string(),
  mainEntrance: v.optional(v.string()),
  accessibleEntrance: v.optional(v.string()),
  mainParking: v.optional(v.string()),
  accessibleParking: v.optional(v.string()),
  bbox: v.array(v.number()),
  rings: v.array(v.array(v.array(v.number()))),
});

/** Replace the copy in one transaction: upsert every ward, drop wards the city no longer lists. */
export const replaceWards = internalMutation({
  args: { rows: v.array(wardRow) },
  handler: async (ctx, { rows }) => {
    const syncedAt = Date.now();
    const keep = new Set(rows.map((r) => r.ward));
    for (const old of await ctx.db.query("mke_wards").collect()) {
      if (!keep.has(old.ward)) await ctx.db.delete(old._id);
    }
    for (const row of rows) {
      const existing = await ctx.db
        .query("mke_wards")
        .withIndex("by_ward", (q) => q.eq("ward", row.ward))
        .unique();
      if (existing) await ctx.db.replace(existing._id, { ...row, syncedAt });
      else await ctx.db.insert("mke_wards", { ...row, syncedAt });
    }
    return { wards: rows.length };
  },
});

export const syncWards = internalAction({
  args: {},
  // Return type stated: inferring it through runMutation loops the generated api types.
  handler: async (ctx): Promise<{ wards: number }> => {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "WARD,PollingPlaceID,POLLING_PL,ADDRESS,MAIN_ENTR,ACSBL_ENTR,MAIN_PKNG,ACSBL_PKNG",
      outSR: "4326",
      geometryPrecision: "6",
      f: "geojson",
    });
    const res = await fetch(`${SERVICE}?${params}`, {
      headers: { "User-Agent": "badgerbrief-wards/1.0 (+https://badgerbrief.org)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ward map: HTTP ${res.status}`);
    const rows = parseWards(await res.json(), MINIMUM_WARDS);
    return await ctx.runMutation(internal.mkeWards.replaceWards, { rows });
  },
});

/** The Election Day polling place for a map point in the City of Milwaukee, or null. */
export const pollingPlaceAt = query({
  args: { lat: v.number(), lon: v.number() },
  handler: async (ctx, { lat, lon }) => {
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const ward = wardAt(await ctx.db.query("mke_wards").collect(), lon, lat);
    if (!ward) return null;
    const { ward: number, pollingPlace, address, mainEntrance, accessibleEntrance, mainParking, accessibleParking, syncedAt } = ward;
    return { ward: number, pollingPlace, address, mainEntrance, accessibleEntrance, mainParking, accessibleParking, syncedAt };
  },
});
