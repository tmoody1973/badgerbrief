import { register as registerAgentComponent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import sample from "./lib/fixtures/mke-wards-sample.json";
import { parseWards } from "./lib/wards";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const USER = { subject: "clerk_ward_user" };
const DISTRICTS = { address: "", congressionalDistrict: "4", stateSenateDistrict: "7", stateAssemblyDistrict: "19" };

async function setup() {
  const t = convexTest(schema, modules);
  registerAgentComponent(t);
  await t.run((ctx) => ctx.db.insert("users", { clerkId: USER.subject }));
  await t.mutation(internal.mkeWards.replaceWards, { rows: parseWards(sample, 3) });
  return t.withIdentity(USER);
}

describe("a signed-in voter's polling place", () => {
  test("saving a Milwaukee ward lets My Brief show its polling place", async () => {
    const me = await setup();
    await me.mutation(api.preferences.saveDistricts, { ...DISTRICTS, ward: "141" });
    expect(await me.query(api.preferences.myPollingPlace, {})).toMatchObject({
      ward: "141",
      pollingPlace: "Zeidler, Frank P. Municipal Building",
    });
  });

  test("saving districts without a ward, such as an address outside the city, clears the old one", async () => {
    const me = await setup();
    await me.mutation(api.preferences.saveDistricts, { ...DISTRICTS, ward: "141" });
    await me.mutation(api.preferences.saveDistricts, DISTRICTS);
    expect(await me.query(api.preferences.myPollingPlace, {})).toBeNull();
  });

  test("a signed-out visitor has no saved polling place", async () => {
    const t = convexTest(schema, modules);
    registerAgentComponent(t);
    expect(await t.query(api.preferences.myPollingPlace, {})).toBeNull();
  });
});
