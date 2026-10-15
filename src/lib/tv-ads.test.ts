import { describe, expect, test } from "vitest";
import { groupTvAds, type TvOrder } from "./tv-ads";

const order = (o: Partial<TvOrder> & Pick<TvOrder, "id" | "sponsor">): TvOrder => ({
  candidateSlug: "tom-tiffany",
  stance: "oppose",
  station: "WISN",
  dma: "Milwaukee",
  spend: 1000,
  ...o,
});

describe("groupTvAds", () => {
  const groups = groupTvAds([
    order({ id: "a", sponsor: "Oracle Action Fund", spend: 5000, flightStart: "2026-10-01", flightEnd: "2026-10-07" }),
    order({ id: "b", sponsor: "Oracle Action Fund,", spend: 7000, station: "WTMJ", flightStart: "2026-09-20", flightEnd: "2026-10-03" }),
    order({ id: "c", sponsor: "Tiffany for Wisconsin", stance: "support", spend: 20000 }),
  ]);

  test("puts each sponsor's orders in one row, however the order spells the name", () => {
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.sponsor === "Oracle Action Fund")?.orders.map((o) => o.id)).toEqual(["a", "b"]);
  });

  test("totals each sponsor's spend and orders, biggest spender first", () => {
    expect(groups.map((g) => [g.sponsor, g.total, g.orders.length])).toEqual([
      ["Tiffany for Wisconsin", 20000, 1],
      ["Oracle Action Fund", 12000, 2],
    ]);
  });

  test("keeps the stance and the candidate when every order agrees", () => {
    expect(groups[1]).toMatchObject({ stance: "oppose", candidateSlug: "tom-tiffany" });
  });

  test("spans the earliest start to the latest end of the sponsor's orders", () => {
    expect(groups[1]).toMatchObject({ flightStart: "2026-09-20", flightEnd: "2026-10-07" });
  });

  test("drops the stance and candidate when a sponsor's orders disagree, rather than guess", () => {
    const mixed = groupTvAds([
      order({ id: "x", sponsor: "Club", stance: "oppose", candidateSlug: "tom-tiffany" }),
      order({ id: "y", sponsor: "Club", stance: "support", candidateSlug: "david-crowley" }),
    ]);
    expect(mixed[0].stance).toBeUndefined();
    expect(mixed[0].candidateSlug).toBeUndefined();
  });
});
