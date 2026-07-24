#!/usr/bin/env node
/**
 * Attach legislatorName to tracked candidates who served in the Legislature.
 *
 * Hand-verified against real roll calls — matching is never fuzzy, because two
 * members can share a surname on the same vote (ANDERSON, C and ANDERSON, J).
 * A candidate omitted here simply shows no voting record.
 *
 * Sessions listed per mapping are those the candidate served AND that our
 * ingest covers (2011–2025 Assembly, 2023–2025 Senate). A legislator who
 * served outside that range has votes we do not have; the UI says which
 * sessions it covers.
 *
 * *** ORDERING CONSTRAINT — READ BEFORE ADDING A MAPPING ***
 * Names here MUST be seeded BEFORE `votes:ingest` runs for the sessions/
 * chambers involved. `storeRollCall` matches each roll call's per-member
 * votes against candidates' legislatorName AT INGEST TIME ONLY — it inserts a
 * `legislator_votes` row for whichever candidates are mapped at that instant,
 * then discards the per-member vote list. `legislative_votes` persists only
 * the aggregate tally (ayes/nays/notVoting), never per-member names, so
 * nothing later can recover who voted which way on an already-ingested roll
 * call. There is no reconcile-from-DB path: it is not merely unbuilt, it is
 * impossible with what's stored.
 *
 * Consequence: adding a mapping AFTER the backfill ingest already ran means
 * that candidate's votes on already-stored roll calls are gone for good. The
 * only fix is a forced re-ingest that re-fetches and re-parses those roll
 * calls from docs.legis.wisconsin.gov (source data still exists there) —
 * `storeRollCall` dedupes on `voteKey`, so simply calling `votes:ingest` again
 * will skip everything already stored via `ingestedKeys`. To actually pick up
 * a newly-added name you must delete the affected `legislative_votes` rows
 * for that session+chamber first (or add a force flag to `votes:ingest` that
 * bypasses the `ingestedKeys` filter) and then re-run ingest so
 * `storeRollCall` re-matches against the now-present mapping.
 *
 * Usage: node scripts/seed-legislator-names.mjs [--prod]
 */
import { execFileSync } from "node:child_process";

const prod = process.argv.includes("--prod");
const IDENTITY = JSON.stringify({ metadata: { role: "admin" } });

