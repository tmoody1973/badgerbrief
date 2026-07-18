/**
 * Pure parsing/aggregation for Wisconsin Sunshine CSV exports
 * (campaignfinance.wi.gov → Browse Data → Transactions → Download Results).
 * Kept dependency-free and side-effect-free so it's unit-testable.
 */

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/**
 * Case/space-insensitive header lookup: "Registrant Name" ≈ "registrant_name".
 * Falls back to prefix match for verbose real-world headers like
 * "Contributor Name (-> Related Payer Name if applicable)".
 */
function headerIndex(headers, ...names) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = names.map(norm);
  const normalized = headers.map(norm);
  const exact = normalized.findIndex((h) => wanted.includes(h));
  if (exact >= 0) return exact;
  return normalized.findIndex((h) => wanted.some((w) => h.startsWith(w)));
}

/**
 * Aggregate a Sunshine transactions export into per-committee totals + top donors.
 * Contributions/receipts count toward `total` (raised); disbursement/expenditure
 * rows count toward `disbursements` (spent). Returns
 * { committees: Map<committeeName, {total, count, disbursements, disbursementCount, topDonors[]}>, skipped }.
 */
export function aggregateSunshine(csvText, { topN = 10, cycle = "2026" } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { committees: new Map(), skipped: 0 };
  const headers = rows[0];
  const iRegistrant = headerIndex(headers, "Registrant Name", "Committee Name");
  const iAmount = headerIndex(headers, "Amount", "Contribution Amount");
  const iType = headerIndex(headers, "Transaction Type", "Type");
  const iDonor = headerIndex(headers, "Contributor Name", "Source Name");
  const iCity = headerIndex(headers, "Contributor City", "City");
  const iDate = headerIndex(headers, "Transaction Date", "Date");
  const iEvent = headerIndex(headers, "Related Ballot Event Name");
  if (iRegistrant < 0 || iAmount < 0) {
    throw new Error(
      `Unrecognized Sunshine CSV header: ${headers.join(", ")} — expected at least "Registrant Name" and "Amount" columns`,
    );
  }

  const committees = new Map();
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const committee = (row[iRegistrant] ?? "").trim();
    const amount = Number((row[iAmount] ?? "").replace(/[$,]/g, ""));
    const type = iType >= 0 ? (row[iType] ?? "").trim().toLowerCase() : "";
    if (!committee || !Number.isFinite(amount)) {
      skipped++;
      continue;
    }
    const isContribution =
      !type || type.includes("contribution") || type.includes("receipt");
    const isDisbursement =
      type.includes("disbursement") || type.includes("expenditure");
    if (!isContribution && !isDisbursement) {
      skipped++;
      continue;
    }
    // Exclude rows tagged to a different election cycle (e.g. an old committee's
    // 2022-tagged activity). Rows with no ballot-event tag are kept.
    if (cycle && iEvent >= 0) {
      const event = (row[iEvent] ?? "").trim();
      if (event && !event.includes(cycle)) {
        skipped++;
        continue;
      }
    }
    const entry = committees.get(committee) ?? {
      total: 0,
      count: 0,
      disbursements: 0,
      disbursementCount: 0,
      donors: new Map(),
    };
    if (isDisbursement) {
      entry.disbursements += amount;
      entry.disbursementCount++;
      committees.set(committee, entry);
      continue;
    }
    entry.total += amount;
    entry.count++;
    if (iDonor >= 0 && row[iDonor]) {
      const donor = row[iDonor].trim();
      const city = iCity >= 0 ? (row[iCity] ?? "").trim() : "";
      const date = iDate >= 0 ? (row[iDate] ?? "").trim() : "";
      const d = entry.donors.get(donor) ?? { amount: 0, city, date };
      d.amount += amount;
      entry.donors.set(donor, d);
    }
    committees.set(committee, entry);
  }

  for (const entry of committees.values()) {
    entry.topDonors = [...entry.donors.entries()]
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topN);
    delete entry.donors;
  }
  return { committees, skipped };
}
