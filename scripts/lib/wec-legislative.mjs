/**
 * Merge the WEC ballot list with the Ballotpedia-derived race metadata.
 *
 * SOURCE SPLIT, AND WHY IT MATTERS. Names and parties come from the WEC
 * "All Contests and Candidates" export ONLY, because WEC is authoritative for
 * who is on the printed ballot (same law as seed.ts addBallotCandidates —
 * `name` is the WEC "Name On Ballot" verbatim, which is what the voter sees in
 * the booth). 28 of 256 state-legislative names differ between the two sources
 * — "Dan Knodl" vs "Daniel Knodl", "Chris J. Larson" vs "Chris Larson",
 * "Renee A. Paplham" vs "Renee Paplham" — so taking names from the JSON would
 * put a name on the guide that is not on the ballot, which is exactly the
 * duplicate-by-spelling mess MOO-334 had to clean up.
 *
 * The JSON supplies only what WEC does not carry: incumbency, district
 * descriptions, open-seat flags and Ballotpedia links.
 *
 * The WEC workbook has NO sharedStrings table — every cell is an inline <x:v>.
 * Parsing it with a sharedStrings-based reader yields empty strings.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Rows of the single worksheet, as objects keyed by the header row. */
export function readWecWorkbook(xlsxPath) {
  const dir = mkdtempSync(join(tmpdir(), "wec-"));
  execFileSync("unzip", ["-o", "-q", xlsxPath, "-d", dir]);
  const xml = readFileSync(join(dir, "xl/worksheets/sheet.xml"), "utf8");
  const rows = [...xml.matchAll(/<x:row[^>]*>([\s\S]*?)<\/x:row>/g)].map((m) =>
    [...m[1].matchAll(/<x:c[^>]*>(?:<x:v>([\s\S]*?)<\/x:v>)?<\/x:c>/g)].map((c) =>
      (c[1] ?? "").trim(),
    ),
  );
  if (rows.length === 0) throw new Error("WEC workbook has no rows");
  const header = rows[0];
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** WEC prints a blank row for every party fielding no candidate in a contest. */
const hasCandidate = (r) => Boolean(r["Name On Ballot"]);

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

/**
 * Surname as printed on a roll call. Suffixes are dropped because the
 * Legislature prints "MADISON", not "MADISON JR." — taking the last token
 * verbatim yields "JR." and matches nobody.
 */
export function surnameOf(name) {
  const parts = decode(name)
    .replace(/[.,]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => !/^(jr|sr|ii|iii|iv|v)$/i.test(w));
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

export const slugify = (name) =>
  decode(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const PARTY_KEYS = [
  "Democratic",
  "Republican",
  "Independent",
  "Libertarian",
  "Constitution",
  "Wisconsin Green",
];

/**
 * One entry per district: WEC candidates plus the JSON's district metadata.
 *
 * `chamber` is "senate" or "assembly"; the WEC District column spells them
 * "State Senate - District N" and "Assembly - District N" respectively. Note
 * the Senate prefix includes "State" and the Assembly one does not — filtering
 * both with the same /Senate|Assembly/ pattern silently returns zero Senate
 * rows.
 */
export function buildDistricts({ wecRows, electionJson, chamber }) {
  const districtRe =
    chamber === "senate" ? /^State Senate - District (\d+)$/ : /^Assembly - District (\d+)$/;
  const officeName = chamber === "senate" ? "Wisconsin State Senate" : "Wisconsin State Assembly";

  const race = electionJson.races.find((r) => r.office === officeName);
  if (!race) throw new Error(`no "${officeName}" race in the election JSON`);

  // Senate districts nest their candidates under `primaries`; Assembly
  // districts put the party arrays at the top level. Same file, two shapes.
  const incumbentByDistrict = new Map();
  const metaByDistrict = new Map();
  for (const d of race.districts) {
    const src = d.primaries ?? d;
    metaByDistrict.set(d.district, {
      districtDescription: d.district_description ?? null,
      openSeat: Boolean(d.open_seat),
      sources: d.sources ?? [],
    });
    for (const p of PARTY_KEYS) {
      for (const c of src[p] ?? []) {
        if (c.incumbent) incumbentByDistrict.set(d.district, c.name);
      }
    }
  }

  const byDistrict = new Map();
  for (const row of wecRows.filter(hasCandidate)) {
    const m = districtRe.exec(row.District);
    if (!m) continue;
    const district = Number(m[1]);
    const name = decode(row["Name On Ballot"]);
    const entry = {
      name,
      slug: slugify(name),
      surname: surnameOf(name),
      party: row["Political Party"] || null,
      // The Wisconsin Ethics Commission committee id, which WEC carries and the
      // JSON does not — it is the join key for Sunshine campaign finance.
      committeeId: row.CommitteeID || null,
    };
    byDistrict.set(district, [...(byDistrict.get(district) ?? []), entry]);
  }

  return [...byDistrict.keys()]
    .sort((a, b) => a - b)
    .map((district) => {
      const jsonIncumbent = incumbentByDistrict.get(district) ?? null;
      const incumbentSurname = jsonIncumbent ? surnameOf(jsonIncumbent) : null;
      const candidates = byDistrict.get(district).map((c) => ({
        ...c,
        // Incumbency is matched on surname, never on full name: the two sources
        // spell given names differently ("Chris J. Larson" vs "Chris Larson").
        incumbent: incumbentSurname !== null && c.surname === incumbentSurname,
      }));
      return {
        district,
        ...metaByDistrict.get(district),
        jsonIncumbent,
        candidates,
      };
    });
}

export const raceIdFor = (chamber, district) =>
  `WI-STATE-${chamber === "senate" ? "SENATE" : "ASSEMBLY"}-D${district}-2026`;

export const officeFor = (chamber, district) =>
  chamber === "senate"
    ? `Wisconsin State Senate — District ${district}`
    : `Wisconsin State Assembly — District ${district}`;