// VERIFY each surname against a roll call from that chamber before adding a row.
const MAPPINGS = [
  { slug: "francesca-hong", name: "HONG", chamber: "assembly", sessions: ["2023", "2025"] },
  { slug: "kelda-roys", name: "ROYS", chamber: "senate", sessions: ["2023", "2025"] },
  // Pre-2019 Assembly service. Each surname verified as the SINGLE, party-D
  // entry in every session served (no same-surname collision) against a real
  // roll call from that session: Barnes 2013/2015, Hulsey 2011/2013, Crowley
  // 2017/2019, Zamarripa 2011/2013/2015/2017/2019.
  { slug: "mandela-barnes", name: "BARNES", chamber: "assembly", sessions: ["2013", "2015"] },
  { slug: "brett-hulsey", name: "HULSEY", chamber: "assembly", sessions: ["2011", "2013"] },
  { slug: "david-crowley", name: "CROWLEY", chamber: "assembly", sessions: ["2017", "2019"] },
  { slug: "jocasta-zamarripa", name: "ZAMARRIPA", chamber: "assembly", sessions: ["2011", "2013", "2015", "2017", "2019"] },

  // Sitting state senators seeking re-election in 2026 (odd districts).
  // Every surname below was checked against BOTH a real 2023 roll call
  // (sv0050) and a real 2025 one (sv0100): all ten appear verbatim, and no row
  // in either document carries a disambiguating initial, so no two senators
  // share a surname and none of these is ambiguous. Slugs are the WEC
  // "Name On Ballot" slugified, which is why Larson is `chris-j-larson`.
  { slug: "tim-carpenter", name: "CARPENTER", chamber: "senate", sessions: ["2023", "2025"] }, // D3
  { slug: "chris-j-larson", name: "LARSON", chamber: "senate", sessions: ["2023", "2025"] }, // D7
  { slug: "john-jagler", name: "JAGLER", chamber: "senate", sessions: ["2023", "2025"] }, // D13
  { slug: "mark-spreitzer", name: "SPREITZER", chamber: "senate", sessions: ["2023", "2025"] }, // D15
  { slug: "howard-marklein", name: "MARKLEIN", chamber: "senate", sessions: ["2023", "2025"] }, // D17
  { slug: "rachael-ann-cabral-guevara", name: "CABRAL-GUEVARA", chamber: "senate", sessions: ["2023", "2025"] }, // D19
  { slug: "dianne-hesselbein", name: "HESSELBEIN", chamber: "senate", sessions: ["2023", "2025"] }, // D27
  { slug: "cory-tomczyk", name: "TOMCZYK", chamber: "senate", sessions: ["2023", "2025"] }, // D29
  { slug: "jeff-smith", name: "SMITH", chamber: "senate", sessions: ["2023", "2025"] }, // D31
  { slug: "chris-kapenga", name: "KAPENGA", chamber: "senate", sessions: ["2023", "2025"] }, // D33

  // Sitting Assembly representatives seeking re-election in 2026.
  // Every surname below was checked against a real 2023 roll call (av0083) and
  // a real 2025 one (av0100), matching BOTH the printed surname and the party.
  // `sessions` lists only the sessions where that surname appears with the
  // right party, which is why 31 of these are 2025-only: they were elected in
  // 2024 and were not in the 2023 Assembly.
  //
  // The party check is not a formality — it caught Tara Johnson, whose surname
  // appears in 2023 as a REPUBLICAN. Mapping her to both sessions would have
  // published another party's voting record on her profile.
  { slug: "joel-kitchens", name: "KITCHENS", chamber: "assembly", sessions: ["2023","2025"] }, // D1
  { slug: "shae-sortwell", name: "SORTWELL", chamber: "assembly", sessions: ["2023","2025"] }, // D2
  { slug: "ron-tusler", name: "TUSLER", chamber: "assembly", sessions: ["2023","2025"] }, // D3
  { slug: "david-steffen", name: "STEFFEN", chamber: "assembly", sessions: ["2023","2025"] }, // D4
  { slug: "joy-goeben", name: "GOEBEN", chamber: "assembly", sessions: ["2023","2025"] }, // D5
  { slug: "elijah-behnke", name: "BEHNKE", chamber: "assembly", sessions: ["2023","2025"] }, // D6
  { slug: "karen-kirsch", name: "KIRSCH", chamber: "assembly", sessions: ["2025"] }, // D7
  { slug: "sylvia-ortiz-velez", name: "ORTIZ-VELEZ", chamber: "assembly", sessions: ["2023","2025"] }, // D8
  { slug: "priscilla-a-prado", name: "PRADO", chamber: "assembly", sessions: ["2025"] }, // D9
  { slug: "darrin-madison", name: "MADISON", chamber: "assembly", sessions: ["2023","2025"] }, // D10
  { slug: "sequanna-taylor", name: "TAYLOR", chamber: "assembly", sessions: ["2025"] }, // D11
  { slug: "russell-antonio-goodwin-sr", name: "GOODWIN", chamber: "assembly", sessions: ["2025"] }, // D12
  { slug: "angelito-tenorio", name: "TENORIO", chamber: "assembly", sessions: ["2025"] }, // D14
  { slug: "adam-neylon", name: "NEYLON", chamber: "assembly", sessions: ["2023","2025"] }, // D15
  { slug: "kalan-haywood", name: "HAYWOOD", chamber: "assembly", sessions: ["2023","2025"] }, // D16
  { slug: "supreme-moore-omokunde", name: "MOORE OMOKUNDE", chamber: "assembly", sessions: ["2023","2025"] }, // D17 — roll calls print the two-word surname
  { slug: "margaret-arney", name: "ARNEY", chamber: "assembly", sessions: ["2025"] }, // D18
  { slug: "ryan-clancy", name: "CLANCY", chamber: "assembly", sessions: ["2023","2025"] }, // D19
  { slug: "christine-m-sinicki", name: "SINICKI", chamber: "assembly", sessions: ["2023","2025"] }, // D20
  { slug: "paul-melotik", name: "MELOTIK", chamber: "assembly", sessions: ["2023","2025"] }, // D22
  { slug: "deb-andraca", name: "ANDRACA", chamber: "assembly", sessions: ["2023","2025"] }, // D23
  { slug: "dan-knodl", name: "KNODL", chamber: "assembly", sessions: ["2025"] }, // D24
  { slug: "paul-tittl", name: "TITTL", chamber: "assembly", sessions: ["2023","2025"] }, // D25
  { slug: "joe-sheehan", name: "SHEEHAN", chamber: "assembly", sessions: ["2025"] }, // D26
  { slug: "lindee-brill", name: "BRILL", chamber: "assembly", sessions: ["2025"] }, // D27
  { slug: "rob-kreibich", name: "KREIBICH", chamber: "assembly", sessions: ["2025"] }, // D28
  { slug: "treig-pronschinske", name: "PRONSCHINSKE", chamber: "assembly", sessions: ["2023","2025"] }, // D29
  { slug: "shannon-zimmerman", name: "ZIMMERMAN", chamber: "assembly", sessions: ["2023","2025"] }, // D30
  { slug: "tyler-august", name: "AUGUST", chamber: "assembly", sessions: ["2023","2025"] }, // D31
  { slug: "amanda-nedweski", name: "NEDWESKI", chamber: "assembly", sessions: ["2023","2025"] }, // D32
  { slug: "rob-swearingen", name: "SWEARINGEN", chamber: "assembly", sessions: ["2023","2025"] }, // D34
  { slug: "calvin-callahan", name: "CALLAHAN", chamber: "assembly", sessions: ["2023","2025"] }, // D35
  { slug: "jeffrey-l-mursau", name: "MURSAU", chamber: "assembly", sessions: ["2023","2025"] }, // D36
  { slug: "mark-born", name: "BORN", chamber: "assembly", sessions: ["2023","2025"] }, // D37
  { slug: "william-penterman", name: "PENTERMAN", chamber: "assembly", sessions: ["2023","2025"] }, // D38
  { slug: "alex-dallman", name: "DALLMAN", chamber: "assembly", sessions: ["2023","2025"] }, // D39
  { slug: "karen-desanto", name: "DESANTO", chamber: "assembly", sessions: ["2025"] }, // D40
  { slug: "tony-kurtz", name: "KURTZ", chamber: "assembly", sessions: ["2023","2025"] }, // D41
  { slug: "maureen-mccarville", name: "MCCARVILLE", chamber: "assembly", sessions: ["2025"] }, // D42
  { slug: "brienne-brown", name: "BROWN", chamber: "assembly", sessions: ["2025"] }, // D43
  { slug: "ann-roe", name: "ROE", chamber: "assembly", sessions: ["2025"] }, // D44
  { slug: "clinton-anderson", name: "ANDERSON", chamber: "assembly", sessions: ["2025"] }, // D45 — 2023 has ANDERSON, C and ANDERSON, J both D — initial unconfirmed, so 2023 is skipped
  { slug: "joan-fitzgerald", name: "FITZGERALD", chamber: "assembly", sessions: ["2025"] }, // D46
  { slug: "randy-udell", name: "UDELL", chamber: "assembly", sessions: ["2025"] }, // D47
  { slug: "andrew-hysell", name: "HYSELL", chamber: "assembly", sessions: ["2025"] }, // D48
  { slug: "travis-tranel", name: "TRANEL", chamber: "assembly", sessions: ["2023","2025"] }, // D49
  { slug: "todd-novak", name: "NOVAK", chamber: "assembly", sessions: ["2023","2025"] }, // D51
  { slug: "lee-snodgrass", name: "SNODGRASS", chamber: "assembly", sessions: ["2023","2025"] }, // D52
  { slug: "lori-palmeri", name: "PALMERI", chamber: "assembly", sessions: ["2023","2025"] }, // D54
  { slug: "nate-gustafson", name: "GUSTAFSON", chamber: "assembly", sessions: ["2023","2025"] }, // D55
  { slug: "bob-donovan", name: "DONOVAN", chamber: "assembly", sessions: ["2023","2025"] }, // D61
  { slug: "angelina-m-cruz", name: "CRUZ", chamber: "assembly", sessions: ["2025"] }, // D62
  { slug: "robert-wittke", name: "WITTKE", chamber: "assembly", sessions: ["2023","2025"] }, // D63
  { slug: "tip-mcguire", name: "MCGUIRE", chamber: "assembly", sessions: ["2023","2025"] }, // D64
  { slug: "ben-desmidt", name: "DESMIDT", chamber: "assembly", sessions: ["2025"] }, // D65
  { slug: "greta-neubauer", name: "NEUBAUER", chamber: "assembly", sessions: ["2023","2025"] }, // D66
  { slug: "david-armstrong", name: "ARMSTRONG", chamber: "assembly", sessions: ["2023","2025"] }, // D67
  { slug: "rob-summerfield", name: "SUMMERFIELD", chamber: "assembly", sessions: ["2023","2025"] }, // D68
  { slug: "karen-hurd", name: "HURD", chamber: "assembly", sessions: ["2023","2025"] }, // D69
  { slug: "nancy-vandermeer", name: "VANDERMEER", chamber: "assembly", sessions: ["2023","2025"] }, // D70
  { slug: "vinnie-miresse", name: "MIRESSE", chamber: "assembly", sessions: ["2025"] }, // D71
  { slug: "scott-krug", name: "KRUG", chamber: "assembly", sessions: ["2023","2025"] }, // D72
  { slug: "angela-stroud", name: "STROUD", chamber: "assembly", sessions: ["2025"] }, // D73
  { slug: "chanz-green", name: "GREEN", chamber: "assembly", sessions: ["2023","2025"] }, // D74
  { slug: "duke-tucker", name: "TUCKER", chamber: "assembly", sessions: ["2025"] }, // D75
  { slug: "renuka-mayadev", name: "MAYADEV", chamber: "assembly", sessions: ["2025"] }, // D77
  { slug: "shelia-stubbs", name: "STUBBS", chamber: "assembly", sessions: ["2023","2025"] }, // D78
  { slug: "lisa-subeck", name: "SUBECK", chamber: "assembly", sessions: ["2023","2025"] }, // D79
  { slug: "mike-bare", name: "BARE", chamber: "assembly", sessions: ["2023","2025"] }, // D80
  { slug: "alex-joers", name: "JOERS", chamber: "assembly", sessions: ["2023","2025"] }, // D81
  { slug: "dave-maxey", name: "MAXEY", chamber: "assembly", sessions: ["2023","2025"] }, // D83
  { slug: "chuck-wichgers", name: "WICHGERS", chamber: "assembly", sessions: ["2023","2025"] }, // D84
  { slug: "patrick-snyder", name: "SNYDER", chamber: "assembly", sessions: ["2023","2025"] }, // D85
  { slug: "john-spiros", name: "SPIROS", chamber: "assembly", sessions: ["2023","2025"] }, // D86
  { slug: "brent-jacobson", name: "JACOBSON, B", chamber: "assembly", sessions: ["2025"] }, // D87 — 2025 prints JACOBSON, B (R); 2023 JACOBSON is a Democrat
  { slug: "ben-franklin", name: "FRANKLIN", chamber: "assembly", sessions: ["2025"] }, // D88
  { slug: "ryan-spaude", name: "SPAUDE", chamber: "assembly", sessions: ["2025"] }, // D89
  { slug: "amaad-rivera-wagner", name: "RIVERA-WAGNER", chamber: "assembly", sessions: ["2025"] }, // D90
  { slug: "jodi-emerson", name: "EMERSON", chamber: "assembly", sessions: ["2023","2025"] }, // D91
  { slug: "clint-moses", name: "MOSES", chamber: "assembly", sessions: ["2023","2025"] }, // D92
  { slug: "christian-phelps", name: "PHELPS", chamber: "assembly", sessions: ["2025"] }, // D93
  { slug: "steve-doyle", name: "DOYLE", chamber: "assembly", sessions: ["2023","2025"] }, // D94
  { slug: "jill-billings", name: "BILLINGS", chamber: "assembly", sessions: ["2023","2025"] }, // D95
  { slug: "tara-johnson", name: "JOHNSON", chamber: "assembly", sessions: ["2025"] }, // D96 — 2023 JOHNSON is a REPUBLICAN — a different person
  { slug: "cindi-duchow", name: "DUCHOW", chamber: "assembly", sessions: ["2023","2025"] }, // D97
  { slug: "jim-piwowarczyk", name: "PIWOWARCZYK", chamber: "assembly", sessions: ["2025"] }, // D98
  { slug: "barbara-dittrich", name: "DITTRICH", chamber: "assembly", sessions: ["2023","2025"] }, // D99
];

for (const m of MAPPINGS) {
  const args = ["convex", "run"];
  if (prod) args.push("--prod");
  args.push("votesQueries:setLegislatorName", JSON.stringify(m), "--identity", IDENTITY);
  console.log(m.slug, execFileSync("npx", args, { encoding: "utf8" }).trim());
}
