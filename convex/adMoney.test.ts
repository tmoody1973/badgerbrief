import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const setup = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof setup>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("races", {
      raceId: "WI-GOV-2026",
      electionSlug: "wi-2026",
      office: "Governor",
      level: "State Executive",
      sources: [],
      dataAsOf: "2026-01-01",
    } as any);
    await ctx.db.insert("candidates", {
      raceId: "WI-GOV-2026",
      slug: "tom-tiffany",
      name: "Tom Tiffany",
      sources: [],
      dataAsOf: "2026-01-01",
    } as any);
    await ctx.db.insert("candidates", {
      raceId: "WI-GOV-2026",
      slug: "jane-doe",
      name: "Jane Doe",
      sources: [],
      dataAsOf: "2026-01-01",
    } as any);
    const base = { platform: "meta" as const, firstSeenAt: 0, lastSeenAt: 0 };
    await ctx.db.insert("ads", { ...base, platformAdId: "a1", raceId: "WI-GOV-2026", candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Tiffany for Governor", spendLower: 800000, spendUpper: 834000 });
    await ctx.db.insert("ads", { ...base, platformAdId: "a2", raceId: "WI-GOV-2026", candidateSlug: "tom-tiffany", stance: "oppose", pageOrCommittee: "A Better Wisconsin Together", spendLower: 60000, spendUpper: 80000 });
    // Unattributed row must be ignored (no candidateSlug):
    await ctx.db.insert("ads", { ...base, platformAdId: "a3", pageOrCommittee: "Random PAC", spendLower: 999999, spendUpper: 999999 });
  });
}

describe("adMoneyForRace", () => {
  test("aggregates the race's attributed ads", async () => {
    const t = setup();
    await seed(t);
    const r = await t.query(api.adMoney.adMoneyForRace, { raceId: "WI-GOV-2026" });
    expect(r.totalSpend).toBe(887000); // 817000 support + 70000 attack
    expect(r.outsideSpend).toBe(70000);
    expect(r.mostAttacked).toBe("tom-tiffany");
    expect(r.candidates.map((c) => c.slug)).toEqual(["tom-tiffany"]);
  });
  test("race with no ads → empty rollup", async () => {
    const t = setup();
    await seed(t);
    const r = await t.query(api.adMoney.adMoneyForRace, { raceId: "WI-DOES-NOT-EXIST" });
    expect(r.candidates).toEqual([]);
    expect(r.totalSpend).toBe(0);
  });
});

describe("adMoneyOverview", () => {
  test("ranks races and computes statewide outside money + most-attacked", async () => {
    const t = setup();
    await seed(t);
    const o = await t.query(api.adMoney.adMoneyOverview, {});
    expect(o.races).toHaveLength(1);
    expect(o.races[0].raceId).toBe("WI-GOV-2026");
    expect(o.statewide.totalSpend).toBe(887000);
    expect(o.statewide.outsideSpend).toBe(70000);
    expect(o.statewide.mostAttacked?.slug).toBe("tom-tiffany");
    expect(o.statewide.mostAttacked?.office).toBe("Governor");
  });

  test("projects a State Legislative race's districts to numbers only (MOO-349)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("races", {
        raceId: "WI-STATE-SENATE-2026",
        electionSlug: "wi-2026",
        office: "State Senate",
        level: "State Legislative",
        // Rich seed blob — only the district numbers should survive to the client.
        districts: [
          { district: 1, district_description: "Northeast", open_seat: true, primaries: {} },
          { district: 3, district_description: "Milwaukee", primaries: {} },
        ],
        sources: [],
        dataAsOf: "2026-01-01",
      } as any);
      await ctx.db.insert("candidates", {
        raceId: "WI-STATE-SENATE-2026",
        slug: "robyn-vining",
        name: "Robyn Vining",
        sources: [],
        dataAsOf: "2026-01-01",
      } as any);
      await ctx.db.insert("ads", {
        platform: "meta" as const,
        firstSeenAt: 0,
        lastSeenAt: 0,
        platformAdId: "s1",
        raceId: "WI-STATE-SENATE-2026",
        candidateSlug: "robyn-vining",
        stance: "support",
        pageOrCommittee: "Vining for Senate",
        spendLower: 1000,
        spendUpper: 3000,
      } as any);
    });
    const o = await t.query(api.adMoney.adMoneyOverview, {});
    const senate = o.races.find((r) => r.raceId === "WI-STATE-SENATE-2026");
    expect(senate).toBeDefined();
    // trimmed to numbers only — no district_description / primaries / open_seat
    expect(senate?.districts).toEqual([{ district: 1 }, { district: 3 }]);
  });

  test("leaves statewide/federal races' districts undefined", async () => {
    const t = setup();
    await seed(t);
    const o = await t.query(api.adMoney.adMoneyOverview, {});
    const gov = o.races.find((r) => r.raceId === "WI-GOV-2026");
    expect(gov?.districts).toBeUndefined();
  });
}
);
