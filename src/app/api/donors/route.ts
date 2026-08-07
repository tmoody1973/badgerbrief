import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";

/**
 * CSV export of a candidate's full donor roster (spec: 2026-08-07-donor-
 * explorer). Public record; the statute note travels in the file header.
 */

const csvCell = (s: string | number | undefined) => {
  let v = String(s ?? "");
  if (/^[=+\-@]/.test(v)) v = `'${v}`; // neutralize spreadsheet formula injection (CWE-1236)
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export async function GET(req: NextRequest) {
  const race = req.nextUrl.searchParams.get("race")?.trim() ?? "";
  const candidate = req.nextUrl.searchParams.get("candidate")?.trim() ?? "";
  if (!/^[A-Z0-9-]{3,40}$/.test(race) || !/^[a-z0-9-]{2,60}$/.test(candidate)) {
    return NextResponse.json({ ok: false, error: "bad_params" }, { status: 400 });
  }

  const lines: string[] = [];
  let cursor: string | null = null;
  let coverage: string | undefined;
  for (;;) {
    const page: Awaited<ReturnType<typeof fetchQuery<typeof api.donors.roster>>> = await fetchQuery(
      api.donors.roster,
      {
        raceId: race,
        candidateSlug: candidate,
        paginationOpts: { cursor, numItems: 500 },
      }
    );
    for (const d of page.page) {
      coverage ??= d.coverageEndDate;
      const dates = d.gifts.map((g: { date?: string }) => g.date ?? "").filter(Boolean).sort();
      lines.push(
        [
          csvCell(d.donorName),
          csvCell(d.category),
          csvCell(d.location),
          d.total,
          d.giftCount,
          csvCell(dates[0]),
          csvCell(dates[dates.length - 1]),
        ].join(","),
      );
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  if (lines.length === 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const header =
    `# BadgerBrief donor roster — ${candidate} (${race}) — Itemized contributions` +
    `${coverage ? `, ${coverage}` : ""} — Data: WI Ethics Commission (Sunshine), ` +
    `non-commercial use per Wis. Stat. § 11.1304(12)\n` +
    "donor,category,location,total,gift_count,first_gift,last_gift";
  return new NextResponse([header, ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${candidate}-donors.csv"`,
      "X-Robots-Tag": "noindex",
    },
  });
}
