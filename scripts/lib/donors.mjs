/**
 * Full donor rosters from a Sunshine transactions CSV (fetch-sunshine.mjs
 * shape). Spec: docs/superpowers/specs/2026-08-07-donor-explorer-design.md.
 * Shares row filtering and category assignment with computeBreakdowns via the
 * exported helpers — a donor's category can never disagree with the mix bar.
 */
import { parseCsv } from "./sunshine.mjs";
import { categoryFor, idx, location } from "./breakdowns.mjs";

const GIFT_CAP = 500;

/** Exact-name identity: trimmed, whitespace-collapsed, lowercased. Never fuzzy. */
export const donorKeyFor = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

const stateCode = (s) => {
  const up = (s ?? "").trim().toUpperCase();
  if (!up) return undefined;
  return up === "WISCONSIN" ? "WI" : up;
};

export function computeDonorRosters(csvText, pacTags, { cycle = "2026" } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return new Map();
  const H = rows[0];
  const iDate = idx(H, "Transaction Date");
  const iAmount = idx(H, "Amount");
  const iCommittee = idx(H, "Registrant Name");
  const iType = idx(H, "Transaction Type");
  const iDonor = idx(H, "Contributor Name");
  const iEntity = idx(H, "Contributor Entity Type");
  const iCity = idx(H, "Contributor City");
  const iState = idx(H, "Contributor State");
  const iEvent = idx(H, "Related Ballot Event Name");
  if (iCommittee < 0 || iAmount < 0 || iDonor < 0) {
    throw new Error(`Unrecognized CSV header: ${H.join(", ")}`);
  }
  const tags = Object.fromEntries(Object.entries(pacTags).map(([k, v]) => [k.trim(), v]));

  // committee -> donorKey -> accumulating doc
  const perCommittee = new Map();
  for (const r of rows.slice(1)) {
    const committee = (r[iCommittee] ?? "").trim();
    const amount = Number((r[iAmount] ?? "").replace(/[$,]/g, ""));
    const type = iType >= 0 ? (r[iType] ?? "").trim().toLowerCase() : "";
    if (!committee || !Number.isFinite(amount)) continue;
    const isIn = !type || type.includes("contribution") || type.includes("receipt");
    if (!isIn) continue;
    const event = iEvent >= 0 ? (r[iEvent] ?? "").trim() : "";
    if (event && !event.includes(cycle)) continue;

    const rawName = (r[iDonor] ?? "").trim() || "(unnamed)";
    const key = donorKeyFor(rawName);
    const donors = perCommittee.get(committee) ?? new Map();
    const d = donors.get(key) ?? {
      donorKey: key,
      donorName: rawName,
      category: categoryFor(r[iEntity], rawName, tags),
      location: location(r[iCity], stateCode(r[iState])),
      state: stateCode(r[iState]),
      total: 0,
      giftCount: 0,
      gifts: [],
    };
    d.total = Math.round((d.total + amount) * 100) / 100;
    d.giftCount++;
    const date = (r[iDate] ?? "").trim() || undefined;
    d.gifts.push(date ? { date, amount } : { amount });
    if (!d.location) d.location = location(r[iCity], stateCode(r[iState]));
    if (!d.state) d.state = stateCode(r[iState]);
    donors.set(key, d);
    perCommittee.set(committee, donors);
  }

  const out = new Map();
  for (const [committee, donors] of perCommittee) {
    const list = [...donors.values()].map((d) => {
      d.gifts.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1));
      const doc = { ...d };
      if (doc.gifts.length > GIFT_CAP) {
        doc.gifts = doc.gifts.slice(-GIFT_CAP); // keep newest, still ascending
        doc.giftsTruncated = true;
      }
      if (doc.location === undefined) delete doc.location;
      if (doc.state === undefined) delete doc.state;
      return doc;
    });
    list.sort((a, b) => b.total - a.total);
    out.set(committee, list);
  }
  return out;
}
