/**
 * Pure computation of finance_breakdowns docs from a Sunshine transactions CSV
 * (the fetch-sunshine.mjs shape). Spec: docs/superpowers/specs/
 * 2026-08-06-finance-drilldown-design.md. Every count = distinct donors.
 */
import { parseCsv } from "./sunshine.mjs";

const CATEGORY_ORDER = ["individuals", "party", "union", "pac", "business", "other"];

function categoryFor(entityType, donorName, pacTags) {
  const t = (entityType ?? "").trim().toLowerCase();
  if (t === "individual") return "individuals";
  if (t === "registrant") {
    const tag = pacTags[donorName];
    if (tag === "party") return "party";
    if (tag === "union") return "union";
    return "pac"; // business-assoc / ideological / untagged all render as PAC
  }
  if (t === "business") return "business";
  return "other"; // Anonymous, Unregistered, Depository, empty
}

function normalizeState(s) {
  const up = (s ?? "").trim().toUpperCase();
  if (!up) return "unknown";
  return up === "WI" || up === "WISCONSIN" ? "inState" : "outOfState";
}

const location = (city, state) =>
  [city, state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ") || undefined;

function idx(headers, name) {
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return headers.findIndex((h) => norm(h) === norm(name) || norm(h).startsWith(norm(name)));
}

// A partial final month (the CSV's coverage window ends mid-month) renders as
// a full-height bar and misleads readers about momentum — so it's dropped
// from `monthly`. "Partial" means windowEnd isn't its month's last day.
function partialMonthKey(windowEnd) {
  if (!windowEnd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(windowEnd);
  if (!m) return null;
  const [, yStr, moStr, dStr] = m;
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d < lastDay ? windowEnd.slice(0, 7) : null;
}

export function computeBreakdowns(csvText, pacTags, { cycle = "2026", windowEnd = null } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return new Map();
  const trimmedTags = Object.fromEntries(
    Object.entries(pacTags).map(([k, v]) => [k.trim(), v]),
  );
  const dropMonth = partialMonthKey(windowEnd);
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

  // committee -> donor name -> {amount, category, city, state, months:{}}
  const perCommittee = new Map();
  for (const row of rows.slice(1)) {
    const committee = (row[iCommittee] ?? "").trim();
    const amount = Number((row[iAmount] ?? "").replace(/[$,]/g, ""));
    const type = iType >= 0 ? (row[iType] ?? "").trim().toLowerCase() : "";
    if (!committee || !Number.isFinite(amount)) continue;
    const isIn = !type || type.includes("contribution") || type.includes("receipt");
    if (!isIn) continue;
    const event = iEvent >= 0 ? (row[iEvent] ?? "").trim() : "";
    if (event && !event.includes(cycle)) continue;

    const donor = (row[iDonor] ?? "").trim() || "(unnamed)";
    const entity = perCommittee.get(committee) ?? { donors: new Map(), monthly: new Map() };
    const d = entity.donors.get(donor) ?? {
      amount: 0,
      category: categoryFor(row[iEntity], donor, trimmedTags),
      city: (row[iCity] ?? "").trim(),
      state: (row[iState] ?? "").trim(),
    };
    d.amount += amount;
    entity.donors.set(donor, d);

    const month = (row[iDate] ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      entity.monthly.set(month, (entity.monthly.get(month) ?? 0) + amount);
    }
    perCommittee.set(committee, entity);
  }

  const out = new Map();
  for (const [committee, { donors, monthly }] of perCommittee) {
    const round = (n) => Math.round(n * 100) / 100;
    const categories = CATEGORY_ORDER.map((key) => {
      const members = [...donors.entries()].filter(([, d]) => d.category === key);
      const topDonors = members
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 10)
        .map(([name, d]) => {
          const loc = location(d.city, d.state);
          return loc
            ? { name, amount: round(d.amount), location: loc }
            : { name, amount: round(d.amount) };
        });
      return {
        key,
        amount: round(members.reduce((s, [, d]) => s + d.amount, 0)),
        count: members.length,
        topDonors,
      };
    }).filter((c) => c.count > 0);

    const individuals = [...donors.values()].filter((d) => d.category === "individuals");
    const bucketOf = (d) => (d.amount < 200 ? "small" : d.amount < 1000 ? "mid" : "large");
    const sizeBuckets = ["small", "mid", "large"]
      .map((key) => {
        const members = individuals.filter((d) => bucketOf(d) === key);
        return {
          key,
          amount: round(members.reduce((s, d) => s + d.amount, 0)),
          count: members.length,
        };
      })
      .filter((b) => b.count > 0);

    const geo = {
      inState: { amount: 0, count: 0 },
      outOfState: { amount: 0, count: 0 },
      unknown: { amount: 0, count: 0 },
    };
    for (const d of donors.values()) {
      if (d.category !== "individuals" && d.category !== "business") continue;
      const g = geo[normalizeState(d.state)];
      g.amount = round(g.amount + d.amount);
      g.count += 1;
    }

    const monthlyArr = [...monthly.entries()]
      .filter(([month]) => month !== dropMonth)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, receipts]) => ({ month, receipts: round(receipts) }));

    const total = categories.reduce((s, c) => s + c.amount, 0);
    const catAmount = (key) => categories.find((c) => c.key === key)?.amount ?? 0;
    const takeaways = [];
    if (total > 0) {
      const partyPct = Math.floor((100 * catAmount("party")) / total);
      if (partyPct >= 40)
        takeaways.push(`Over ${partyPct}% of this campaign's money came from party committees.`);
      const unionPct = Math.round((100 * catAmount("union")) / total);
      if (unionPct >= 25)
        takeaways.push(`About ${unionPct}% of this campaign's money came from union PACs.`);
      const small = sizeBuckets.find((b) => b.key === "small");
      if (small) {
        const smallPct = Math.round((100 * small.amount) / total);
        if (smallPct >= 40)
          takeaways.push(
            `${small.count.toLocaleString("en-US")} donors gave under $200 — ${smallPct}% of the total raised.`,
          );
      }
      const known = geo.inState.amount + geo.outOfState.amount;
      if (known > 0) {
        const outPct = Math.round((100 * geo.outOfState.amount) / known);
        if (outPct >= 40)
          takeaways.push(
            `${outPct}% of individual and business donations came from outside Wisconsin.`,
          );
      }
    }

    out.set(committee, { categories, sizeBuckets, geo, monthly: monthlyArr, takeaways });
  }
  return out;
}
