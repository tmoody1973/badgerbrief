import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { RaceTvAds } from "./race-tv-ads";

const ad = (id: string, sponsor: string, extra: Record<string, unknown> = {}) =>
  ({ id, sponsor, candidateSlug: "tom-tiffany", stance: "oppose", station: "WISN", dma: "Milwaukee", spend: 5000, flightStart: "2026-10-01", flightEnd: "2026-10-07", pdfUrl: `https://publicfiles.fcc.gov/${id}.pdf`, ...extra }) as never;

describe("RaceTvAds", () => {
  const html = renderToStaticMarkup(
    <RaceTvAds
      ads={[ad("a", "Oracle Action Fund"), ad("b", "Oracle Action Fund", { station: "WTMJ" }), ad("c", "Tiffany for Wisconsin", { stance: "support", spend: 20000 })]}
      names={{ "tom-tiffany": "Tom Tiffany" }}
    />,
  );

  test("gives each sponsor one row, as a heading a screen reader can jump between", () => {
    expect(html.match(/<h3/g)).toHaveLength(2);
    expect(html).toContain("Oracle Action Fund");
  });

  test("says whom an attack is against, in a label readable on white", () => {
    expect(html).toContain("Attack on Tom Tiffany");
    expect(html).toMatch(/bg-warning[^"]*text-foreground|text-foreground[^"]*bg-warning/);
  });

  test("folds the individual orders, each link named for its station and dates", () => {
    expect(html).toContain("<details");
    expect(html).toContain("FCC order: WTMJ");
  });

  test("uses no text smaller than 12px", () => {
    expect(html).not.toMatch(/text-\[1[01]px\]/);
  });
});
