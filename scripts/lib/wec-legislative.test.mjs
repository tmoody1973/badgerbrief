import { describe, expect, test } from "vitest";
import { buildDistricts, slugify, surnameOf } from "./wec-legislative.mjs";

describe("surnameOf", () => {
  test("drops generational suffixes the Legislature does not print", () => {
    // Roll calls print "MADISON", not "MADISON JR." — taking the last token
    // verbatim yields "JR." and matches nobody, silently leaving that member
    // with an empty voting record.
    expect(surnameOf("Darrin Madison Jr.")).toBe("MADISON");
    expect(surnameOf("John Smith III")).toBe("SMITH");
    expect(surnameOf("Jane Doe Sr")).toBe("DOE");
  });

  test("keeps hyphenated and multi-word surnames intact", () => {
    expect(surnameOf("Rachael Ann Cabral-Guevara")).toBe("CABRAL-GUEVARA");
    expect(surnameOf("Chris J. Larson")).toBe("LARSON");
  });
});

describe("slugify", () => {
  test("strips punctuation so middle initials do not leak into the slug", () => {
    expect(slugify("Chris J. Larson")).toBe("chris-j-larson");
    expect(slugify("Renee A. Paplham")).toBe("renee-a-paplham");
    expect(slugify("Rachael Ann Cabral-Guevara")).toBe("rachael-ann-cabral-guevara");
  });
});

describe("buildDistricts", () => {
  // The Senate rows say "State Senate - District N" while Assembly rows say
  // "Assembly - District N". Filtering both with one /Senate|Assembly/ pattern
  // returns zero Senate rows — a silent empty import.
  const wecRows = [
    {
      "Name On Ballot": "Chris J. Larson",
      "Political Party": "Democratic",
      District: "State Senate - District 7",
      CommitteeID: "0100123",
    },
    {
      "Name On Ballot": "Mike Moeller",
      "Political Party": "Republican",
      District: "State Senate - District 7",
      CommitteeID: "",
    },
    // A party fielding nobody still gets a row, with a blank name.
    { "Name On Ballot": "", "Political Party": "", District: "State Senate - District 7", CommitteeID: "" },
    {
      "Name On Ballot": "Joel Kitchens",
      "Political Party": "Republican",
      District: "Assembly - District 1",
      CommitteeID: "0105512",
    },
  ];

  const electionJson = {
    races: [
      {
        office: "Wisconsin State Senate",
        // Senate nests candidates under `primaries`...
        districts: [
          {
            district: 7,
            district_description: "Milwaukee",
            primaries: { Democratic: [{ name: "Chris Larson", incumbent: true }], Republican: [] },
          },
        ],
      },
      {
        office: "Wisconsin State Assembly",
        // ...Assembly puts the party arrays at the top level.
        districts: [
          { district: 1, Republican: [{ name: "Joel Kitchens", incumbent: true }], Democratic: [] },
        ],
      },
    ],
  };

  test("reads Senate rows despite the differing District prefix", () => {
    const out = buildDistricts({ wecRows, electionJson, chamber: "senate" });
    expect(out).toHaveLength(1);
    expect(out[0].district).toBe(7);
    expect(out[0].candidates.map((c) => c.name)).toEqual(["Chris J. Larson", "Mike Moeller"]);
  });

  test("drops the blank placeholder rows WEC prints for empty primaries", () => {
    const out = buildDistricts({ wecRows, electionJson, chamber: "senate" });
    expect(out[0].candidates.every((c) => c.name.length > 0)).toBe(true);
  });

  test("matches incumbency on surname, since given names differ by source", () => {
    // WEC says "Chris J. Larson", the JSON says "Chris Larson". Matching on the
    // full name marks the sitting senator a challenger.
    const out = buildDistricts({ wecRows, electionJson, chamber: "senate" });
    const larson = out[0].candidates.find((c) => c.surname === "LARSON");
    expect(larson.incumbent).toBe(true);
    expect(out[0].candidates.find((c) => c.surname === "MOELLER").incumbent).toBe(false);
  });

  test("keeps the WEC name verbatim rather than the JSON spelling", () => {
    const out = buildDistricts({ wecRows, electionJson, chamber: "senate" });
    // WEC is what is printed on the ballot.
    expect(out[0].candidates[0].name).toBe("Chris J. Larson");
  });

  test("reads the Assembly's top-level party arrays", () => {
    const out = buildDistricts({ wecRows, electionJson, chamber: "assembly" });
    expect(out).toHaveLength(1);
    expect(out[0].candidates[0]).toMatchObject({
      name: "Joel Kitchens",
      incumbent: true,
      committeeId: "0105512",
    });
  });
});
