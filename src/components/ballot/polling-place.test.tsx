import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PollingPlaceCard } from "./polling-place";

// City Hall's ward, as the City of Milwaukee's map service listed it on 2026-10-14.
const ward141 = {
  ward: "141",
  pollingPlace: "Zeidler, Frank P. Municipal Building",
  address: "841 N Broadway",
  mainEntrance: "Voters should use the main building entrance on N Broadway St",
  accessibleEntrance: "The accessible entrance is the main building entrance on N Broadway St",
  mainParking: "Street parking is available near the N Broadway St entrance",
  accessibleParking: "Designated accessible street parking is available near the N Broadway St entrance",
  syncedAt: Date.UTC(2026, 9, 14, 10, 40),
};

describe("PollingPlaceCard", () => {
  const html = renderToStaticMarkup(<PollingPlaceCard place={ward141} />);

  test("names the building, its address and the ward", () => {
    expect(html).toContain("Where you vote on Nov 3");
    expect(html).toContain("Zeidler, Frank P. Municipal Building");
    expect(html).toContain("841 N Broadway");
    expect(html).toContain("Ward 141");
  });

  test("says how to get in, including the accessible entrance and parking", () => {
    expect(html).toContain("The accessible entrance is the main building entrance on N Broadway St");
    expect(html).toContain("Designated accessible street parking");
  });

  test("names its source and sends the voter to MyVote to confirm", () => {
    expect(html).toContain("City of Milwaukee");
    expect(html).toMatch(/href="https:\/\/myvote\.wi\.gov\/en-us\/Find-My-Polling-Place"/);
  });

  test("says it is for Election Day only, since early voting happens elsewhere", () => {
    expect(html).toContain("Election Day");
    expect(html).toMatch(/href="\/vote"/);
  });
});
