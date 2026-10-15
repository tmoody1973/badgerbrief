import { register as registerAgentComponent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import sample from "./lib/fixtures/mke-wards-sample.json";
import { parseWards } from "./lib/wards";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => {
  const t = convexTest(schema, modules);
  registerAgentComponent(t);
  return t;
};
const rows = parseWards(sample, 3);
const CITY_HALL = { lat: 43.0418, lon: -87.9094 };

describe("mke_wards", () => {
  test("a stored copy answers which polling place serves a map point", async () => {
    const t = setup();
    await t.mutation(internal.mkeWards.replaceWards, { rows });
    const place = await t.query(api.mkeWards.pollingPlaceAt, CITY_HALL);
    expect(place).toMatchObject({ ward: "141", pollingPlace: "Zeidler, Frank P. Municipal Building", address: "841 N Broadway" });
    expect(place).not.toHaveProperty("rings");
  });

  test("a new copy replaces the old one, dropping wards the city no longer lists", async () => {
    const t = setup();
    await t.mutation(internal.mkeWards.replaceWards, { rows });
    await t.mutation(internal.mkeWards.replaceWards, { rows: rows.filter((r) => r.ward !== "141") });
    expect(await t.query(api.mkeWards.pollingPlaceAt, CITY_HALL)).toBeNull();
  });

  test("answers null outside the City of Milwaukee", async () => {
    const t = setup();
    await t.mutation(internal.mkeWards.replaceWards, { rows });
    expect(await t.query(api.mkeWards.pollingPlaceAt, { lat: 43.0747, lon: -89.3838 })).toBeNull();
  });
});
