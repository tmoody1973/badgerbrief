import assert from "node:assert";
import { aggregateSunshine, parseCsv } from "./sunshine.mjs";

// parseCsv: quoted fields with commas and escaped quotes
const rows = parseCsv('a,"b,c","d""e"\n1,2,3\n');
assert.deepStrictEqual(rows, [
  ["a", "b,c", 'd"e'],
  ["1", "2", "3"],
]);

// aggregateSunshine: totals, top donors, type filtering, dirty amounts
const csv = [
  "Registrant Name,Transaction Type,Amount,Contributor Name,Contributor City,Transaction Date",
  'Kelda for Governor,Contribution,"$1,000.00",Jane Smith,Madison,2026-05-01',
  "Kelda for Governor,Contribution,500,Jane Smith,Madison,2026-06-01",
  "Kelda for Governor,Contribution,250,Bob Jones,Milwaukee,2026-06-02",
  "Kelda for Governor,Expenditure,9999,Vendor Inc,Chicago,2026-06-03",
  "Crowley for Wisconsin,Contribution,750,Ann Lee,Racine,2026-06-04",
  ",Contribution,100,Nobody,,2026-06-05",
].join("\n");

const { committees, skipped } = aggregateSunshine(csv);
const kelda = committees.get("Kelda for Governor");
assert.strictEqual(kelda.total, 1750, "expenditures excluded from raised");
assert.strictEqual(kelda.count, 3);
assert.strictEqual(kelda.disbursements, 9999, "expenditures counted as spent");
assert.strictEqual(kelda.disbursementCount, 1);
assert.strictEqual(kelda.topDonors[0].name, "Jane Smith");
assert.strictEqual(kelda.topDonors[0].amount, 1500, "donor amounts aggregate");
assert.strictEqual(committees.get("Crowley for Wisconsin").total, 750);
assert.strictEqual(committees.get("Crowley for Wisconsin").disbursements, 0);
assert.strictEqual(skipped, 1, "blank committee skipped");

console.log("sunshine parser: all assertions passed");
